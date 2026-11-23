import { useEffect, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import {
  auth,
  checkRedirectAuthResult,
  ensureUserProfile,
  persistCompletedMatch,
  subscribeLeaderboard,
  subscribeLiveArenas,
  subscribeMatchHistory,
  subscribeUserProfile,
  syncArenaMetadataToFirestore,
} from './lib/firebase';
import { getLocalPlayer, useGameStore } from './store/gameStore';
import { ErrorBoundary } from './components/ErrorBoundary';
import { CrtOverlay } from './components/CrtOverlay';
import { LaserStrikeOverlay } from './components/LaserStrikeOverlay';
import { ShatteredScreenOverlay } from './components/ShatteredScreenOverlay';
import { TopBar } from './components/TopBar';
import { LobbyView } from './components/LobbyView';
import { CutsceneView } from './components/CutsceneView';
import { QuestionView } from './components/QuestionView';
import { ResultView } from './components/ResultView';
import { EliminationView } from './components/EliminationView';
import { LeaderboardView } from './components/LeaderboardView';
import { AnalyticsView } from './components/AnalyticsView';
import { DealerConsoleView } from './components/DealerConsoleView';
import { AdminConsoleView } from './components/AdminConsoleView';
import { GeminiSettingsModal } from './components/GeminiSettingsModal';

function ArenaAppShell() {
  const activeTab = useGameStore((s) => s.activeTab);
  const setActiveTab = useGameStore((s) => s.setActiveTab);
  const room = useGameStore((s) => s.room);
  const playerId = useGameStore((s) => s.playerId);
  const user = useGameStore((s) => s.user);
  const userRole = useGameStore((s) => s.userRole);
  const setUserRole = useGameStore((s) => s.setUserRole);
  const setUserProfile = useGameStore((s) => s.setUserProfile);
  const authReady = useGameStore((s) => s.authReady);
  const setAuthState = useGameStore((s) => s.setAuthState);
  const setFirestoreLeaderboard = useGameStore((s) => s.setFirestoreLeaderboard);
  const setMatchHistory = useGameStore((s) => s.setMatchHistory);
  const setLiveArenas = useGameStore((s) => s.setLiveArenas);
  const setFirestoreError = useGameStore((s) => s.setFirestoreError);
  const initFirestoreSync = useGameStore((s) => s.initFirestoreSync);
  const reportTabViolation = useGameStore((s) => s.reportTabViolation);
  const glitchActive = useGameStore((s) => s.glitchActive);
  const laserActive = useGameStore((s) => s.laserActive);
  const shatteredScreen = useGameStore((s) => s.shatteredScreen);
  const dismissShatteredScreen = useGameStore((s) => s.dismissShatteredScreen);
  const geminiModalOpen = useGameStore((s) => s.geminiModalOpen);
  const setGeminiModalOpen = useGameStore((s) => s.setGeminiModalOpen);

  const persistedMatchKeyRef = useRef<string | null>(null);

  // 1. Initialize Cloud Firestore Real-time Sync & check Google redirect sign-in
  useEffect(() => {
    initFirestoreSync();
    checkRedirectAuthResult().catch((e) => {
      console.warn('Redirect auth check notice:', e);
    });
  }, [initFirestoreSync]);

  // 2. Firebase Auth listener & Real-time User Profile & RBAC role subscription
  useEffect(() => {
    let profileUnsub: (() => void) | null = null;

    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setAuthState(firebaseUser, true);

      if (profileUnsub) {
        profileUnsub();
        profileUnsub = null;
      }

      if (firebaseUser) {
        try {
          const profile = await ensureUserProfile(firebaseUser);
          if (profile) {
            setUserProfile(profile);
            setUserRole(profile.role);
          }
        } catch (err) {
          setFirestoreError(err instanceof Error ? err.message : String(err));
        }

        // Real-time listener: when Super Admin approves or updates role, UI updates instantly
        profileUnsub = subscribeUserProfile(
          firebaseUser.uid,
          (prof) => {
            if (prof) {
              setUserProfile(prof);
              setUserRole(prof.role);
            }
          },
          (err) => {
            setFirestoreError(err.message);
          }
        );
      } else {
        setUserProfile(null);
        setUserRole('guest');
      }
    });

    return () => {
      unsub();
      if (profileUnsub) profileUnsub();
    };
  }, [setAuthState, setUserProfile, setUserRole, setFirestoreError]);

  // 3. Tab RBAC Protection: redirect if unauthorized for dealer or admin tabs
  useEffect(() => {
    if (activeTab === 'admin' && userRole !== 'admin') {
      setActiveTab('arena');
    } else if (activeTab === 'dealer' && userRole !== 'admin' && userRole !== 'host') {
      setActiveTab('arena');
    }
  }, [activeTab, userRole, setActiveTab]);

  // 3. Firestore Real-time Snapshots (Public Leaderboard & Live Arenas + Authenticated History)
  useEffect(() => {
    const unsubLb = subscribeLeaderboard(setFirestoreLeaderboard, (err) =>
      setFirestoreError(err.message)
    );
    const unsubArenas = subscribeLiveArenas(setLiveArenas, (err) =>
      setFirestoreError(err.message)
    );

    let unsubHistory: (() => void) | null = null;
    if (user) {
      unsubHistory = subscribeMatchHistory(user.uid, setMatchHistory, (err) =>
        setFirestoreError(err.message)
      );
    } else {
      setMatchHistory([]);
    }

    return () => {
      unsubLb();
      unsubArenas();
      if (unsubHistory) unsubHistory();
    };
  }, [user, setFirestoreLeaderboard, setMatchHistory, setLiveArenas, setFirestoreError]);

  // 4. Sync host's live Arena metadata & persist finished MatchRecord to Firestore
  useEffect(() => {
    if (!user || !room) return;

    const isHost = room.hostPlayerId === playerId;
    if (isHost) {
      syncArenaMetadataToFirestore(user, {
        roomCode: room.roomCode,
        subject: room.subject,
        fsmState: room.fsmState,
        currentRound: room.currentRound,
        maxRounds: room.totalRounds,
        activePlayers: room.players.filter((p) => p.status === 'active' || p.status === 'revived')
          .length,
      }).catch(() => {
        // Non-blocking cloud sync
      });
    }

    if (room.fsmState === 'Leaderboard') {
      const me = getLocalPlayer(room, playerId);
      const matchKey = `${room.roomCode}-${room.currentRound}-${me?.score ?? 0}`;
      if (me && me.answerLog.length > 0 && persistedMatchKeyRef.current !== matchKey) {
        persistedMatchKeyRef.current = matchKey;
        persistCompletedMatch(user, room.roomCode, room.subject, me).catch((err) => {
          setFirestoreError(err instanceof Error ? err.message : String(err));
        });
      }
    }
  }, [user, room?.roomCode, room?.fsmState, room?.currentRound, playerId, setFirestoreError]);

  // 5. Anti-Cheat: Page Visibility API monitors tab switches during active rounds
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) {
        reportTabViolation();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [reportTabViolation]);

  const renderArenaFsm = () => {
    if (!room || room.fsmState === 'Lobby') return <LobbyView />;
    if (room.fsmState === 'Cutscene') return <CutsceneView />;
    if (room.fsmState === 'Question') return <QuestionView />;
    if (room.fsmState === 'Result') return <ResultView />;
    if (room.fsmState === 'Elimination') return <EliminationView />;
    return <LeaderboardView />;
  };

  return (
    <div
      className={`min-h-screen bg-[#090A0D] brutalist-grid text-[#E6E9F0] flex flex-col ${
        glitchActive ? 'glitch-active' : ''
      }`}
    >
      <CrtOverlay />
      <LaserStrikeOverlay active={laserActive} />
      <ShatteredScreenOverlay active={shatteredScreen} onReset={dismissShatteredScreen} />

      <TopBar />
      <GeminiSettingsModal isOpen={geminiModalOpen} onClose={() => setGeminiModalOpen(false)} />

      {/* Banner thông báo người dùng đang chờ cấp quyền Chủ phòng (Host) */}
      {user && userRole === 'pending' && (
        <div className="bg-amber-950/80 border-b border-amber-500/40 text-amber-200 px-4 py-3 text-xs relative z-20">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
              <p className="font-medium">
                Tài khoản của bạn đang chờ Quản trị viên cấp quyền Chủ phòng. Bạn vẫn có thể tham gia đấu trường với tư cách Người chơi.
              </p>
            </div>
            <span className="font-mono text-[11px] text-amber-400/90 whitespace-nowrap">
              Trạng thái: Chờ duyệt (Pending)
            </span>
          </div>
        </div>
      )}

      {/* Banner thông báo tài khoản bị chặn */}
      {user && userRole === 'blocked' && (
        <div className="bg-red-950/90 border-b border-red-500/50 text-red-200 px-4 py-3 text-xs relative z-20">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
            <p className="font-medium">
              Tài khoản này đã bị Quản trị viên tạm khóa quyền truy cập. Vui lòng liên hệ Quản trị viên để được hỗ trợ.
            </p>
            <span className="font-mono text-[11px] text-red-400 whitespace-nowrap">
              Trạng thái: Đã chặn (Blocked)
            </span>
          </div>
        </div>
      )}

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-8 relative z-10">
        {activeTab === 'arena' && renderArenaFsm()}
        {activeTab === 'leaderboard' && <LeaderboardView />}
        {activeTab === 'analytics' && <AnalyticsView />}
        {activeTab === 'dealer' && (userRole === 'admin' || userRole === 'host') && <DealerConsoleView />}
        {activeTab === 'admin' && userRole === 'admin' && <AdminConsoleView />}
      </main>

      <footer className="border-t border-white/10 bg-[#090A0D] relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <span>Borderland Quiz Arena · Hệ thống Sinh tồn Tri thức</span>
          <span className="font-mono">Máy chủ Kiểm soát FSM · Tuyệt đối Không Lộ Đáp án</span>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ArenaAppShell />
    </ErrorBoundary>
  );
}
