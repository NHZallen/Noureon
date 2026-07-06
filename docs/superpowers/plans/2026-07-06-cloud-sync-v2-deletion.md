# Cloud Sync V2 Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add refresh-based, non-resurrecting trash, restore, permanent conversation deletion, and folder deletion to normalized Supabase Sync V2.

**Architecture:** A content-free `workspace_tombstones` table is authoritative for permanent deletion. Pure client reconciliation functions remove tombstoned records before merge or upload; security-definer RPCs atomically write tombstones and delete normalized rows; a persistent client queue retries orphaned Storage object cleanup without restoring deleted content.

**Tech Stack:** Vite, browser ES modules, Node.js test runner, Supabase JS, PostgreSQL migrations/RLS/RPC, IndexedDB-compatible storage adapter.

---

## File structure

- Create `src/app/sync/cloud-sync-v2-deletions.js`: tombstone indexing and immutable workspace/encoded-row filtering.
- Create `src/app/sync/cloud-sync-v2-asset-cleanup.js`: persistent retry queue for Storage paths returned by the deletion RPC.
- Create `supabase/migrations/20260706030000_add_workspace_tombstones.sql`: tombstone table, RLS, anti-resurrection policies, asset-path helper, and deletion RPCs.
- Create `tests/cloud-sync-v2-deletions.test.js`: pure tombstone behavior.
- Create `tests/cloud-sync-v2-asset-cleanup.test.js`: cleanup persistence and retry behavior.
- Create `tests/cloud-sync-v2-deletion-migration.test.js`: static migration security contract.
- Modify `src/app/sync/cloud-sync-v2-shadow.js`: fetch tombstones first, sanitize before merge/upload, expose deletion methods, drain cleanup.
- Modify `tests/cloud-sync-v2-shadow.test.js`: repository order, stale-device, RPC, and failure tests.
- Modify `src/app/runtime/features/trash-lifecycle.js`: await cloud permanent deletion before removing local records.
- Modify `src/app/runtime/features/folder-lifecycle.js`: await cloud folder deletion before local mutation.
- Modify `src/app/runtime/legacy-core/legacy-core.js`: define cloud-aware deletion adapters for local versus Supabase users.
- Modify `src/app/runtime/legacy-core/core-tail-lifecycle.js`: inject deletion adapters into trash lifecycle.
- Create `tests/trash-cloud-deletion.test.js`: single, batch, empty-trash, and failure behavior.
- Create `tests/folder-cloud-deletion.test.js`: successful and failed cloud folder deletion.
- Modify `public/service-worker.js` and `tests/branding-assets.test.js`: release cache V17.

### Task 1: Pure tombstone reconciliation

**Files:**
- Create: `src/app/sync/cloud-sync-v2-deletions.js`
- Create: `tests/cloud-sync-v2-deletions.test.js`

- [ ] **Step 1: Write failing tests for authoritative tombstones**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyWorkspaceTombstones,
  createTombstoneIndex,
  filterEncodedWorkspaceByTombstones
} from '../src/app/sync/cloud-sync-v2-deletions.js';

const conversationId = '22222222-2222-4222-8222-222222222222';
const folderId = '33333333-3333-4333-8333-333333333333';
const tombstones = [
  { entity_type: 'conversation', entity_id: conversationId, deleted_at: '2026-07-06T02:00:00Z' },
  { entity_type: 'folder', entity_id: folderId, deleted_at: '2026-07-06T02:01:00Z' }
];

test('tombstones remove conversations and folders and clear stale folder membership', () => {
  const workspace = {
    conversations: [
      { id: conversationId, folderId, messages: [{ id: 'm1' }] },
      { id: '44444444-4444-4444-8444-444444444444', folderId, messages: [] }
    ],
    folders: [{ id: folderId, conversationIds: [conversationId] }],
    astras: [],
    personalMemories: []
  };
  const result = applyWorkspaceTombstones(workspace, createTombstoneIndex(tombstones));
  assert.deepEqual(result.folders, []);
  assert.deepEqual(result.conversations.map(item => item.id), ['44444444-4444-4444-8444-444444444444']);
  assert.equal(result.conversations[0].folderId, null);
  assert.notEqual(result, workspace);
});

test('encoded stale rows are removed before upload', () => {
  const result = filterEncodedWorkspaceByTombstones({
    folders: [{ id: folderId }],
    conversations: [{ id: conversationId }, { id: '44444444-4444-4444-8444-444444444444', folder_id: folderId }],
    messages: [
      { id: '55555555-5555-4555-8555-555555555555', conversation_id: conversationId },
      { id: '66666666-6666-4666-8666-666666666666', conversation_id: '44444444-4444-4444-8444-444444444444' }
    ],
    skippedConversationIds: []
  }, createTombstoneIndex(tombstones));
  assert.deepEqual(result.folders, []);
  assert.deepEqual(result.conversations.map(item => item.id), ['44444444-4444-4444-8444-444444444444']);
  assert.equal(result.conversations[0].folder_id, null);
  assert.deepEqual(result.messages.map(item => item.id), ['66666666-6666-4666-8666-666666666666']);
});
```

- [ ] **Step 2: Run the tests and verify the module is missing**

Run: `node --test tests/cloud-sync-v2-deletions.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement immutable filtering**

```js
export function createTombstoneIndex(rows = []) {
  const conversations = new Set();
  const folders = new Set();
  for (const row of rows) {
    if (row?.entity_type === 'conversation' && row.entity_id) conversations.add(row.entity_id);
    if (row?.entity_type === 'folder' && row.entity_id) folders.add(row.entity_id);
  }
  return { conversations, folders };
}

export function applyWorkspaceTombstones(workspace = {}, index = createTombstoneIndex()) {
  const conversations = (workspace.conversations || [])
    .filter(item => !index.conversations.has(item?.id))
    .map(item => index.folders.has(item?.folderId) ? { ...item, folderId: null } : item);
  const visibleIds = new Set(conversations.filter(item => !item.deletedAt).map(item => item.id));
  const folders = (workspace.folders || [])
    .filter(item => !index.folders.has(item?.id))
    .map(item => ({
      ...item,
      conversationIds: conversations
        .filter(conversation => conversation.folderId === item.id && visibleIds.has(conversation.id))
        .map(conversation => conversation.id)
    }));
  return { ...workspace, conversations, folders };
}

export function filterEncodedWorkspaceByTombstones(encoded = {}, index = createTombstoneIndex()) {
  const conversations = (encoded.conversations || [])
    .filter(row => !index.conversations.has(row.id))
    .map(row => index.folders.has(row.folder_id) ? { ...row, folder_id: null } : row);
  const conversationIds = new Set(conversations.map(row => row.id));
  return {
    ...encoded,
    folders: (encoded.folders || []).filter(row => !index.folders.has(row.id)),
    conversations,
    messages: (encoded.messages || []).filter(row => conversationIds.has(row.conversation_id))
  };
}
```

- [ ] **Step 4: Run the focused tests**

Run: `node --test tests/cloud-sync-v2-deletions.test.js`

Expected: PASS.

- [ ] **Step 5: Commit the pure reconciliation unit**

```powershell
git add -- src/app/sync/cloud-sync-v2-deletions.js tests/cloud-sync-v2-deletions.test.js
git commit -m "feat: add sync tombstone reconciliation"
```

### Task 2: Tombstone migration and atomic deletion RPCs

**Files:**
- Create: `supabase/migrations/20260706030000_add_workspace_tombstones.sql`
- Create: `tests/cloud-sync-v2-deletion-migration.test.js`

- [ ] **Step 1: Write the migration contract test**

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/20260706030000_add_workspace_tombstones.sql', import.meta.url);

test('deletion migration creates owner-readable immutable tombstones and protected RPCs', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /create table if not exists public\.workspace_tombstones/i);
  assert.match(sql, /primary key \(user_id, entity_type, entity_id\)/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /for select to authenticated/i);
  assert.doesNotMatch(sql, /workspace_tombstones for (insert|update|delete) to authenticated/i);
  assert.match(sql, /permanently_delete_workspace_conversations/i);
  assert.match(sql, /permanently_delete_workspace_folder/i);
  assert.match(sql, /security definer[\s\S]*set search_path = ''/i);
  assert.match(sql, /revoke all on function[\s\S]*from public/i);
  assert.match(sql, /grant execute on function[\s\S]*to authenticated/i);
  assert.doesNotMatch(sql, /alter publication|supabase_realtime/i);
});
```

- [ ] **Step 2: Run the test and verify the migration is missing**

Run: `node --test tests/cloud-sync-v2-deletion-migration.test.js`

Expected: FAIL with `ENOENT`.

- [ ] **Step 3: Add the tombstone table, helper, RLS, and RPCs**

Create the migration with this contract:

```sql
create table if not exists public.workspace_tombstones (
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('conversation', 'folder')),
  entity_id uuid not null,
  deleted_at timestamptz not null default statement_timestamp(),
  primary key (user_id, entity_type, entity_id)
);

create index if not exists workspace_tombstones_user_deleted_idx
  on public.workspace_tombstones(user_id, deleted_at desc);

alter table public.workspace_tombstones enable row level security;
drop policy if exists "Users read their own workspace tombstones" on public.workspace_tombstones;
create policy "Users read their own workspace tombstones"
on public.workspace_tombstones for select to authenticated
using ((select auth.uid()) = user_id);

grant select on public.workspace_tombstones to authenticated;
revoke all on public.workspace_tombstones from anon;

create or replace function public.workspace_asset_paths(p_parts jsonb)
returns setof text
language sql immutable security invoker set search_path = ''
as $$
  select distinct value #>> '{}'
  from jsonb_path_query(p_parts, 'strict $.**."__astraCloudAsset".path') as paths(value)
  where jsonb_typeof(value) = 'string';
$$;

create or replace function public.permanently_delete_workspace_conversations(p_conversation_ids uuid[])
returns table(object_path text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_candidate_paths text[] := array[]::text[];
  v_orphan_paths text[] := array[]::text[];
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select coalesce(array_agg(distinct paths.path), array[]::text[])
  into v_candidate_paths
  from public.workspace_messages messages
  cross join lateral public.workspace_asset_paths(messages.parts) paths(path)
  where messages.user_id = v_user_id
    and messages.conversation_id = any(coalesce(p_conversation_ids, array[]::uuid[]));
  insert into public.workspace_tombstones(user_id, entity_type, entity_id)
  select v_user_id, 'conversation', conversations.id
  from public.workspace_conversations conversations
  where conversations.user_id = v_user_id
    and conversations.id = any(coalesce(p_conversation_ids, array[]::uuid[]))
  on conflict (user_id, entity_type, entity_id) do nothing;
  delete from public.workspace_conversations conversations
  where conversations.user_id = v_user_id
    and conversations.id = any(coalesce(p_conversation_ids, array[]::uuid[]));
  select coalesce(array_agg(candidates.path), array[]::text[])
  into v_orphan_paths
  from unnest(v_candidate_paths) candidates(path)
  where not exists (
    select 1
    from public.workspace_messages messages
    cross join lateral public.workspace_asset_paths(messages.parts) paths(path)
    where messages.user_id = v_user_id and paths.path = candidates.path
  );
  delete from public.workspace_assets assets
  where assets.user_id = v_user_id
    and assets.object_path = any(v_orphan_paths);
  return query select unnest(v_orphan_paths);
end;
$$;

create or replace function public.permanently_delete_workspace_folder(p_folder_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  insert into public.workspace_tombstones(user_id, entity_type, entity_id)
  select v_user_id, 'folder', folders.id
  from public.workspace_folders folders
  where folders.user_id = v_user_id and folders.id = p_folder_id
  on conflict (user_id, entity_type, entity_id) do nothing;
  update public.workspace_conversations
    set folder_id = null
    where user_id = v_user_id and folder_id = p_folder_id;
  delete from public.workspace_folders where user_id = v_user_id and id = p_folder_id;
end;
$$;

revoke all on function public.workspace_asset_paths(jsonb) from public, anon;
revoke all on function public.permanently_delete_workspace_conversations(uuid[]) from public, anon;
revoke all on function public.permanently_delete_workspace_folder(uuid) from public, anon;
grant execute on function public.workspace_asset_paths(jsonb) to authenticated;
grant execute on function public.permanently_delete_workspace_conversations(uuid[]) to authenticated;
grant execute on function public.permanently_delete_workspace_folder(uuid) to authenticated;

drop policy if exists "Users manage their own workspace folders" on public.workspace_folders;
create policy "Users manage their own workspace folders"
on public.workspace_folders for all to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and not exists (
    select 1 from public.workspace_tombstones tombstones
    where tombstones.user_id = (select auth.uid())
      and tombstones.entity_type = 'folder'
      and tombstones.entity_id = workspace_folders.id
  )
);

drop policy if exists "Users manage their own workspace conversations" on public.workspace_conversations;
create policy "Users manage their own workspace conversations"
on public.workspace_conversations for all to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and not exists (
    select 1 from public.workspace_tombstones tombstones
    where tombstones.user_id = (select auth.uid())
      and tombstones.entity_type = 'conversation'
      and tombstones.entity_id = workspace_conversations.id
  )
);
```

These replacement policies make stale uploads fail safely instead of recreating deleted content.

- [ ] **Step 4: Run migration contract tests**

Run: `node --test tests/cloud-sync-v2-migration.test.js tests/cloud-sync-v2-deletion-migration.test.js`

Expected: PASS.

- [ ] **Step 5: Commit the database contract**

```powershell
git add -- supabase/migrations/20260706030000_add_workspace_tombstones.sql tests/cloud-sync-v2-deletion-migration.test.js
git commit -m "feat: add normalized deletion tombstones"
```

### Task 3: Refresh-before-upload synchronization

**Files:**
- Modify: `src/app/sync/cloud-sync-v2-shadow.js`
- Modify: `tests/cloud-sync-v2-shadow.test.js`

- [ ] **Step 1: Replace the initialization test with a failing pull-first assertion**

The repository fake must implement `fetchTombstones` and `fetchWorkspace`. Assert this call order:

```js
assert.deepEqual(calls.map(call => call[0]), [
  'probe', 'tombstones', 'workspace', 'writeLocal',
  'state', 'folders', 'conversations', 'messages', 'verify', 'state'
]);
```

Add a stale-device test where local contains a tombstoned conversation and remote contains no conversation; assert `writeWorkspace` and uploaded rows contain neither the conversation nor its messages.

- [ ] **Step 2: Run the focused test and verify the old upload-first order fails**

Run: `node --test tests/cloud-sync-v2-shadow.test.js`

Expected: FAIL because initialization currently uploads before fetching tombstones.

- [ ] **Step 3: Add repository tombstone fetching and pull-first initialization**

Add:

```js
async function fetchTombstones() {
  const { data, error } = await supabase
    .from('workspace_tombstones')
    .select('entity_type,entity_id,deleted_at')
    .eq('user_id', userId);
  if (error) throw error;
  return data || [];
}
```

Import Task 1 helpers. Keep a private `tombstoneIndex`. In `initialize()` perform:

```js
const localWorkspace = await readWorkspace() || {};
const tombstones = await repository.fetchTombstones();
tombstoneIndex = createTombstoneIndex(tombstones);
const localWithoutDeleted = applyWorkspaceTombstones(localWorkspace, tombstoneIndex);
const remoteRows = await repository.fetchWorkspace();
const remoteWorkspace = applyWorkspaceTombstones(
  decodeWorkspaceConversationShadow(remoteRows),
  tombstoneIndex
);
const mergedWorkspace = applyWorkspaceTombstones(
  mergeWorkspaceAppData(localWithoutDeleted, remoteWorkspace),
  tombstoneIndex
);
await writeWorkspace(mergedWorkspace);
return captureNow(mergedWorkspace);
```

In `captureNow()`, pass encoded rows through `filterEncodedWorkspaceByTombstones`. Inject `writeWorkspace` into `createConversationShadowSync`; `initializeConversationShadowSync` supplies the existing `storage.setItem` callback and removes its old upload-then-pull continuation.

- [ ] **Step 4: Run Sync V2 unit tests**

Run: `node --test tests/cloud-sync-v2-deletions.test.js tests/cloud-sync-v2-codecs.test.js tests/cloud-sync-v2-shadow.test.js`

Expected: PASS.

- [ ] **Step 5: Commit pull-first reconciliation**

```powershell
git add -- src/app/sync/cloud-sync-v2-shadow.js tests/cloud-sync-v2-shadow.test.js
git commit -m "fix: apply tombstones before sync uploads"
```

### Task 4: Persistent orphaned-asset cleanup

**Files:**
- Create: `src/app/sync/cloud-sync-v2-asset-cleanup.js`
- Create: `tests/cloud-sync-v2-asset-cleanup.test.js`
- Modify: `src/app/sync/cloud-sync-v2-shadow.js`
- Modify: `tests/cloud-sync-v2-shadow.test.js`

- [ ] **Step 1: Write failing queue tests**

Test that `enqueue(['user/a', 'user/a', 'user/b'])` persists two paths, successful `drain()` clears them, and failed `removeAssets()` leaves both paths persisted without throwing from `enqueue`.

```js
const queue = createAssetCleanupQueue({ storage, repository, userId: 'user-1', logger });
await queue.enqueue(['user/a', 'user/a', 'user/b']);
assert.deepEqual(JSON.parse(await storage.getItem(queue.storageKey)), ['user/a', 'user/b']);
await queue.drain();
assert.equal(await storage.getItem(queue.storageKey), null);
```

- [ ] **Step 2: Run the test and verify the module is missing**

Run: `node --test tests/cloud-sync-v2-asset-cleanup.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement the persistent queue**

Export `createAssetCleanupQueue({ storage, repository, userId, logger })` with key `astraSyncV2PendingAssetCleanup:${userId}`. `enqueue()` merges and persists unique non-empty paths, then calls a non-throwing `drain()`. `drain()` removes paths through `repository.removeAssets(paths)` and deletes the key only on success.

Add repository methods:

```js
async function removeAssets(paths) {
  if (!paths.length) return;
  const { error } = await supabase.storage.from('user-assets').remove(paths);
  if (error) throw error;
}

async function permanentlyDeleteConversations(ids) {
  const { data, error } = await supabase.rpc('permanently_delete_workspace_conversations', {
    p_conversation_ids: ids
  });
  if (error) throw error;
  return (data || []).map(row => row.object_path).filter(Boolean);
}
```

Create the queue in `initializeConversationShadowSync`. Drain it after successful initialization. Expose `permanentlyDeleteConversations(ids)` on the Sync V2 API: require `status.state === 'ready'`, call the RPC, add conversation IDs to the in-memory tombstone index, enqueue returned paths, and return only after the database RPC succeeds.

- [ ] **Step 4: Test database success and Storage failure separately**

Run: `node --test tests/cloud-sync-v2-asset-cleanup.test.js tests/cloud-sync-v2-shadow.test.js`

Expected: PASS; a Storage failure leaves a retry queue but the deletion method resolves after database success.

- [ ] **Step 5: Commit cleanup and deletion API**

```powershell
git add -- src/app/sync/cloud-sync-v2-asset-cleanup.js src/app/sync/cloud-sync-v2-shadow.js tests/cloud-sync-v2-asset-cleanup.test.js tests/cloud-sync-v2-shadow.test.js
git commit -m "feat: add permanent conversation deletion API"
```

### Task 5: Trash UI uses confirmed cloud deletion

**Files:**
- Modify: `src/app/runtime/features/trash-lifecycle.js`
- Modify: `src/app/runtime/legacy-core/legacy-core.js`
- Modify: `src/app/runtime/legacy-core/core-tail-lifecycle.js`
- Create: `tests/trash-cloud-deletion.test.js`

- [ ] **Step 1: Write failing lifecycle tests**

Instantiate `createLegacyTrashLifecycle` with a `permanentlyDeleteConversations` spy. Cover:

```js
await lifecycle.handleDeleteTrashItemPermanently(conversationId);
assert.deepEqual(cloudCalls, [[conversationId]]);
assert.deepEqual(conversations, []);

cloudDelete.rejects(new Error('offline'));
await lifecycle.handleDeleteTrashItemPermanently(conversationId);
assert.equal(conversations.length, 1);
assert.equal(conversations[0].deletedAt != null, true);
assert.equal(saveCalls, 0);
```

Repeat with two selected IDs for batch delete and all trashed IDs for empty trash.

- [ ] **Step 2: Run the lifecycle test and verify local records are currently removed first**

Run: `node --test tests/trash-cloud-deletion.test.js`

Expected: FAIL because the lifecycle has no cloud deletion dependency.

- [ ] **Step 3: Inject and await permanent deletion**

Add `permanentlyDeleteConversations = async () => {}` to `createLegacyTrashLifecycle`. For single, batch, and empty-trash paths:

```js
try {
  await permanentlyDeleteConversations(ids);
} catch (error) {
  showNotification(error?.message || 'Cloud deletion failed. Please try again.', 'error');
  return;
}
replaceConversations(getConversations().filter(item => !ids.includes(item.id)));
await saveAppData();
```

In `legacy-core.js`, define a cloud-aware adapter: local users resolve immediately; usernames beginning with `supabase:` require `globalThis.__astraCloudSyncV2.permanentlyDeleteConversations`, otherwise throw a retryable error. Pass it through `createLegacyCoreTailLifecycle`, then into `createLegacyTrashLifecycle`.

- [ ] **Step 4: Run trash and boundary tests**

Run: `node --test tests/trash-cloud-deletion.test.js` followed by `npm.cmd run check:legacy-runtime`.

Expected: PASS.

- [ ] **Step 5: Commit the trash integration**

```powershell
git add -- src/app/runtime/features/trash-lifecycle.js src/app/runtime/legacy-core/legacy-core.js src/app/runtime/legacy-core/core-tail-lifecycle.js tests/trash-cloud-deletion.test.js
git commit -m "feat: sync permanent trash deletion"
```

### Task 6: Folder deletion uses the same tombstone contract

**Files:**
- Modify: `src/app/sync/cloud-sync-v2-shadow.js`
- Modify: `src/app/runtime/features/folder-lifecycle.js`
- Modify: `src/app/runtime/legacy-core/legacy-core.js`
- Modify: `src/app/runtime/legacy-core/core-tail-lifecycle.js`
- Create: `tests/folder-cloud-deletion.test.js`

- [ ] **Step 1: Write failing folder deletion tests**

Assert `permanentlyDeleteFolder(folderId)` is called before local removal; on rejection, the folder and conversation membership remain unchanged and `saveAppData` is not called. On success, the folder is removed and affected conversations have `folderId === null`.

- [ ] **Step 2: Run the test and verify current eager local deletion fails it**

Run: `node --test tests/folder-cloud-deletion.test.js`

Expected: FAIL.

- [ ] **Step 3: Add repository/API/UI folder deletion**

Repository method:

```js
async function permanentlyDeleteFolder(id) {
  const { error } = await supabase.rpc('permanently_delete_workspace_folder', { p_folder_id: id });
  if (error) throw error;
}
```

Expose it from Sync V2 with the same ready-state guard and immediately add the ID to the in-memory folder tombstone set after RPC success. Add a cloud-aware runtime adapter and inject it into `createLegacyFolderLifecycle`. In `deleteFolder`, await the adapter before clearing conversation membership or replacing folders; on failure, notify and return without local mutation.

- [ ] **Step 4: Run folder, sync, and codec tests**

Run: `node --test tests/folder-cloud-deletion.test.js tests/cloud-sync-v2-shadow.test.js tests/cloud-sync-v2-codecs.test.js`

Expected: PASS.

- [ ] **Step 5: Commit folder deletion sync**

```powershell
git add -- src/app/sync/cloud-sync-v2-shadow.js src/app/runtime/features/folder-lifecycle.js src/app/runtime/legacy-core/legacy-core.js src/app/runtime/legacy-core/core-tail-lifecycle.js tests/folder-cloud-deletion.test.js
git commit -m "feat: sync permanent folder deletion"
```

### Task 7: Release verification and deployment handoff

**Files:**
- Modify: `public/service-worker.js`
- Modify: `tests/branding-assets.test.js`

- [ ] **Step 1: Write the expected V17 cache assertion**

Change the branding test expectation from `astra-chat-vite-cache-v16` to `astra-chat-vite-cache-v17`.

- [ ] **Step 2: Run the test and verify it fails against V16**

Run: `node --test tests/branding-assets.test.js`

Expected: FAIL with the missing V17 cache name.

- [ ] **Step 3: Bump the service worker cache**

Change the first line of `public/service-worker.js` to:

```js
const CACHE_NAME = 'astra-chat-vite-cache-v17';
```

- [ ] **Step 4: Run full automated verification**

Run:

```powershell
npm.cmd test
npm.cmd run check:legacy-runtime
npm.cmd run build
git diff --check
```

Expected: all tests pass, the runtime boundary check exits 0, Vite build succeeds, and `git diff --check` prints nothing.

- [ ] **Step 5: Commit the release cache bump**

```powershell
git add -- public/service-worker.js tests/branding-assets.test.js
git commit -m "chore: release deletion sync cache v17"
```

- [ ] **Step 6: Apply and verify the Supabase migration before application deployment**

Run `supabase/migrations/20260706030000_add_workspace_tombstones.sql` once in the Supabase SQL Editor. Verify:

```sql
select entity_type, count(*)
from public.workspace_tombstones
group by entity_type;
```

Expected initially: zero rows or no result rows. Then deploy/push the application and verify `/service-worker.js` begins with V17.

- [ ] **Step 7: Perform the two-device acceptance test**

1. A moves a conversation to trash; refresh B; B sees it in trash.
2. B restores it; refresh A; A sees it in history.
3. A permanently deletes it; refresh B; neither history nor trash contains it.
4. Refresh the stale device again; the deleted conversation does not return.
5. A deletes a folder containing a conversation; refresh B; the folder is absent and the conversation is unfiled.
6. Take B offline before a deletion, edit other data, reconnect, then refresh; the deleted entity remains absent while unrelated edits survive.
