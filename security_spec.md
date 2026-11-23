# Borderland Quiz Arena — Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **PII Isolation**: `/users/{userId}` stores `email` and is readable/writable strictly by `request.auth.uid == userId` with `email_verified == true`. List queries on `/users` are permanently denied.
2. **Zero Answer Leakage**: Quiz answer keys (`correctIndex`, `explanation`) never exist in Firestore; they remain strictly server-side in Express memory.
3. **Leaderboard Integrity**: `/leaderboard/{entryId}` requires `entryId == request.auth.uid`, contains zero PII, enforces `isPublic == true` for list queries, and bounds all numeric/string fields.
4. **Immutable Analytics**: `/matchRecords/{recordId}` documents are append-only (`update` and `delete` permanently denied) and strictly owned by `ownerId == request.auth.uid`.
5. **Terminal Arena Locking**: `/arenas/{arenaId}` can only be mutated by its `hostUid` and becomes permanently locked once `fsmState == 'Leaderboard'`.
6. **Temporal Integrity**: All `createdAt` and `updatedAt` timestamps must strictly equal `request.time`.

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Identity Spoofing on User Profile**: Create `/users/victim_uid` while signed in as `attacker_uid` with `uid: "victim_uid"`.
2. **Shadow / Ghost Field Injection**: Update `/users/attacker_uid` adding `isAdmin: true` or `role: "dealer"`.
3. **PII Blanket Read**: `get(/users/victim_uid)` as `attacker_uid` or `list(/users)`.
4. **Unverified Email Write**: Create `/leaderboard/attacker_uid` with `email_verified: false`.
5. **ID Poisoning**: Create `/matchRecords/<200-char-invalid-id!@#>` to bypass `isValidId()`.
6. **Backdated Timestamp Forgery**: Create `/matchRecords/rec_01` with client-forged `createdAt` not equal to `request.time`.
7. **Post-Completion Tampering (Analytics)**: Update `/matchRecords/rec_01` to raise `score` from `100` to `99999`.
8. **Score / Visa Overflow Poisoning**: Update `/leaderboard/attacker_uid` with `visaBalance: 999999` (exceeds max boundary `100`).
9. **Terminal State Mutation**: Update `/arenas/arena_01` when `existing().fsmState == 'Leaderboard'` to reset `fsmState` back to `'Lobby'`.
10. **Host Hijacking**: Update `/arenas/arena_01` changing `hostUid` to `attacker_uid`.
11. **Unscoped List Scraping on Match Records**: List `/matchRecords` without `where('ownerId', '==', auth.uid)`.
12. **Oversized String Resource Exhaustion**: Create `/arenas/arena_02` with a 500-character `subject` string (exceeds `maxLength: 64`).
