# Incremental Workspace Sync Implementation Plan

> **For Codex:** Execute only after the Storage milestone passes. Use `superpowers:test-driven-development`; deploy the SQL migration before enabling the client delta path.

**Goal:** Replace startup and Realtime full-workspace reads with an owner-scoped monotonic delta protocol while retaining one safe snapshot fallback.

**Architecture:** PostgreSQL assigns one global sequence value to every synchronized row mutation and exposes an authenticated paginated RPC. The client persists a versioned per-user normalized-row baseline and the exclusive sequence watermark. Startup reconstructs the remote workspace by applying ordered delta pages; Realtime only debounces a request for changes after that watermark.

**Tech Stack:** PostgreSQL/Supabase SQL, JavaScript ES modules, IndexedDB, Supabase JS RPC, Node test runner.

---

## Task 1: Sequence migration and owner-scoped delta RPC

**Files:**

- Create: `supabase/migrations/20260716010000_add_incremental_workspace_sync.sql`
- Create: `tests/cloud-sync-incremental-migration.test.js`

### Step 1: Write a failing migration contract test

Read the migration source and assert it contains:

- idempotent creation of `public.workspace_sync_seq`
- non-null `sync_seq bigint` columns for folders, conversations, messages, Astras, and tombstones
- backfill and owner/sequence indexes
- an insert/update trigger for each table
- `public.fetch_workspace_delta(p_after_seq bigint, p_limit integer)`
- `auth.uid()` owner filtering, an empty `search_path`, bounded limit, ordered rows, and authenticated execute grants

Also assert the RPC accepts no user ID parameter and does not grant execute to `anon`.

### Step 2: Confirm red

Run: `node --test tests/cloud-sync-incremental-migration.test.js`

### Step 3: Implement the migration

The RPC returns rows shaped as:

```json
{
  "changes": [{ "collection": "messages", "sync_seq": 42, "row": {} }],
  "next_seq": 42,
  "has_more": false
}
```

Use `SECURITY DEFINER`, `SET search_path = ''`, schema-qualified relations, `auth.uid()`, and a clamped page limit. Ensure sequence privileges match the existing protected upsert functions.

### Step 4: Confirm green and commit

Run: `node --test tests/cloud-sync-incremental-migration.test.js tests/cloud-sync-trash-state-migration.test.js`

```bash
git add supabase/migrations/20260716010000_add_incremental_workspace_sync.sql tests/cloud-sync-incremental-migration.test.js
git commit -m "feat: add workspace delta protocol"
```

## Task 2: Versioned persistent remote baseline

**Files:**

- Create: `src/app/sync/cloud-sync-v2-baseline.js`
- Create: `tests/cloud-sync-v2-baseline.test.js`

### Step 1: Write failing pure-function tests

Test exports that:

- create and validate `{ version, userId, watermark, rows }`
- reject another user's baseline and unsupported versions
- apply ordered upserts by collection and ID
- apply tombstones before workspace decoding
- reject decreasing or malformed sequence values
- produce deterministic normalized rows without duplicates

### Step 2: Confirm red

Run: `node --test tests/cloud-sync-v2-baseline.test.js`

### Step 3: Implement the pure baseline module

Keep storage I/O outside this module. Export small functions such as:

```js
createRemoteBaseline({ userId, rows, watermark })
validateRemoteBaseline(value, { userId })
applyRemoteDeltaPage(baseline, page)
```

Return new values rather than mutating the persisted input.

### Step 4: Confirm green and commit

Run: `node --test tests/cloud-sync-v2-baseline.test.js`

```bash
git add src/app/sync/cloud-sync-v2-baseline.js tests/cloud-sync-v2-baseline.test.js
git commit -m "feat: model persisted sync baselines"
```

## Task 3: Repository delta reader with capability fallback

**Files:**

- Modify: `src/app/sync/cloud-sync-v2-shadow.js`
- Modify: `tests/cloud-sync-v2-shadow.test.js`

### Step 1: Write failing repository tests

Assert:

- `fetchWorkspaceDelta(afterSeq, limit)` calls `supabase.rpc('fetch_workspace_delta', { p_after_seq, p_limit })`.
- Multiple pages are requested from each returned `next_seq` without skipping rows.
- A missing-function migration error is classified as unsupported capability.
- Network, authorization, and malformed-response errors are not silently treated as unsupported.

### Step 2: Confirm red

Run: `node --test tests/cloud-sync-v2-shadow.test.js`

### Step 3: Implement the repository API

Add a bounded page reader and strict response normalization. Preserve `fetchWorkspace()` unchanged as the snapshot fallback. Cache only the capability result for the current sync instance.

### Step 4: Confirm green and commit

Run: `node --test tests/cloud-sync-v2-shadow.test.js`

```bash
git add src/app/sync/cloud-sync-v2-shadow.js tests/cloud-sync-v2-shadow.test.js
git commit -m "feat: read paginated workspace deltas"
```

## Task 4: Bootstrap from persisted baseline and watermark

**Files:**

- Modify: `src/app/sync/cloud-sync-v2-shadow.js`
- Modify: `src/app/sync/cloud-sync-journal.js`
- Modify: `tests/cloud-sync-v2-shadow.test.js`
- Modify: `tests/cloud-sync-journal.test.js`

### Step 1: Add failing startup tests

Cover:

- A valid baseline plus watermark performs delta RPC calls and zero full-table selects.
- No changes returns the persisted rows unchanged.
- Multiple pages persist the final baseline and `lastRemoteWatermark` before readiness.
- Missing, corrupt, wrong-user, or unsupported-version baselines perform exactly one snapshot and then persist a valid baseline.
- A failed delta does not advance the watermark or overwrite the valid baseline.
- Stop/generation invalidation prevents an in-flight delta from committing.

### Step 2: Confirm red

Run: `node --test tests/cloud-sync-v2-shadow.test.js tests/cloud-sync-journal.test.js`

### Step 3: Implement atomic persistence

- Define a versioned per-user baseline storage key.
- Read the baseline and journal together where the adapter supports `readItems`.
- Persist baseline plus journal through `setItemsAtomic`; fall back conservatively only for test adapters that lack the method.
- Reconstruct normalized rows before using the existing decode/merge path.
- Advance `lastRemoteWatermark` only after every delta page validates and baseline persistence succeeds.
- On a capability miss, use `fetchWorkspace()` and persist the snapshot baseline without deleting local dirty state.

### Step 4: Confirm green and commit

Run the focused command above.

```bash
git add src/app/sync/cloud-sync-v2-shadow.js src/app/sync/cloud-sync-journal.js tests/cloud-sync-v2-shadow.test.js tests/cloud-sync-journal.test.js
git commit -m "feat: bootstrap cloud sync from deltas"
```

## Task 5: Realtime invalidation and debounced delta refresh

**Files:**

- Modify: `src/app/sync/cloud-workspace-sync.js`
- Modify: `src/app/sync/cloud-sync-v2-shadow.js`
- Modify: `tests/cloud-workspace-sync-safety.test.js`
- Modify: `tests/cloud-sync-v2-shadow.test.js`

### Step 1: Write failing behavior tests

Assert a burst of relevant Realtime events causes one debounced delta refresh, not `fetchWorkspace()`. Assert reconnect/`SUBSCRIBED` requests changes after the persisted watermark. Assert stopping clears the timer and ignores queued work.

### Step 2: Confirm red

Run: `node --test tests/cloud-workspace-sync-safety.test.js tests/cloud-sync-v2-shadow.test.js`

### Step 3: Implement invalidation-only handling

- Expose a shadow `refreshRemote()` operation that uses the persisted baseline path.
- Coalesce Realtime events using the existing queue and debounce interval.
- Keep payloads as invalidation signals only; never merge Realtime row payloads directly.
- Preserve the full snapshot fallback only when delta capability is absent or the baseline is invalid.

### Step 4: Confirm green and commit

Run the focused command above.

```bash
git add src/app/sync/cloud-workspace-sync.js src/app/sync/cloud-sync-v2-shadow.js tests/cloud-workspace-sync-safety.test.js tests/cloud-sync-v2-shadow.test.js
git commit -m "fix: refresh workspace incrementally after realtime"
```

## Task 6: Narrow upload verification and diagnostics

**Files:**

- Modify: `src/app/sync/cloud-sync-v2-shadow.js`
- Modify: `tests/cloud-sync-v2-shadow.test.js`

### Step 1: Write failing tests

Assert upload verification fetches only uploaded entity IDs, failed verification retains dirty journal entries, and status reports delta pages/rows, snapshot fallback count/reason, and current watermark without asset data or credentials.

### Step 2: Confirm red

Run: `node --test tests/cloud-sync-v2-shadow.test.js`

### Step 3: Implement narrowly

Reuse protected upsert RPCs. Add owner-scoped ID filters to verification queries, update the persisted baseline with verified rows, and acknowledge the journal only after verification and persistence succeed.

### Step 4: Confirm green and commit

Run: `node --test tests/cloud-sync-v2-shadow.test.js`

```bash
git add src/app/sync/cloud-sync-v2-shadow.js tests/cloud-sync-v2-shadow.test.js
git commit -m "fix: narrow cloud upload verification"
```

## Task 7: Full acceptance verification

### Step 1: Run all automated checks

```bash
npm test
npm run check:legacy-runtime
npm run check:sizes
npm run build
```

### Step 2: Validate SQL in a non-production Supabase project

- Apply migrations.
- Insert/update records for two authenticated owners.
- Verify each owner receives only their own ordered delta rows.
- Verify `p_after_seq` is exclusive and pagination has no gaps.
- Verify an unauthenticated caller cannot execute the RPC.

### Step 3: Validate browser behavior

- With a valid baseline and no changes, reload and confirm zero workspace entity rows return.
- Trigger several Realtime updates and confirm one delta refresh.
- Disable the RPC in a test environment and confirm one safe snapshot fallback with intact local data.

### Step 4: Final commit if verification required code or documentation changes

```bash
git add src/app/sync tests supabase/migrations docs/superpowers
git commit -m "test: verify incremental workspace sync"
```
