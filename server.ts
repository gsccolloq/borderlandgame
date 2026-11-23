import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, type WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { arenaEngine } from './server/arenaEngine.ts';
import { generateAdaptiveQuestion, generateGameTheoryReport } from './server/dealerAi.ts';
import type { CardSuit } from './src/types/game.ts';
import type { ServerQuestion } from './server/questionBank.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ADMIN_EMAIL = (
  process.env.ADMIN_EMAIL ||
  process.env.NEXT_PUBLIC_ADMIN_EMAIL ||
  process.env.VITE_ADMIN_EMAIL ||
  'gsc.colloq@gmail.com'
).toLowerCase().trim();

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '1mb' }));

  // Health & Latency ping endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', serverTime: Date.now() });
  });

  // Server-side Gemini AI Dealer: Generate dynamic adaptive question and inject into room
  app.post('/api/dealer/generate-question', async (req, res) => {
    try {
      const { roomCode, subject, suit, difficulty, isRevival, immediate } = req.body as {
        roomCode?: string;
        subject?: string;
        suit?: CardSuit;
        difficulty?: number;
        isRevival?: boolean;
        immediate?: boolean;
      };

      const validSuits: CardSuit[] = ['spades', 'hearts', 'clubs', 'diamonds'];
      const chosenSuit: CardSuit = validSuits.includes(suit as CardSuit) ? (suit as CardSuit) : 'diamonds';
      const room = roomCode ? arenaEngine.getRoom(roomCode) : undefined;
      const targetSubject = subject || room?.subject || 'Computer Science & Algorithms';
      const targetDifficulty = Math.max(1, Math.min(10, Number(difficulty) || room?.difficultyLevel || 7));

      const clientApiKey = (
        req.body.apiKey ||
        req.headers['x-gemini-api-key'] ||
        process.env.GEMINI_API_KEY ||
        ''
      ).toString().trim();

      const clientModel = (
        req.body.model ||
        req.headers['x-gemini-model'] ||
        'gemini-3-flash-preview'
      ).toString().trim();

      const question = await generateAdaptiveQuestion({
        subject: targetSubject,
        suit: chosenSuit,
        difficulty: targetDifficulty,
        isRevival: Boolean(isRevival),
        previousTopics: [],
        playerAccuracyPct: 65,
        apiKey: clientApiKey,
        model: clientModel,
      });

      let injected = false;
      if (roomCode && room) {
        injected = arenaEngine.injectQuestion(roomCode, question, Boolean(immediate));
      }

      // NEVER return correctIndex or explanation to client here!
      res.json({
        ok: true,
        injected,
        questionPreview: {
          id: question.id,
          suit: question.suit,
          cardRank: question.cardRank,
          difficulty: question.difficulty,
          topic: question.topic,
          prompt: question.prompt,
          timeLimitMs: question.timeLimitMs,
          source: question.source,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không thể rèn lá bài thử thách từ Quản trò AI.';
      res.status(502).json({ ok: false, error: message });
    }
  });

  // Server-side Gemini AI Dealer: Game Theory Analytics Report
  app.post('/api/dealer/analyze', async (req, res) => {
    try {
      const {
        playerName,
        subject,
        score,
        finalVisa,
        accuracyPct,
        avgResponseMs,
        suitBreakdown,
        weakTopics,
        tabSwitches,
      } = req.body;

      const clientApiKey = (
        req.body.apiKey ||
        req.headers['x-gemini-api-key'] ||
        process.env.GEMINI_API_KEY ||
        ''
      ).toString().trim();

      const clientModel = (
        req.body.model ||
        req.headers['x-gemini-model'] ||
        'gemini-3-flash-preview'
      ).toString().trim();

      const report = await generateGameTheoryReport({
        playerName: String(playerName || 'Người chơi').slice(0, 64),
        subject: String(subject || 'Tổng hợp').slice(0, 64),
        score: Number(score) || 0,
        finalVisa: Number(finalVisa) || 0,
        accuracyPct: Number(accuracyPct) || 0,
        avgResponseMs: Number(avgResponseMs) || 0,
        suitBreakdown: suitBreakdown || {
          spades: { accuracy: 0, avgMs: 0, attempts: 0 },
          hearts: { accuracy: 0, avgMs: 0, attempts: 0 },
          clubs: { accuracy: 0, avgMs: 0, attempts: 0 },
          diamonds: { accuracy: 0, avgMs: 0, attempts: 0 },
        },
        weakTopics: Array.isArray(weakTopics) ? weakTopics.map(String).slice(0, 10) : [],
        tabSwitches: Number(tabSwitches) || 0,
        apiKey: clientApiKey,
        model: clientModel,
      });

      res.json({ ok: true, report });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Phân tích chiến lược từ Quản trò AI thất bại.';
      res.status(502).json({ ok: false, error: message });
    }
  });

  // Real-time WebSocket server on same HTTP server (/ws)
  const wss = new WebSocketServer({ server, path: '/ws' });
  const socketToPlayer = new Map<WebSocket, string>();

  wss.on('connection', (ws: WebSocket) => {
    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as Record<string, unknown>;
        const type = String(msg.type || '');

        if (type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', clientSentAt: msg.clientSentAt, serverTime: Date.now() }));
          return;
        }

        if (type === 'room:create') {
          const playerId = String(msg.playerId || `p-${Date.now()}`);
          const playerName = String(msg.playerName || 'Người chơi');
          const subject = String(msg.subject || 'Computer Science & Algorithms');
          const uid = msg.uid ? String(msg.uid) : undefined;
          const userEmail = msg.userEmail ? String(msg.userEmail).toLowerCase().trim() : '';
          const userRole = String(msg.userRole || 'guest');
          const customDeck = Array.isArray(msg.customDeck) ? (msg.customDeck as ServerQuestion[]) : undefined;

          // Server-side RBAC verification: Only Super Admin and approved Hosts can create rooms
          const isSuperAdmin = userEmail === ADMIN_EMAIL || userRole === 'admin';
          const isHost = userRole === 'host';

          if (!isSuperAdmin && !isHost) {
            ws.send(
              JSON.stringify({
                type: 'room:error',
                error:
                  'Chỉ Quản trị viên và Chủ phòng đã được cấp quyền mới có thể tạo phòng đấu.',
              })
            );
            return;
          }

          socketToPlayer.set(ws, playerId);
          arenaEngine.createRoom(playerId, playerName, subject, ws, uid, customDeck);
          return;
        }

        if (type === 'room:set-questions') {
          const roomCode = String(msg.roomCode || '');
          const playerId = String(msg.playerId || socketToPlayer.get(ws) || '');
          const questions = Array.isArray(msg.questions)
            ? (msg.questions as ServerQuestion[])
            : [];
          const success = arenaEngine.setCustomDeck(roomCode, playerId, questions);
          if (!success) {
            ws.send(
              JSON.stringify({
                type: 'room:error',
                error: 'Không thể nạp bộ câu hỏi tùy chỉnh (yêu cầu quyền Chủ phòng).',
              })
            );
          }
          return;
        }

        if (type === 'room:join') {
          const roomCode = String(msg.roomCode || '');
          const playerId = String(msg.playerId || `p-${Date.now()}`);
          const playerName = String(msg.playerName || 'Người chơi');
          const uid = msg.uid ? String(msg.uid) : undefined;
          socketToPlayer.set(ws, playerId);
          const room = arenaEngine.joinRoom(roomCode, playerId, playerName, ws, uid);
          if (!room) {
            ws.send(JSON.stringify({ type: 'room:error', error: `Không tìm thấy phòng ${roomCode.toUpperCase()}.` }));
          }
          return;
        }

        if (type === 'game:start') {
          const roomCode = String(msg.roomCode || '');
          arenaEngine.startGame(roomCode);
          return;
        }

        if (type === 'answer:submit') {
          const roomCode = String(msg.roomCode || '');
          const playerId = String(msg.playerId || socketToPlayer.get(ws) || '');
          const optionIndex = Number(msg.optionIndex);
          const wagered = Boolean(msg.wagered);
          arenaEngine.submitAnswer(roomCode, playerId, optionIndex, wagered);
          return;
        }

        if (type === 'phase:next') {
          const roomCode = String(msg.roomCode || '');
          arenaEngine.nextPhase(roomCode);
          return;
        }

        if (type === 'revival:launch') {
          const roomCode = String(msg.roomCode || '');
          const result = await arenaEngine.launchRevivalGame(roomCode);
          if (!result.ok) {
            ws.send(JSON.stringify({ type: 'room:error', error: result.error }));
          }
          return;
        }

        if (type === 'tab:violation') {
          const roomCode = String(msg.roomCode || '');
          const playerId = String(msg.playerId || socketToPlayer.get(ws) || '');
          arenaEngine.reportTabViolation(roomCode, playerId);
          return;
        }

        if (type === 'room:inject-question') {
          const roomCode = String(msg.roomCode || '');
          const question = msg.question as ServerQuestion;
          const immediate = Boolean(msg.immediate);
          if (roomCode && question) {
            arenaEngine.injectQuestion(roomCode, question, immediate);
          }
          return;
        }
      } catch (err) {
        ws.send(
          JSON.stringify({
            type: 'room:error',
            error: err instanceof Error ? err.message : 'Gói dữ liệu WebSocket không hợp lệ.',
          })
        );
      }
    });

    ws.on('close', () => {
      const playerId = socketToPlayer.get(ws);
      if (playerId) {
        arenaEngine.disconnectSocket(playerId);
        socketToPlayer.delete(ws);
      }
    });
  });

  // Vite middleware for dev, static dist for prod
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Borderland Quiz Arena server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Borderland Quiz Arena server:', err);
  process.exit(1);
});
