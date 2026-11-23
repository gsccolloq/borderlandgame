import {
  doc,
  setDoc,
  updateDoc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, sanitizeForFirestore } from './firebase';
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
  visaExtensionConfig?: {
    ratio: number;
    maxSlots: number;
    visaReward: number;
    question: ArenaQuestion;
  };
  registrationStartedAt?: number;
  registrationEndsAt?: number;
  registeredPlayers?: Array<{ playerId: string; name: string; timestamp: number }>;
  qualifiedPlayerIds?: string[];
  extensionSubmissions?: Record<string, { optionIndex: number; isCorrect: boolean; timestamp: number }>;
}

export const DEFAULT_VISA_EXTENSION_QUESTION: ArenaQuestion = {
  id: 'ext-default-1',
  subject: 'Thử Thách Sinh Tử',
  suit: 'hearts',
  cardRank: 'A',
  difficulty: 9,
  topic: 'Gia hạn Visa Sinh tồn',
  prompt: 'Trong thuyết Trò chơi (Game Theory), khi hai kẻ bị thanh trừng cùng đứng trước cơ hội sống sót duy nhất, nghịch lý kinh điển nào mô tả tình thế mà việc mỗi bên tối ưu hóa quyền lợi ích kỷ lại dẫn đến sự hủy diệt chung cho cả hai?',
  options: [
    'Nghịch lý Fermi (Fermi Paradox)',
    'Thế lưỡng nan của người tù (Prisoner\'s Dilemma)',
    'Nghịch lý Con quạ (Hempel\'s Raven)',
    'Nghịch lý Monty Hall',
  ],
  correctIndex: 1,
  explanation: 'Prisoner\'s Dilemma (Thế lưỡng nan của người tù) là mô hình chứng minh khi hai bên không thể tin tưởng hợp tác và cùng chọn phản bội, kết cục đạt được là cân bằng Nash tồi tệ nhất.',
  timeLimitMs: 25000,
  source: 'bank',
};

// Built-in question bank for offline/fallback mode
export const BUILTIN_QUESTION_BANK: ArenaQuestion[] = [
  {
    id: 'cs-spade-1',
    subject: 'Computer Science & Algorithms',
    suit: 'spades',
    cardRank: '4',
    difficulty: 4,
    topic: 'Phân tích Độ phức tạp',
    prompt: 'Trong thuật toán tìm kiếm nhị phân trên mảng đã sắp xếp kích thước N = 1,048,576, số phép so sánh tối đa trong trường hợp xấu nhất là bao nhiêu?',
    options: ['10 phép so sánh', '20 phép so sánh', '21 phép so sánh', '1,024 phép so sánh'],
    correctIndex: 2,
    explanation: 'log2(1,048,576) = 20, cộng thêm 1 phép kiểm tra phần tử cuối cùng nên tối đa là floor(log2(N)) + 1 = 21 phép so sánh.',
    timeLimitMs: 14000,
    source: 'bank',
  },
  {
    id: 'cs-diamond-1',
    subject: 'Computer Science & Algorithms',
    suit: 'diamonds',
    cardRank: '7',
    difficulty: 7,
    topic: 'Hệ điều hành & Đồng thời',
    prompt: 'Điều kiện nào sau đây KHÔNG PHẢI là một trong 4 điều kiện Coffman gây ra hiện tượng bế tắc (Deadlock)?',
    options: [
      'Loại trừ tương hỗ (Mutual Exclusion)',
      'Giữ và chờ (Hold and Wait)',
      'Thu hồi tài nguyên sớm (Preemption allowed)',
      'Chờ đợi vòng tròn (Circular Wait)',
    ],
    correctIndex: 2,
    explanation: '4 điều kiện Coffman gồm: Mutual Exclusion, Hold and Wait, No Preemption (Không thu hồi), và Circular Wait. Cho phép thu hồi tài nguyên (Preemption) là giải pháp phá vỡ bế tắc.',
    timeLimitMs: 22000,
    source: 'bank',
  },
  {
    id: 'cs-heart-1',
    subject: 'Computer Science & Algorithms',
    suit: 'hearts',
    cardRank: '8',
    difficulty: 8,
    topic: 'Cấu trúc Dữ liệu & Đồ thị',
    prompt: 'Độ phức tạp thời gian tối ưu nhất để tìm cây khung nhỏ nhất (MST) trên đồ thị liên thông vô hướng có V đỉnh và E cạnh sử dụng cấu trúc Disjoint Set Union (DSU) với nén đường và xếp hạng là gì?',
    options: ['O(E log V)', 'O(E α(V)) sau khi đã sắp xếp cạnh', 'O(V^2)', 'O(E + V log V)'],
    correctIndex: 1,
    explanation: 'Sau khi sắp xếp các cạnh O(E log E), mỗi thao tác Find/Union trên DSU có thời gian khấu hao O(α(V)) (hàm ngược Ackermann cực nhỏ).',
    dealerHint: 'Quản trò cảnh báo: Đừng vội đánh giá thấp độ tăng trưởng siêu chậm của hàm nghịch đảo Ackermann.',
    timeLimitMs: 22000,
    source: 'bank',
  },
  {
    id: 'cs-club-1',
    subject: 'Computer Science & Algorithms',
    suit: 'clubs',
    cardRank: '9',
    difficulty: 9,
    topic: 'Lý thuyết Tính toán & NP-Complete',
    prompt: 'Nếu một bài toán X thuộc lớp NP và tồn tại một thuật toán chuyển đổi đa thức từ bài toán 3-SAT sang X, ta có thể kết luận điều gì về X?',
    options: [
      'X giải được trong thời gian đa thức P',
      'X chắc chắn là bài toán NP-Complete',
      'X là bài toán NP-Hard',
      'Không thể kết luận được tính đầy đủ của X',
    ],
    correctIndex: 1,
    explanation: 'Vì 3-SAT là NP-Complete, việc quy dẫn đa thức 3-SAT <=p X chứng minh X là NP-Hard. Kết hợp với giả thiết X in NP, suy ra X là NP-Complete.',
    timeLimitMs: 26000,
    source: 'bank',
  },
  {
    id: 'gt-heart-1',
    subject: 'Game Theory & Strategic Logic',
    suit: 'hearts',
    cardRank: '9',
    difficulty: 9,
    topic: 'Cân bằng Nash & Điểm Yên ngựa',
    prompt: 'Trong trò chơi tổng bằng không (Zero-sum Game) với ma trận thanh toán 2x2 không có điểm yên ngựa thuần túy, định lý Minimax của John von Neumann khẳng định điều gì?',
    options: [
      'Không tồn tại bất kỳ điểm cân bằng nào',
      'Luôn tồn tại ít nhất một cân bằng Nash trong không gian chiến lược hỗn hợp',
      'Người đi trước luôn có lợi thế tuyệt đối',
      'Tổng điểm của hai người chơi luôn lớn hơn 0',
    ],
    correctIndex: 1,
    explanation: 'Định lý Minimax của Von Neumann chứng minh mọi trò chơi 2 người tổng bằng không hữu hạn luôn có nghiệm cân bằng trong không gian chiến lược hỗn hợp.',
    timeLimitMs: 25000,
    source: 'bank',
  },
  {
    id: 'stem-spade-1',
    subject: 'STEM & Quantitative Physics',
    suit: 'spades',
    cardRank: '4',
    difficulty: 4,
    topic: 'Động học',
    prompt: 'Một tia laser di chuyển trong chân không với vận tốc xấp xỉ 3×10^8 m/s. Thời gian để tia laser truyền đi quãng đường 300 km là bao nhiêu?',
    options: ['0.1 mili-giây', '1 mili-giây', '10 mili-giây', '0.01 giây'],
    correctIndex: 1,
    explanation: 't = s / c = (300 × 10^3 m) / (3 × 10^8 m/s) = 10^-3 s = 1 mili-giây.',
    timeLimitMs: 14000,
    source: 'bank',
  },
];

export function getQuestionsForSubject(subject: string): ArenaQuestion[] {
  const filtered = BUILTIN_QUESTION_BANK.filter((q) => q.subject.toLowerCase() === subject.toLowerCase());
  if (filtered.length >= 4) return filtered;
  return BUILTIN_QUESTION_BANK.slice(0, 6);
}

export function createEmptySuitStats(): PlayerState['suitStats'] {
  return {
    spades: { attempts: 0, correct: 0, totalResponseMs: 0 },
    hearts: { attempts: 0, correct: 0, totalResponseMs: 0 },
    clubs: { attempts: 0, correct: 0, totalResponseMs: 0 },
    diamonds: { attempts: 0, correct: 0, totalResponseMs: 0 },
  };
}

export function createPlayer(id: string, name: string, uid?: string): PlayerState {
  const player: PlayerState = {
    id,
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
    currentQuestionIndex: 0,
    completedQuestions: false,
  };
  if (uid && uid.trim()) {
    player.uid = uid.trim();
  }
  return player;
}

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = 'BL-';
  for (let i = 0; i < 4; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export function toClientQuestion(
  q: ArenaQuestion | null,
  roundNumber: number,
  totalRounds: number,
  startedAt: number,
  isRevival: boolean
): ClientQuestion | null {
  if (!q) return null;
  const clientQ: ClientQuestion = {
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
    wagerAllowed: q.suit === 'hearts' && !isRevival,
    source: q.source,
  };
  if (q.dealerHint) {
    clientQ.dealerHint = q.dealerHint;
  }
  return clientQ;
}

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
    : getQuestionsForSubject(params.subject);

  const hostPlayer = createPlayer(params.playerId, params.playerName, params.uid);
  const welcomeMsg = 'Chào mừng tới Borderland Arena. Visa khởi điểm: 3 ngày. Khi Visa chạm 0, tia laser quỹ đạo sẽ kích hoạt.';

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

  await setDoc(doc(db, 'arenas', roomCode), sanitizeForFirestore(initialDoc));
  return roomCode;
}

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
  const players = [...(data.players || [])];
  const existingIdx = players.findIndex((p) => p.id === params.playerId);

  if (existingIdx >= 0) {
    players[existingIdx].name = params.playerName.trim().slice(0, 32) || players[existingIdx].name;
    if (params.uid && params.uid.trim()) {
      players[existingIdx].uid = params.uid.trim();
    }
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

  await updateDoc(ref, sanitizeForFirestore({
    players,
    dealerLogs: [joinLog, ...(data.dealerLogs || [])].slice(0, 24),
    serverTime: Date.now(),
    updatedAt: serverTimestamp(),
  }));

  return true;
}

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
        onError?.(new Error(`Phòng đấu ${normalized} đã giải tán hoặc không tồn tại.`));
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
        activeQuestion: data.activeQuestion,
        questionStartedAt: data.questionStartedAt,
        submissions: data.submissions || {},
        lastReveal: data.lastReveal,
        dealerMessage: data.dealerMessage,
        dealerLogs: data.dealerLogs || [],
        players: data.players || [],
        hostPlayerId: data.hostPlayerId,
        isPublic: data.isPublic,
        serverTime: Date.now(),
        laserStrike: Boolean(data.laserStrike),
        visaExtensionConfig: data.visaExtensionConfig,
        registrationStartedAt: data.registrationStartedAt,
        registrationEndsAt: data.registrationEndsAt,
        registeredPlayers: data.registeredPlayers || [],
        qualifiedPlayerIds: data.qualifiedPlayerIds || [],
        extensionSubmissions: data.extensionSubmissions || {},
      };
      onUpdate(snapshot, Boolean(data.laserStrike));
    },
    (err) => {
      onError?.(err);
    }
  );
}

export async function startFirestoreArena(roomCode: string): Promise<void> {
  const ref = doc(db, 'arenas', roomCode.trim().toUpperCase());
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data() as FirestoreArenaDoc;
  const deck = data.fullDeck && data.fullDeck.length > 0
    ? data.fullDeck
    : getQuestionsForSubject(data.subject);

  const resetPlayers = (data.players || []).map((p) => {
    const cleaned: PlayerState = {
      ...p,
      visa: 3,
      score: 0,
      streak: 0,
      status: 'active',
      hasAnsweredCurrent: false,
      revivalUsed: false,
      tabSwitches: 0,
      currentQuestionIndex: 0,
      completedQuestions: false,
      suitStats: createEmptySuitStats(),
      topicStats: {},
      answerLog: [],
    };
    return cleaned;
  });

  const firstQ = deck[0] || null;
  const clientQ = toClientQuestion(firstQ, 1, deck.length, Date.now(), false);
  const startLog: DealerLogEntry = {
    id: `log-${Date.now()}`,
    timestamp: Date.now(),
    phase: 'Question',
    message: 'Trận chiến sinh tồn bắt đầu! Hãy chốt đáp án để vượt qua từng thử thách.',
    action: 'escalation',
  };

  await updateDoc(ref, sanitizeForFirestore({
    fsmState: 'Question',
    currentRound: 1,
    totalRounds: deck.length,
    activeQuestion: clientQ,
    questionStartedAt: Date.now(),
    submissions: {},
    lastReveal: null,
    laserStrike: false,
    players: resetPlayers,
    dealerMessage: startLog.message,
    dealerLogs: [startLog, ...(data.dealerLogs || [])].slice(0, 24),
    serverTime: Date.now(),
    updatedAt: serverTimestamp(),
  }));
}

export async function submitAnswerFirestoreArena(params: {
  roomCode: string;
  playerId: string;
  optionIndex: number;
  responseMs: number;
  wagered: boolean;
}): Promise<void> {
  const ref = doc(db, 'arenas', params.roomCode.trim().toUpperCase());
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data() as FirestoreArenaDoc;
  const submissions = {
    ...(data.submissions || {}),
    [params.playerId]: {
      optionIndex: params.optionIndex,
      responseMs: params.responseMs,
      wagered: params.wagered,
    },
  };

  const players = [...(data.players || [])];
  const pIdx = players.findIndex((p) => p.id === params.playerId);
  if (pIdx >= 0) {
    players[pIdx].hasAnsweredCurrent = true;
  }

  await updateDoc(ref, sanitizeForFirestore({
    submissions,
    players,
    serverTime: Date.now(),
    updatedAt: serverTimestamp(),
  }));
}

export async function submitIndividualAnswer(params: {
  roomCode: string;
  playerId: string;
  optionIndex: number;
  responseMs: number;
}): Promise<{ isCorrect: boolean; explanation: string; newVisa: number; newScore: number; isLaser: boolean } | null> {
  const ref = doc(db, 'arenas', params.roomCode.trim().toUpperCase());
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  const data = snap.data() as FirestoreArenaDoc;
  const players = [...(data.players || [])];
  const playerIdx = players.findIndex((p) => p.id === params.playerId);
  if (playerIdx < 0) return null;

  const player = players[playerIdx];
  const currentIdx = player.currentQuestionIndex || 0;
  const deck = data.fullDeck && data.fullDeck.length > 0
    ? data.fullDeck
    : getQuestionsForSubject(data.subject);

  const q = deck[currentIdx] || deck[0];
  if (!q) return null;

  const isCorrect = params.optionIndex === q.correctIndex;
  let newVisa = player.visa;
  let newScore = player.score;
  let newStreak = player.streak;
  let newStatus = player.status;
  let isLaser = false;

  if (isCorrect) {
    newScore += 100 + Math.max(0, 50 - Math.floor(params.responseMs / 500));
    newStreak += 1;
    newVisa = Math.min(player.maxVisa || 5, newVisa + 1);
  } else {
    newStreak = 0;
    newVisa = Math.max(0, newVisa - 1);
    if (newVisa === 0) {
      newStatus = 'eliminated';
      isLaser = true;
    }
  }

  const suitStats = { ...player.suitStats };
  const currentSuitStat = suitStats[q.suit] || { attempts: 0, correct: 0, totalResponseMs: 0 };
  suitStats[q.suit] = {
    attempts: currentSuitStat.attempts + 1,
    correct: currentSuitStat.correct + (isCorrect ? 1 : 0),
    totalResponseMs: currentSuitStat.totalResponseMs + params.responseMs,
  };

  const answerLog = [
    ...(player.answerLog || []),
    {
      round: currentIdx + 1,
      suit: q.suit,
      correct: isCorrect,
      responseMs: params.responseMs,
      timestamp: Date.now(),
    },
  ];

  players[playerIdx] = {
    ...player,
    visa: newVisa,
    score: newScore,
    streak: newStreak,
    status: newStatus,
    hasAnsweredCurrent: true,
    suitStats,
    answerLog,
  };

  const logs = [...(data.dealerLogs || [])];
  if (isLaser) {
    logs.unshift({
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      phase: 'Elimination',
      message: `Tia laser quỹ đạo giáng xuống! Kẻ tham gia ${player.name} đã bị thanh trừng do cạn kiệt Visa.`,
      action: 'elimination',
    });
  }

  await updateDoc(ref, sanitizeForFirestore({
    players,
    dealerLogs: logs.slice(0, 24),
    serverTime: Date.now(),
    updatedAt: serverTimestamp(),
  }));

  return {
    isCorrect,
    explanation: q.explanation || (isCorrect ? 'Đáp án hoàn toàn chính xác.' : 'Đáp án không chính xác.'),
    newVisa,
    newScore,
    isLaser,
  };
}

export async function advancePlayerQuestion(params: {
  roomCode: string;
  playerId: string;
}): Promise<{ completed: boolean; nextIndex: number }> {
  const ref = doc(db, 'arenas', params.roomCode.trim().toUpperCase());
  const snap = await getDoc(ref);
  if (!snap.exists()) return { completed: true, nextIndex: 0 };

  const data = snap.data() as FirestoreArenaDoc;
  const players = [...(data.players || [])];
  const playerIdx = players.findIndex((p) => p.id === params.playerId);
  if (playerIdx < 0) return { completed: true, nextIndex: 0 };

  const total = data.totalRounds || (data.fullDeck ? data.fullDeck.length : 10);
  const nextIdx = (players[playerIdx].currentQuestionIndex || 0) + 1;
  const completed = nextIdx >= total;

  players[playerIdx] = {
    ...players[playerIdx],
    currentQuestionIndex: nextIdx,
    hasAnsweredCurrent: false,
    completedQuestions: completed,
  };

  await updateDoc(ref, sanitizeForFirestore({
    players,
    serverTime: Date.now(),
    updatedAt: serverTimestamp(),
  }));

  return { completed, nextIndex: nextIdx };
}

export async function activateVisaExtension(params: {
  roomCode: string;
  ratio: number;
  visaReward?: number;
  question?: ArenaQuestion;
}): Promise<void> {
  const ref = doc(db, 'arenas', params.roomCode.trim().toUpperCase());
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data() as FirestoreArenaDoc;
  const deadPlayers = (data.players || []).filter((p) => p.status === 'eliminated' || p.visa <= 0);
  const maxSlots = Math.max(1, Math.ceil(deadPlayers.length * (params.ratio / 100)));
  const now = Date.now();
  const endsAt = now + 10000;

  const extQuestion = params.question || DEFAULT_VISA_EXTENSION_QUESTION;
  const log: DealerLogEntry = {
    id: `log-${now}`,
    timestamp: now,
    phase: 'visa_extension_registration',
    message: `QUẢN TRÒ TẠM DỪNG ĐẤU TRƯỜNG! Mở cổng đăng ký gia hạn Visa (10 giây) cho ${deadPlayers.length} kẻ đã bị loại. Giới hạn: ${maxSlots} suất (${params.ratio}%).`,
    action: 'escalation',
  };

  await updateDoc(ref, sanitizeForFirestore({
    fsmState: 'visa_extension_registration',
    registrationStartedAt: now,
    registrationEndsAt: endsAt,
    registeredPlayers: [],
    qualifiedPlayerIds: [],
    extensionSubmissions: {},
    visaExtensionConfig: {
      ratio: params.ratio,
      maxSlots,
      visaReward: params.visaReward || 1,
      question: extQuestion,
    },
    dealerMessage: log.message,
    dealerLogs: [log, ...(data.dealerLogs || [])].slice(0, 24),
    serverTime: now,
    updatedAt: serverTimestamp(),
  }));
}

export async function registerForVisaExtension(params: {
  roomCode: string;
  playerId: string;
  playerName: string;
}): Promise<{ success: boolean; position: number }> {
  const ref = doc(db, 'arenas', params.roomCode.trim().toUpperCase());
  const snap = await getDoc(ref);
  if (!snap.exists()) return { success: false, position: -1 };

  const data = snap.data() as FirestoreArenaDoc;
  if (data.fsmState !== 'visa_extension_registration') {
    return { success: false, position: -1 };
  }

  const list = [...(data.registeredPlayers || [])];
  const existingIdx = list.findIndex((x) => x.playerId === params.playerId);
  if (existingIdx >= 0) {
    return { success: true, position: existingIdx + 1 };
  }

  const now = Date.now();
  list.push({ playerId: params.playerId, name: params.playerName, timestamp: now });

  await updateDoc(ref, sanitizeForFirestore({
    registeredPlayers: list,
    serverTime: now,
    updatedAt: serverTimestamp(),
  }));

  return { success: true, position: list.length };
}

export async function startVisaExtensionQuiz(roomCode: string): Promise<void> {
  const ref = doc(db, 'arenas', roomCode.trim().toUpperCase());
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data() as FirestoreArenaDoc;
  const config = data.visaExtensionConfig;
  const maxSlots = config?.maxSlots || 1;
  const registered = data.registeredPlayers || [];
  const qualified = registered.slice(0, maxSlots).map((r) => r.playerId);

  const log: DealerLogEntry = {
    id: `log-${Date.now()}`,
    timestamp: Date.now(),
    phase: 'visa_extension_quiz',
    message: `Thời gian đăng ký kết thúc. Có ${qualified.length} kẻ nhanh tay nhất lọt vào vòng trả lời câu hỏi sinh tử gia hạn Visa!`,
    action: 'escalation',
  };

  await updateDoc(ref, sanitizeForFirestore({
    fsmState: 'visa_extension_quiz',
    qualifiedPlayerIds: qualified,
    dealerMessage: log.message,
    dealerLogs: [log, ...(data.dealerLogs || [])].slice(0, 24),
    serverTime: Date.now(),
    updatedAt: serverTimestamp(),
  }));
}

export async function submitVisaExtensionAnswer(params: {
  roomCode: string;
  playerId: string;
  optionIndex: number;
}): Promise<{ isCorrect: boolean; visaReward: number }> {
  const ref = doc(db, 'arenas', params.roomCode.trim().toUpperCase());
  const snap = await getDoc(ref);
  if (!snap.exists()) return { isCorrect: false, visaReward: 0 };

  const data = snap.data() as FirestoreArenaDoc;
  const config = data.visaExtensionConfig;
  const correctIdx = config?.question?.correctIndex ?? 1;
  const visaReward = config?.visaReward || 1;
  const isCorrect = params.optionIndex === correctIdx;

  const players = [...(data.players || [])];
  const pIdx = players.findIndex((p) => p.id === params.playerId);
  const logs = [...(data.dealerLogs || [])];

  if (pIdx >= 0) {
    if (isCorrect) {
      players[pIdx] = {
        ...players[pIdx],
        status: 'revived',
        visa: Math.max(1, visaReward),
      };
      logs.unshift({
        id: `log-${Date.now()}`,
        timestamp: Date.now(),
        phase: 'visa_extension_quiz',
        message: `Kẻ tham gia ${players[pIdx].name} đã trả lời CHÍNH XÁC câu hỏi sinh tồn! Visa được gia hạn thêm ${visaReward} ngày. Được phép hồi sinh!`,
        action: 'revival',
      });
    } else {
      logs.unshift({
        id: `log-${Date.now()}`,
        timestamp: Date.now(),
        phase: 'visa_extension_quiz',
        message: `Kẻ tham gia ${players[pIdx].name} đã trả lời SAI câu hỏi gia hạn Visa. Cơ hội sống sót cuối cùng đã tan biến.`,
        action: 'elimination',
      });
    }
  }

  const submissions = {
    ...(data.extensionSubmissions || {}),
    [params.playerId]: {
      optionIndex: params.optionIndex,
      isCorrect,
      timestamp: Date.now(),
    },
  };

  await updateDoc(ref, sanitizeForFirestore({
    players,
    extensionSubmissions: submissions,
    dealerLogs: logs.slice(0, 24),
    serverTime: Date.now(),
    updatedAt: serverTimestamp(),
  }));

  return { isCorrect, visaReward };
}

export async function resumeGameAfterExtension(roomCode: string): Promise<void> {
  const ref = doc(db, 'arenas', roomCode.trim().toUpperCase());
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data() as FirestoreArenaDoc;
  const log: DealerLogEntry = {
    id: `log-${Date.now()}`,
    timestamp: Date.now(),
    phase: 'Question',
    message: 'Host đã bấm TIẾP TỤC TRẬN ĐẤU! Toàn bộ người chơi còn sống tiếp tục thử thách từ vị trí của mình.',
    action: 'briefing',
  };

  await updateDoc(ref, sanitizeForFirestore({
    fsmState: 'Question',
    dealerMessage: log.message,
    dealerLogs: [log, ...(data.dealerLogs || [])].slice(0, 24),
    serverTime: Date.now(),
    updatedAt: serverTimestamp(),
  }));
}

export async function nextPhaseFirestoreArena(roomCode: string): Promise<void> {
  const ref = doc(db, 'arenas', roomCode.trim().toUpperCase());
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data() as FirestoreArenaDoc;
  const deck = data.fullDeck && data.fullDeck.length > 0
    ? data.fullDeck
    : getQuestionsForSubject(data.subject);

  const nextRound = (data.currentRound || 0) + 1;
  if (nextRound > deck.length) {
    await finishMatchFirestoreArena(roomCode);
    return;
  }

  const nextQ = deck[nextRound - 1];
  const clientQ = toClientQuestion(nextQ, nextRound, deck.length, Date.now(), false);

  const resetPlayers = (data.players || []).map((p) => ({
    ...p,
    hasAnsweredCurrent: false,
  }));

  await updateDoc(ref, sanitizeForFirestore({
    fsmState: 'Question',
    currentRound: nextRound,
    activeQuestion: clientQ,
    questionStartedAt: Date.now(),
    submissions: {},
    lastReveal: null,
    laserStrike: false,
    players: resetPlayers,
    serverTime: Date.now(),
    updatedAt: serverTimestamp(),
  }));
}

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
    message: 'THỬ THÁCH HỒI SINH KÍCH HOẠT: Kẻ nào bị loại có cơ hội duy nhất chuộc lại Visa.',
    action: 'revival',
  };

  await updateDoc(ref, sanitizeForFirestore({
    fsmState: 'Question',
    isRevivalActive: true,
    revivalOffered: true,
    activeQuestion: revivalClientQ,
    questionStartedAt: Date.now(),
    submissions: {},
    dealerMessage: revivalLog.message,
    dealerLogs: [revivalLog, ...(data.dealerLogs || [])].slice(0, 24),
    serverTime: Date.now(),
    updatedAt: serverTimestamp(),
  }));
}

export async function setCustomDeckFirestoreArena(roomCode: string, deck: ArenaQuestion[]): Promise<void> {
  const ref = doc(db, 'arenas', roomCode.trim().toUpperCase());
  await updateDoc(ref, sanitizeForFirestore({
    fullDeck: deck,
    totalRounds: deck.length,
    serverTime: Date.now(),
    updatedAt: serverTimestamp(),
  }));
}

export async function injectQuestionFirestoreArena(
  roomCode: string,
  question: ArenaQuestion,
  immediate: boolean
): Promise<void> {
  const ref = doc(db, 'arenas', roomCode.trim().toUpperCase());
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data() as FirestoreArenaDoc;
  const updatedDeck = [...(data.fullDeck || []), question];

  if (immediate) {
    const round = (data.currentRound || 0) + 1;
    const clientQ = toClientQuestion(question, round, updatedDeck.length, Date.now(), false);
    const log: DealerLogEntry = {
      id: `log-${Date.now()}`,
      timestamp: Date.now(),
      phase: 'Question',
      message: `Quản trò kích hoạt lá bài đặc biệt từ AI: ${question.prompt.slice(0, 60)}...`,
      action: 'escalation',
    };

    await updateDoc(ref, sanitizeForFirestore({
      fullDeck: updatedDeck,
      totalRounds: updatedDeck.length,
      currentRound: round,
      activeQuestion: clientQ,
      questionStartedAt: Date.now(),
      submissions: {},
      dealerMessage: log.message,
      dealerLogs: [log, ...(data.dealerLogs || [])].slice(0, 24),
      serverTime: Date.now(),
      updatedAt: serverTimestamp(),
    }));
  } else {
    await updateDoc(ref, sanitizeForFirestore({
      fullDeck: updatedDeck,
      totalRounds: updatedDeck.length,
      serverTime: Date.now(),
      updatedAt: serverTimestamp(),
    }));
  }
}

export async function finishMatchFirestoreArena(roomCode: string): Promise<void> {
  const ref = doc(db, 'arenas', roomCode.trim().toUpperCase());
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data() as FirestoreArenaDoc;
  const endLog: DealerLogEntry = {
    id: `log-${Date.now()}`,
    timestamp: Date.now(),
    phase: 'Leaderboard',
    message: 'Quản trò đã bấm kết thúc trận đấu. Bảng thành tích sinh tồn chính thức được niêm phong.',
    action: 'briefing',
  };

  await updateDoc(ref, sanitizeForFirestore({
    fsmState: 'Leaderboard',
    laserStrike: false,
    dealerMessage: endLog.message,
    dealerLogs: [endLog, ...(data.dealerLogs || [])].slice(0, 24),
    serverTime: Date.now(),
    updatedAt: serverTimestamp(),
  }));
}

// Aliases with 'Internal' suffix for backwards compatibility with any existing imports
export {
  createFirestoreArena as createFirestoreArenaInternal,
  joinFirestoreArena as joinFirestoreArenaInternal,
  subscribeFirestoreArena as subscribeFirestoreArenaInternal,
  startFirestoreArena as startFirestoreArenaInternal,
  submitAnswerFirestoreArena as submitAnswerFirestoreArenaInternal,
  submitIndividualAnswer as submitIndividualAnswerInternal,
  advancePlayerQuestion as advancePlayerQuestionInternal,
  activateVisaExtension as activateVisaExtensionInternal,
  registerForVisaExtension as registerForVisaExtensionInternal,
  startVisaExtensionQuiz as startVisaExtensionQuizInternal,
  submitVisaExtensionAnswer as submitVisaExtensionAnswerInternal,
  resumeGameAfterExtension as resumeGameAfterExtensionInternal,
  nextPhaseFirestoreArena as nextPhaseFirestoreArenaInternal,
  launchRevivalFirestoreArena as launchRevivalFirestoreArenaInternal,
  setCustomDeckFirestoreArena as setCustomDeckFirestoreArenaInternal,
  injectQuestionFirestoreArena as injectQuestionFirestoreArenaInternal,
  finishMatchFirestoreArena as finishMatchFirestoreArenaInternal,
  getQuestionsForSubject as getQuestionsForSubjectInternal,
  createPlayer as createPlayerInternal,
  generateRoomCode as generateRoomCodeInternal,
  toClientQuestion as toClientQuestionInternal,
  sanitizeForFirestore,
};
