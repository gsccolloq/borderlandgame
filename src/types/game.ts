export type CardSuit = 'spades' | 'hearts' | 'clubs' | 'diamonds';

export type UserRole = 'admin' | 'host' | 'pending' | 'blocked' | 'guest';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  totalVisaEarned?: number;
  gamesPlayed?: number;
  gamesSurvived?: number;
  avgResponseMs?: number;
  tabViolationsTotal?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PreauthorizedHost {
  email: string;
  role: 'host';
  grantedBy: string;
  createdAt?: unknown;
}

export interface ExcelQuestionRow {
  stt: number;
  prompt: string;
  options: [string, string, string, string];
  correctAnswerRaw: string;
  correctIndex: number;
  difficulty: number;
  timeLimitSec: number;
  roundNumber: number;
  topic?: string;
  suit?: CardSuit;
  isValid: boolean;
  errors: string[];
}

export interface ColumnMapping {
  prompt: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: string;
  difficulty: string;
  timeLimitSec: string;
  roundNumber: string;
}

export interface ArenaQuestion {
  id: string;
  subject: string;
  suit: CardSuit;
  cardRank: string;
  difficulty: number;
  topic: string;
  prompt: string;
  options: [string, string, string, string];
  correctIndex: number;
  explanation: string;
  dealerHint?: string;
  timeLimitMs: number;
  source: 'bank' | 'gemini' | 'excel';
}

export type FsmState =
  | 'Lobby'
  | 'Cutscene'
  | 'Question'
  | 'Result'
  | 'Elimination'
  | 'Leaderboard';

export type PlayerStatus = 'active' | 'eliminated' | 'revived' | 'disqualified';

export interface ClientQuestion {
  id: string;
  roundNumber: number;
  totalRounds: number;
  suit: CardSuit;
  cardRank: string;
  difficulty: number; // 1 to 10
  topic: string;
  prompt: string;
  options: [string, string, string, string];
  timeLimitMs: number;
  startedAt: number;
  isRevival: boolean;
  dealerHint?: string;
  wagerAllowed: boolean;
  source: 'bank' | 'gemini' | 'excel';
}

export interface RoundReveal {
  questionId: string;
  correctIndex: number;
  explanation: string;
  optionCounts: [number, number, number, number];
  consensusAchieved: boolean;
  accuracyPct: number;
  avgResponseMs: number;
  dealerReaction: string;
  difficultyAction: 'escalate' | 'maintain' | 'revival';
  nextSuitHint?: CardSuit;
}

export interface SuitMetric {
  attempts: number;
  correct: number;
  totalResponseMs: number;
}

export interface TopicMetric {
  topic: string;
  suit: CardSuit;
  attempts: number;
  correct: number;
  totalResponseMs: number;
}

export interface QuestionLogEntry {
  roundNumber: number;
  questionId: string;
  suit: CardSuit;
  cardRank: string;
  difficulty: number;
  topic: string;
  selectedIndex: number | null;
  correctIndex: number;
  isCorrect: boolean;
  responseMs: number;
  visaDelta: number;
  scoreDelta: number;
  wagered: boolean;
}

export interface PlayerState {
  id: string;
  uid?: string;
  name: string;
  visa: number;
  maxVisa: number;
  score: number;
  streak: number;
  status: PlayerStatus;
  tabSwitches: number;
  hasAnsweredCurrent: boolean;
  lastCorrect?: boolean;
  lastResponseMs?: number;
  lastVisaDelta?: number;
  lastScoreDelta?: number;
  revivalUsed: boolean;
  suitStats: Record<CardSuit, SuitMetric>;
  topicStats: Record<string, TopicMetric>;
  answerLog: QuestionLogEntry[];
}

export interface DealerLogEntry {
  id: string;
  timestamp: number;
  phase: FsmState;
  message: string;
  action: 'briefing' | 'escalate' | 'taunt' | 'revival' | 'execution' | 'violation';
}

export interface ArenaRoomSnapshot {
  roomCode: string;
  subject: string;
  fsmState: FsmState;
  currentRound: number;
  totalRounds: number;
  difficultyLevel: number;
  isRevivalActive: boolean;
  revivalOffered: boolean;
  currentQuestion: ClientQuestion | null;
  lastReveal: RoundReveal | null;
  dealerMessage: string;
  dealerLogs: DealerLogEntry[];
  players: PlayerState[];
  hostPlayerId: string;
  serverTime: number;
}

export interface LeaderboardRecord {
  uid: string;
  displayName: string;
  bestScore: number;
  visaBalance: number;
  survivalRate: number;
  avgResponseMs: number;
  rankSuit: CardSuit;
  isPublic: boolean;
  updatedAt?: unknown;
}

export interface MatchHistoryRecord {
  id: string;
  ownerId: string;
  arenaCode: string;
  subject: string;
  status: 'survived' | 'eliminated' | 'disqualified';
  finalVisa: number;
  score: number;
  accuracyPct: number;
  avgResponseMs: number;
  tabSwitches: number;
  spadesScore: number;
  heartsScore: number;
  clubsScore: number;
  diamondsScore: number;
  createdAt?: unknown;
}

export interface LiveArenaRecord {
  id: string;
  hostUid: string;
  roomCode: string;
  subject: string;
  fsmState: FsmState;
  currentRound: number;
  maxRounds: number;
  activePlayers: number;
  isPublic: boolean;
}

export const SUIT_META: Record<
  CardSuit,
  {
    label: string;
    viLabel: string;
    symbol: string;
    role: string;
    color: string;
    borderClass: string;
    textClass: string;
    bgClass: string;
    timeBaseMs: number;
  }
> = {
  spades: {
    label: 'Bích',
    viLabel: 'Bích · Tốc độ & Phản xạ',
    symbol: '♠',
    role: 'Tốc độ & Phản xạ',
    color: '#3B82F6',
    borderClass: 'border-blue-500/50',
    textClass: 'text-blue-400',
    bgClass: 'bg-blue-500/15',
    timeBaseMs: 14000,
  },
  hearts: {
    label: 'Cơ',
    viLabel: 'Cơ · Thao túng Tâm lý',
    symbol: '♥',
    role: 'Đánh đổi Tâm lý',
    color: '#EF4444',
    borderClass: 'border-red-500/50',
    textClass: 'text-red-400',
    bgClass: 'bg-red-500/15',
    timeBaseMs: 22000,
  },
  clubs: {
    label: 'Chuồn',
    viLabel: 'Chuồn · Đồng thuận Tập thể',
    symbol: '♣',
    role: 'Hợp tác Đồng thuận',
    color: '#10B981',
    borderClass: 'border-emerald-500/50',
    textClass: 'text-emerald-400',
    bgClass: 'bg-emerald-500/15',
    timeBaseMs: 20000,
  },
  diamonds: {
    label: 'Rô',
    viLabel: 'Rô · Logic Thuần túy',
    symbol: '♦',
    role: 'Logic Tuyệt đối',
    color: '#F59E0B',
    borderClass: 'border-amber-500/50',
    textClass: 'text-amber-400',
    bgClass: 'bg-amber-500/15',
    timeBaseMs: 25000,
  },
};

export const ARENA_SUBJECTS = [
  'Computer Science & Algorithms',
  'Logic & Game Theory',
  'Cybersecurity & Cryptography',
  'STEM & Quantitative Physics',
] as const;

export const SUBJECT_LABELS_VI: Record<string, string> = {
  'Computer Science & Algorithms': 'Khoa học Máy tính & Thuật toán',
  'Logic & Game Theory': 'Tư duy Logic & Lý thuyết Trò chơi',
  'Cybersecurity & Cryptography': 'An ninh mạng & Mật mã học',
  'STEM & Quantitative Physics': 'Khoa học & Vật lý Định lượng',
};

export const FSM_LABELS_VI: Record<FsmState, string> = {
  Lobby: 'Sảnh chờ',
  Cutscene: 'Mở bài',
  Question: 'Thử thách',
  Result: 'Kết quả',
  Elimination: 'Thanh trừng',
  Leaderboard: 'Bảng xếp hạng',
};

export function getSubjectLabelVi(subject: string): string {
  return SUBJECT_LABELS_VI[subject] || subject;
}
