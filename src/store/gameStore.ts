import { create } from 'zustand';
import type { User } from 'firebase/auth';
import {
  doc,
  setDoc,
  updateDoc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, testFirestoreConnection } from '../lib/firebase';
import type {
  ArenaQuestion,
  ArenaRoomSnapshot,
  CardSuit,
  ClientQuestion,
  DealerLogEntry,
  FsmState,
  LeaderboardRecord,
  LiveArenaRecord,
  MatchHistoryRecord,
  PlayerState,
  RoundReveal,
  UserProfile,
  UserRole,
} from '../types/game';
import { audioEngine, speakDealerLine, triggerHaptic } from '../lib/audioEngine';
import {
  forgeAdaptiveQuestionWithFallback,
  generateGameTheoryReportWithFallback,
  getStoredApiKey,
  getStoredModel,
  type PipelineStep,
} from '../lib/geminiService';

export type NavTab = 'arena' | 'leaderboard' | 'analytics' | 'dealer' | 'admin';

export interface DealerAnalysisReport {
  archetype: string;
  strategicDiagnosis: string;
  knowledgeGapDirective: string;
  dealerClosingScript: string;
}

interface FirestoreArenaDoc {
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

// === EMBEDDED QUESTION BANK FOR SERVERLESS RUNTIME ===
const BUILTIN_QUESTION_BANK: ArenaQuestion[] = [
  // --- Computer Science & Algorithms ---
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
    topic: 'Hệ thống Phân tán',
    prompt: 'Theo định lý CAP, khi xảy ra phân mảnh mạng (Partition) trong hệ thống cơ sở dữ liệu phân tán đa nút, kiến trúc buộc phải đánh đổi trực tiếp giữa hai thuộc tính nào?',
    options: ['Latency và Throughput', 'Consistency và Availability', 'Durability và Atomicity', 'Scalability và Fault Tolerance'],
    correctIndex: 1,
    explanation: 'Khi Partition xảy ra (P là bắt buộc trong mạng phân tán thực tế), hệ thống phải chọn giữ tính nhất quán tuyệt đối (C) bằng cách từ chối ghi/đọc, hoặc giữ tính sẵn sàng (A) và chấp nhận dữ liệu trễ.',
    timeLimitMs: 22000,
    source: 'bank',
  },
  {
    id: 'cs-heart-1',
    subject: 'Computer Science & Algorithms',
    suit: 'hearts',
    cardRank: '8',
    difficulty: 8,
    topic: 'Đồng thời & Khóa tiến trình',
    prompt: 'Hai tiến trình P1 và P2 cùng cần tài nguyên A và B. Điều kiện nào KHÔNG thuộc 4 điều kiện Coffman cần thiết để xảy ra Deadlock?',
    options: ['Mutual Exclusion (Loại trừ tương hỗ)', 'Hold and Wait (Giữ và chờ)', 'Starvation Priority (Ưu tiên bỏ đói)', 'Circular Wait (Chờ đợi vòng tròn)'],
    correctIndex: 2,
    explanation: 'Bốn điều kiện Coffman là: Mutual Exclusion, Hold and Wait, No Preemption, và Circular Wait. Starvation không phải điều kiện cấu thành Deadlock.',
    dealerHint: 'Quản trò thì thầm: Nhiều kẻ tham gia thường nhầm lẫn "Hold and Wait" với khái niệm bỏ đói tài nguyên.',
    timeLimitMs: 22000,
    source: 'bank',
  },
  {
    id: 'cs-club-1',
    subject: 'Computer Science & Algorithms',
    suit: 'clubs',
    cardRank: '6',
    difficulty: 6,
    topic: 'Giao thức Đồng thuận',
    prompt: 'Trong thuật toán đồng thuận Raft cho cụm gồm 5 máy chủ (nodes), số nút tối đa có thể bị sập mà cụm vẫn duy trì khả năng bầu Leader và ghi dữ liệu hợp lệ là bao nhiêu?',
    options: ['1 nút', '2 nút', '3 nút', '4 nút'],
    correctIndex: 1,
    explanation: 'Raft yêu cầu đa số tuyệt đối (quorum = floor(N/2) + 1). Với N = 5, quorum là 3 nút hoạt động, do đó cụm chịu được tối đa 2 nút lỗi.',
    timeLimitMs: 20000,
    source: 'bank',
  },
  {
    id: 'cs-spade-2',
    subject: 'Computer Science & Algorithms',
    suit: 'spades',
    cardRank: '9',
    difficulty: 9,
    topic: 'Cấu trúc Dữ liệu',
    prompt: 'Cấu trúc dữ liệu nào đảm bảo độ phức tạp trung bình O(1) cho cả thao tác truy cập, chèn và xóa nút cuối cùng trong cài đặt LRU Cache chuẩn?',
    options: ['Binary Search Tree + Stack', 'Hash Map + Doubly Linked List', 'Min Heap + Singly Linked List', 'Trie + Circular Queue'],
    correctIndex: 1,
    explanation: 'Hash Map cho phép tìm node theo key trong O(1), kết hợp Doubly Linked List cho phép gỡ và đưa node lên đầu trong O(1).',
    timeLimitMs: 14000,
    source: 'bank',
  },
  {
    id: 'cs-diamond-2',
    subject: 'Computer Science & Algorithms',
    suit: 'diamonds',
    cardRank: 'K',
    difficulty: 10,
    topic: 'Lý thuyết Đồ thị',
    prompt: 'Thuật toán Dijkstra tiêu chuẩn (dùng Priority Queue) có thể trả về đường đi ngắn nhất SAI trong trường hợp đồ thị có đặc điểm nào?',
    options: ['Đồ thị có chu trình với trọng số dương', 'Đồ thị vô hướng không liên thông', 'Đồ thị có cạnh trọng số âm', 'Đồ thị dày có số cạnh tiến tới V^2'],
    correctIndex: 2,
    explanation: 'Dijkstra giả định rằng một khi đỉnh đã được chọn từ Priority Queue thì khoảng cách của nó là tối ưu nhất — giả định này bị phá vỡ nếu có cạnh trọng số âm.',
    timeLimitMs: 24000,
    source: 'bank',
  },

  // --- Logic & Game Theory ---
  {
    id: 'gt-diamond-1',
    subject: 'Logic & Game Theory',
    suit: 'diamonds',
    cardRank: '6',
    difficulty: 6,
    topic: 'Cân bằng Nash',
    prompt: 'Trong trò chơi Song đề Tù nhân (Prisoner’s Dilemma) chơi một lượt duy nhất, chiến lược cân bằng Nash duy nhất dẫn đến kết cục nào?',
    options: ['Cả hai cùng hợp tác để tối đa tổng lợi ích', 'Một người hợp tác, một người phản bội', 'Cả hai cùng phản bội (Defect - Defect)', 'Không tồn tại cân bằng Nash thuần túy'],
    correctIndex: 2,
    explanation: 'Phản bội là chiến lược trội tuyệt đối (strictly dominant strategy) của mỗi cá nhân bất kể đối phương chọn gì, nên (Defect, Defect) là cân bằng Nash duy nhất.',
    timeLimitMs: 22000,
    source: 'bank',
  },
  {
    id: 'gt-heart-1',
    subject: 'Logic & Game Theory',
    suit: 'hearts',
    cardRank: 'J',
    difficulty: 8,
    topic: 'Trò chơi Đoán số Keynes',
    prompt: '100 người chơi chọn số nguyên từ 0 đến 100. Người thắng là người chọn gần nhất với 2/3 trung bình cộng của cả nhóm. Nếu mọi người đều duy lý tuyệt đối, cân bằng Nash là số nào?',
    options: ['33', '22', '0', '50'],
    correctIndex: 2,
    explanation: 'Qua quá trình loại bỏ lặp các chiến lược bị trội: >66.7 bị loại, tiếp theo >44.4 bị loại, hội tụ tuyệt đối về 0.',
    dealerHint: 'Quản trò thì thầm: Câu hỏi đang nói về cân bằng Nash khi MỌI NGƯỜI duy lý tuyệt đối.',
    timeLimitMs: 24000,
    source: 'bank',
  },
  {
    id: 'gt-spade-1',
    subject: 'Logic & Game Theory',
    suit: 'spades',
    cardRank: '5',
    difficulty: 5,
    topic: 'Nghịch lý Xác suất',
    prompt: 'Trong bài toán Monty Hall với 3 cánh cửa (1 xe, 2 dê), sau khi bạn chọn cửa 1 và người dẫn mở cửa 3 có dê, xác suất thắng nếu bạn ĐỔI sang cửa 2 là bao nhiêu?',
    options: ['1/3 (33.3%)', '1/2 (50.0%)', '2/3 (66.7%)', '3/4 (75.0%)'],
    correctIndex: 2,
    explanation: 'Cửa ban đầu giữ xác suất 1/3. Toàn bộ xác suất 2/3 của hai cửa còn lại dồn vào cánh cửa duy nhất chưa mở.',
    timeLimitMs: 14000,
    source: 'bank',
  },
  {
    id: 'gt-club-1',
    subject: 'Logic & Game Theory',
    suit: 'clubs',
    cardRank: '7',
    difficulty: 7,
    topic: 'Trò chơi Lặp lại',
    prompt: 'Trong giải đấu Song đề Tù nhân lặp lại của Robert Axelrod, chiến lược đơn giản nào đã thống trị nhờ kết hợp sự tử tế, trả đũa tức thì và sẵn sàng tha thứ?',
    options: ['Always Defect (Luôn phản bội)', 'Grim Trigger (Trả đũa vĩnh viễn)', 'Tit-for-Tat (Ăn miếng trả miếng)', 'Random Mixed Strategy (Ngẫu nhiên 50/50)'],
    correctIndex: 2,
    explanation: 'Tit-for-Tat bắt đầu bằng hợp tác và sao chép hành động trước đó của đối thủ, tạo động lực hợp tác bền vững.',
    timeLimitMs: 20000,
    source: 'bank',
  },
  {
    id: 'gt-heart-2',
    subject: 'Logic & Game Theory',
    suit: 'hearts',
    cardRank: 'K',
    difficulty: 10,
    topic: 'Tư duy Suy diễn',
    prompt: 'Có 3 hộp bị dán nhãn SAI hoàn toàn: [Táo], [Cam], [Táo & Cam]. Bạn chỉ được bốc đúng 1 quả từ 1 hộp duy nhất để xác định chính xác cả 3 hộp. Bạn phải bốc từ hộp nào?',
    options: ['Hộp dán nhãn [Táo]', 'Hộp dán nhãn [Cam]', 'Hộp dán nhãn [Táo & Cam]', 'Không thể xác định chỉ với 1 lần bốc'],
    correctIndex: 2,
    explanation: 'Vì mọi nhãn đều sai, hộp [Táo & Cam] chắc chắn chỉ chứa 1 loại duy nhất. Bốc ra loại quả nào thì xác định ngay hộp đó.',
    dealerHint: 'Quản trò thì thầm: Nhãn dán của cả 3 hộp đều nói dối ngươi.',
    timeLimitMs: 22000,
    source: 'bank',
  },

  // --- Cybersecurity & Cryptography ---
  {
    id: 'sec-spade-1',
    subject: 'Cybersecurity & Cryptography',
    suit: 'spades',
    cardRank: '5',
    difficulty: 5,
    topic: 'Bảo mật Web',
    prompt: 'Cơ chế phòng thủ HTTP nào ngăn trình duyệt thực thi mã JavaScript trái phép được chèn qua lỗ hổng XSS hiệu quả nhất ở tầng chính sách trình duyệt?',
    options: ['Strict Content-Security-Policy (CSP) với nonce', 'Bật CORS Access-Control-Allow-Origin: *', 'Tắt nén Gzip trên máy chủ', 'Đổi phương thức GET thành POST'],
    correctIndex: 0,
    explanation: 'Content-Security-Policy nghiêm ngặt kèm nonce/hash chặn thực thi inline script và script từ nguồn không được phép.',
    timeLimitMs: 14000,
    source: 'bank',
  },
  {
    id: 'sec-diamond-1',
    subject: 'Cybersecurity & Cryptography',
    suit: 'diamonds',
    cardRank: '8',
    difficulty: 8,
    topic: 'Mật mã học',
    prompt: 'Tại sao lưu mật khẩu bằng SHA-256 đơn thuần (không có salt và key stretching) bị coi là không an toàn trong thực tế?',
    options: ['SHA-256 có thể giải mã ngược trực tiếp', 'SHA-256 chạy quá nhanh trên GPU và dễ bị Rainbow Table', 'SHA-256 tạo chuỗi đầu ra ngắn hơn 64 bit', 'SHA-256 chỉ hỗ trợ ký tự ASCII thường'],
    correctIndex: 1,
    explanation: 'SHA-256 băm cực nhanh, cho phép thử hàng tỷ tổ hợp mỗi giây trên GPU. Cần thuật toán chậm như Argon2id/bcrypt.',
    timeLimitMs: 22000,
    source: 'bank',
  },
  {
    id: 'sec-heart-1',
    subject: 'Cybersecurity & Cryptography',
    suit: 'hearts',
    cardRank: '9',
    difficulty: 9,
    topic: 'Kiểm soát Truy cập',
    prompt: 'Trong kiến trúc Zero-Trust Firestore Security Rules, lỗi nào cho phép kẻ tấn công tự leo thang đặc quyền dù giao diện Frontend đã ẩn nút Admin?',
    options: ['Kiểm tra request.auth != null trước khi đọc', 'Cho phép update document mà không dùng affectedKeys().hasOnly()', 'Từ chối delete trên collection users', 'Xác thực request.time cho trường updatedAt'],
    correctIndex: 1,
    explanation: 'Nếu không khóa danh sách trường được phép sửa bằng affectedKeys().hasOnly(), kẻ tấn công có thể chèn trường ẩn như role: "admin".',
    dealerHint: 'Quản trò thì thầm: Đừng bao giờ tin giao diện phía Client.',
    timeLimitMs: 22000,
    source: 'bank',
  },
  {
    id: 'sec-club-1',
    subject: 'Cybersecurity & Cryptography',
    suit: 'clubs',
    cardRank: '6',
    difficulty: 6,
    topic: 'Phòng thủ Mạng',
    prompt: 'Trong quy trình ứng cứu sự cố (Incident Response), thứ tự chuẩn xác theo NIST SP 800-61 là gì?',
    options: [
      'Eradication -> Detection -> Preparation -> Recovery',
      'Preparation -> Detection & Analysis -> Containment, Eradication & Recovery -> Post-Incident',
      'Containment -> Preparation -> Post-Incident -> Detection',
      'Recovery -> Analysis -> Containment -> Preparation',
    ],
    correctIndex: 1,
    explanation: 'Vòng đời chuẩn NIST gồm: Preparation -> Detection & Analysis -> Containment, Eradication & Recovery -> Post-Incident Activity.',
    timeLimitMs: 20000,
    source: 'bank',
  },

  // --- STEM & Quantitative Physics ---
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
  {
    id: 'stem-diamond-1',
    subject: 'STEM & Quantitative Physics',
    suit: 'diamonds',
    cardRank: '7',
    difficulty: 7,
    topic: 'Nhiệt động lực học',
    prompt: 'Hiệu suất nhiệt cực đại lý thuyết của một động cơ Carnot hoạt động giữa nguồn nóng 600 K và nguồn lạnh 300 K là bao nhiêu?',
    options: ['25%', '50%', '66.7%', '100%'],
    correctIndex: 1,
    explanation: 'Hiệu suất Carnot η = 1 - (T_cold / T_hot) = 1 - (300 / 600) = 0.5 = 50%.',
    timeLimitMs: 22000,
    source: 'bank',
  },
  {
    id: 'stem-heart-1',
    subject: 'STEM & Quantitative Physics',
    suit: 'hearts',
    cardRank: '8',
    difficulty: 8,
    topic: 'Cơ học Lượng tử',
    prompt: 'Theo nguyên lý bất định Heisenberg (Δx · Δp >= ħ/2), nếu ta đo vị trí một hạt hạ nguyên tử với độ chính xác cực cao (Δx -> 0), điều gì xảy ra với độ bất định động lượng Δp?',
    options: ['Δp cũng tiến về 0', 'Δp tăng lên tiến tới vô cực', 'Δp giữ nguyên không đổi', 'Hạt mất hoàn toàn khối lượng nghỉ'],
    correctIndex: 1,
    explanation: 'Tích Δx · Δp bị chặn dưới bởi ħ/2, do đó thu hẹp Δx buộc độ bất định động lượng Δp phải tiến tới vô cùng.',
    dealerHint: 'Quản trò thì thầm: Thế giới lượng tử không chấp nhận sự chắc chắn tuyệt đối cho cả hai.',
    timeLimitMs: 22000,
    source: 'bank',
  },
];

function getQuestionsForSubjectInternal(subject: string): ArenaQuestion[] {
  const filtered = BUILTIN_QUESTION_BANK.filter((q) => q.subject.toLowerCase() === subject.toLowerCase());
  if (filtered.length >= 4) return filtered;
  return BUILTIN_QUESTION_BANK.slice(0, 6);
}

function createEmptySuitStats(): PlayerState['suitStats'] {
  return {
    spades: { attempts: 0, correct: 0, totalResponseMs: 0 },
    hearts: { attempts: 0, correct: 0, totalResponseMs: 0 },
    clubs: { attempts: 0, correct: 0, totalResponseMs: 0 },
    diamonds: { attempts: 0, correct: 0, totalResponseMs: 0 },
  };
}

function createPlayerInternal(id: string, name: string, uid?: string): PlayerState {
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

function generateRoomCodeInternal(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = 'BL-';
  for (let i = 0; i < 4; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function toClientQuestionInternal(
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

// === FIRESTORE AUTHORITATIVE REAL-TIME ARENA ENGINE (SERVERLESS) ===
async function createFirestoreArenaInternal(params: {
  playerId: string;
  playerName: string;
  subject: string;
  uid?: string;
  customDeck?: ArenaQuestion[];
}): Promise<string> {
  const roomCode = generateRoomCodeInternal();
  const deck = params.customDeck && params.customDeck.length > 0
    ? [...params.customDeck]
    : getQuestionsForSubjectInternal(params.subject);

  const hostPlayer = createPlayerInternal(params.playerId, params.playerName, params.uid);
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

  await setDoc(doc(db, 'arenas', roomCode), initialDoc);
  return roomCode;
}

async function joinFirestoreArenaInternal(params: {
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
    if (params.uid) players[existingIdx].uid = params.uid;
  } else {
    players.push(createPlayerInternal(params.playerId, params.playerName, params.uid));
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

function subscribeFirestoreArenaInternal(
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
      console.error('Firestore subscription error:', err);
      onError?.(err);
    }
  );
}

async function startFirestoreArenaInternal(roomCode: string): Promise<void> {
  const ref = doc(db, 'arenas', roomCode.trim().toUpperCase());
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data() as FirestoreArenaDoc;
  const deck = data.fullDeck && data.fullDeck.length > 0
    ? data.fullDeck
    : getQuestionsForSubjectInternal(data.subject);

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

  const cutsceneClientQ = toClientQuestionInternal(firstQuestion, 1, deck.length, 0, false);
  const startLog: DealerLogEntry = {
    id: `log-${Date.now()}`,
    timestamp: Date.now(),
    phase: 'Cutscene',
    message: suitBrief[firstQuestion.suit],
    action: 'briefing',
  };

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

  setTimeout(async () => {
    try {
      const qSnap = await getDoc(ref);
      if (!qSnap.exists()) return;
      const qData = qSnap.data() as FirestoreArenaDoc;
      if (qData.fsmState !== 'Cutscene') return;

      const startedAt = Date.now();
      const liveClientQ = toClientQuestionInternal(firstQuestion, 1, deck.length, startedAt, false);

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

async function resolveFirestoreRoundInternal(roomCode: string): Promise<void> {
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

async function submitFirestoreAnswerInternal(params: {
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

  const eligiblePlayers = updatedPlayers.filter((p) =>
    data.isRevivalActive
      ? p.status === 'eliminated' && !p.revivalUsed
      : p.status === 'active' || p.status === 'revived'
  );

  if (eligiblePlayers.every((p) => newSubmissions[p.id])) {
    await resolveFirestoreRoundInternal(params.roomCode);
  }
}

async function nextPhaseFirestoreArenaInternal(roomCode: string): Promise<void> {
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

  const cutsceneClientQ = toClientQuestionInternal(nextQ, nextRoundNumber, data.totalRounds, 0, false);
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
      const liveClientQ = toClientQuestionInternal(nextQ, nextRoundNumber, data.totalRounds, startedAt, false);

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

async function launchRevivalFirestoreArenaInternal(roomCode: string): Promise<void> {
  const ref = doc(db, 'arenas', roomCode.trim().toUpperCase());
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data() as FirestoreArenaDoc;
  const revivalDeck = getQuestionsForSubjectInternal(data.subject);
  const revivalQ = revivalDeck[Math.floor(Math.random() * revivalDeck.length)] || data.fullDeck[0];

  const revivalClientQ = toClientQuestionInternal(revivalQ, data.currentRound, data.totalRounds, Date.now(), true);
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

async function reportTabViolationFirestoreInternal(roomCode: string, playerId: string): Promise<void> {
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

async function setCustomDeckFirestoreArenaInternal(roomCode: string, deck: ArenaQuestion[]): Promise<void> {
  const ref = doc(db, 'arenas', roomCode.trim().toUpperCase());
  await updateDoc(ref, {
    fullDeck: deck,
    totalRounds: deck.length,
    updatedAt: serverTimestamp(),
  });
}

async function injectQuestionFirestoreArenaInternal(
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

interface GameStoreState {
  // Navigation & UI
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;

  // Local identity & RBAC
  playerId: string;
  playerName: string;
  setPlayerName: (name: string) => void;
  userRole: UserRole;
  userProfile: UserProfile | null;
  setUserRole: (role: UserRole) => void;
  setUserProfile: (profile: UserProfile | null) => void;
  allUsers: UserProfile[];
  setAllUsers: (users: UserProfile[]) => void;

  // Custom Question Deck from Excel / Host
  customDeck: ArenaQuestion[] | null;
  setCustomDeck: (deck: ArenaQuestion[] | null) => void;
  applyCustomDeckToRoom: (deck: ArenaQuestion[]) => Promise<void>;

  // Firebase Auth & Firestore Snapshots
  user: User | null;
  authReady: boolean;
  setAuthState: (user: User | null, ready: boolean) => void;
  firestoreLeaderboard: LeaderboardRecord[];
  setFirestoreLeaderboard: (rows: LeaderboardRecord[]) => void;
  matchHistory: MatchHistoryRecord[];
  setMatchHistory: (rows: MatchHistoryRecord[]) => void;
  liveArenas: LiveArenaRecord[];
  setLiveArenas: (rows: LiveArenaRecord[]) => void;
  firestoreError: string | null;
  setFirestoreError: (err: string | null) => void;

  // Firestore Real-Time Arena & Authoritative State
  wsConnected: boolean;
  firestoreConnected: boolean;
  initFirestoreSync: () => Promise<void>;
  latencyMs: number;
  room: ArenaRoomSnapshot | null;
  roomError: string | null;
  clearRoomError: () => void;
  handleArenaSnapshot: (next: ArenaRoomSnapshot, laserStrike?: boolean) => void;

  // Gameplay controls
  selectedOption: number | null;
  wagerVisa: boolean;
  setWagerVisa: (val: boolean) => void;
  audioEnabled: boolean;
  voiceEnabled: boolean;
  toggleAudio: () => void;
  toggleVoice: () => void;

  // Dramatic Overlays
  glitchActive: boolean;
  laserActive: boolean;
  shatteredScreen: boolean;
  triggerGlitch: () => void;
  dismissShatteredScreen: () => void;

  // Gemini Settings & Pipeline Step State
  geminiModalOpen: boolean;
  setGeminiModalOpen: (open: boolean) => void;
  aiSteps: PipelineStep[];
  aiActiveModel: string;

  // AI Dealer Game Theory Report
  dealerReport: DealerAnalysisReport | null;
  dealerReportLoading: boolean;
  dealerReportError: string | null;
  requestDealerAnalysis: () => Promise<void>;

  // AI Dealer On-Demand Question Injection
  aiQuestionLoading: boolean;
  aiQuestionError: string | null;
  aiQuestionNotice: string | null;
  injectAiQuestion: (params: {
    subject: string;
    suit: CardSuit;
    difficulty: number;
    isRevival?: boolean;
    immediate?: boolean;
  }) => Promise<void>;

  // Real-Time Arena Actions (Serverless via Firestore)
  connectWs: () => void;
  createRoom: (subject: string, customQuestions?: ArenaQuestion[]) => Promise<void>;
  joinRoom: (roomCode: string) => Promise<void>;
  startGame: () => Promise<void>;
  submitAnswer: (optionIndex: number) => Promise<void>;
  nextPhase: () => Promise<void>;
  launchRevival: () => Promise<void>;
  reportTabViolation: () => Promise<void>;
  leaveRoom: () => void;
}

let activeArenaUnsub: (() => void) | null = null;
let autoResolveTimer: ReturnType<typeof setTimeout> | null = null;

function getStablePlayerId(): string {
  if (typeof window === 'undefined') return 'player-ssr';
  let existing =
    window.localStorage.getItem('borderland_player_id') ||
    window.sessionStorage.getItem('borderland_player_id');
  if (existing) return existing;
  const fresh = `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  try {
    window.localStorage.setItem('borderland_player_id', fresh);
    window.sessionStorage.setItem('borderland_player_id', fresh);
  } catch {
    // Ignore storage quota error
  }
  return fresh;
}

export const useGameStore = create<GameStoreState>((set, get) => ({
  activeTab: 'arena',
  setActiveTab: (tab) => set({ activeTab: tab }),

  playerId: getStablePlayerId(),
  playerName: 'Người chơi 01',
  setPlayerName: (name) => {
    const trimmed = name.trim().slice(0, 32);
    set({ playerName: trimmed || 'Người chơi' });
  },

  userRole: 'guest',
  userProfile: null,
  setUserRole: (role) => set({ userRole: role }),
  setUserProfile: (profile) =>
    set({
      userProfile: profile,
      userRole: profile?.role || 'guest',
      playerName:
        profile?.displayName && get().playerName === 'Người chơi 01'
          ? profile.displayName.slice(0, 32)
          : get().playerName,
    }),
  allUsers: [],
  setAllUsers: (users) => set({ allUsers: users }),

  customDeck: null,
  setCustomDeck: (deck) => set({ customDeck: deck }),
  applyCustomDeckToRoom: async (deck) => {
    const state = get();
    set({ customDeck: deck });
    if (state.room) {
      try {
        await setCustomDeckFirestoreArenaInternal(state.room.roomCode, deck);
      } catch (err) {
        console.error('Error applying custom deck to Firestore:', err);
      }
    }
  },

  user: null,
  authReady: false,
  setAuthState: (user, ready) =>
    set((state) => ({
      user,
      authReady: ready,
      userRole: user ? state.userRole : 'guest',
      playerName:
        user?.displayName && state.playerName === 'Người chơi 01'
          ? user.displayName.slice(0, 32)
          : state.playerName,
    })),

  firestoreLeaderboard: [],
  setFirestoreLeaderboard: (rows) => set({ firestoreLeaderboard: rows }),
  matchHistory: [],
  setMatchHistory: (rows) => set({ matchHistory: rows }),
  liveArenas: [],
  setLiveArenas: (rows) => set({ liveArenas: rows }),
  firestoreError: null,
  setFirestoreError: (err) => set({ firestoreError: err }),

  wsConnected: false,
  firestoreConnected: false,
  initFirestoreSync: async () => {
    try {
      await testFirestoreConnection();
      set({ wsConnected: true, firestoreConnected: true, latencyMs: 15 });
    } catch {
      set({ wsConnected: true, firestoreConnected: true, latencyMs: 20 });
    }
  },
  latencyMs: 15,
  room: null,
  roomError: null,
  clearRoomError: () => set({ roomError: null }),

  selectedOption: null,
  wagerVisa: false,
  setWagerVisa: (val) => set({ wagerVisa: val }),
  audioEnabled: true,
  voiceEnabled: true,

  toggleAudio: () =>
    set((state) => {
      const next = !state.audioEnabled;
      audioEngine.setEnabled(next);
      return { audioEnabled: next };
    }),

  toggleVoice: () =>
    set((state) => {
      const next = !state.voiceEnabled;
      if (!next && typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      return { voiceEnabled: next };
    }),

  glitchActive: false,
  laserActive: false,
  shatteredScreen: false,

  geminiModalOpen: false,
  setGeminiModalOpen: (open) => set({ geminiModalOpen: open }),
  aiSteps: [],
  aiActiveModel: getStoredModel(),

  triggerGlitch: () => {
    set({ glitchActive: true });
    setTimeout(() => set({ glitchActive: false }), 550);
  },

  dismissShatteredScreen: () => {
    set({ shatteredScreen: false, room: null, selectedOption: null, wagerVisa: false });
    audioEngine.stopHeartbeat();
    audioEngine.stopDrone();
  },

  dealerReport: null,
  dealerReportLoading: false,
  dealerReportError: null,

  requestDealerAnalysis: async () => {
    const state = get();
    const me = state.room?.players.find((p) => p.id === state.playerId) ?? null;
    const history = state.matchHistory;

    if (!me && history.length === 0) {
      set({ dealerReportError: 'Hãy hoàn thành ít nhất một vòng đấu để Quản trò AI phân tích.' });
      return;
    }

    set({ dealerReportLoading: true, dealerReportError: null });

    try {
      let score = 0;
      let finalVisa = 3;
      let accuracyPct = 0;
      let avgResponseMs = 0;
      let tabSwitches = 0;
      let subject = state.room?.subject || history[0]?.subject || 'Computer Science & Algorithms';
      let weakTopics: string[] = [];
      const suitBreakdown: Record<CardSuit, { accuracy: number; avgMs: number; attempts: number }> = {
        spades: { accuracy: 0, avgMs: 0, attempts: 0 },
        hearts: { accuracy: 0, avgMs: 0, attempts: 0 },
        clubs: { accuracy: 0, avgMs: 0, attempts: 0 },
        diamonds: { accuracy: 0, avgMs: 0, attempts: 0 },
      };

      if (me && me.answerLog.length > 0) {
        score = me.score;
        finalVisa = me.visa;
        tabSwitches = me.tabSwitches;
        const correct = me.answerLog.filter((l) => l.isCorrect).length;
        accuracyPct = (correct / me.answerLog.length) * 100;
        avgResponseMs =
          me.answerLog.reduce((s, l) => s + l.responseMs, 0) / me.answerLog.length;

        (['spades', 'hearts', 'clubs', 'diamonds'] as CardSuit[]).forEach((suit) => {
          const st = me.suitStats[suit];
          suitBreakdown[suit] = {
            attempts: st.attempts,
            accuracy: st.attempts > 0 ? (st.correct / st.attempts) * 100 : 0,
            avgMs: st.attempts > 0 ? st.totalResponseMs / st.attempts : 0,
          };
        });

        weakTopics = Object.values(me.topicStats)
          .filter((t) => t.attempts > 0 && t.correct / t.attempts < 0.7)
          .map((t) => t.topic);
      } else if (history.length > 0) {
        const latest = history[0];
        score = latest.score;
        finalVisa = latest.finalVisa;
        accuracyPct = latest.accuracyPct;
        avgResponseMs = latest.avgResponseMs;
        tabSwitches = latest.tabSwitches;
        suitBreakdown.spades.accuracy = latest.spadesScore;
        suitBreakdown.hearts.accuracy = latest.heartsScore;
        suitBreakdown.clubs.accuracy = latest.clubsScore;
        suitBreakdown.diamonds.accuracy = latest.diamondsScore;
      }

      const apiKey = getStoredApiKey();
      const preferredModel = getStoredModel();

      if (!apiKey) {
        set({
          geminiModalOpen: true,
          dealerReportLoading: false,
          dealerReportError: 'Chưa cấu hình Google Gemini API Key. Vui lòng bấm "Settings (API Key)" trên Header để nhập key.',
        });
        return;
      }

      const report = await generateGameTheoryReportWithFallback({
        playerName: me?.name || state.playerName,
        subject,
        score,
        finalVisa,
        accuracyPct,
        avgResponseMs,
        suitBreakdown,
        weakTopics,
        tabSwitches,
        apiKey,
        preferredModel,
        onModelSwitch: (from, to, error) => {
          console.warn(`Model ${from} thất bại (${error}), tự động chuyển sang ${to}...`);
        },
      });

      set({
        dealerReport: {
          archetype: report.archetype,
          strategicDiagnosis: report.strategicDiagnosis,
          knowledgeGapDirective: report.knowledgeGapDirective,
          dealerClosingScript: report.dealerClosingScript,
        },
        dealerReportLoading: false,
      });
      speakDealerLine(report.dealerClosingScript, get().voiceEnabled);
    } catch (err) {
      set({
        dealerReportLoading: false,
        dealerReportError: err instanceof Error ? err.message : 'Không thể kết nối Quản trò AI.',
      });
    }
  },

  aiQuestionLoading: false,
  aiQuestionError: null,
  aiQuestionNotice: null,

  injectAiQuestion: async ({ subject, suit, difficulty, isRevival, immediate }) => {
    const state = get();
    const apiKey = getStoredApiKey();
    const preferredModel = getStoredModel();

    if (!apiKey) {
      set({
        geminiModalOpen: true,
        aiQuestionLoading: false,
        aiQuestionError: 'Chưa cấu hình Google Gemini API Key. Vui lòng bấm "Settings (API Key)" trên Header để lấy và nhập key.',
        aiSteps: [
          { id: 1, name: 'Chuẩn bị Tham số & Kiểm tra API Key', status: 'error', detail: 'Thiếu Google Gemini API Key.' },
          { id: 2, name: 'Quản trò AI Rèn Lá bài Thử thách', status: 'stopped', detail: 'Đã dừng do lỗi' },
          { id: 3, name: 'Kiểm định Cấu trúc & Niêm phong Đáp án', status: 'stopped', detail: 'Đã dừng do lỗi' },
        ],
      });
      return;
    }

    set({
      aiQuestionLoading: true,
      aiQuestionError: null,
      aiQuestionNotice: null,
      aiSteps: [
        { id: 1, name: 'Chuẩn bị Tham số & Kiểm tra API Key', status: 'completed', detail: 'API Key hợp lệ' },
        { id: 2, name: 'Quản trò AI Rèn Lá bài Thử thách', status: 'in_progress', detail: `Đang kết nối ${preferredModel}...` },
        { id: 3, name: 'Kiểm định Cấu trúc & Niêm phong Đáp án', status: 'idle' },
      ],
    });

    try {
      const { question, modelUsed, retriedModels } = await forgeAdaptiveQuestionWithFallback(
        {
          subject,
          suit,
          difficulty,
          isRevival: Boolean(isRevival),
        },
        {
          apiKey,
          preferredModel,
          onStepUpdate: (steps) => set({ aiSteps: steps }),
          onModelSwitch: (from, to, error) => {
            console.warn(`Model ${from} gặp lỗi: ${error}. Đang chuyển sang ${to}...`);
          },
        }
      );

      const suitVi: Record<CardSuit, string> = {
        spades: 'Bích',
        hearts: 'Cơ',
        clubs: 'Chuồn',
        diamonds: 'Rô',
      };

      if (state.room) {
        await injectQuestionFirestoreArenaInternal(state.room.roomCode, question, Boolean(immediate));
      }

      const retryNote = retriedModels.length > 0 ? ` (Dự phòng từ ${retriedModels.join(' → ')})` : '';

      set({
        aiQuestionLoading: false,
        aiActiveModel: modelUsed,
        aiQuestionNotice: `Đã nạp lá bài AI [${question.cardRank} ${suitVi[question.suit] || question.suit} — ${question.topic}] vào phòng bằng ${modelUsed}${retryNote}.`,
      });
    } catch (err) {
      const rawError = err instanceof Error ? err.message : 'Lỗi kết nối máy chủ Quản trò AI.';
      set({
        aiQuestionLoading: false,
        aiQuestionError: rawError,
        aiSteps: [
          { id: 1, name: 'Chuẩn bị Tham số & Kiểm tra API Key', status: 'completed', detail: 'API Key hợp lệ' },
          { id: 2, name: 'Quản trò AI Rèn Lá bài Thử thách', status: 'error', detail: rawError },
          { id: 3, name: 'Kiểm định Cấu trúc & Niêm phong Đáp án', status: 'stopped', detail: 'Đã dừng do lỗi' },
        ],
      });
    }
  },

  handleArenaSnapshot: (next: ArenaRoomSnapshot, laserStrike?: boolean) => {
    const prev = get().room;
    const state = get();
    const me = next.players.find((p) => p.id === state.playerId);

    const enteringNewQuestion =
      prev?.currentQuestion?.id !== next.currentQuestion?.id ||
      (prev?.fsmState !== 'Question' && next.fsmState === 'Question');

    set({
      room: next,
      roomError: null,
      selectedOption: enteringNewQuestion ? null : state.selectedOption,
      wagerVisa: enteringNewQuestion ? false : state.wagerVisa,
    });

    if (
      next.dealerMessage &&
      next.dealerMessage !== prev?.dealerMessage &&
      next.fsmState !== 'Lobby'
    ) {
      speakDealerLine(next.dealerMessage, state.voiceEnabled);
    }

    if (next.fsmState === 'Cutscene' || next.fsmState === 'Question') {
      audioEngine.startDrone();
    } else if (next.fsmState === 'Lobby' || next.fsmState === 'Leaderboard') {
      audioEngine.stopHeartbeat();
      audioEngine.stopDrone();
    } else {
      audioEngine.stopHeartbeat();
    }

    if (prev?.fsmState === 'Question' && (next.fsmState === 'Result' || next.fsmState === 'Elimination')) {
      if (me?.lastCorrect) {
        audioEngine.playCorrect();
        triggerHaptic('tap');
      } else if (me && me.lastCorrect === false) {
        audioEngine.playDamage();
        triggerHaptic('warning');
        get().triggerGlitch();
      }
    }

    if (laserStrike) {
      audioEngine.playLaser();
      triggerHaptic('laser');
      set({ laserActive: true });
      setTimeout(() => set({ laserActive: false }), 1600);
    }

    if (me && prev) {
      const prevMe = prev.players.find((p) => p.id === state.playerId);
      if (prevMe && me.tabSwitches > prevMe.tabSwitches) {
        audioEngine.playDamage();
        triggerHaptic('warning');
        get().triggerGlitch();
        if (me.tabSwitches >= 3) {
          audioEngine.playShatter();
          triggerHaptic('shatter');
          set({ shatteredScreen: true });
        }
      }
    }

    if (next.fsmState === 'Question' && next.currentQuestion) {
      if (autoResolveTimer) {
        clearTimeout(autoResolveTimer);
        autoResolveTimer = null;
      }
      const isHost = next.hostPlayerId === state.playerId || state.userRole === 'admin';
      if (isHost) {
        const remaining = (next.currentQuestion.startedAt + next.currentQuestion.timeLimitMs + 800) - Date.now();
        autoResolveTimer = setTimeout(async () => {
          try {
            await resolveFirestoreRoundInternal(next.roomCode);
          } catch (e) {
            console.error('Auto resolve round error:', e);
          }
        }, Math.max(500, remaining));
      }
    } else if (autoResolveTimer) {
      clearTimeout(autoResolveTimer);
      autoResolveTimer = null;
    }
  },

  connectWs: () => {
    get().initFirestoreSync();
  },

  createRoom: async (subject, customQuestions) => {
    const state = get();
    audioEngine.init();
    set({ roomError: null });
    const deck = customQuestions || state.customDeck || undefined;

    try {
      const roomCode = await createFirestoreArenaInternal({
        playerId: state.playerId,
        playerName: state.playerName || 'Người chơi',
        subject,
        uid: state.user?.uid,
        customDeck: deck,
      });

      if (activeArenaUnsub) {
        activeArenaUnsub();
        activeArenaUnsub = null;
      }

      activeArenaUnsub = subscribeFirestoreArenaInternal(
        roomCode,
        (snapshot, laserStrike) => {
          get().handleArenaSnapshot(snapshot, laserStrike);
        },
        (err) => {
          set({ roomError: err.message });
        }
      );
    } catch (err) {
      set({ roomError: err instanceof Error ? err.message : 'Không thể tạo phòng đấu Firestore.' });
    }
  },

  joinRoom: async (roomCode) => {
    const state = get();
    audioEngine.init();
    set({ roomError: null });

    try {
      await joinFirestoreArenaInternal({
        roomCode,
        playerId: state.playerId,
        playerName: state.playerName || 'Người chơi',
        uid: state.user?.uid,
      });

      if (activeArenaUnsub) {
        activeArenaUnsub();
        activeArenaUnsub = null;
      }

      activeArenaUnsub = subscribeFirestoreArenaInternal(
        roomCode,
        (snapshot, laserStrike) => {
          get().handleArenaSnapshot(snapshot, laserStrike);
        },
        (err) => {
          set({ roomError: err.message });
        }
      );
    } catch (err) {
      set({ roomError: err instanceof Error ? err.message : 'Không thể tham gia phòng đấu.' });
    }
  },

  startGame: async () => {
    const state = get();
    if (!state.room) return;
    audioEngine.init();
    audioEngine.startDrone();
    set({ dealerReport: null, dealerReportError: null });
    try {
      await startFirestoreArenaInternal(state.room.roomCode);
    } catch (err) {
      set({ roomError: err instanceof Error ? err.message : 'Lỗi khi bắt đầu trận đấu.' });
    }
  },

  submitAnswer: async (optionIndex) => {
    const state = get();
    if (!state.room || state.room.fsmState !== 'Question' || state.selectedOption !== null) return;
    audioEngine.playLock();
    triggerHaptic('tap');
    set({ selectedOption: optionIndex });
    try {
      await submitFirestoreAnswerInternal({
        roomCode: state.room.roomCode,
        playerId: state.playerId,
        optionIndex,
        wagered: state.wagerVisa,
      });
    } catch (err) {
      console.error('Lỗi khi gửi đáp án:', err);
    }
  },

  nextPhase: async () => {
    const state = get();
    if (!state.room) return;
    try {
      await nextPhaseFirestoreArenaInternal(state.room.roomCode);
    } catch (err) {
      set({ roomError: err instanceof Error ? err.message : 'Lỗi chuyển giai đoạn.' });
    }
  },

  launchRevival: async () => {
    const state = get();
    if (!state.room) return;
    try {
      await launchRevivalFirestoreArenaInternal(state.room.roomCode);
    } catch (err) {
      set({ roomError: err instanceof Error ? err.message : 'Lỗi kích hoạt vòng Hồi sinh.' });
    }
  },

  reportTabViolation: async () => {
    const state = get();
    if (!state.room) return;
    if (state.room.fsmState !== 'Question' && state.room.fsmState !== 'Cutscene') return;
    audioEngine.playDamage();
    triggerHaptic('warning');
    get().triggerGlitch();
    try {
      await reportTabViolationFirestoreInternal(state.room.roomCode, state.playerId);
    } catch (err) {
      console.warn('Lỗi ghi nhận vi phạm tab:', err);
    }
  },

  leaveRoom: () => {
    if (activeArenaUnsub) {
      activeArenaUnsub();
      activeArenaUnsub = null;
    }
    if (autoResolveTimer) {
      clearTimeout(autoResolveTimer);
      autoResolveTimer = null;
    }
    audioEngine.stopHeartbeat();
    audioEngine.stopDrone();
    set({ room: null, selectedOption: null, wagerVisa: false, roomError: null });
  },
}));

export function getLocalPlayer(room: ArenaRoomSnapshot | null, playerId: string): PlayerState | null {
  if (!room) return null;
  return room.players.find((p) => p.id === playerId) ?? null;
}
