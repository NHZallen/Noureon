# Realtime Delta No-op Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop self-generated Realtime events from producing redundant delta requests and prevent unchanged remote snapshots from rewriting or rerendering the active chat.

**Architecture:** A sequence-aware scheduler coalesces Realtime invalidations against the shadow sync watermark. The storage commit reports whether its semantic workspace changed, allowing refresh to suppress no-op writes and runtime handoffs while still advancing the durable delta cursor.

**Tech Stack:** JavaScript ES modules, Supabase Realtime/RPC, IndexedDB storage adapter, Node test runner.

## Global Constraints

- Preserve cross-device updates, reconnect gap checks, tombstones, dirty-journal merging, and snapshot fallback.
- Do not require a new SQL migration.
- Work directly on `main` because the user explicitly requested a verified push to `main`.

---

### Task 1: Sequence-aware Realtime refresh scheduler

**Files:**
- Create: `src/app/sync/cloud-sync-realtime-refresh.js`
- Create: `tests/cloud-sync-realtime-refresh.test.js`
- Modify: `src/app/sync/cloud-workspace-sync.js`

**Interfaces:**
- Consumes: `getSync(): { retry(), getStatus() } | null`, timer injection, Realtime payloads containing `new.sync_seq`.
- Produces: `createConversationRealtimeRefreshScheduler({ getSync, schedule, cancel, delay, logger })` with `request(payload?)`, `resume()`, and `stop()`.

- [ ] **Step 1: Write failing scheduler tests**

Test that a pending sequence satisfied by the watermark reached during the in-flight retry produces no trailing timer, while a later sequence schedules another retry. Test that stale duplicate sequences are ignored and a sequence-less request forces one refresh.

- [ ] **Step 2: Verify red**

Run: `node --test tests/cloud-sync-realtime-refresh.test.js`

Expected: FAIL because `cloud-sync-realtime-refresh.js` does not exist.

- [ ] **Step 3: Implement the minimal scheduler and wire it into cloud sync**

Normalize sequence values through `BigInt`, retain the maximum target, and clear it only when `currentRemoteWatermark >= target`. Replace the boolean/timer/work block in `cloud-workspace-sync.js`; pass Realtime payloads to `request`, use a forced request for `SUBSCRIBED`, call `resume` after shadow initialization, and call `stop` during teardown.

- [ ] **Step 4: Verify green**

Run: `node --test tests/cloud-sync-realtime-refresh.test.js tests/cloud-workspace-sync-safety.test.js`

Expected: PASS with zero failures.

### Task 2: Suppress unchanged workspace commits and handoffs

**Files:**
- Modify: `src/app/sync/cloud-sync-v2-shadow.js`
- Modify: `tests/cloud-sync-v2-shadow.test.js`

**Interfaces:**
- `commitWorkspace(...)` may return `{ workspace, changed }`; plain workspace return values remain compatible.
- Remote refresh dispatches `onWorkspaceCommitted` only when `changed !== false`.

- [ ] **Step 1: Write a failing no-op refresh test**

Initialize a sync with a commit callback returning `{ workspace, changed: false }`, clear initialization handoffs, call `retry()`, and assert zero new handoffs. Add the companion case where `changed: true` still hands off once.

- [ ] **Step 2: Verify red**

Run: `node --test tests/cloud-sync-v2-shadow.test.js --test-name-pattern="unchanged refresh"`

Expected: FAIL because refresh currently dispatches unconditionally.

- [ ] **Step 3: Implement commit result normalization and semantic equality**

Import `cloudValuesEqual`. Inside the exclusive storage commit, compare `storedWorkspace` with `committedWorkspace`, skip `writeWorkspaceAndJournal` when equal, and return `{ workspace: committedWorkspace, changed }`. Normalize both structured and legacy plain commit results in refresh; suppress only the refresh handoff when unchanged.

- [ ] **Step 4: Verify green**

Run: `node --test tests/cloud-sync-v2-shadow.test.js`

Expected: PASS with zero failures.

### Task 3: Avoid persistence writes for a trusted empty delta

**Files:**
- Modify: `src/app/sync/cloud-sync-v2-remote-state.js`
- Modify: `tests/cloud-sync-v2-remote-state.test.js`

**Interfaces:**
- `createPersistentWorkspaceRemoteReader().read()` returns the same diagnostics and rows; persistence is skipped only when the baseline is trusted, `rowCount === 0`, and the watermark is unchanged.

- [ ] **Step 1: Write a failing empty-delta persistence test**

Seed a matching baseline and journal watermark, return an empty page with the same `next_seq`, call `read()`, and assert that no storage setter or atomic write ran.

- [ ] **Step 2: Verify red**

Run: `node --test tests/cloud-sync-v2-remote-state.test.js --test-name-pattern="empty delta"`

Expected: FAIL because the reader currently persists after every delta read.

- [ ] **Step 3: Implement the persistence guard**

Persist when the baseline was rebuilt, at least one row was returned, or the watermark changed. Otherwise return the trusted baseline directly.

- [ ] **Step 4: Verify green**

Run: `node --test tests/cloud-sync-v2-remote-state.test.js`

Expected: PASS with zero failures.

### Task 4: Full verification and delivery

**Files:**
- Verify all modified production, test, and documentation files.

- [ ] **Step 1: Run the complete regression suite**

Run: `npm.cmd test`

Expected: all tests pass with zero failures.

- [ ] **Step 2: Run structure, size, and production build checks**

Run: `npm.cmd run check:legacy-runtime`

Run: `npm.cmd run check:sizes`

Run: `npm.cmd run build`

Expected: every command exits 0.

- [ ] **Step 3: Review the diff and repository state**

Run: `git diff --check` and inspect `git diff --stat` plus the relevant production/test hunks.

- [ ] **Step 4: Commit and push**

Commit message: `fix: suppress redundant workspace refreshes`

Push: `git push origin main`

