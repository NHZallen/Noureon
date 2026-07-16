# Supabase Egress Optimization Design

**Date:** 2026-07-16

**Status:** Approved for implementation

## Problem Statement

The current cloud-sync startup path fetches every normalized workspace row and recursively hydrates every referenced `user-assets` object. Asset de-duplication exists only in memory, generated-image hydration ignores an already-present IndexedDB blob, cross-origin authenticated Storage requests bypass the service worker, and the custom raw upload path uses mutable upserts with an invalid browser-cache directive. A production trace showed `cloud-workspace` initiating approximately 32 Storage downloads and 16.585 MB of transfer during one load, accounting for about 78% of that page load's transferred bytes.

The same sync layer also treats Realtime events as a signal to fetch all workspace tables. This is not the primary cause of Cached Egress, but it creates avoidable Database and Realtime egress.

## Goals

- Keep the `user-assets` bucket private and retain all existing RLS policies.
- Reduce Storage transfer on a cold start with previously cached local assets to less than 1 MB.
- Perform zero Storage object downloads during workspace metadata bootstrap on a new device.
- Download a missing asset only when its conversation becomes active or the asset is otherwise explicitly requested.
- Reuse downloaded assets across page reloads through IndexedDB-backed persistent caching.
- Stop overwriting content-addressed objects whose path already represents their SHA-256 digest.
- Replace full workspace refreshes with an owner-scoped, monotonic-sequence delta protocol.
- Reduce combined future Storage and Database egress by at least 90% under the observed workload.
- Preserve offline startup, cross-device merge behavior, durable tombstones, encrypted settings, and current local data.

## Non-Goals

- Making `user-assets` public.
- Deleting existing Storage objects or introducing automatic garbage collection in this change.
- Replacing Supabase, IndexedDB, the normalized workspace schema, or the existing encryption vault.
- Reworking import/export archives or model-provider request formats beyond resolving a required cloud asset before those paths consume it.

## Delivery Decomposition

The work is split into two independently deployable milestones.

1. **Storage asset egress control** stops eager network hydration, adds persistent local caching, corrects immutable uploads, and resolves assets only for active conversations.
2. **Incremental workspace synchronization** persists the remote row baseline and consumes owner-scoped database deltas identified by a single monotonic sequence.

Milestone 1 is deployed and measured before Milestone 2. This isolates billing impact and provides a safe rollback boundary.

## Milestone 1: Storage Asset Egress Control

### Asset transport interface

`createCloudAssetTransport` continues to expose `externalize` and `hydrate`, and adds an explicit `hydrateConversation` operation. Hydration accepts a network policy:

- Bootstrap hydration uses `allowNetwork: false`. It may read IndexedDB but must leave an unresolved cloud marker intact instead of downloading it.
- Active-conversation hydration uses `allowNetwork: true`. It resolves only markers contained in that conversation.
- Every successful network download is written to a persistent cache keyed by user ID, object path, encoding, and marker version.
- Generated images first read their existing `storageKey`. A Blob at that key is authoritative for the current descriptor and prevents a Storage request.

The transport reports whether it resolved any markers so callers can avoid unnecessary persistence and rendering.

### Persistent cache

The existing IndexedDB `keyValue` store remains the storage backend. Cache keys use:

```text
noureon:cloud-asset-cache:v1:<user-id>:<encoded-object-path>
```

The cached value is a Blob plus the marker's MIME type and encoding metadata. Content-addressed object paths make the cache immutable. No time-based eviction is required in this milestone; account deletion and existing user-data clearing remove the same IndexedDB store.

### Startup and active-conversation flow

1. Cloud sync fetches or reconstructs workspace metadata.
2. Bootstrap hydration walks markers with `allowNetwork: false`.
3. Locally cached values are restored; uncached values remain as markers.
4. The merged workspace is committed without downloading missing Storage objects.
5. When an active conversation is rendered, `hydrateConversation` resolves only that conversation's missing markers.
6. Generated-image Blobs are restored to their existing `storageKey`; inline attachment bytes are reconstructed from the persistent Blob cache.
7. The live conversation is updated and rendered again only when at least one marker was resolved.

An offline cache miss remains a marker and produces the existing unavailable-asset fallback. Going online or reopening the conversation retries it.

### Immutable upload behavior

- Object paths remain `<user-id>/<sha256>`.
- Raw uploads send `cache-control: max-age=31536000, immutable`.
- Raw uploads send `x-upsert: false`.
- A duplicate-object response is treated as success because the path is content-addressed.
- Ambiguous upload errors use an owner-scoped metadata listing to verify existence; they never download the object body.
- A persistent marker cache prevents an already-known local value from being uploaded again after reload.

### Compatibility

Existing markers require no migration. Existing generated-image storage keys remain valid. Existing objects uploaded with weaker metadata remain readable; any newly uploaded object receives immutable metadata. No bucket visibility or RLS change is made.

## Milestone 2: Incremental Workspace Synchronization

### Monotonic sequence

A migration creates `public.workspace_sync_seq` if absent and adds a non-null `sync_seq bigint` to:

- `workspace_folders`
- `workspace_conversations`
- `workspace_messages`
- `workspace_astras`
- `workspace_tombstones`

Existing rows are backfilled. A database trigger assigns `nextval('public.workspace_sync_seq')` on every insert and meaningful update. Owner-and-sequence indexes support ordered delta reads.

### Delta RPC

An authenticated, security-definer RPC named `fetch_workspace_delta` accepts an exclusive `p_after_seq` watermark and bounded `p_limit`. It returns an ordered page containing collection name, row data, and sequence, plus `next_seq` and `has_more`.

The function always derives the owner from `auth.uid()`, never accepts a user ID argument, uses an empty search path, clamps the page size, and exposes no rows belonging to another user.

### Persisted remote baseline

The complete last-known remote row baseline is stored in IndexedDB under a versioned per-user key. It is written atomically with the cloud-sync journal whenever possible. The journal's existing `lastRemoteWatermark` becomes the exclusive delta cursor.

Startup behavior is:

1. Read local workspace, remote baseline, and journal.
2. If baseline and watermark are valid, request delta pages after the watermark.
3. Apply inserts and updates to the baseline by collection and ID; apply tombstones before decoding.
4. Persist the new baseline and watermark before acknowledging readiness.
5. Decode and merge the reconstructed remote workspace with local dirty entities.

If the baseline is missing, malformed, belongs to another user, or has an unsupported version, the client performs one complete paginated snapshot fetch, stores it as the new baseline, and resumes deltas afterward.

### Realtime behavior

Realtime becomes invalidation-only. A relevant event schedules one debounced delta pull. It never injects a partial payload into the baseline and never directly triggers a full snapshot. Reconnect and `SUBSCRIBED` statuses request deltas from the persisted watermark, closing notification gaps without transferring unchanged rows.

### Upload verification

Local dirty-entity uploads continue to use the protected upsert RPCs. Verification is narrowed to uploaded IDs. After verification, the corresponding uploaded rows update the persisted baseline and the journal is acknowledged with the latest remote watermark. A failed verification leaves the journal dirty and does not advance the watermark.

## Error Handling and Recovery

- Storage cache corruption removes only the affected cache entry and retries that object on demand.
- A missing Storage object preserves its cloud marker and emits one warning per session.
- Delta RPC migration errors fall back to the current full-snapshot reader without modifying local data.
- Malformed or non-monotonic delta responses invalidate the persisted baseline and require a safe full snapshot on the next attempt.
- Network failures never advance `lastRemoteWatermark` and never clear the local dirty journal.
- Stopping sync invalidates in-flight hydration and delta work through the existing generation guard.
- Tombstones are applied before any remote row can be merged or uploaded.

## Observability

Cloud sync status adds counters for:

- bootstrap persistent-cache hits
- on-demand Storage downloads
- bytes downloaded when available from Blob size
- delta pages and rows received
- full-snapshot fallback count and reason
- current remote watermark

Diagnostics expose counts and timestamps only; they do not expose asset contents, access tokens, or encrypted settings.

## Testing Strategy

### Storage tests

- A generated image already present at `storageKey` causes zero Storage downloads.
- A marker cached in IndexedDB survives a new transport instance and causes zero Storage downloads.
- Bootstrap hydration leaves an uncached marker intact and causes zero Storage downloads.
- Active-conversation hydration downloads only markers in that conversation.
- Concurrent requests for one path share one download promise.
- Duplicate immutable uploads do not call the body-download endpoint.
- Raw upload headers contain `max-age=31536000, immutable` and disable upsert.
- Offline and missing-object paths retain retryable markers.

### Delta-sync tests

- The migration backfills and protects `sync_seq` for every synchronized table.
- The RPC is owner-scoped, ordered, exclusive of the prior watermark, and page-bounded.
- A valid baseline performs no full-table selects at startup.
- Multiple delta pages merge without skipped or duplicated rows.
- Realtime bursts coalesce into one delta refresh.
- Reconnect uses the persisted watermark.
- Invalid baselines fall back exactly once to a complete snapshot.
- Tombstones win over older entity rows.
- A failed upload or verification does not advance the watermark.
- Stopping during a delta fetch prevents commit.

### Regression and acceptance checks

- Existing cloud-sync, deletion, account-linking, import/export, generated-image, service-worker, and security tests pass.
- Production-like browser tracing shows no `user-assets` requests during bootstrap when the active conversation has no uncached assets.
- Reopening an already hydrated conversation produces zero Storage transfer.
- Opening one uncached conversation downloads only its referenced unique assets.
- With a valid baseline and no remote changes, startup returns zero workspace entity rows.

## Rollout and Rollback

1. Deploy Milestone 1 and observe Cached Egress, Storage request count, and startup behavior for one billing-day window.
2. Deploy the sequence/RPC migration before enabling the Milestone 2 client path.
3. The client probes delta capability. Projects without the migration retain the safe full-snapshot path.
4. Observe Database Egress, delta fallback rate, and sync error rate before removing any legacy fallback.
5. Rollback of either client milestone does not require deleting data. The added sequence columns, RPC, indexes, and persistent cache entries are backward-compatible and may remain in place.

## Acceptance Criteria

- No automatic Storage body request occurs during cloud workspace bootstrap.
- A locally cached active conversation can be opened repeatedly with zero Storage transfer.
- A new device downloads assets only for the active conversation.
- The bucket stays private and all owner isolation tests pass.
- Realtime and reconnect paths use deltas when capability is available.
- A valid baseline with no changes performs no full workspace snapshot.
- Existing local data, remote rows, generated images, folders, Astras, and tombstones remain intact.
- Relevant automated tests and the full project test suite pass.

