import { create } from 'zustand';
import type { User } from 'firebase/auth';
import { testFirestoreConnection } from '../lib/firebase';
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

import {
  createFirestoreArenaInternal,
  joinFirestoreArenaInternal,
  subscribeFirestoreArenaInternal,
  startFirestoreArenaInternal,
  submitAnswerFirestoreArenaInternal,
  submitIndividualAnswerInternal,
  advancePlayerQuestionInternal,
  activateVisaExtensionInternal,
  registerForVisaExtensionInternal,
  startVisaExtensionQuizInternal,
  submitVisaExtensionAnswerInternal,
  resumeGameAfterExtensionInternal,
  nextPhaseFirestoreArenaInternal,
  launchRevivalFirestoreArenaInternal,
  setCustomDeckFirestoreArenaInternal,
  injectQuestionFirestoreArenaInternal,
  finishMatchFirestoreArenaInternal,
  getQuestionsForSubjectInternal,
  DEFAULT_VISA_EXTENSION_QUESTION,
  type FirestoreArenaDoc,
} from '../lib/firestoreArena';

export {
  createFirestoreArenaInternal,
  joinFirestoreArenaInternal,
  subscribeFirestoreArenaInternal,
  startFirestoreArenaInternal,
  submitAnswerFirestoreArenaInternal,
  submitIndividualAnswerInternal,
  advancePlayerQuestionInternal,
  activateVisaExtensionInternal,
  registerForVisaExtensionInternal,
  startVisaExtensionQuizInternal,
  submitVisaExtensionAnswerInternal,
  resumeGameAfterExtensionInternal,
  nextPhaseFirestoreArenaInternal,
  launchRevivalFirestoreArenaInternal,
  setCustomDeckFirestoreArenaInternal,
  injectQuestionFirestoreArenaInternal,
  finishMatchFirestoreArenaInternal,
  getQuestionsForSubjectInternal,
  DEFAULT_VISA_EXTENSION_QUESTION,
  type FirestoreArenaDoc,
};

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

  // Individual Fast-Paced Answer Actions
  submitIndividualAnswer: (params: {
    optionIndex: number;
    responseMs: number;
    wagered: boolean;
  }) => Promise<{
    isCorrect: boolean;
    scoreDelta: number;
    visaDelta: number;
    newVisa: number;
    newScore: number;
    explanation: string;
  } | null>;
  advancePlayerQuestion: (nextIndex: number) => Promise<void>;

  // Visa Extension & Projector Mode
  visaExtensionDraft: ArenaQuestion;
  setVisaExtensionDraft: (q: ArenaQuestion) => void;
  visaRewardDays: number;
  setVisaRewardDays: (days: number) => void;
  extensionRatio: number;
  setExtensionRatio: (ratio: number) => void;
  activateVisaExtension: (params?: { ratio?: number; visaReward?: number; question?: ArenaQuestion }) => Promise<void>;
  registerForVisaExtension: () => Promise<{ success: boolean; rank?: number; reason?: string }>;
  startVisaExtensionQuiz: () => Promise<void>;
  submitVisaExtensionAnswer: (optionIndex: number) => Promise<{ isCorrect: boolean; visaReward: number } | null>;
  resumeGameAfterExtension: () => Promise<void>;
  finishMatch: () => Promise<void>;
  projectorModeOpen: boolean;
  setProjectorModeOpen: (open: boolean) => void;
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
  playerName: 'NgÆ°á»i chÆ¡i 01',
  setPlayerName: (name) => {
    const trimmed = name.trim().slice(0, 32);
    set({ playerName: trimmed || 'NgÆ°á»i chÆ¡i' });
  },

  userRole: 'guest',
  userProfile: null,
  setUserRole: (role) => set({ userRole: role }),
  setUserProfile: (profile) =>
    set({
      userProfile: profile,
      userRole: profile?.role || 'guest',
      playerName:
        profile?.displayName && get().playerName === 'NgÆ°á»i chÆ¡i 01'
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
        user?.displayName && state.playerName === 'NgÆ°á»i chÆ¡i 01'
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
      set({ dealerReportError: 'HÃ£y hoÃ n thÃ nh Ã­t nháº¥t má»™t vÃ²ng Ä‘áº¥u Ä‘á»ƒ Quáº£n trÃ² AI phÃ¢n tÃ­ch.' });
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
          dealerReportError: 'ChÆ°a cáº¥u hÃ¬nh Google Gemini API Key. Vui lÃ²ng báº¥m "Settings (API Key)" trÃªn Header Ä‘á»ƒ nháº­p key.',
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
          console.warn(`Model ${from} tháº¥t báº¡i (${error}), tá»± Ä‘á»™ng chuyá»ƒn sang ${to}...`);
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
        dealerReportError: err instanceof Error ? err.message : 'KhÃ´ng thá»ƒ káº¿t ná»‘i Quáº£n trÃ² AI.',
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
        aiQuestionError: 'ChÆ°a cáº¥u hÃ¬nh Google Gemini API Key. Vui lÃ²ng báº¥m "Settings (API Key)" trÃªn Header Ä‘á»ƒ láº¥y vÃ  nháº­p key.',
        aiSteps: [
          { id: 1, name: 'Chuáº©n bá»‹ Tham sá»‘ & Kiá»ƒm tra API Key', status: 'error', detail: 'Thiáº¿u Google Gemini API Key.' },
          { id: 2, name: 'Quáº£n trÃ² AI RÃ¨n LÃ¡ bÃ i Thá»­ thÃ¡ch', status: 'stopped', detail: 'ÄÃ£ dá»«ng do lá»—i' },
          { id: 3, name: 'Kiá»ƒm Ä‘á»‹nh Cáº¥u trÃºc & NiÃªm phong ÄÃ¡p Ã¡n', status: 'stopped', detail: 'ÄÃ£ dá»«ng do lá»—i' },
        ],
      });
      return;
    }

    set({
      aiQuestionLoading: true,
      aiQuestionError: null,
      aiQuestionNotice: null,
      aiSteps: [
        { id: 1, name: 'Chuáº©n bá»‹ Tham sá»‘ & Kiá»ƒm tra API Key', status: 'completed', detail: 'API Key há»£p lá»‡' },
        { id: 2, name: 'Quáº£n trÃ² AI RÃ¨n LÃ¡ bÃ i Thá»­ thÃ¡ch', status: 'in_progress', detail: `Äang káº¿t ná»‘i ${preferredModel}...` },
        { id: 3, name: 'Kiá»ƒm Ä‘á»‹nh Cáº¥u trÃºc & NiÃªm phong ÄÃ¡p Ã¡n', status: 'idle' },
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
            console.warn(`Model ${from} gáº·p lá»—i: ${error}. Äang chuyá»ƒn sang ${to}...`);
          },
        }
      );

      const suitVi: Record<CardSuit, string> = {
        spades: 'BÃ­ch',
        hearts: 'CÆ¡',
        clubs: 'Chuá»“n',
        diamonds: 'RÃ´',
      };

      if (state.room) {
        await injectQuestionFirestoreArenaInternal(state.room.roomCode, question, Boolean(immediate));
      }

      const retryNote = retriedModels.length > 0 ? ` (Dá»± phÃ²ng tá»« ${retriedModels.join(' â†’ ')})` : '';

      set({
        aiQuestionLoading: false,
        aiActiveModel: modelUsed,
        aiQuestionNotice: `ÄÃ£ náº¡p lÃ¡ bÃ i AI [${question.cardRank} ${suitVi[question.suit] || question.suit} â€” ${question.topic}] vÃ o phÃ²ng báº±ng ${modelUsed}${retryNote}.`,
      });
    } catch (err) {
      const rawError = err instanceof Error ? err.message : 'Lá»—i káº¿t ná»‘i mÃ¡y chá»§ Quáº£n trÃ² AI.';
      set({
        aiQuestionLoading: false,
        aiQuestionError: rawError,
        aiSteps: [
          { id: 1, name: 'Chuáº©n bá»‹ Tham sá»‘ & Kiá»ƒm tra API Key', status: 'completed', detail: 'API Key há»£p lá»‡' },
          { id: 2, name: 'Quáº£n trÃ² AI RÃ¨n LÃ¡ bÃ i Thá»­ thÃ¡ch', status: 'error', detail: rawError },
          { id: 3, name: 'Kiá»ƒm Ä‘á»‹nh Cáº¥u trÃºc & NiÃªm phong ÄÃ¡p Ã¡n', status: 'stopped', detail: 'ÄÃ£ dá»«ng do lá»—i' },
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
        playerName: state.playerName || 'NgÆ°á»i chÆ¡i',
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
      set({ roomError: err instanceof Error ? err.message : 'KhÃ´ng thá»ƒ táº¡o phÃ²ng Ä‘áº¥u Firestore.' });
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
        playerName: state.playerName || 'NgÆ°á»i chÆ¡i',
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
      set({ roomError: err instanceof Error ? err.message : 'KhÃ´ng thá»ƒ tham gia phÃ²ng Ä‘áº¥u.' });
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
      set({ roomError: err instanceof Error ? err.message : 'Lá»—i khi báº¯t Ä‘áº§u tráº­n Ä‘áº¥u.' });
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
      console.error('Lá»—i khi gá»­i Ä‘Ã¡p Ã¡n:', err);
    }
  },

  nextPhase: async () => {
    const state = get();
    if (!state.room) return;
    try {
      await nextPhaseFirestoreArenaInternal(state.room.roomCode);
    } catch (err) {
      set({ roomError: err instanceof Error ? err.message : 'Lá»—i chuyá»ƒn giai Ä‘oáº¡n.' });
    }
  },

  launchRevival: async () => {
    const state = get();
    if (!state.room) return;
    try {
      await launchRevivalFirestoreArenaInternal(state.room.roomCode);
    } catch (err) {
      set({ roomError: err instanceof Error ? err.message : 'Lá»—i kÃ­ch hoáº¡t vÃ²ng Há»“i sinh.' });
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
      console.warn('Lá»—i ghi nháº­n vi pháº¡m tab:', err);
    }
  },

  // Visa Extension & Projector Mode defaults
  visaExtensionDraft: DEFAULT_VISA_EXTENSION_QUESTION,
  setVisaExtensionDraft: (q) => set({ visaExtensionDraft: q }),
  visaRewardDays: 2,
  setVisaRewardDays: (days) => set({ visaRewardDays: days }),
  extensionRatio: 50,
  setExtensionRatio: (ratio) => set({ extensionRatio: ratio }),
  projectorModeOpen: false,
  setProjectorModeOpen: (open) => set({ projectorModeOpen: open }),

  // Requirement 1: Individual Answer Submission & Immediate Advancement
  submitIndividualAnswer: async (params) => {
    const state = get();
    if (!state.room) return null;
    try {
      const res = await submitIndividualAnswerInternal({
        roomCode: state.room.roomCode,
        playerId: state.playerId,
        optionIndex: params.optionIndex,
        responseMs: params.responseMs,
        wagered: params.wagered,
      });
      return res;
    } catch (err) {
      console.error('Lá»—i ná»™p cÃ¢u tráº£ lá»i cÃ¡ nhÃ¢n:', err);
      return null;
    }
  },

  advancePlayerQuestion: async (nextIndex) => {
    const state = get();
    if (!state.room) return;
    try {
      await advancePlayerQuestionInternal({
        roomCode: state.room.roomCode,
        playerId: state.playerId,
        nextIndex,
      });
    } catch (err) {
      console.error('Lá»—i chuyá»ƒn cÃ¢u tiáº¿p theo:', err);
    }
  },

  // Requirements 2 & 3: Visa Extension Lifecycle Actions
  activateVisaExtension: async (params) => {
    const state = get();
    if (!state.room) return;
    try {
      const ratio = params?.ratio ?? state.extensionRatio ?? 50;
      const visaReward = params?.visaReward ?? state.visaRewardDays ?? 2;
      const question = params?.question ?? state.visaExtensionDraft ?? DEFAULT_VISA_EXTENSION_QUESTION;
      await activateVisaExtensionInternal({
        roomCode: state.room.roomCode,
        ratio,
        visaReward,
        question,
      });
    } catch (err) {
      set({ roomError: err instanceof Error ? err.message : 'Lá»—i kÃ­ch hoáº¡t VÃ²ng Gia háº¡n Visa.' });
    }
  },

  registerForVisaExtension: async () => {
    const state = get();
    if (!state.room) return { success: false, reason: 'ChÆ°a vÃ o phÃ²ng' };
    try {
      const res = await registerForVisaExtensionInternal({
        roomCode: state.room.roomCode,
        playerId: state.playerId,
        playerName: state.playerName,
      });
      return res;
    } catch (err) {
      return { success: false, reason: err instanceof Error ? err.message : 'Lá»—i Ä‘Äƒng kÃ½' };
    }
  },

  startVisaExtensionQuiz: async () => {
    const state = get();
    if (!state.room) return;
    try {
      await startVisaExtensionQuizInternal(state.room.roomCode);
    } catch (err) {
      console.error('Lá»—i báº¯t Ä‘áº§u cÃ¢u há»i Gia háº¡n:', err);
    }
  },

  submitVisaExtensionAnswer: async (optionIndex) => {
    const state = get();
    if (!state.room) return null;
    try {
      return await submitVisaExtensionAnswerInternal({
        roomCode: state.room.roomCode,
        playerId: state.playerId,
        optionIndex,
      });
    } catch (err) {
      console.error('Lá»—i gá»­i Ä‘Ã¡p Ã¡n Gia háº¡n:', err);
      return null;
    }
  },

  resumeGameAfterExtension: async () => {
    const state = get();
    if (!state.room) return;
    try {
      await resumeGameAfterExtensionInternal(state.room.roomCode);
    } catch (err) {
      set({ roomError: err instanceof Error ? err.message : 'Lá»—i tiáº¿p tá»¥c tráº­n Ä‘áº¥u.' });
    }
  },

  finishMatch: async () => {
    const state = get();
    if (!state.room) return;
    try {
      await finishMatchFirestoreArenaInternal(state.room.roomCode);
    } catch (err) {
      set({ roomError: err instanceof Error ? err.message : 'Lá»—i káº¿t thÃºc tráº­n Ä‘áº¥u.' });
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
