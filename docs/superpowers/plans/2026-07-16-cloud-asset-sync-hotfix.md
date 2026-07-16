# Cloud Asset Sync Hotfix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop duplicate content-addressed Storage uploads, prevent unresolved cloud markers from reaching legacy UI renderers, and expose sanitized Sync V2 verification mismatch details.

**Architecture:** Extend the existing cloud asset transport with one lazily shared, paginated index of object names under the current user's folder, while preserving immutable uploads and duplicate-race handling. Restore network-capable hydration at all remote workspace merge boundaries so committed workspace values are render-safe. Replace boolean-only repository verification with a backward-compatible structured result that identifies only the collection, row ID, and differing top-level fields.

**Tech Stack:** JavaScript ES modules, Node.js built-in test runner, Supabase JS Storage/PostgREST APIs, IndexedDB-backed application storage, Vite.

## Global Constraints

- Do not add a database migration or alter existing Storage objects.
- Keep content-addressed paths as `userId/sha256` and new uploads as `upsert: false` with immutable cache metadata.
- A Storage list failure must fall back to the existing immutable upload and duplicate-detection path.
- Never log field values, message content, titles, metadata contents, asset URLs, access tokens, or other user content in verification diagnostics.
- Do not relax shadow verification or mark a mismatched migration ready.
- Preserve local-mode fallback and existing journal, tombstone, and generation safety checks.
- All production changes require a failing regression test first.

---

### Task 1: Skip uploads for existing content hashes

**Files:**
- Modify: `tests/cloud-assets.test.js:7-301`
- Modify: `src/app/sync/cloud-assets.js:77-180`

**Interfaces:**
- Consumes: Supabase Storage bucket methods `list(folder, options)`, `upload(path, blob, options)`, and the existing raw REST upload fallback.
- Produces: an internal shared `getExistingObjectPaths(): Promise<Set<string> | null>` used by `uploadBlob(blob, encoding)` before `uploadObject(path, blob)`.
- Preserves: public transport methods `externalize(value)`, `hydrate(value, options)`, and `hydrateConversation(conversation)`.

- [ ] **Step 1: Add a failing test proving a listed hash sends no upload**

Add this helper and test to `tests/cloud-assets.test.js`:

```js
async function sha256Hex(bytes) {
  const digest = await webcrypto.subtle.digest('SHA-256', Uint8Array.from(bytes));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

test('cloud assets skip upload when the content hash already exists in Storage', async () => {
  const hash = await sha256Hex([1, 2, 3]);
  const calls = { lists: [], uploads: [] };
  const transport = createCloudAssetTransport({
    supabase: { storage: { from: () => ({
      async list(folder, options) {
        calls.lists.push({ folder, options });
        return { data: [{ name: hash }], error: null };
      },
      async upload(path) {
        calls.uploads.push(path);
        return { error: null };
      },
      async download() { return { data: null, error: new Error('not used') }; }
    }) } },
    storage: { getItem: async () => null, setItem: async () => {} },
    userId: 'user-1',
    cryptoProvider: webcrypto
  });

  const cloudValue = await transport.externalize({
    part: { mimeType: 'image/png', data: 'AQID' }
  });

  assert.equal(calls.lists.length, 1);
  assert.equal(calls.lists[0].folder, 'user-1');
  assert.deepEqual(calls.uploads, []);
  assert.equal(cloudValue.part.data.__astraCloudAsset.path, `user-1/${hash}`);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --test --test-name-pattern="skip upload when the content hash already exists" tests/cloud-assets.test.js
```

Expected: FAIL because `uploadBlob` calls `uploadObject` before consulting `storageBucket.list`, so `calls.uploads` contains the hash path.

- [ ] **Step 3: Add failing concurrency, pagination, and list-fallback tests**

Add tests with these concrete assertions:

```js
test('cloud assets share one paginated existing-object index across concurrent assets', async () => {
  const calls = { lists: [], uploads: [] };
  const firstPage = Array.from({ length: 1000 }, (_, index) => ({ name: `existing-${index}` }));
  const transport = createCloudAssetTransport({
    supabase: { storage: { from: () => ({
      async list(folder, options) {
        calls.lists.push({ folder, options });
        return options.offset === 0
          ? { data: firstPage, error: null }
          : { data: [], error: null };
      },
      async upload(path, _blob, options) {
        calls.uploads.push({ path, options });
        return { error: null };
      },
      async download() { return { data: null, error: new Error('not used') }; }
    }) } },
    storage: { getItem: async () => null, setItem: async () => {} },
    userId: 'user-1',
    cryptoProvider: webcrypto
  });

  await transport.externalize([
    { mimeType: 'image/png', data: 'AQID' },
    { mimeType: 'image/png', data: 'BAUG' }
  ]);

  assert.deepEqual(calls.lists.map(call => call.options.offset), [0, 1000]);
  assert.equal(calls.uploads.length, 2);
  assert.equal(calls.uploads.every(call => call.options.upsert === false), true);
});

test('cloud assets fall back to duplicate-safe upload when the object index fails', async () => {
  const uploads = [];
  const transport = createCloudAssetTransport({
    supabase: { storage: { from: () => ({
      async list() { return { data: null, error: new Error('list denied') }; },
      async upload(path) {
        uploads.push(path);
        return { error: { statusCode: '409', message: 'already exists' } };
      },
      async download() { return { data: null, error: new Error('not used') }; }
    }) } },
    storage: { getItem: async () => null, setItem: async () => {} },
    userId: 'user-1',
    cryptoProvider: webcrypto
  });

  const cloudValue = await transport.externalize({
    part: { mimeType: 'image/png', data: 'AQID' }
  });

  assert.equal(uploads.length, 1);
  assert.ok(cloudValue.part.data.__astraCloudAsset);
});
```

- [ ] **Step 4: Run the focused tests and verify RED**

Run:

```powershell
node --test --test-name-pattern="existing-object index|object index fails" tests/cloud-assets.test.js
```

Expected: the pagination assertion fails because no pre-upload index exists; the fallback test may already pass and must remain as a safety contract.

- [ ] **Step 5: Implement the shared paginated index**

In `createCloudAssetTransport`, add the internal state and loader near `uploadedPaths`:

```js
  const uploadedPaths = new Set();
  let existingObjectPathsPromise = null;

  async function loadExistingObjectPaths() {
    if (typeof storageBucket.list !== 'function') return null;
    const paths = new Set();
    const limit = 1000;
    let offset = 0;
    while (true) {
      const { data, error } = await storageBucket.list(userId, {
        limit,
        offset,
        sortBy: { column: 'name', order: 'asc' }
      });
      if (error || !Array.isArray(data)) return null;
      for (const item of data) {
        if (item?.name) paths.add(`${userId}/${item.name}`);
      }
      if (data.length < limit) return paths;
      offset += data.length;
    }
  }

  function getExistingObjectPaths() {
    if (!existingObjectPathsPromise) {
      existingObjectPathsPromise = loadExistingObjectPaths().catch(() => null);
    }
    return existingObjectPathsPromise;
  }
```

Update `uploadBlob` so the index check happens before `uploadObject` and successful or duplicate-confirmed paths update both sets:

```js
  async function uploadBlob(blob, encoding) {
    const hash = await sha256(blob, cryptoProvider);
    const path = `${userId}/${hash}`;
    if (!uploadedPaths.has(path)) {
      const existingObjectPaths = await getExistingObjectPaths();
      if (!existingObjectPaths?.has(path)) {
        const { error } = await uploadObject(path, blob);
        const duplicate = error && (
          String(error.statusCode) === '409'
          || String(error.code) === '23505'
          || /already exists|duplicate|bucketid_objname/i.test(`${error.message || ''}\n${error.details || ''}`)
        );
        if (error && !duplicate && !(await objectAlreadyExists(path))) throw error;
        existingObjectPaths?.add(path);
      }
      uploadedPaths.add(path);
    }
    return marker(path, blob.type || 'application/octet-stream', encoding);
  }
```

- [ ] **Step 6: Update the ambiguous-error test for preflight semantics**

Replace the existing test named `cloud assets verify object existence before failing ambiguous raw upload errors` with this version. It distinguishes the initial paginated index call from the later filename-specific fallback after an ambiguous raw HTTP error:

```js
test('cloud assets verify object existence before failing ambiguous raw upload errors', async () => {
  const fixture = createFixture();
  const listings = [];
  let rawUploads = 0;
  const transport = createCloudAssetTransport({
    ...fixture,
    supabase: {
      auth: {
        getSession: async () => ({ data: { session: { access_token: 'session-token' } }, error: null })
      },
      storage: {
        from: () => ({
          upload: async () => assert.fail('raw upload should be used before SDK upload'),
          download: async () => assert.fail('object existence checks must not download the body'),
          list: async (folder, options) => {
            listings.push({ folder, options });
            return Object.hasOwn(options, 'offset')
              ? { data: [], error: null }
              : { data: [{ name: options.search }], error: null };
          }
        })
      }
    },
    userId: 'user-1',
    supabaseUrl: 'https://project.supabase.co',
    supabasePublishableKey: 'publishable-key',
    fetchImpl: async () => {
      rawUploads += 1;
      return new Response('<html><body><h1>400 Bad Request</h1></body></html>', { status: 400 });
    },
    cryptoProvider: webcrypto
  });

  const cloudValue = await transport.externalize({
    part: { mimeType: 'image/png', data: 'AQID' }
  });

  assert.equal(rawUploads, 1);
  assert.equal(listings.length, 2);
  assert.equal(listings[0].folder, 'user-1');
  assert.equal(listings[0].options.offset, 0);
  assert.match(listings[1].options.search, /^[a-f0-9]{64}$/);
  assert.ok(cloudValue.part.data.__astraCloudAsset);
});
```

Keep the existing raw duplicate 23505 test to prove the race/fallback path remains accepted when the bucket mock does not provide `list`.

- [ ] **Step 7: Run the cloud asset suite and verify GREEN**

Run:

```powershell
node --test tests/cloud-assets.test.js
```

Expected: all `cloud-assets` tests pass with zero failures.

- [ ] **Step 8: Commit Task 1**

```powershell
git add -- src/app/sync/cloud-assets.js tests/cloud-assets.test.js
git commit -m "fix: skip existing cloud asset uploads"
```

---

### Task 2: Keep unresolved markers out of committed workspaces

**Files:**
- Modify: `tests/cloud-sync-v2-shadow.test.js:680-747`
- Modify: `src/app/sync/cloud-sync-v2-shadow.js:1185-1200, 1788-1800`
- Modify: other `hydrateRemoteWorkspace` call sites in `src/app/sync/cloud-sync-v2-shadow.js` found by `rg -n "allowNetwork: false"`

**Interfaces:**
- Consumes: `hydrateRemoteWorkspace(workspace, { allowNetwork: boolean })` backed by `assetTransport.hydrate`.
- Produces: remote initialization, pull, and refresh workspaces whose asset fields are resolved strings or Blobs before commit/handoff.
- Preserves: persistent IndexedDB cache and `hydrateConversation` defensive API.

- [ ] **Step 1: Change the hydration-policy expectations to require network-capable hydration**

In the existing test that records `hydrationPolicies`, change its expectations to:

```js
  const committedWorkspaces = [];
  // Add to createConversationShadowSync options:
  onWorkspaceCommitted: detail => committedWorkspaces.push(detail.workspace),

  assert.deepEqual(hydrationPolicies, [{ allowNetwork: true }]);
  assert.equal(
    committedWorkspaces[0].conversations[0].messages[0].parts[0].inlineData.data,
    'RESTORED_IMAGE_BYTES'
  );
  // after pullWorkspace
  assert.deepEqual(hydrationPolicies, [
    { allowNetwork: true },
    { allowNetwork: true }
  ]);
```

Add an assertion that the workspace handed to `onWorkspaceCommitted` contains `RESTORED_IMAGE_BYTES`, not an asset marker object.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --test --test-name-pattern="shadow sync externalizes upload assets" tests/cloud-sync-v2-shadow.test.js
```

Expected: FAIL showing actual hydration options `{ allowNetwork: false }` instead of `{ allowNetwork: true }`.

- [ ] **Step 3: Restore network-capable hydration at every remote merge boundary**

Replace every remote workspace call shaped as:

```js
await hydrateRemoteWorkspace(decodedRemoteWorkspace, { allowNetwork: false });
```

with:

```js
await hydrateRemoteWorkspace(decodedRemoteWorkspace, { allowNetwork: true });
```

The expected call sites are initialization, explicit pull, Realtime/remote refresh, and retry paths. Do not change `cloud-assets.test.js` coverage that verifies direct cache-only hydration preserves an uncached marker; cache-only remains a transport capability but is no longer used before workspace commit.

- [ ] **Step 4: Run hydration and live-runtime regression suites and verify GREEN**

Run:

```powershell
node --test tests/cloud-sync-v2-shadow.test.js tests/cloud-assets.test.js tests/cloud-workspace-live-lifecycle.test.js tests/cloud-workspace-sync-safety.test.js
```

Expected: all selected suites pass with zero failures and no assertion still requires merge-boundary `allowNetwork: false`.

- [ ] **Step 5: Commit Task 2**

```powershell
git add -- src/app/sync/cloud-sync-v2-shadow.js tests/cloud-sync-v2-shadow.test.js tests/cloud-workspace-sync-safety.test.js
git commit -m "fix: hydrate cloud assets before workspace commit"
```

---

### Task 3: Report sanitized verification mismatches

**Files:**
- Modify: `src/app/sync/cloud-sync-v2-codecs.js:13-42, 384-386`
- Modify: `src/app/sync/cloud-sync-v2-shadow.js:1-7, 141-154, 620-652, 1075-1080`
- Modify: `tests/cloud-sync-v2-codecs.test.js`
- Modify: `tests/cloud-sync-v2-shadow.test.js`

**Interfaces:**
- Produces from codecs: `getShadowRowDifferingFields(left, right): string[]`.
- Produces from repository: `verify(rows): Promise<{ verified: boolean, mismatch: null | { collection: string, id: string | null, differingFields: string[] } }>`.
- Consumes in sync engine: structured verification results or legacy boolean results from injected repositories.

- [ ] **Step 1: Add a failing codec test for differing top-level fields**

Import `getShadowRowDifferingFields` in `tests/cloud-sync-v2-codecs.test.js` and add:

```js
test('shadow row diagnostics report field names without returning field values', () => {
  const fields = getShadowRowDifferingFields(
    {
      id: conversationId,
      title: 'private local title',
      metadata: { clientUpdatedAt: '2026-07-16T08:00:00.000Z', secret: 'local' }
    },
    {
      id: conversationId,
      title: 'private remote title',
      metadata: { clientUpdatedAt: '2026-07-16T08:00:00Z', secret: 'remote' }
    }
  );

  assert.deepEqual(fields, ['metadata', 'title']);
  assert.equal(JSON.stringify(fields).includes('private'), false);
  assert.equal(JSON.stringify(fields).includes('secret'), false);
});
```

- [ ] **Step 2: Run the codec test and verify RED**

Run:

```powershell
node --test --test-name-pattern="shadow row diagnostics" tests/cloud-sync-v2-codecs.test.js
```

Expected: test module fails because `getShadowRowDifferingFields` is not exported.

- [ ] **Step 3: Implement canonical top-level field diagnostics**

In `cloud-sync-v2-codecs.js`, add:

```js
export function getShadowRowDifferingFields(left, right) {
  const local = canonicalizeShadowRow(left);
  const remote = canonicalizeShadowRow(right);
  const keys = [...new Set([...Object.keys(local), ...Object.keys(remote)])].sort();
  return keys.filter(key => JSON.stringify(local[key]) !== JSON.stringify(remote[key]));
}
```

This must reuse `canonicalizeShadowRow` so timestamp and JSON normalization match `shadowRowsEqual`.

- [ ] **Step 4: Run the codec suite and verify GREEN**

Run:

```powershell
node --test tests/cloud-sync-v2-codecs.test.js
```

Expected: all codec tests pass.

- [ ] **Step 5: Add failing repository and sync-engine diagnostic tests**

Add this repository test in `tests/cloud-sync-v2-shadow.test.js`:

```js
test('repository reports sanitized verification mismatch details', async () => {
  const localConversationRow = {
    id: conversationId,
    user_id: userId,
    folder_id: null,
    title: 'private local title',
    summary: '',
    model: 'model-1',
    provider: 'provider-1',
    metadata: {},
    archived: false,
    pinned: false,
    created_at: '2026-07-16T08:00:00.000Z',
    deleted_at: null
  };
  const remoteConversationRow = { ...localConversationRow, title: 'private remote title' };
  const supabase = {
    from(table) {
      assert.equal(table, 'workspace_conversations');
      return {
        select() { return this; },
        eq() { return this; },
        async in() { return { data: [remoteConversationRow], error: null }; }
      };
    }
  };
  const repository = createConversationShadowRepository({ supabase, userId });

  assert.deepEqual(await repository.verify({
    folders: [],
    conversations: [localConversationRow],
    messages: [],
    astras: []
  }), {
    verified: false,
    mismatch: {
      collection: 'conversations',
      id: conversationId,
      differingFields: ['title']
    }
  });
});
```

Add this sync-engine test, which also proves the mismatch remains fatal:

```js
test('structured verification mismatch keeps local mode and exposes sanitized details', async () => {
  const mismatch = {
    collection: 'conversations',
    id: conversationId,
    differingFields: ['title']
  };
  const repository = {
    paginatedSnapshotsAreComplete: true,
    probe: async () => ({ schema_version: 2, migration_state: 'ready' }),
    fetchTombstones: async () => [],
    fetchWorkspace: async () => ({ folders: [], conversations: [], messages: [], astras: [] }),
    setMigrationState: async () => {},
    upsertFolders: async () => {},
    upsertConversations: async () => {},
    upsertMessages: async () => {},
    upsertAstras: async () => {},
    verify: async () => ({ verified: false, mismatch })
  };
  const sync = createConversationShadowSync({
    repository,
    readWorkspace: async () => structuredClone(workspace),
    writeWorkspace: async () => {},
    userId,
    cryptoProvider: webcrypto
  });

  const status = await sync.initialize();

  assert.equal(status.state, 'retry');
  assert.equal(status.code, 'ASTRA_SHADOW_VERIFY_MISMATCH');
  assert.deepEqual(status.details, mismatch);
});
```

The existing initialization tests whose repository returns boolean `true` are the backward-compatibility contract; do not convert every fixture to the structured return type.

- [ ] **Step 6: Run the shadow tests and verify RED**

Run:

```powershell
node --test --test-name-pattern="sanitized verification mismatch|structured verification mismatch" tests/cloud-sync-v2-shadow.test.js
```

Expected: FAIL because repository verification still returns a boolean and the generic mismatch error has no `details`.

- [ ] **Step 7: Implement structured repository verification**

Import `getShadowRowDifferingFields`. Replace boolean-only `verifyRows` with a collection-aware result:

```js
    const verifyRows = async (collection, table, columns, localRows) => {
      for (let index = 0; index < localRows.length; index += 200) {
        const chunk = localRows.slice(index, index + 200);
        const { data, error } = await supabase
          .from(table)
          .select(columns)
          .eq('user_id', userId)
          .in('id', chunk.map(row => row.id));
        if (error) throw error;
        const remoteById = new Map((data || []).map(row => [row.id, row]));
        for (const local of chunk) {
          const remote = remoteById.get(local.id);
          if (!shadowRowsEqual(local, remote)) {
            return {
              verified: false,
              mismatch: {
                collection,
                id: local?.id || null,
                differingFields: getShadowRowDifferingFields(local, remote)
              }
            };
          }
        }
      }
      return { verified: true, mismatch: null };
    };
```

Run folders, conversations, messages, then Astras sequentially and return the first failure. For a remotely deleted Astra, return `differingFields: ['deleted_at']`. Return `{ verified: true, mismatch: null }` only after all collections pass.

- [ ] **Step 8: Make the sync engine backward-compatible and attach sanitized details**

Normalize the repository result at the existing verification boundary:

```js
      const verification = await repository.verify(uploadRows);
      assertCurrent();
      const verified = typeof verification === 'boolean'
        ? verification
        : verification?.verified === true;
      if (!verified) {
        const error = new Error('Sync V2 shadow verification did not match the local workspace.');
        error.code = 'ASTRA_SHADOW_VERIFY_MISMATCH';
        if (verification?.mismatch) error.details = verification.mismatch;
        throw error;
      }
```

Do not attach local or remote row objects to the error.

- [ ] **Step 9: Run codec and shadow suites and verify GREEN**

Run:

```powershell
node --test tests/cloud-sync-v2-codecs.test.js tests/cloud-sync-v2-shadow.test.js tests/cloud-sync-v2-journal.test.js
```

Expected: all selected tests pass; structured mismatch details contain only field names.

- [ ] **Step 10: Commit Task 3**

```powershell
git add -- src/app/sync/cloud-sync-v2-codecs.js src/app/sync/cloud-sync-v2-shadow.js tests/cloud-sync-v2-codecs.test.js tests/cloud-sync-v2-shadow.test.js
git commit -m "fix: diagnose shadow verification mismatches"
```

---

### Task 4: Full verification and main delivery

**Files:**
- Verify all modified files from Tasks 1-3.
- Do not add generated `dist/` output to Git.

**Interfaces:**
- Consumes: the complete repository test/build scripts.
- Produces: a clean `main` branch pushed to `origin/main` with the design, plan, implementation, and regression tests.

- [ ] **Step 1: Run the full automated test suite**

Run with summary-only output to avoid truncation:

```powershell
$output = npm.cmd test 2>&1
$code = $LASTEXITCODE
$output | Select-Object -Last 25
Write-Output "EXIT_CODE=$code"
exit $code
```

Expected: exit code 0, zero failed tests.

- [ ] **Step 2: Run release boundary and size checks**

Run:

```powershell
npm.cmd run check:legacy-runtime
npm.cmd run check:sizes
```

Expected: both commands exit 0. Existing long-term size debt may be reported, but every transitional budget must pass.

- [ ] **Step 3: Build the production bundle**

Run:

```powershell
npm.cmd run build
```

Expected: Vite exits 0. The unrelated Lightning CSS `::highlight` warning may remain.

- [ ] **Step 4: Review the final diff and repository state**

Run:

```powershell
git diff --check
git status --short --branch --untracked-files=all
git log -6 --oneline
```

Expected: no whitespace errors, no generated build output staged, and only intended hotfix files are present.

- [ ] **Step 5: Push the verified main branch**

Run:

```powershell
git push origin main
git status --short --branch --untracked-files=all
```

Expected: push reports `main -> main`; final status is `## main...origin/main` with no modifications or untracked files.

- [ ] **Step 6: Report manual production checks**

Tell the user to reload once, clear Network, send one text-only message, and verify:

- no existing hash triggers `POST /storage/v1/object/user-assets/...`;
- no `bucketid_objname` errors appear;
- no `/[object Object]` requests appear;
- if shadow verification still fails, its details identify only collection, row ID, and differing field names.
