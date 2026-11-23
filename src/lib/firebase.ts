import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type {
  CardSuit,
  FsmState,
  LeaderboardRecord,
  LiveArenaRecord,
  MatchHistoryRecord,
  PlayerState,
  UserProfile,
  UserRole,
} from '../types/game';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validate live connection to Firestore on startup
export async function testFirestoreConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testFirestoreConnection();

export const ADMIN_EMAIL = (
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ADMIN_EMAIL) ||
  'gsc.colloq@gmail.com'
).toLowerCase().trim();

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  await ensureUserProfile(result.user);
  return result.user;
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return cleaned.length > 0 ? cleaned : `id_${Date.now()}`;
}

export function sanitizeEmailId(email: string): string {
  return email.toLowerCase().trim().replace(/[^a-z0-9_.-]/g, '_').slice(0, 128);
}

function sanitizeRoomCode(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12);
  return cleaned.length >= 4 ? cleaned : 'BL-0001';
}

function clamp(val: number, min: number, max: number): number {
  if (!Number.isFinite(val)) return min;
  return Math.max(min, Math.min(max, val));
}

export async function ensureUserProfile(user: User): Promise<UserProfile | null> {
  if (!user.emailVerified || !user.email) return null;
  const uid = sanitizeId(user.uid);
  const email = user.email.toLowerCase().trim();
  const isAdminEmail = email === ADMIN_EMAIL;
  const path = `users/${uid}`;
  const ref = doc(db, 'users', uid);

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      let initialRole: UserRole = isAdminEmail ? 'admin' : 'pending';
      if (!isAdminEmail) {
        // Check if preauthorized
        try {
          const preSnap = await getDoc(doc(db, 'authorized_hosts', email));
          if (preSnap.exists()) {
            initialRole = 'host';
          }
        } catch {
          // Pre-authorization check fallback
        }
      }

      const newProfile: UserProfile = {
        uid,
        displayName: (user.displayName || 'Người chơi').slice(0, 64),
        email,
        role: initialRole,
        totalVisaEarned: 3,
        gamesPlayed: 0,
        gamesSurvived: 0,
        avgResponseMs: 0,
        tabViolationsTotal: 0,
      };

      await setDoc(ref, {
        ...newProfile,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      return newProfile;
    } else {
      const data = snap.data();
      let role: UserRole = (data.role as UserRole) || (isAdminEmail ? 'admin' : 'pending');

      // Super Admin override guarantee
      if (isAdminEmail && role !== 'admin') {
        role = 'admin';
        await updateDoc(ref, { role: 'admin', updatedAt: serverTimestamp() });
      } else if (!data.role) {
        try {
          const preSnap = await getDoc(doc(db, 'authorized_hosts', email));
          if (preSnap.exists()) {
            role = 'host';
          }
        } catch {
          // Fallback
        }
        await updateDoc(ref, { role, updatedAt: serverTimestamp() });
      }

      return {
        uid,
        displayName: (data.displayName || user.displayName || 'Người chơi').slice(0, 64),
        email,
        role,
        totalVisaEarned: data.totalVisaEarned ?? 3,
        gamesPlayed: data.gamesPlayed ?? 0,
        gamesSurvived: data.gamesSurvived ?? 0,
        avgResponseMs: data.avgResponseMs ?? 0,
        tabViolationsTotal: data.tabViolationsTotal ?? 0,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      };
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeUserProfile(
  uid: string,
  onData: (profile: UserProfile | null) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const ref = doc(db, 'users', sanitizeId(uid));
  return onSnapshot(
    ref,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const email = (data.email || '').toLowerCase().trim();
        const isAdmin = email === ADMIN_EMAIL;
        const role = isAdmin ? 'admin' : (data.role as UserRole) || 'pending';
        onData({
          uid: snap.id,
          displayName: data.displayName || 'Người chơi',
          email: data.email || '',
          role,
          totalVisaEarned: data.totalVisaEarned ?? 3,
          gamesPlayed: data.gamesPlayed ?? 0,
          gamesSurvived: data.gamesSurvived ?? 0,
          avgResponseMs: data.avgResponseMs ?? 0,
          tabViolationsTotal: data.tabViolationsTotal ?? 0,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        });
      } else {
        onData(null);
      }
    },
    (err) => onError(err)
  );
}

export function subscribeAllUsers(
  onData: (users: UserProfile[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = 'users';
  const q = query(collection(db, path), limit(150));
  return onSnapshot(
    q,
    (snapshot) => {
      const users: UserProfile[] = snapshot.docs.map((d) => {
        const data = d.data();
        const email = (data.email || '').toLowerCase().trim();
        const isAdmin = email === ADMIN_EMAIL;
        const role: UserRole = isAdmin ? 'admin' : (data.role as UserRole) || 'pending';
        return {
          uid: d.id,
          displayName: data.displayName || 'Người chơi',
          email: data.email || '',
          role,
          totalVisaEarned: data.totalVisaEarned ?? 3,
          gamesPlayed: data.gamesPlayed ?? 0,
          gamesSurvived: data.gamesSurvived ?? 0,
          avgResponseMs: data.avgResponseMs ?? 0,
          tabViolationsTotal: data.tabViolationsTotal ?? 0,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        };
      });

      const roleOrder: Record<UserRole, number> = {
        admin: 0,
        host: 1,
        pending: 2,
        blocked: 3,
        guest: 4,
      };

      users.sort((a, b) => roleOrder[a.role] - roleOrder[b.role]);
      onData(users);
    },
    (error) => {
      onError(error);
    }
  );
}

export async function updateUserRole(targetUid: string, newRole: UserRole): Promise<void> {
  const uid = sanitizeId(targetUid);
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      role: newRole,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function preauthorizeHostEmail(
  rawEmail: string
): Promise<{ success: boolean; message: string }> {
  const email = rawEmail.toLowerCase().trim();
  if (!email || !email.includes('@') || !email.includes('.')) {
    throw new Error('Địa chỉ email không đúng định dạng.');
  }

  const authPath = `authorized_hosts/${email}`;

  try {
    // 1. Lưu vào collection authorized_hosts
    await setDoc(doc(db, 'authorized_hosts', email), {
      email,
      role: 'host',
      grantedBy: auth.currentUser?.email || 'admin',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // 2. Nếu tài khoản này đã từng đăng nhập vào app, cập nhật ngay quyền trong collection users
    const q = query(collection(db, 'users'), where('email', '==', email), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const userDoc = snap.docs[0];
      await updateDoc(userDoc.ref, {
        role: 'host',
        updatedAt: serverTimestamp(),
      });
      return {
        success: true,
        message: `Đã cấp quyền Chủ phòng thành công cho tài khoản ${email}.`,
      };
    }

    return {
      success: true,
      message: `Đã cấp sẵn quyền Chủ phòng cho ${email}. Khi người này đăng nhập Google, hệ thống sẽ tự động kích hoạt quyền Chủ phòng ngay lập tức.`,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, authPath);
  }
}

export async function revokePreauthorizedHost(rawEmail: string): Promise<void> {
  const email = rawEmail.toLowerCase().trim();
  try {
    await deleteDoc(doc(db, 'authorized_hosts', email));
  } catch {
    // Fallback if not exists
  }
}

function getDominantSuit(player: PlayerState): CardSuit {
  const suits: CardSuit[] = ['spades', 'hearts', 'clubs', 'diamonds'];
  let best: CardSuit = 'diamonds';
  let bestAcc = -1;
  for (const suit of suits) {
    const st = player.suitStats[suit];
    const acc = st.attempts > 0 ? st.correct / st.attempts : 0;
    if (acc > bestAcc) {
      bestAcc = acc;
      best = suit;
    }
  }
  return best;
}

export async function persistCompletedMatch(
  user: User,
  roomCode: string,
  subject: string,
  player: PlayerState
): Promise<void> {
  if (!user.emailVerified || !user.email) return;

  const uid = sanitizeId(user.uid);
  const totalAttempts = player.answerLog.length;
  const totalCorrect = player.answerLog.filter((l) => l.isCorrect).length;
  const accuracyPct = totalAttempts > 0 ? Number(((totalCorrect / totalAttempts) * 100).toFixed(1)) : 0;
  const avgResponseMs =
    totalAttempts > 0
      ? Math.round(player.answerLog.reduce((s, l) => s + l.responseMs, 0) / totalAttempts)
      : 0;

  const suitPct = (suit: CardSuit) => {
    const st = player.suitStats[suit];
    return st.attempts > 0 ? Number(((st.correct / st.attempts) * 100).toFixed(1)) : 0;
  };

  const finalStatus: 'survived' | 'eliminated' | 'disqualified' =
    player.status === 'disqualified'
      ? 'disqualified'
      : player.visa > 0
        ? 'survived'
        : 'eliminated';

  // 1. Write immutable MatchRecord
  const recordId = sanitizeId(`rec_${uid.slice(0, 10)}_${Date.now()}`);
  const matchPath = `matchRecords/${recordId}`;
  try {
    await setDoc(doc(db, 'matchRecords', recordId), {
      ownerId: uid,
      arenaCode: sanitizeRoomCode(roomCode),
      subject: subject.slice(0, 64) || 'General',
      status: finalStatus,
      finalVisa: Math.round(clamp(player.visa, 0, 100)),
      score: Math.round(clamp(player.score, 0, 1000000)),
      accuracyPct: clamp(accuracyPct, 0, 100),
      avgResponseMs: clamp(avgResponseMs, 0, 120000),
      tabSwitches: Math.round(clamp(player.tabSwitches, 0, 100)),
      spadesScore: clamp(suitPct('spades'), 0, 100),
      heartsScore: clamp(suitPct('hearts'), 0, 100),
      clubsScore: clamp(suitPct('clubs'), 0, 100),
      diamondsScore: clamp(suitPct('diamonds'), 0, 100),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, matchPath);
  }

  // 2. Update Private Profile & Public Leaderboard
  const userPath = `users/${uid}`;
  let gamesPlayed = 1;
  let gamesSurvived = finalStatus === 'survived' ? 1 : 0;

  try {
    const profileRef = doc(db, 'users', uid);
    const snap = await getDoc(profileRef);
    if (snap.exists()) {
      const data = snap.data();
      gamesPlayed = clamp((Number(data.gamesPlayed) || 0) + 1, 0, 10000);
      gamesSurvived = clamp(
        (Number(data.gamesSurvived) || 0) + (finalStatus === 'survived' ? 1 : 0),
        0,
        gamesPlayed
      );
      await updateDoc(profileRef, {
        displayName: (player.name || user.displayName || 'Survivor').slice(0, 64),
        totalVisaEarned: Math.round(clamp((Number(data.totalVisaEarned) || 0) + player.visa, 0, 10000)),
        gamesPlayed,
        gamesSurvived,
        avgResponseMs: clamp(avgResponseMs, 0, 120000),
        tabViolationsTotal: Math.round(
          clamp((Number(data.tabViolationsTotal) || 0) + player.tabSwitches, 0, 10000)
        ),
        updatedAt: serverTimestamp(),
      });
    } else {
      await ensureUserProfile(user);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, userPath);
  }

  const lbPath = `leaderboard/${uid}`;
  try {
    const lbRef = doc(db, 'leaderboard', uid);
    const lbSnap = await getDoc(lbRef);
    const prevBest = lbSnap.exists() ? Number(lbSnap.data().bestScore) || 0 : 0;
    const survivalRate = Number(((gamesSurvived / Math.max(1, gamesPlayed)) * 100).toFixed(1));
    const payload = {
      uid,
      displayName: (player.name || user.displayName || 'Survivor').slice(0, 64),
      bestScore: Math.round(clamp(Math.max(prevBest, player.score), 0, 1000000)),
      visaBalance: Math.round(clamp(player.visa, 0, 100)),
      survivalRate: clamp(survivalRate, 0, 100),
      avgResponseMs: clamp(avgResponseMs, 0, 120000),
      rankSuit: getDominantSuit(player),
      isPublic: true,
      updatedAt: serverTimestamp(),
    };
    if (lbSnap.exists()) {
      await updateDoc(lbRef, {
        displayName: payload.displayName,
        bestScore: payload.bestScore,
        visaBalance: payload.visaBalance,
        survivalRate: payload.survivalRate,
        avgResponseMs: payload.avgResponseMs,
        rankSuit: payload.rankSuit,
        isPublic: true,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(lbRef, payload);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, lbPath);
  }
}

export async function syncArenaMetadataToFirestore(
  user: User,
  params: {
    roomCode: string;
    subject: string;
    fsmState: FsmState;
    currentRound: number;
    maxRounds: number;
    activePlayers: number;
  }
): Promise<void> {
  if (!user.emailVerified) return;
  const uid = sanitizeId(user.uid);
  const arenaId = sanitizeId(params.roomCode);
  const path = `arenas/${arenaId}`;
  const ref = doc(db, 'arenas', arenaId);

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      if (params.fsmState !== 'Lobby') return;
      await setDoc(ref, {
        hostUid: uid,
        roomCode: sanitizeRoomCode(params.roomCode),
        subject: params.subject.slice(0, 64) || 'General',
        fsmState: 'Lobby',
        currentRound: Math.round(clamp(params.currentRound, 0, 50)),
        maxRounds: Math.round(clamp(params.maxRounds, 1, 50)),
        activePlayers: Math.round(clamp(params.activePlayers, 0, 500)),
        isPublic: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const existingData = snap.data();
      if (existingData.hostUid !== uid || existingData.fsmState === 'Leaderboard') return;
      await updateDoc(ref, {
        fsmState: params.fsmState,
        currentRound: Math.round(clamp(params.currentRound, 0, 50)),
        activePlayers: Math.round(clamp(params.activePlayers, 0, 500)),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeLeaderboard(
  onData: (records: LeaderboardRecord[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = 'leaderboard';
  const q = query(collection(db, path), where('isPublic', '==', true), limit(50));
  return onSnapshot(
    q,
    (snapshot) => {
      const rows = snapshot.docs.map((d) => d.data() as LeaderboardRecord);
      rows.sort((a, b) => b.bestScore - a.bestScore);
      onData(rows);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export function subscribeMatchHistory(
  uid: string,
  onData: (records: MatchHistoryRecord[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = 'matchRecords';
  const q = query(collection(db, path), where('ownerId', '==', sanitizeId(uid)), limit(30));
  return onSnapshot(
    q,
    (snapshot) => {
      const rows = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<MatchHistoryRecord, 'id'>),
      }));
      rows.sort((a, b) => {
        const ta = (a.createdAt as { seconds?: number } | undefined)?.seconds ?? 0;
        const tb = (b.createdAt as { seconds?: number } | undefined)?.seconds ?? 0;
        return tb - ta;
      });
      onData(rows);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export function subscribeLiveArenas(
  onData: (records: LiveArenaRecord[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = 'arenas';
  const q = query(collection(db, path), where('isPublic', '==', true), limit(20));
  return onSnapshot(
    q,
    (snapshot) => {
      const rows = snapshot.docs
        .map((d) => ({
          id: d.id,
          ...(d.data() as Omit<LiveArenaRecord, 'id'>),
        }))
        .filter((r) => r.fsmState !== 'Leaderboard');
      onData(rows);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}
