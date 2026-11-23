/**
 * Firestore Real-time Serverless Arena Engine
 * Fully replaces WebSocket (/ws) with Cloud Firestore onSnapshot for 100% Serverless Vercel deployment.
 */

import {
  doc,
  setDoc,
  updateDoc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import { getQuestionsForSubject, type ServerQuestion } from './questionBank';
import type {
  ArenaQuestion,
  ArenaRoomSnapshot,
  CardSuit,
  ClientQuestion,
  DealerLogEntry,
  FsmState,
  PlayerState,
  RoundReveal,
} from '../types/game';

export interface FirestoreArenaDoc {
  roomCode: string;
  subject: string;
  fsmState: FsmState;
  currentRound: number;
  totalRounds: number;
  difficultyLevel: number;
  isRevivalActive: boolean;
  revivalOffered: boolean;
  activeQuestion: ClientQuestion | null;
  fullDeck: ArenaQuestion[];
  questionStartedAt: number;
  submissions: Record<string, { optionIndex: number; responseMs: number; wagered: boolean }>;
  lastReveal: RoundReveal | null;
  dealerMessage: string;
  dealerLogs: DealerLogEntry[];
  players: PlayerState[];
  hostPlayerId: string;
  isPublic: boolean;
  serverTime: number;
  laserStrike?: boolean;
  updatedAt: unknown;
  createdAt: unknown;
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

function toClientQuestion(
  q: ArenaQuestion | null,
  roundNumber: number,
  totalRounds: number,
  startedAt: number,
  isRevival: boolean
): ClientQuestion | null {
  if (!q) return null;
  return {
    id: q.id,
    roundNumber,
    totalRounds,
    suit: q.suit,
    cardRank: q.cardRank,
    difficulty: q.difficulty,
    topic: q.topic,
    prompt: q.prompt,
    options: q.options,
    timeLimitMs: q.timeLimitMs,
    startedAt,
    isRevival,
    dealerHint: q.dealerHint,
    wagerAllowed: q.suit === 'hearts' && !isRevival,
    source: q.source,
  };
}

/**
 * Create a new Arena room in Firestore
 */
export async function createFirestoreArena(params: {
  playerId: string;
  playerName: string;
  subject: string;
  uid?: string;
  customDeck?: ArenaQuestion[];
}): Promise<string> {
  const roomCode = generateRoomCode();
  const deck = params.customDeck && params.customDeck.length > 0
    ? [...params.customDeck]
    : [...getQuestionsForSubject(params.subject)];

  const hostPlayer = createPlayer(params.playerId, params.playerName, params.uid);
  const welcomeMsg = 'Chào mừng các Kẻ tham gia tới Borderland Arena. Visa khởi điểm: 3 ngày. Khi Visa chạm 0, tia laser sẽ khai hỏa.';

  const initialDoc: FirestoreArenaDoc = {
    roomCode,
    subject: params.subject,
    fsmState: 'Lobby',
    currentRound: 0,
    totalRounds: deck.length,
    difficultyLevel: 5,
    isRevivalActive: false,
    revivalOffered: false,
    activeQuestion: null,
    fullDeck: deck,
    questionStartedAt: 0,
    submissions: {},
    lastReveal: null,
    dealerMessage: welcomeMsg,
    dealerLogs: [
      {
        id: `log-${Date.now()}`,
        timestamp: Date.now(),
        phase: 'Lobby',
        message: welcomeMsg,
        action: 'briefing',
      },
    ],
    players: [hostPlayer],
    hostPlayerId: params.playerId,
    isPublic: true,
    serverTime: Date.now(),
    laserStrike: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(doc(db, 'arenas', roomCode), initialDoc);
  return roomCode;
}

/**
 * Join an existing Firestore arena
 */
export async function joinFirestoreArena(params: {
  roomCode: string;
  playerId: string;
  playerName: string;
  uid?: string;
}): Promise<boolean> {
  const normalized = params.roomCode.trim().toUpperCase();
  const ref = doc(db, 'arenas', normalized);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    throw new Error(`Không tìm thấy phòng đấu ${normalized}. Vui lòng kiểm tra lại mã phòng.`);
  }

  const data = snap.data() as FirestoreArenaDoc;
  const players = [...data.players];
  const existingIdx = players.findIndex((p) => p.id === params.playerId);

  if (existingIdx >= 0) {
    players[existingIdx].name = params.playerName.trim().slice(0, 32) || players[existingIdx].name;
    if (params.uid) players[existingIdx].uid = params.uid;
  } else {
    players.push(createPlayer(params.playerId, params.playerName, params.uid));
  }

  const joinLog: DealerLogEntry = {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    phase: data.fsmState,
    message: `Kẻ tham gia ${params.playerName} đã bước vào đấu trường ${normalized}.`,
    action: 'briefing',
  };

  await updateDoc(ref, {
    players,
    dealerLogs: [joinLog, ...(data.dealerLogs || [])].slice(0, 24),
    serverTime: Date.now(),
    updatedAt: serverTimestamp(),
  });

  return true;
}

/**
 * Subscribe to real-time room updates via Firestore onSnapshot
 */
export function subscribeFirestoreArena(
  roomCode: string,
  onUpdate: (snapshot: ArenaRoomSnapshot, laserStrike?: boolean) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const normalized = roomCode.trim().toUpperCase();
  const ref = doc(db, 'arenas', normalized);

  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onError?.(new Error(`Phòng ${normalized} đã bị đóng hoặc không tồn tại.`));
        return;
      }

      const data = snap.data() as FirestoreArenaDoc;
      const snapshot: ArenaRoomSnapshot = {
        roomCode: data.roomCode,
        subject: data.subject,
        fsmState: data.fsmState,
        currentRound: data.currentRound,
        totalRounds: data.totalRounds,
        difficultyLevel: data.difficultyLevel,
        isRevivalActive: data.isRevivalActive,
        revivalOffered: data.revivalOffered,
        currentQuestion: data.activeQuestion,
        lastReveal: data.lastReveal,
        dealerMessage: data.dealerMessage,
        dealerLogs: data.dealerLogs || [],
        players: data.players || [],
        hostPlayerId: data.hostPlayerId,
        serverTime: Date.now(),
      };

      onUpdate(snapshot, Boolean(data.laserStrike));
    },
    (err) => {
      console.error('Firestore Arena subscription error:', err);
      onError?.(err);
    }
  );
}

/**
 * Start the Game (Host authoritative)
 */
export async function startFirestoreArena(roomCode: string): Promise<void> {
  const ref = doc(db, 'arenas', roomCode.trim().toUpperCase());
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data() as FirestoreArenaDoc;
  const deck = data.fullDeck && data.fullDeck.length > 0
    ? data.fullDeck
    : getQuestionsForSubject(data.subject);

  const resetPlayers = (data.players || []).map((p) => ({
    ...p,
    visa: 3,
    score: 0,
    streak: 0,
    status: 'active' as const,
    tabSwitches: 0,
    hasAnsweredCurrent: false,
    revivalUsed: false,
    lastCorrect: undefined,
    lastResponseMs: undefined,
    lastVisaDelta: undefined,
    lastScoreDelta: undefined,
    suitStats: createEmptySuitStats(),
    topicStats: {},
    answerLog: [],
  }));

  const firstQuestion = deck[0];
  const suitBrief: Record<CardSuit, string> = {
    spades: `Lá bài ${firstQuestion.cardRank} Bích — Thử thách tốc độ. Chậm trễ đồng nghĩa với mất Visa.`,
    hearts: `Lá bài ${firstQuestion.cardRank} Cơ — Thao túng tâm lý. Ngươi có thể cược thêm Visa để nhân đôi điểm số.`,
    clubs: `Lá bài ${firstQuestion.cardRank} Chuồn — Trò chơi đồng thuận. Đa số trả lời đúng sẽ được thưởng Visa.`,
    diamonds: `Lá bài ${firstQuestion.cardRank} Rô — Logic thuần túy. Độ chính xác tuyệt đối là lối thoát duy nhất.`,
  };

  const cutsceneClientQ = toClientQuestion(firstQuestion, 1, deck.length, 0, false);
  const startLog: DealerLogEntry = {
    id: `log-${Date.now()}`,
    timestamp: Date.now(),
    phase: 'Cutscene',
    message: suitBrief[firstQuestion.suit],
    action: 'briefing',
  };

  // Phase 1: Cutscene
  await updateDoc(ref, {
    fsmState: 'Cutscene',
    currentRound: 1,
    totalRounds: deck.length,
    difficultyLevel: 5,
    isRevivalActive: false,
    revivalOffered: false,
    fullDeck: deck,
    activeQuestion: cutsceneClientQ,
    questionStartedAt: 0,
    submissions: {},
    lastReveal: null,
    dealerMessage: suitBrief[firstQuestion.suit],
    dealerLogs: [startLog, ...(data.dealerLogs || [])].slice(0, 24),
    players: resetPlayers,
    laserStrike: false,
    serverTime: Date.now(),
    updatedAt: serverTimestamp(),
  });

  // Phase 2: Enter Question phase after 2.6s
  setTimeout(async () => {
    try {
      const qSnap = await getDoc(ref);
      if (!qSnap.exists()) return;
      const qData = qSnap.data() as FirestoreArenaDoc;
      if (qData.fsmState !== 'Cutscene') return;

      const startedAt = Date.now();
      const liveClientQ = toClientQuestion(firstQuestion, 1, deck.length, startedAt, false);

      await updateDoc(ref, {
        fsmState: 'Question',
        activeQuestion: liveClientQ,
        questionStartedAt: startedAt,
        submissions: {},
        laserStrike: false,
        serverTime: startedAt,
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.error('Error transitioning to Question phase:', e);
    }
  }, 2600);
}

/**
 * Submit player answer in Firestore
 */
export async function submitFirestoreAnswer(params: {
  roomCode: string;
  playerId: string;
  optionIndex: number;
  wagered: boolean;
}): Promise<void> {
  const ref = doc(db, 'arenas', params.roomCode.trim().toUpperCase());
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data() as FirestoreArenaDoc;
  if (data.fsmState !== 'Question' || !data.activeQuestion) return;

  const player = (data.players || []).find((p) => p.id === params.playerId);
  if (!player) return;

  const eligible = data.isRevivalActive
    ? player.status === 'eliminated' && !player.revivalUsed
    : player.status === 'active' || player.status === 'revived';

  if (!eligible || (data.submissions && data.submissions[params.playerId])) return;

  const responseMs = Math.max(150, Math.min(data.activeQuestion.timeLimitMs, Date.now() - (data.questionStartedAt || Date.now())));
  const canWager = data.activeQuestion.suit === 'hearts' && !data.isRevivalActive && player.visa >= 2;

  const newSubmissions = {
    ...(data.submissions || {}),
    [params.playerId]: {
      optionIndex: params.optionIndex,
      responseMs,
      wagered: Boolean(params.wagered && canWager),
    },
  };

  const updatedPlayers = (data.players || []).map((p) =>
    p.id === params.playerId ? { ...p, hasAnsweredCurrent: true } : p
  );

  await updateDoc(ref, {
    submissions: newSubmissions,
    players: updatedPlayers,
    updatedAt: serverTimestamp(),
  });

  // Check if all eligible players have submitted
  const eligiblePlayers = updatedPlayers.filter((p) =>
    data.isRevivalActive
      ? p.status === 'eliminated' && !p.revivalUsed
      : p.status === 'active' || p.status === 'revived'
  );

  if (eligiblePlayers.every((p) => newSubmissions[p.id])) {
    await resolveFirestoreRound(params.roomCode);
  }
}

/**
 * Resolve round: grade answers, compute Visas, laser eliminations, and reveal
 */
export async function resolveFirestoreRound(roomCode: string): Promise<void> {
  const ref = doc(db, 'arenas', roomCode.trim().toUpperCase());
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data() as FirestoreArenaDoc;
  if (data.fsmState !== 'Question') return;

  const currentQIndex = data.currentRound - 1;
  const q = data.fullDeck[currentQIndex];
  if (!q) return;

  const submissions = data.submissions || {};
  const optionCounts: [number, number, number, number] = [0, 0, 0, 0];

  const eligiblePlayers = (data.players || []).filter((p) =>
    data.isRevivalActive
      ? p.status === 'eliminated' && !p.revivalUsed
      : p.status === 'active' || p.status === 'revived'
  );

  let correctCount = 0;
  let totalResponseMs = 0;

  for (const p of eligiblePlayers) {
    const sub = submissions[p.id];
    if (sub) {
      optionCounts[sub.optionIndex] = (optionCounts[sub.optionIndex] || 0) + 1;
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

  const updatedPlayers = (data.players || []).map((player) => {
    const isEligible = data.isRevivalActive
      ? player.status === 'eliminated' && !player.revivalUsed
      : player.status === 'active' || player.status === 'revived';

    if (!isEligible) return player;

    const sub = submissions[player.id];
    const isCorrect = sub ? sub.optionIndex === q.correctIndex : false;
    const responseMs = sub ? sub.responseMs : q.timeLimitMs;
    const wagered = sub ? sub.wagered : false;

    // Analytics
    const suitStats = { ...player.suitStats };
    const suitBucket = { ...(suitStats[q.suit] || { attempts: 0, correct: 0, totalResponseMs: 0 }) };
    suitBucket.attempts += 1;
    suitBucket.totalResponseMs += responseMs;
    if (isCorrect) suitBucket.correct += 1;
    suitStats[q.suit] = suitBucket;

    let visaDelta = 0;
    let scoreDelta = 0;
    let newVisa = player.visa;
    let newStatus = player.status;
    let newStreak = player.streak;
    let newScore = player.score;

    if (data.isRevivalActive) {
      if (isCorrect) {
        newStatus = 'revived';
        newVisa = 2;
        visaDelta = 2;
        scoreDelta = 350;
        newScore += scoreDelta;
        newStreak = 1;
      } else {
        newStatus = 'eliminated';
        newVisa = 0;
        visaDelta = 0;
        newlyEliminated += 1;
      }
    } else if (isCorrect) {
      newStreak += 1;
      const speedRatio = Math.max(0, 1 - responseMs / q.timeLimitMs);
      const suitMultiplier = q.suit === 'diamonds' ? 1.35 : q.suit === 'spades' ? 1.25 : 1.1;
      const baseScore = Math.round((200 + speedRatio * 180) * suitMultiplier);
      scoreDelta = wagered ? baseScore * 2 : baseScore;
      newScore += scoreDelta;

      if ((wagered || consensusAchieved) && newVisa < player.maxVisa) {
        visaDelta = 1;
        newVisa = Math.min(player.maxVisa, newVisa + 1);
      }
    } else {
      newStreak = 0;
      visaDelta = wagered ? -2 : -1;
      newVisa = Math.max(0, newVisa + visaDelta);
      if (newVisa === 0) {
        newStatus = 'eliminated';
        newlyEliminated += 1;
      }
    }

    const answerLog = [
      ...(player.answerLog || []),
      {
        roundNumber: data.currentRound,
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
      },
    ];

    return {
      ...player,
      visa: newVisa,
      status: newStatus,
      score: newScore,
      streak: newStreak,
      revivalUsed: data.isRevivalActive ? true : player.revivalUsed,
      lastCorrect: isCorrect,
      lastResponseMs: responseMs,
      lastVisaDelta: visaDelta,
      lastScoreDelta: scoreDelta,
      suitStats,
      answerLog,
    };
  });

  let difficultyAction: 'escalate' | 'maintain' | 'revival' = 'maintain';
  const dealerReaction =
    accuracyPct >= 75
      ? 'Quá dễ dàng sao? Đừng tự mãn. Quản trò đang tăng độ khó cho vòng kế tiếp.'
      : newlyEliminated > 0
        ? 'Visa chạm mốc 0. Tia laser quỹ đạo đã kích hoạt thanh trừng.'
        : 'Máu và thời gian vẫn đang chảy. Hãy chuẩn bị cho lá bài tiếp theo.';

  if (accuracyPct >= 75 && avgResponseMs < 11000) {
    difficultyAction = 'escalate';
  }

  const reveal: RoundReveal = {
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

  const nextState: FsmState = newlyEliminated > 0 ? 'Elimination' : 'Result';
  const revealLog: DealerLogEntry = {
    id: `log-${Date.now()}`,
    timestamp: Date.now(),
    phase: nextState,
    message: dealerReaction,
    action: newlyEliminated > 0 ? 'execution' : difficultyAction === 'escalate' ? 'escalate' : 'briefing',
  };

  await updateDoc(ref, {
    fsmState: nextState,
    lastReveal: reveal,
    players: updatedPlayers,
    laserStrike: newlyEliminated > 0,
    dealerMessage: dealerReaction,
    dealerLogs: [revealLog, ...(data.dealerLogs || [])].slice(0, 24),
    serverTime: Date.now(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Move to next round or finish match
 */
export async function nextPhaseFirestoreArena(roomCode: string): Promise<void> {
  const ref = doc(db, 'arenas', roomCode.trim().toUpperCase());
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data() as FirestoreArenaDoc;
  const activePlayers = (data.players || []).filter(
    (p) => p.status === 'active' || p.status === 'revived'
  );

  if (activePlayers.length === 0 || data.currentRound >= data.totalRounds) {
    const endLog: DealerLogEntry = {
      id: `log-${Date.now()}`,
      timestamp: Date.now(),
      phase: 'Leaderboard',
      message: 'Trò chơi kết thúc. Bảng thành tích sinh tồn chính thức được niêm phong.',
      action: 'briefing',
    };

    await updateDoc(ref, {
      fsmState: 'Leaderboard',
      laserStrike: false,
      dealerMessage: endLog.message,
      dealerLogs: [endLog, ...(data.dealerLogs || [])].slice(0, 24),
      serverTime: Date.now(),
      updatedAt: serverTimestamp(),
    });
    return;
  }

  const nextQ = data.fullDeck[data.currentRound];
  if (!nextQ) return;

  const nextRoundNumber = data.currentRound + 1;
  const suitBrief: Record<CardSuit, string> = {
    spades: `Lá bài ${nextQ.cardRank} Bích — Thử thách tốc độ. Chậm trễ đồng nghĩa với mất Visa.`,
    hearts: `Lá bài ${nextQ.cardRank} Cơ — Thao túng tâm lý. Ngươi có thể cược thêm Visa để nhân đôi điểm số.`,
    clubs: `Lá bài ${nextQ.cardRank} Chuồn — Trò chơi đồng thuận. Đa số trả lời đúng sẽ được thưởng Visa.`,
    diamonds: `Lá bài ${nextQ.cardRank} Rô — Logic thuần túy. Độ chính xác tuyệt đối là lối thoát duy nhất.`,
  };

  const cutsceneClientQ = toClientQuestion(nextQ, nextRoundNumber, data.totalRounds, 0, false);
  const nextLog: DealerLogEntry = {
    id: `log-${Date.now()}`,
    timestamp: Date.now(),
    phase: 'Cutscene',
    message: suitBrief[nextQ.suit],
    action: 'briefing',
  };

  const resetAnswerFlags = (data.players || []).map((p) => ({
    ...p,
    hasAnsweredCurrent: false,
  }));

  await updateDoc(ref, {
    fsmState: 'Cutscene',
    currentRound: nextRoundNumber,
    activeQuestion: cutsceneClientQ,
    questionStartedAt: 0,
    submissions: {},
    lastReveal: null,
    laserStrike: false,
    dealerMessage: suitBrief[nextQ.suit],
    dealerLogs: [nextLog, ...(data.dealerLogs || [])].slice(0, 24),
    players: resetAnswerFlags,
    serverTime: Date.now(),
    updatedAt: serverTimestamp(),
  });

  setTimeout(async () => {
    try {
      const qSnap = await getDoc(ref);
      if (!qSnap.exists()) return;
      const qData = qSnap.data() as FirestoreArenaDoc;
      if (qData.fsmState !== 'Cutscene') return;

      const startedAt = Date.now();
      const liveClientQ = toClientQuestion(nextQ, nextRoundNumber, data.totalRounds, startedAt, false);

      await updateDoc(ref, {
        fsmState: 'Question',
        activeQuestion: liveClientQ,
        questionStartedAt: startedAt,
        submissions: {},
        laserStrike: false,
        serverTime: startedAt,
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.error('Error transitioning to Question phase:', e);
    }
  }, 2600);
}

/**
 * Launch revival game
 */
export async function launchRevivalFirestoreArena(roomCode: string): Promise<void> {
  const ref = doc(db, 'arenas', roomCode.trim().toUpperCase());
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data() as FirestoreArenaDoc;
  const revivalDeck = getQuestionsForSubject(data.subject);
  const revivalQ = revivalDeck[Math.floor(Math.random() * revivalDeck.length)] || data.fullDeck[0];

  const revivalClientQ = toClientQuestion(revivalQ, data.currentRound, data.totalRounds, Date.now(), true);
  const revivalLog: DealerLogEntry = {
    id: `log-${Date.now()}`,
    timestamp: Date.now(),
    phase: 'Question',
    message: 'TRÒ CHƠI HỒI SINH ĐÃ KÍCH HOẠT. Những kẻ bị loại có đúng 1 cơ hội duy nhất để sống lại!',
    action: 'revival',
  };

  await updateDoc(ref, {
    fsmState: 'Question',
    isRevivalActive: true,
    revivalOffered: true,
    activeQuestion: revivalClientQ,
    questionStartedAt: Date.now(),
    submissions: {},
    lastReveal: null,
    laserStrike: false,
    dealerMessage: revivalLog.message,
    dealerLogs: [revivalLog, ...(data.dealerLogs || [])].slice(0, 24),
    serverTime: Date.now(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Report tab violation in Firestore
 */
export async function reportTabViolationFirestore(roomCode: string, playerId: string): Promise<void> {
  const ref = doc(db, 'arenas', roomCode.trim().toUpperCase());
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data() as FirestoreArenaDoc;
  const players = (data.players || []).map((p) =>
    p.id === playerId ? { ...p, tabSwitches: p.tabSwitches + 1 } : p
  );

  await updateDoc(ref, {
    players,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Set custom question deck into room
 */
export async function setCustomDeckFirestoreArena(roomCode: string, deck: ArenaQuestion[]): Promise<void> {
  const ref = doc(db, 'arenas', roomCode.trim().toUpperCase());
  await updateDoc(ref, {
    fullDeck: deck,
    totalRounds: deck.length,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Inject AI generated or custom question into the live arena
 */
export async function injectQuestionFirestoreArena(
  roomCode: string,
  question: ArenaQuestion,
  immediate?: boolean
): Promise<void> {
  const ref = doc(db, 'arenas', roomCode.trim().toUpperCase());
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data() as FirestoreArenaDoc;
  const currentRound = data.currentRound;
  const currentDeck = [...(data.fullDeck || [])];

  if (immediate) {
    currentDeck.splice(currentRound, 0, question);
  } else {
    currentDeck.push(question);
  }

  const log: DealerLogEntry = {
    id: `log-${Date.now()}`,
    timestamp: Date.now(),
    phase: data.fsmState,
    message: `Quản trò AI đã rèn và nạp lá bài mới [${question.cardRank} ${question.suit}] vào vòng đấu.`,
    action: 'briefing',
  };

  await updateDoc(ref, {
    fullDeck: currentDeck,
    totalRounds: currentDeck.length,
    dealerLogs: [log, ...(data.dealerLogs || [])].slice(0, 24),
    updatedAt: serverTimestamp(),
  });
}

