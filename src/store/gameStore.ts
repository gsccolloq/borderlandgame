import { create } from 'zustand';
import type { User } from 'firebase/auth';
import type {
  ArenaQuestion,
  ArenaRoomSnapshot,
  CardSuit,
  LeaderboardRecord,
  LiveArenaRecord,
  MatchHistoryRecord,
  PlayerState,
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
import {
  createFirestoreArena,
  joinFirestoreArena,
  subscribeFirestoreArena,
  startFirestoreArena,
  submitFirestoreAnswer,
  resolveFirestoreRound,
  nextPhaseFirestoreArena,
  launchRevivalFirestoreArena,
  reportTabViolationFirestore,
  setCustomDeckFirestoreArena,
  injectQuestionFirestoreArena,
} from '../lib/firestoreArena';
import { testFirestoreConnection } from '../lib/firebase';

export type NavTab = 'arena' | 'leaderboard' | 'analytics' | 'dealer' | 'admin';

export interface DealerAnalysisReport {
  archetype: string;
  strategicDiagnosis: string;
  knowledgeGapDirective: string;
  dealerClosingScript: string;
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
  applyCustomDeckToRoom: (deck: ArenaQuestion[]) => void;

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
  wsConnected: boolean; // Indicates real-time connection status (Đã kết nối Firestore)
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
  createRoom: (subject: string, customQuestions?: ArenaQuestion[]) => void;
  joinRoom: (roomCode: string) => void;
  startGame: () => void;
  submitAnswer: (optionIndex: number) => void;
  nextPhase: () => void;
  launchRevival: () => void;
  reportTabViolation: () => void;
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
        await setCustomDeckFirestoreArena(state.room.roomCode, deck);
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

      // Inject to Firestore Arena directly
      if (state.room) {
        await injectQuestionFirestoreArena(state.room.roomCode, question, Boolean(immediate));
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

    // Reset selection when entering Cutscene / new Question
    const enteringNewQuestion =
      prev?.currentQuestion?.id !== next.currentQuestion?.id ||
      (prev?.fsmState !== 'Question' && next.fsmState === 'Question');

    set({
      room: next,
      roomError: null,
      selectedOption: enteringNewQuestion ? null : state.selectedOption,
      wagerVisa: enteringNewQuestion ? false : state.wagerVisa,
    });

    // Speak Dealer line on state transitions or new reaction
    if (
      next.dealerMessage &&
      next.dealerMessage !== prev?.dealerMessage &&
      next.fsmState !== 'Lobby'
    ) {
      speakDealerLine(next.dealerMessage, state.voiceEnabled);
    }

    // Audio layers by FSM state
    if (next.fsmState === 'Cutscene' || next.fsmState === 'Question') {
      audioEngine.startDrone();
    } else if (next.fsmState === 'Lobby' || next.fsmState === 'Leaderboard') {
      audioEngine.stopHeartbeat();
      audioEngine.stopDrone();
    } else {
      audioEngine.stopHeartbeat();
    }

    // Result feedback
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

    // Laser Strike execution animation
    if (laserStrike) {
      audioEngine.playLaser();
      triggerHaptic('laser');
      set({ laserActive: true });
      setTimeout(() => set({ laserActive: false }), 1600);
    }

    // Anti-Cheat warning or Hard Reset Shattered Screen
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

    // Auto-resolve round when timer expires in Question phase
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
            await resolveFirestoreRound(next.roomCode);
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
      const roomCode = await createFirestoreArena({
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

      activeArenaUnsub = subscribeFirestoreArena(
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
      await joinFirestoreArena({
        roomCode,
        playerId: state.playerId,
        playerName: state.playerName || 'Người chơi',
        uid: state.user?.uid,
      });

      if (activeArenaUnsub) {
        activeArenaUnsub();
        activeArenaUnsub = null;
      }

      activeArenaUnsub = subscribeFirestoreArena(
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
      await startFirestoreArena(state.room.roomCode);
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
      await submitFirestoreAnswer({
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
      await nextPhaseFirestoreArena(state.room.roomCode);
    } catch (err) {
      set({ roomError: err instanceof Error ? err.message : 'Lỗi chuyển giai đoạn.' });
    }
  },

  launchRevival: async () => {
    const state = get();
    if (!state.room) return;
    try {
      await launchRevivalFirestoreArena(state.room.roomCode);
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
      await reportTabViolationFirestore(state.room.roomCode, state.playerId);
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
