import type { WebSocket } from 'ws';
import type {
  ArenaRoomSnapshot,
  CardSuit,
  ClientQuestion,
  DealerLogEntry,
  FsmState,
  PlayerState,
  RoundReveal,
} from '../src/types/game.ts';
import { getQuestionsForSubject, type ServerQuestion } from './questionBank.ts';
import { generateAdaptiveQuestion, generateDealerRoundReaction } from './dealerAi.ts';

interface PendingSubmission {
  optionIndex: number;
  responseMs: number;
  wagered: boolean;
}

interface InternalRoom {
  roomCode: string;
  subject: string;
  fsmState: FsmState;
  currentRound: number;
  totalRounds: number;
  difficultyLevel: number;
  isRevivalActive: boolean;
  revivalOffered: boolean;
  deck: ServerQuestion[];
  activeQuestion: ServerQuestion | null;
  questionStartedAt: number;
  submissions: Map<string, PendingSubmission>;
  lastReveal: RoundReveal | null;
  dealerMessage: string;
  dealerLogs: DealerLogEntry[];
  players: Map<string, PlayerState>;
  sockets: Map<string, WebSocket>;
  hostPlayerId: string;
  roundTimer: ReturnType<typeof setTimeout> | null;
  cutsceneTimer: ReturnType<typeof setTimeout> | null;
}

function createEmptySuitStats(): PlayerState['suitStats'] {
  return {
    spades: { attempts: 0, correct: 0, totalResponseMs: 0 },
    hearts: { attempts: 0, correct: 0, totalResponseMs: 0 },
    clubs: { attempts: 0, correct: 0, totalResponseMs: 0 },
    diamonds: { attempts: 0, correct: 0, totalResponseMs: 0 },
  };
}

const SUIT_LABEL_VI: Record<CardSuit, string> = {
  spades: 'Bích',
  hearts: 'Cơ',
  clubs: 'Chuồn',
  diamonds: 'Rô',
};

function createPlayer(id: string, name: string, uid?: string): PlayerState {
  return {
    id,
    uid,
    name: name.trim().slice(0, 32) || 'Người chơi',
    visa: 3,
    maxVisa: 5,
    score: 0,
    streak: 0,
    status: 'active',
    tabSwitches: 0,
    hasAnsweredCurrent: false,
    revivalUsed: false,
    suitStats: createEmptySuitStats(),
    topicStats: {},
    answerLog: [],
  };
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = 'BL-';
  for (let i = 0; i < 4; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export class ArenaEngine {
  private rooms = new Map<string, InternalRoom>();

  private pushLog(room: InternalRoom, message: string, action: DealerLogEntry['action']): void {
    room.dealerMessage = message;
    room.dealerLogs = [
      {
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: Date.now(),
        phase: room.fsmState,
        message,
        action,
      },
      ...room.dealerLogs,
    ].slice(0, 24);
  }

  private clearTimers(room: InternalRoom): void {
    if (room.roundTimer) {
      clearTimeout(room.roundTimer);
      room.roundTimer = null;
    }
    if (room.cutsceneTimer) {
      clearTimeout(room.cutsceneTimer);
      room.cutsceneTimer = null;
    }
  }

  /**
   * CRITICAL SECURITY BOUNDARY:
   * Strictly strips `correctIndex` and `explanation` before any question leaves the server.
   */
  private toClientQuestion(room: InternalRoom): ClientQuestion | null {
    const q = room.activeQuestion;
    if (!q) return null;
    return {
      id: q.id,
      roundNumber: room.currentRound,
      totalRounds: room.totalRounds,
      suit: q.suit,
      cardRank: q.cardRank,
      difficulty: q.difficulty,
      topic: q.topic,
      prompt: q.prompt,
      options: q.options,
      timeLimitMs: q.timeLimitMs,
      startedAt: room.questionStartedAt,
      isRevival: room.isRevivalActive,
      dealerHint: q.dealerHint,
      wagerAllowed: q.suit === 'hearts' && !room.isRevivalActive,
      source: q.source,
    };
  }

  public getSnapshot(room: InternalRoom): ArenaRoomSnapshot {
    return {
      roomCode: room.roomCode,
      subject: room.subject,
      fsmState: room.fsmState,
      currentRound: room.currentRound,
      totalRounds: room.totalRounds,
      difficultyLevel: room.difficultyLevel,
      isRevivalActive: room.isRevivalActive,
      revivalOffered: room.revivalOffered,
      currentQuestion:
        room.fsmState === 'Cutscene' || room.fsmState === 'Question' || room.fsmState === 'Result'
          ? this.toClientQuestion(room)
          : null,
      lastReveal: room.fsmState === 'Result' || room.fsmState === 'Elimination' ? room.lastReveal : null,
      dealerMessage: room.dealerMessage,
      dealerLogs: room.dealerLogs,
      players: Array.from(room.players.values()),
      hostPlayerId: room.hostPlayerId,
      serverTime: Date.now(),
    };
  }

  public broadcast(room: InternalRoom, extraEvent?: Record<string, unknown>): void {
    const payload = JSON.stringify({
      type: 'room:state',
      snapshot: this.getSnapshot(room),
      ...(extraEvent ?? {}),
    });
    for (const [, socket] of room.sockets) {
      if (socket.readyState === 1) {
        socket.send(payload);
      }
    }
  }

  public createRoom(
    playerId: string,
    playerName: string,
    subject: string,
    socket: WebSocket,
    uid?: string,
    customDeck?: ServerQuestion[]
  ): InternalRoom {
    let code = generateRoomCode();
    while (this.rooms.has(code)) {
      code = generateRoomCode();
    }

    const deck =
      customDeck && customDeck.length > 0
        ? [...customDeck]
        : [...getQuestionsForSubject(subject)];
    const room: InternalRoom = {
      roomCode: code,
      subject,
      fsmState: 'Lobby',
      currentRound: 0,
      totalRounds: deck.length,
      difficultyLevel: 5,
      isRevivalActive: false,
      revivalOffered: false,
      deck,
      activeQuestion: null,
      questionStartedAt: 0,
      submissions: new Map(),
      lastReveal: null,
      dealerMessage: 'Chào mừng các Kẻ tham gia tới Borderland Arena. Visa khởi điểm: 3 ngày. Khi Visa chạm 0, tia laser sẽ khai hỏa.',
      dealerLogs: [],
      players: new Map(),
      sockets: new Map(),
      hostPlayerId: playerId,
      roundTimer: null,
      cutsceneTimer: null,
    };

    const host = createPlayer(playerId, playerName, uid);
    room.players.set(playerId, host);
    room.sockets.set(playerId, socket);
    this.pushLog(room, room.dealerMessage, 'briefing');
    this.rooms.set(code, room);
    this.broadcast(room);
    return room;
  }

  public setCustomDeck(
    roomCode: string,
    playerId: string,
    questions: ServerQuestion[]
  ): boolean {
    const room = this.getRoom(roomCode);
    if (!room) return false;
    if (room.hostPlayerId !== playerId) return false;
    if (questions && questions.length > 0) {
      room.deck = [...questions];
      room.totalRounds = questions.length;
      this.pushLog(
        room,
        `Chủ phòng vừa nạp bộ câu hỏi tùy chỉnh (${questions.length} câu) vào đấu trường ${room.roomCode}.`,
        'briefing'
      );
      this.broadcast(room);
      return true;
    }
    return false;
  }

  public joinRoom(
    roomCode: string,
    playerId: string,
    playerName: string,
    socket: WebSocket,
    uid?: string
  ): InternalRoom | null {
    const normalized = roomCode.trim().toUpperCase();
    const room = this.rooms.get(normalized);
    if (!room) return null;

    if (!room.players.has(playerId)) {
      room.players.set(playerId, createPlayer(playerId, playerName, uid));
      this.pushLog(
        room,
        `Kẻ tham gia ${playerName} đã bước vào đấu trường ${room.roomCode}.`,
        'briefing'
      );
    } else {
      const existing = room.players.get(playerId)!;
      existing.name = playerName.trim().slice(0, 32) || existing.name;
      if (uid) existing.uid = uid;
    }

    room.sockets.set(playerId, socket);
    this.broadcast(room);
    return room;
  }

  public disconnectSocket(playerId: string): void {
    for (const [code, room] of this.rooms.entries()) {
      if (room.sockets.has(playerId)) {
        room.sockets.delete(playerId);
        if (room.sockets.size === 0) {
          this.clearTimers(room);
          // Keep room briefly in memory or clean up after inactivity
          setTimeout(() => {
            const current = this.rooms.get(code);
            if (current && current.sockets.size === 0) {
              this.rooms.delete(code);
            }
          }, 1000 * 60 * 10);
        }
      }
    }
  }

  public getRoom(roomCode: string): InternalRoom | undefined {
    return this.rooms.get(roomCode.trim().toUpperCase());
  }

  public startGame(roomCode: string): boolean {
    const room = this.getRoom(roomCode);
    if (!room) return false;

    this.clearTimers(room);
    room.currentRound = 0;
    room.isRevivalActive = false;
    room.revivalOffered = false;
    room.lastReveal = null;
    if (!room.deck || room.deck.length === 0) {
      room.deck = [...getQuestionsForSubject(room.subject)];
    }
    room.totalRounds = room.deck.length;
    room.difficultyLevel = 5;

    for (const player of room.players.values()) {
      player.visa = 3;
      player.score = 0;
      player.streak = 0;
      player.status = 'active';
      player.tabSwitches = 0;
      player.hasAnsweredCurrent = false;
      player.revivalUsed = false;
      player.lastCorrect = undefined;
      player.lastResponseMs = undefined;
      player.lastVisaDelta = undefined;
      player.lastScoreDelta = undefined;
      player.suitStats = createEmptySuitStats();
      player.topicStats = {};
      player.answerLog = [];
    }

    this.advanceToNextRound(room);
    return true;
  }

  public injectQuestion(roomCode: string, question: ServerQuestion, immediate = false): boolean {
    const room = this.getRoom(roomCode);
    if (!room) return false;

    if (immediate && (room.fsmState === 'Lobby' || room.fsmState === 'Result')) {
      room.deck.splice(room.currentRound, 0, question);
      room.totalRounds = room.deck.length;
      this.pushLog(
        room,
        `Quản trò AI vừa rèn một lá bài mới [${question.cardRank} ${SUIT_LABEL_VI[question.suit]}] cho vòng tiếp theo.`,
        'escalate'
      );
      this.advanceToNextRound(room);
      return true;
    }

    room.deck.splice(room.currentRound, 0, question);
    room.totalRounds = room.deck.length;
    this.pushLog(
      room,
      `Lá bài AI [${question.cardRank} ${SUIT_LABEL_VI[question.suit]}] đã được nạp vào bộ bài đấu trường.`,
      'escalate'
    );
    this.broadcast(room);
    return true;
  }

  private advanceToNextRound(room: InternalRoom): void {
    this.clearTimers(room);

    const activePlayers = Array.from(room.players.values()).filter(
      (p) => p.status === 'active' || p.status === 'revived'
    );

    if (activePlayers.length === 0) {
      room.fsmState = 'Leaderboard';
      this.pushLog(room, 'Không còn Kẻ tham gia nào sống sót. Đấu trường đóng cửa.', 'execution');
      this.broadcast(room);
      return;
    }

    if (room.currentRound >= room.deck.length) {
      room.fsmState = 'Leaderboard';
      this.pushLog(
        room,
        'Trò chơi kết thúc. Những người sống sót sẽ được gia hạn Visa và ghi tên lên bảng phân tích.',
        'briefing'
      );
      this.broadcast(room);
      return;
    }

    const nextQuestion = room.deck[room.currentRound];
    room.currentRound += 1;
    room.isRevivalActive = false;
    room.activeQuestion = nextQuestion;
    room.submissions.clear();
    room.lastReveal = null;

    for (const p of room.players.values()) {
      p.hasAnsweredCurrent = false;
      p.lastCorrect = undefined;
      p.lastResponseMs = undefined;
      p.lastVisaDelta = undefined;
      p.lastScoreDelta = undefined;
    }

    room.fsmState = 'Cutscene';
    const suitBrief: Record<CardSuit, string> = {
      spades: `Lá bài ${nextQuestion.cardRank} Bích — Thử thách tốc độ. Chậm trễ đồng nghĩa với mất Visa.`,
      hearts: `Lá bài ${nextQuestion.cardRank} Cơ — Thao túng tâm lý. Ngươi có thể cược thêm Visa để nhân đôi điểm số.`,
      clubs: `Lá bài ${nextQuestion.cardRank} Chuồn — Trò chơi đồng thuận. Đa số trả lời đúng sẽ được thưởng Visa.`,
      diamonds: `Lá bài ${nextQuestion.cardRank} Rô — Logic thuần túy. Độ chính xác tuyệt đối là lối thoát duy nhất.`,
    };
    this.pushLog(room, suitBrief[nextQuestion.suit], 'briefing');
    this.broadcast(room);

    room.cutsceneTimer = setTimeout(() => {
      this.enterQuestionPhase(room);
    }, 2800);
  }

  private enterQuestionPhase(room: InternalRoom): void {
    if (!room.activeQuestion) return;
    this.clearTimers(room);
    room.fsmState = 'Question';
    room.questionStartedAt = Date.now();
    this.broadcast(room);

    room.roundTimer = setTimeout(() => {
      void this.resolveRound(room);
    }, room.activeQuestion.timeLimitMs + 350);
  }

  public submitAnswer(
    roomCode: string,
    playerId: string,
    optionIndex: number,
    wagered: boolean
  ): boolean {
    const room = this.getRoom(roomCode);
    if (!room || room.fsmState !== 'Question' || !room.activeQuestion) return false;

    const player = room.players.get(playerId);
    if (!player) return false;

    const eligible = room.isRevivalActive
      ? player.status === 'eliminated' && !player.revivalUsed
      : player.status === 'active' || player.status === 'revived';

    if (!eligible || room.submissions.has(playerId)) return false;

    const clampedOption = Math.max(0, Math.min(3, Math.floor(optionIndex)));
    const responseMs = Math.max(120, Math.min(room.activeQuestion.timeLimitMs, Date.now() - room.questionStartedAt));
    const canWager = room.activeQuestion.suit === 'hearts' && !room.isRevivalActive && player.visa >= 2;

    room.submissions.set(playerId, {
      optionIndex: clampedOption,
      responseMs,
      wagered: Boolean(wagered && canWager),
    });
    player.hasAnsweredCurrent = true;
    this.broadcast(room);

    // Check if all eligible players have answered
    const eligiblePlayers = Array.from(room.players.values()).filter((p) =>
      room.isRevivalActive
        ? p.status === 'eliminated' && !p.revivalUsed
        : p.status === 'active' || p.status === 'revived'
    );

    if (eligiblePlayers.every((p) => room.submissions.has(p.id))) {
      void this.resolveRound(room);
    }

    return true;
  }

  private async resolveRound(room: InternalRoom): Promise<void> {
    if (room.fsmState !== 'Question' || !room.activeQuestion) return;
    this.clearTimers(room);

    const q = room.activeQuestion;
    const optionCounts: [number, number, number, number] = [0, 0, 0, 0];

    const eligiblePlayers = Array.from(room.players.values()).filter((p) =>
      room.isRevivalActive
        ? p.status === 'eliminated' && !p.revivalUsed
        : p.status === 'active' || p.status === 'revived'
    );

    let correctCount = 0;
    let totalResponseMs = 0;

    for (const player of eligiblePlayers) {
      const sub = room.submissions.get(player.id);
      if (sub) {
        optionCounts[sub.optionIndex] += 1;
        totalResponseMs += sub.responseMs;
        if (sub.optionIndex === q.correctIndex) {
          correctCount += 1;
        }
      } else {
        totalResponseMs += q.timeLimitMs;
      }
    }

    const totalEligible = Math.max(1, eligiblePlayers.length);
    const accuracyPct = (correctCount / totalEligible) * 100;
    const avgResponseMs = totalResponseMs / totalEligible;
    const consensusAchieved = q.suit === 'clubs' && accuracyPct >= 60;

    let newlyEliminated = 0;

    for (const player of eligiblePlayers) {
      const sub = room.submissions.get(player.id);
      const isCorrect = sub ? sub.optionIndex === q.correctIndex : false;
      const responseMs = sub ? sub.responseMs : q.timeLimitMs;
      const wagered = sub ? sub.wagered : false;

      // Update suit & topic analytics
      const suitBucket = player.suitStats[q.suit];
      suitBucket.attempts += 1;
      suitBucket.totalResponseMs += responseMs;
      if (isCorrect) suitBucket.correct += 1;

      const topicKey = `${q.topic}::${q.suit}`;
      if (!player.topicStats[topicKey]) {
        player.topicStats[topicKey] = {
          topic: q.topic,
          suit: q.suit,
          attempts: 0,
          correct: 0,
          totalResponseMs: 0,
        };
      }
      player.topicStats[topicKey].attempts += 1;
      player.topicStats[topicKey].totalResponseMs += responseMs;
      if (isCorrect) player.topicStats[topicKey].correct += 1;

      let visaDelta = 0;
      let scoreDelta = 0;

      if (room.isRevivalActive) {
        player.revivalUsed = true;
        if (isCorrect) {
          player.status = 'revived';
          player.visa = 2;
          visaDelta = 2;
          scoreDelta = 350;
          player.score += scoreDelta;
          player.streak = 1;
        } else {
          player.status = 'eliminated';
          player.visa = 0;
          visaDelta = 0;
          newlyEliminated += 1;
        }
      } else if (isCorrect) {
        player.streak += 1;
        const speedRatio = Math.max(0, 1 - responseMs / q.timeLimitMs);
        const suitMultiplier = q.suit === 'diamonds' ? 1.35 : q.suit === 'spades' ? 1.25 : 1.1;
        const baseScore = Math.round((200 + speedRatio * 180) * suitMultiplier);
        scoreDelta = wagered ? baseScore * 2 : baseScore;
        player.score += scoreDelta;

        if (wagered && player.visa < player.maxVisa) {
          visaDelta = 1;
          player.visa = Math.min(player.maxVisa, player.visa + 1);
        } else if (consensusAchieved && player.visa < player.maxVisa) {
          visaDelta = 1;
          player.visa = Math.min(player.maxVisa, player.visa + 1);
        }
      } else {
        player.streak = 0;
        visaDelta = wagered ? -2 : -1;
        player.visa = Math.max(0, player.visa + visaDelta);
        if (player.visa === 0) {
          player.status = 'eliminated';
          newlyEliminated += 1;
        }
      }

      player.lastCorrect = isCorrect;
      player.lastResponseMs = responseMs;
      player.lastVisaDelta = visaDelta;
      player.lastScoreDelta = scoreDelta;

      player.answerLog.push({
        roundNumber: room.currentRound,
        questionId: q.id,
        suit: q.suit,
        cardRank: q.cardRank,
        difficulty: q.difficulty,
        topic: q.topic,
        selectedIndex: sub ? sub.optionIndex : null,
        correctIndex: q.correctIndex,
        isCorrect,
        responseMs,
        visaDelta,
        scoreDelta,
        wagered,
      });
    }

    const activeCount = Array.from(room.players.values()).filter(
      (p) => p.status === 'active' || p.status === 'revived'
    ).length;
    const eliminatedCount = Array.from(room.players.values()).filter(
      (p) => p.status === 'eliminated' || p.status === 'disqualified'
    ).length;
    const totalTabViolations = Array.from(room.players.values()).reduce(
      (sum, p) => sum + p.tabSwitches,
      0
    );

    // Default deterministic reaction first for <100ms instant state flip
    let difficultyAction: 'escalate' | 'maintain' | 'revival' = 'maintain';
    let dealerReaction =
      accuracyPct >= 75
        ? 'Quá dễ dàng sao? Đừng tự mãn. Quản trò đang nâng cấp độ sát thương của vòng sau.'
        : newlyEliminated > 0
          ? 'Visa chạm 0. Tia laser đã được kích hoạt từ quỹ đạo.'
          : 'Máu và thời gian vẫn đang chảy. Chuẩn bị cho lá bài kế tiếp.';

    const canOfferRevival =
      !room.isRevivalActive &&
      !room.revivalOffered &&
      Array.from(room.players.values()).some((p) => p.status === 'eliminated' && !p.revivalUsed);

    if (canOfferRevival && (activeCount === 0 || eliminatedCount >= activeCount)) {
      difficultyAction = 'revival';
      room.revivalOffered = true;
    } else if (accuracyPct >= 75 && avgResponseMs < 11000) {
      difficultyAction = 'escalate';
      room.difficultyLevel = Math.min(10, room.difficultyLevel + 2);
    }

    room.lastReveal = {
      questionId: q.id,
      correctIndex: q.correctIndex,
      explanation: q.explanation,
      optionCounts,
      consensusAchieved,
      accuracyPct,
      avgResponseMs,
      dealerReaction,
      difficultyAction,
    };

    room.fsmState = newlyEliminated > 0 ? 'Elimination' : 'Result';
    this.pushLog(
      room,
      dealerReaction,
      newlyEliminated > 0 ? 'execution' : difficultyAction === 'escalate' ? 'escalate' : 'briefing'
    );
    this.broadcast(room, { laserStrike: newlyEliminated > 0 });

    // Asynchronously enrich Dealer commentary via Gemini API without blocking <100ms round resolution
    if (process.env.GEMINI_API_KEY) {
      generateDealerRoundReaction({
        subject: room.subject,
        suit: q.suit,
        accuracyPct,
        avgResponseMs,
        eliminatedCount,
        activeCount,
        difficulty: room.difficultyLevel,
        tabViolations: totalTabViolations,
      })
        .then((aiResult) => {
          if (room.lastReveal && room.lastReveal.questionId === q.id) {
            room.lastReveal.dealerReaction = aiResult.reaction;
            if (aiResult.difficultyAction === 'escalate') {
              room.difficultyLevel = Math.min(10, room.difficultyLevel + 1);
            }
            this.pushLog(room, aiResult.reaction, aiResult.difficultyAction === 'escalate' ? 'escalate' : 'taunt');
            this.broadcast(room);
          }
        })
        .catch(() => {
          // Keep deterministic reaction if API call fails transiently
        });
    }
  }

  public nextPhase(roomCode: string): void {
    const room = this.getRoom(roomCode);
    if (!room) return;

    if (room.fsmState === 'Cutscene') {
      this.enterQuestionPhase(room);
      return;
    }

    if (room.fsmState === 'Result' || room.fsmState === 'Elimination') {
      this.advanceToNextRound(room);
    }
  }

  public async launchRevivalGame(roomCode: string): Promise<{ ok: boolean; error?: string }> {
    const room = this.getRoom(roomCode);
    if (!room) return { ok: false, error: 'Không tìm thấy phòng đấu.' };

    const eligibleRevival = Array.from(room.players.values()).filter(
      (p) => p.status === 'eliminated' && !p.revivalUsed
    );
    if (eligibleRevival.length === 0) {
      return { ok: false, error: 'Không có Người chơi bị loại nào đủ điều kiện tham gia Trò chơi Hồi sinh.' };
    }

    this.clearTimers(room);
    room.revivalOffered = true;
    room.isRevivalActive = true;

    let revivalQuestion: ServerQuestion;
    try {
      revivalQuestion = await generateAdaptiveQuestion({
        subject: room.subject,
        suit: 'hearts',
        difficulty: Math.min(10, room.difficultyLevel + 1),
        isRevival: true,
        previousTopics: room.deck.map((q) => q.topic),
        playerAccuracyPct: 35,
      });
    } catch {
      revivalQuestion = {
        id: `revival-fallback-${Date.now()}`,
        subject: room.subject,
        suit: 'hearts',
        cardRank: 'A',
        difficulty: 9,
        topic: 'Tư duy Sinh tử',
        prompt:
          'TRÒ CHƠI HỒI SINH (A♥): Trong một hệ thống thời gian thực chống gian lận, kiến trúc nào đảm bảo Client tuyệt đối không thể đọc trước đáp án dù mở DevTools Network/Memory?',
        options: [
          'Mã hóa Base64 đáp án gửi kèm payload câu hỏi',
          'Giữ đáp án hoàn toàn ở máy chủ và chỉ xác thực qua API/WebSocket sau khi khóa lựa chọn',
          'Lưu đáp án trong biến localStorage có tên ngẫu nhiên',
          'Ẩn đáp án bằng thuộc tính CSS opacity: 0',
        ],
        correctIndex: 1,
        explanation:
          'Bất kỳ dữ liệu nào gửi tới Client đều có thể bị giải mã. Chỉ giữ đáp án ở Server-Authoritative Engine mới ngăn rò rỉ tuyệt đối.',
        dealerHint: 'Một cơ hội duy nhất để hồi sinh +2 ngày Visa. Sai là chấm dứt vĩnh viễn.',
        timeLimitMs: 18000,
        source: 'bank',
      };
    }

    room.activeQuestion = revivalQuestion;
    room.submissions.clear();
    room.lastReveal = null;
    for (const p of room.players.values()) {
      p.hasAnsweredCurrent = false;
    }

    room.fsmState = 'Cutscene';
    this.pushLog(
      room,
      'TRÒ CHƠI HỒI SINH [A♥] KÍCH HOẠT. Kẻ bị loại có đúng 1 cơ hội sinh tử để giành lại 2 ngày Visa.',
      'revival'
    );
    this.broadcast(room);

    room.cutsceneTimer = setTimeout(() => {
      this.enterQuestionPhase(room);
    }, 2800);

    return { ok: true };
  }

  public reportTabViolation(roomCode: string, playerId: string): { hardReset: boolean; switches: number } {
    const room = this.getRoom(roomCode);
    if (!room) return { hardReset: false, switches: 0 };

    const player = room.players.get(playerId);
    if (!player || player.status === 'disqualified') {
      return { hardReset: false, switches: player?.tabSwitches ?? 0 };
    }

    // Only enforce during active gameplay phases
    if (room.fsmState !== 'Question' && room.fsmState !== 'Cutscene') {
      return { hardReset: false, switches: player.tabSwitches };
    }

    player.tabSwitches += 1;

    if (player.tabSwitches > 2) {
      player.visa = 0;
      player.score = 0;
      player.streak = 0;
      player.status = 'disqualified';
      this.pushLog(
        room,
        `VI PHẠM NGHIÊM TRỌNG: ${player.name} đã chuyển tab lần thứ ${player.tabSwitches}. Kích hoạt Đặt lại Cưỡng chế & vô hiệu hóa tài khoản phiên đấu.`,
        'violation'
      );
      this.broadcast(room, { hardResetPlayerId: playerId });
      return { hardReset: true, switches: player.tabSwitches };
    }

    this.pushLog(
      room,
      `CẢNH BÁO GIAN LẬN (${player.tabSwitches}/2): ${player.name} vừa rời khỏi đấu trường. Quá 2 lần sẽ bị Đặt lại Cưỡng chế ngay lập tức.`,
      'violation'
    );
    this.broadcast(room, { warningPlayerId: playerId });
    return { hardReset: false, switches: player.tabSwitches };
  }
}

export const arenaEngine = new ArenaEngine();
