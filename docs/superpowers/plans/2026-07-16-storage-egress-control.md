# Storage Egress Control Implementation Plan

> **For Codex:** Execute this plan with `superpowers:test-driven-development` and verify each red/green step before committing.

**Goal:** Eliminate Storage body downloads during workspace bootstrap and reuse private `user-assets` blobs across reloads while downloading only assets referenced by the active conversation.

**Architecture:** Keep cloud markers in the normalized workspace until a consumer explicitly needs them. `createCloudAssetTransport` reads/writes an immutable per-user IndexedDB blob cache, distinguishes cache-only bootstrap hydration from network-enabled conversation hydration, and exposes request counters. The runtime dispatches an active-conversation hydration request after selection and applies the resolved conversation only if the session/generation is still current.

**Tech Stack:** JavaScript ES modules, Supabase Storage, IndexedDB storage adapter, Node test runner.

---

## Task 1: Persistent asset cache and cache-only hydration

**Files:**

- Modify: `src/app/sync/cloud-assets.js`
- Modify: `tests/cloud-assets.test.js`

### Step 1: Write failing tests

Add tests proving:

```js
await firstTransport.hydrate(markerValue, { allowNetwork: true });
const secondTransport = createCloudAssetTransport(samePersistentFixture);
const restored = await secondTransport.hydrate(markerValue, { allowNetwork: false });
assert.equal(downloadCount, 1);
assert.equal(restored.part.data, 'AQID');
```

Also assert an uncached marker survives `hydrate(value, { allowNetwork: false })` with zero calls to `storageBucket.download`.

### Step 2: Run the focused test and confirm red

Run: `node --test tests/cloud-assets.test.js`

Expected: the new cross-transport and `allowNetwork: false` assertions fail.

### Step 3: Implement the minimum cache behavior

In `cloud-assets.js`:

- Define the versioned key prefix `noureon:cloud-asset-cache:v1:`.
- Encode `userId` and the complete object path into the cache key.
- Read cached `{ blob, mimeType, encoding }` values through `storage.getItem` before any network request.
- Persist successful network downloads through `storage.setItem`.
- Accept `hydrate(value, { allowNetwork = true } = {})` and preserve the marker on a cache-only miss.
- Keep `pendingDownloads` so concurrent reads of the same path share one promise.
- Treat malformed cache records as misses without deleting unrelated data.

### Step 4: Run the focused test and confirm green

Run: `node --test tests/cloud-assets.test.js`

Expected: all cloud asset tests pass.

### Step 5: Commit

```bash
git add src/app/sync/cloud-assets.js tests/cloud-assets.test.js
git commit -m "fix: persist cloud asset downloads"
```

## Task 2: Prefer existing generated-image blobs

**Files:**

- Modify: `src/app/sync/cloud-assets.js`
- Modify: `tests/cloud-assets.test.js`

### Step 1: Write the failing test

Create a remote marker whose generated image `storageKey` already contains a Blob. Call network-enabled hydration and assert:

```js
assert.equal(fixture.downloadCounts.size, 0);
assert.equal('cloudAsset' in hydrated.generatedImage, false);
```

### Step 2: Confirm red

Run: `node --test tests/cloud-assets.test.js`

Expected: the current implementation downloads the Storage object.

### Step 3: Implement the minimum local-first check

Before resolving a generated-image marker, read `storageKey`. If it contains a Blob-like value, remove `cloudAsset` from the hydrated descriptor and do not call Storage. Preserve the marker if the local value is absent and network access is disabled.

### Step 4: Confirm green and commit

Run: `node --test tests/cloud-assets.test.js`

```bash
git add src/app/sync/cloud-assets.js tests/cloud-assets.test.js
git commit -m "fix: reuse local generated image blobs"
```

## Task 3: Immutable uploads without body-based existence checks

**Files:**

- Modify: `src/app/sync/cloud-assets.js`
- Modify: `tests/cloud-assets.test.js`

### Step 1: Update tests to express the required protocol

Assert raw upload requests contain:

```js
assert.equal(headers['cache-control'], 'max-age=31536000, immutable');
assert.equal(headers['x-upsert'], 'false');
```

For an ambiguous upload error, provide `storageBucket.list(folder, { search: filename })`, assert the object is accepted only when the exact name is present, and assert `download` is never called.

### Step 2: Confirm red

Run: `node --test tests/cloud-assets.test.js`

### Step 3: Implement immutable upload handling

- Correct REST and SDK cache-control metadata.
- Keep content-addressed `<userId>/<sha256>` paths and disable upsert.
- Treat known duplicate responses as success.
- Split a path into owner folder and object filename, query `storageBucket.list`, and require an exact metadata match for ambiguous failures.
- Never download an object body to test existence.

### Step 4: Confirm green and commit

Run: `node --test tests/cloud-assets.test.js`

```bash
git add src/app/sync/cloud-assets.js tests/cloud-assets.test.js
git commit -m "fix: make cloud asset uploads immutable"
```

## Task 4: Bootstrap cache-only and active-conversation hydration

**Files:**

- Modify: `src/app/sync/cloud-assets.js`
- Modify: `src/app/sync/cloud-sync-v2-shadow.js`
- Modify: `src/app/sync/cloud-workspace-sync.js`
- Modify: `src/app/runtime/features/cloud-workspace-live-lifecycle.js`
- Modify: `tests/cloud-assets.test.js`
- Modify: `tests/cloud-sync-v2-shadow.test.js`
- Modify: `tests/cloud-workspace-live-lifecycle.test.js`

### Step 1: Add failing behavior tests

Cover these boundaries:

- Shadow bootstrap calls remote hydration with `{ allowNetwork: false }`.
- `hydrateConversation(conversation)` walks only the supplied conversation and returns `{ conversation, resolvedCount }`.
- Applying a workspace with an active conversation schedules one hydration request.
- A stale result for a conversation that is no longer active is ignored.
- A resolved current conversation is persisted and re-rendered once.

### Step 2: Confirm red

Run:

```bash
node --test tests/cloud-assets.test.js tests/cloud-sync-v2-shadow.test.js tests/cloud-workspace-live-lifecycle.test.js
```

### Step 3: Implement the runtime flow

- Add `hydrateConversation` as a narrow wrapper around network-enabled hydration with resolution accounting.
- Change the shadow adapter's `hydrateRemoteWorkspace` callback to cache-only mode.
- Install a private runtime hydration hook owned by `cloud-workspace-sync.js`; it may call the transport but must not expose credentials or raw Supabase objects.
- In the live lifecycle, request hydration for the current active conversation after the remote workspace commit.
- Guard completion by active conversation ID and an incrementing request generation.
- Replace only the matching live conversation, call `saveAppData`, and render chat only when `resolvedCount > 0`.
- Keep unresolved markers on offline/missing-object failures so reopening can retry in a later session.

### Step 4: Confirm green

Run the focused command above, then:

```bash
npm test
npm run build
```

Expected: no regressions and production build succeeds.

### Step 5: Commit

```bash
git add src/app/sync/cloud-assets.js src/app/sync/cloud-sync-v2-shadow.js src/app/sync/cloud-workspace-sync.js src/app/runtime/features/cloud-workspace-live-lifecycle.js tests/cloud-assets.test.js tests/cloud-sync-v2-shadow.test.js tests/cloud-workspace-live-lifecycle.test.js
git commit -m "feat: hydrate cloud assets on demand"
```

## Task 5: Storage acceptance verification

**Files:**

- Modify if needed: `docs/superpowers/specs/2026-07-16-egress-optimization-design.md`

### Step 1: Run regression checks

Run:

```bash
npm test
npm run check:legacy-runtime
npm run check:sizes
npm run build
```

### Step 2: Perform browser verification

With DevTools Network filtered to `storage/v1/object/user-assets`:

1. Reload an account whose active conversation has no missing cloud asset: expect zero object GETs during bootstrap.
2. Open one uncached conversation: expect downloads only for its unique markers.
3. Reload and reopen the same conversation: expect zero object GETs.

Record request count and transferred bytes without copying access tokens.

### Step 3: Commit any documentation-only measurement notes

```bash
git add docs/superpowers/specs/2026-07-16-egress-optimization-design.md
git commit -m "docs: record storage egress verification"
```
