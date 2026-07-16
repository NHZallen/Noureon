# Cloud Asset Sync Hotfix Design

**Date:** 2026-07-16
**Status:** Approved direction; pending written-spec review

## Context

Production logs show a burst of `POST /storage/v1/object/user-assets/...` requests returning HTTP 400 with PostgreSQL error `23505` on the `bucketid_objname` unique constraint. The affected object names are content hashes that already exist in the user's Storage folder. The same session also emits `/[object Object]` 404 requests and ends Sync V2 initialization with `ASTRA_SHADOW_VERIFY_MISMATCH`.

The Content Security Policy report-only messages, Perplexity font warning, Chrome Built-In AI notice, and Cloudflare Turnstile font warning are unrelated browser or third-party noise. They are not part of this hotfix.

## Confirmed Root Causes

### Duplicate Storage uploads

Cloud assets are content-addressed as `userId/sha256`. The transport currently sends a raw `POST` with `x-upsert: false` before checking whether that object already exists. A duplicate response is recognized and treated as success, but only after the browser has retransmitted the full Blob and Supabase has recorded an HTTP 400 and database uniqueness violation.

Because the in-memory `uploadedPaths` set is recreated on every page load, a dirty workspace can retransmit every inline asset again. With roughly 93 MB of stored assets, this creates avoidable traffic, error logs, and initialization work.

### Unresolved cloud markers entering the live UI

Recent on-demand hydration changed remote workspace merges to use `allowNetwork: false`. When a marker is absent from the current browser's IndexedDB cache, hydration returns the marker object unchanged. Legacy rendering paths expect fields such as `avatarUrl` or inline media data to be strings. String interpolation therefore produces `[object Object]` and the browser requests an invalid relative URL.

### Opaque shadow verification failure

The repository verification boundary currently returns only a boolean. When a row differs after an upsert, the caller reports a generic `ASTRA_SHADOW_VERIFY_MISMATCH`. The logs show that the first mismatch occurs while verifying `workspace_conversations`, but they do not identify the row or differing columns. The hotfix must improve diagnostics without weakening verification or logging user content.

## Goals

- Do not upload a Blob when the same content hash already exists in the user's Storage folder.
- Preserve immutable, content-addressed object names and `upsert: false` for genuinely new objects.
- Never hand unresolved cloud asset marker objects to legacy UI rendering paths.
- Reuse in-memory and IndexedDB asset caches so an object is downloaded at most once per browser cache lifetime.
- Report the collection, row ID, and differing top-level fields for shadow verification failures without logging field values.
- Preserve current local-mode fallback and all sync safety boundaries.

## Non-goals

- Redesigning the complete cloud asset manifest format.
- Deleting or rewriting existing Storage objects.
- Relaxing row verification or accepting mismatched content.
- Changing Supabase CSP, browser extensions, Perplexity assets, or Cloudflare Turnstile behavior.
- Adding a database migration.

## Design

### 1. Existing-object index before upload

`createCloudAssetTransport` will lazily build one in-memory index of existing object names for the current user's folder. The index operation will:

1. Call `storageBucket.list(userId, { limit, offset })` with bounded pagination.
2. Add each returned filename to a `Set` as `userId/filename`.
3. Share one in-flight promise across concurrent asset externalization calls.
4. Stop when a page contains fewer than the requested limit.

Before uploading a content-addressed path, `uploadBlob` will await this index once. If the path exists, it will add the path to `uploadedPaths` and return its marker without sending a Storage `POST`.

If listing is unavailable or fails, the transport will retain the current safe fallback: attempt the immutable upload, recognize duplicate responses, and use the existing per-object lookup for otherwise ambiguous errors. A concurrent client may create an object after the index was loaded; that race is still handled by the duplicate-response path.

When a genuinely new upload succeeds or is confirmed as a duplicate, its path will be added to both the existing-object index and `uploadedPaths`.

### 2. Safe remote hydration at workspace merge boundaries

Remote workspaces will again be fully hydrated before they are committed or handed to the live runtime. Hydration will continue to check, in order:

1. The transport's in-memory Blob cache.
2. The persistent IndexedDB asset cache.
3. Supabase Storage when the asset is missing locally.

Downloaded Blobs are already persisted, so repeated refreshes in the same browser will not download them again. A browser whose cache does not contain the existing 93 MB asset set may perform a one-time recovery download after deployment; subsequent loads reuse IndexedDB.

The active-conversation hydration helper remains valid as a defensive and future on-demand path, but committed workspace data must already be safe for legacy string-based renderers. The hotfix will remove `allowNetwork: false` from the initialization, pull, and refresh merge boundaries.

### 3. Structured verification diagnostics

Repository verification will return a structured result:

```js
{
  verified: false,
  mismatch: {
    collection: 'conversations',
    id: '...',
    differingFields: ['metadata', 'title']
  }
}
```

The comparison will canonicalize timestamps and structured JSON exactly as the current equality helper does. Diagnostics will contain only the collection name, row ID, and top-level field names. They will not include titles, messages, metadata values, asset URLs, or other user content.

`createConversationShadowSync` will remain compatible with existing boolean-returning test repositories. On a structured failure it will throw the existing `ASTRA_SHADOW_VERIFY_MISMATCH` error and attach the sanitized mismatch object to `error.details`. No mismatch will be silently accepted.

## Data Flow

### Upload

1. Normalize the local workspace.
2. Externalize an inline asset and calculate its SHA-256 path.
3. Load the user's existing-object index once.
4. If the path exists, emit the marker without uploading.
5. Otherwise upload once with immutable cache metadata and `upsert: false`.
6. Continue encoding and uploading only changed workspace rows.

### Remote merge

1. Fetch remote delta or snapshot rows.
2. Decode cloud asset markers.
3. Resolve every marker through memory, IndexedDB, or one Storage download.
4. Merge the hydrated remote workspace with the local workspace.
5. Commit only when semantic workspace content changed.
6. Hand only hydrated values to the live runtime.

### Verification failure

1. Read back the uploaded row IDs.
2. Compare each local row with its canonical remote row.
3. Stop at the first mismatch and calculate differing top-level field names.
4. Throw the existing safe fallback error with sanitized details.
5. Keep local mode active and avoid marking the migration ready.

## Error Handling

- A Storage list failure does not block syncing; it falls back to immutable upload plus duplicate detection.
- A new-object upload failure is still fatal unless the object can be confirmed to exist.
- A missing remote object remains a logged asset-unavailable condition and must not be converted into `[object Object]` UI output.
- A verification mismatch keeps Sync V2 disabled for that initialization and exposes only sanitized diagnostics.
- No automatic object deletion, overwrite, or database repair is part of this hotfix.

## Tests

The implementation will add regression tests that first fail against the current code:

- Existing listed hashes produce zero Storage upload requests.
- Multiple concurrent assets share a single paginated list operation.
- New hashes still upload with `upsert: false` and immutable cache metadata.
- A failed list falls back to the existing duplicate-safe upload behavior.
- Remote workspace merge boundaries allow network hydration so unresolved marker objects are not committed.
- Structured verification reports collection, ID, and differing field names without values.
- Legacy boolean verification results remain supported.

Focused tests will cover `cloud-assets`, `cloud-sync-v2-shadow`, and relevant safety contracts. Completion requires the full test suite, legacy runtime boundary check, size-budget check, and production build.

## Release and Manual Verification

After the hotfix is deployed:

1. Reload once and allow any missing IndexedDB assets to recover from Storage.
2. Clear the Network panel, send one text-only message, and filter by `/storage/v1/object/user-assets`.
3. Existing hashes must not produce Storage `POST` requests or `bucketid_objname` errors.
4. The console must not request `/[object Object]`.
5. If verification still fails, the error details must identify the collection, row ID, and differing fields for the next targeted correction.
