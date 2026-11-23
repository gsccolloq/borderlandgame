/**
 * Phase 0 Security TDD Specification Tests for Borderland Quiz Arena
 * Verifies all 12 "Dirty Dozen" adversarial payloads are rejected by firestore.rules.
 */

export interface SecurityTestCase {
  id: number;
  name: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  actorUid: string;
  emailVerified: boolean;
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TESTS: SecurityTestCase[] = [
  {
    id: 1,
    name: 'Identity Spoofing on User Profile',
    operation: 'create',
    path: '/users/victim_uid',
    actorUid: 'attacker_uid',
    emailVerified: true,
    payload: { uid: 'victim_uid', displayName: 'Spoofer', email: 'a@b.com' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Shadow Ghost Field Injection',
    operation: 'update',
    path: '/users/attacker_uid',
    actorUid: 'attacker_uid',
    emailVerified: true,
    payload: { displayName: 'Player', isAdmin: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'PII Blanket Read / List Users',
    operation: 'list',
    path: '/users',
    actorUid: 'attacker_uid',
    emailVerified: true,
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Unverified Email Write on Leaderboard',
    operation: 'create',
    path: '/leaderboard/attacker_uid',
    actorUid: 'attacker_uid',
    emailVerified: false,
    payload: { uid: 'attacker_uid', displayName: 'Unverified', bestScore: 500, isPublic: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'ID Poisoning on Match Records',
    operation: 'create',
    path: `/matchRecords/${'X'.repeat(150)}!@#`,
    actorUid: 'attacker_uid',
    emailVerified: true,
    payload: { ownerId: 'attacker_uid', score: 100 },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Backdated Timestamp Forgery',
    operation: 'create',
    path: '/matchRecords/rec_forged_time',
    actorUid: 'attacker_uid',
    emailVerified: true,
    payload: { ownerId: 'attacker_uid', createdAt: '2020-01-01T00:00:00Z' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Immutable MatchRecord Tampering',
    operation: 'update',
    path: '/matchRecords/rec_01',
    actorUid: 'attacker_uid',
    emailVerified: true,
    payload: { score: 99999 },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Score / Visa Boundary Overflow Poisoning',
    operation: 'update',
    path: '/leaderboard/attacker_uid',
    actorUid: 'attacker_uid',
    emailVerified: true,
    payload: { visaBalance: 999999 },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Terminal Arena State Mutation',
    operation: 'update',
    path: '/arenas/arena_finished',
    actorUid: 'host_uid',
    emailVerified: true,
    payload: { fsmState: 'Lobby' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Arena Host Hijacking',
    operation: 'update',
    path: '/arenas/arena_live',
    actorUid: 'attacker_uid',
    emailVerified: true,
    payload: { hostUid: 'attacker_uid' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Unscoped List Scraping on Match Records',
    operation: 'list',
    path: '/matchRecords',
    actorUid: 'attacker_uid',
    emailVerified: true,
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Oversized Subject String Resource Exhaustion',
    operation: 'create',
    path: '/arenas/arena_oversize',
    actorUid: 'host_uid',
    emailVerified: true,
    payload: { hostUid: 'host_uid', subject: 'A'.repeat(500) },
    expected: 'PERMISSION_DENIED',
  },
];
