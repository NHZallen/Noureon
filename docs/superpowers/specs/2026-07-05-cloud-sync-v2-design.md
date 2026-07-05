# AstraChat Cloud Sync V2 Design

## Objective

Replace the current whole-workspace JSON synchronization path with an entity-level, offline-first synchronization engine that cannot erase unrelated changes from another device. The first release also prevents blank chat state, stops legacy snapshot writes, preserves a recoverable local backup, and moves attachment loading off the startup path.

## Scope

This specification covers:

- a safety release that disables destructive legacy workspace writes;
- deterministic active-conversation recovery;
- normalized Supabase workspace tables and RLS;
- an IndexedDB outbox for entity-level synchronization;
- incremental Realtime application;
- throttled AI response synchronization;
- lazy Supabase Storage asset resolution;
- one-time migration from `user_workspaces.app_data` and legacy IndexedDB data;
- two-device integration and recovery tests.

This specification does not redesign authentication, the encrypted API-key vault, or Email recovery. Those remain operational during the workspace migration and receive a separate security specification after Sync V2 is stable.

## Evidence Behind the Redesign

The current schema stores conversations, messages, folders, Astras, and memories in one `user_workspaces.app_data` JSON value. Every local save eventually fetches, hydrates, merges, and rewrites that entire value.

A deterministic two-client simulation demonstrates the loss mode:

1. Device A and device B read the same base snapshot.
2. A appends an assistant reply.
3. B only expands a folder.
4. Both independently merge against the same base.
5. If B writes last, the remote snapshot contains the folder state but loses A's assistant reply.

The runtime also initializes `activeConversationId` to `null`. Loading existing conversations and applying cloud data do not select a valid conversation. `renderChat()` treats this state as no conversation, clears the messages and model selector, and leaves the static API-key placeholder visible.

Attachment markers are hydrated eagerly. A missing Storage object becomes `null`, and the unavailable-path cache only lasts for the current page lifetime. Every reload therefore requests the same missing objects again.

## Considered Approaches

### A. Continue whole-snapshot synchronization with more merge rules

This is rejected. Client-side three-way merging cannot prevent two clients that fetched the same base from concurrently overwriting each other. It also retains full-tree serialization, eager attachment hydration, and full UI replacement.

### B. Build a complete event-sourced workspace

An immutable event log provides strong auditability and conflict reconstruction. It is not selected for the first stable release because it would require rewriting most runtime reads and projections at once.

### C. Normalized entities with a local outbox

This is selected. Messages are append/update entities, conversation metadata is independent from message content, and folder membership has one source of truth. The existing runtime can transition through an adapter while cloud operations become small, idempotent, and independently testable.

## Release Strategy

### Release 1: Safety mode

- Stop `cloud-workspace-sync.js` from uploading or applying `app_data` snapshots.
- Keep authentication, config, vault, and sensitive-config behavior unchanged.
- Copy the current local app data to `chatRecoveryBackup_v1_<username>` before changing synchronization state.
- Keep the legacy Supabase row untouched as a server-side recovery source.
- Select the newest visible conversation after startup when no valid active conversation exists.
- If an active conversation is removed by a remote tombstone, select the next visible conversation or create a new temporary chat.
- Do not sync `folder.isOpen`; keep it as device-local UI state.

This release is deployable before the new database migration and must not require users to run SQL manually.

### Release 2: Schema and shadow migration

- Create normalized tables, policies, indexes, and Realtime publication entries.
- Import legacy data idempotently while Sync V2 remains in shadow mode.
- Compare local entity counts and hashes against the imported server entities.
- Do not delete or modify `user_workspaces.app_data`.

### Release 3: Sync V2 cutover

- Enable entity-level upload, pull, and Realtime application.
- Retain the legacy snapshot and recovery backup for at least one schema version.
- Remove the legacy app-data synchronization code only after two-device tests pass in production-like fixtures.

## Supabase Schema

All tables use UUID primary keys, `user_id uuid not null references auth.users(id) on delete cascade`, server-controlled timestamps, and RLS restricted to `auth.uid() = user_id`.

### `sync_profiles`

- `user_id uuid primary key`
- `schema_version integer not null default 2`
- `migration_state text not null check (migration_state in ('pending', 'shadow', 'ready', 'active'))`
- `legacy_backup_created_at timestamptz`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### `workspace_folders`

- `id uuid primary key`
- `user_id uuid not null`
- `name text not null`
- `color text not null default 'gray'`
- `icon text not null default 'default'`
- `text_color text not null default 'gray'`
- `updated_at timestamptz not null default now()`
- `deleted_at timestamptz`

Folder expansion state is intentionally absent.

### `workspace_conversations`

- `id uuid primary key`
- `user_id uuid not null`
- `folder_id uuid references workspace_folders(id) on delete set null`
- `title text not null`
- `summary text not null default ''`
- `model text not null`
- `provider text not null`
- `metadata jsonb not null default '{}'::jsonb`
- `archived boolean not null default false`
- `pinned boolean not null default false`
- `created_at timestamptz not null`
- `updated_at timestamptz not null default now()`
- `deleted_at timestamptz`

`folder_id` is the only persisted source of folder membership. `folder.conversationIds` is derived for the legacy runtime adapter.

### `workspace_messages`

- `id uuid primary key`
- `user_id uuid not null`
- `conversation_id uuid not null references workspace_conversations(id) on delete cascade`
- `role text not null check (role in ('user', 'model', 'system'))`
- `parts jsonb not null default '[]'::jsonb`
- `status text not null check (status in ('streaming', 'complete', 'error'))`
- `sequence bigint not null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null default now()`
- `deleted_at timestamptz`
- unique `(conversation_id, sequence)`

Every new message receives an ID before it enters runtime state. Assistant streaming updates reuse one message ID and are throttled to at most one cloud write per 750 milliseconds, with an immediate final `complete` update.

### `workspace_astras`

- `id uuid primary key`
- `user_id uuid not null`
- `name text not null`
- `description text not null default ''`
- `instructions text not null`
- `metadata jsonb not null default '{}'::jsonb`
- `updated_at timestamptz not null default now()`
- `deleted_at timestamptz`

### `workspace_memories`

- `id uuid primary key`
- `user_id uuid not null`
- `content text not null`
- `enabled boolean not null default true`
- `updated_at timestamptz not null default now()`
- `deleted_at timestamptz`

### `workspace_assets`

- `id uuid primary key`
- `user_id uuid not null`
- `object_path text not null`
- `sha256 text not null`
- `mime_type text not null`
- `byte_size bigint not null`
- `status text not null check (status in ('uploading', 'ready', 'missing'))`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- unique `(user_id, sha256)`

Message parts reference `assetId`; they never contain a hydrated Blob or a destructive `null` replacement.

## Client Architecture

### `cloud-sync-v2-db.js`

Use a separate IndexedDB database named `AstraCloudSyncV2` so legacy `ChatAppDB` remains recoverable. Stores:

- `entities`, keyed by `[kind, id]`;
- `outbox`, keyed by operation ID and indexed by creation time;
- `meta`, keyed by name;
- `assetCache`, keyed by asset ID.

### `cloud-sync-v2-codecs.js`

Convert between legacy runtime records and normalized server rows. It assigns stable message IDs and sequences during migration, strips device-only fields, and derives `folder.conversationIds` on the way back into runtime.

### `cloud-sync-v2-outbox.js`

Record idempotent `upsert` or `delete` operations. Each operation contains:

- operation ID;
- entity kind and ID;
- payload;
- local creation time;
- attempt count.

Successful operations are removed only after Supabase confirms the write. Network failures retain the operation and retry with bounded backoff.

### `cloud-sync-v2-engine.js`

Coordinate initial pull, outbox flush, and Realtime events. It never replaces the whole runtime workspace. Remote events update one entity and are ignored when an unsent local operation for the same entity is newer.

### `cloud-sync-v2-runtime-bridge.js`

Apply entity changes to the existing runtime stores. It batches UI updates into one animation frame and reconciles the active conversation after every conversation deletion or initial load.

### `cloud-asset-resolver.js`

Resolve an asset only when its message becomes visible or a preview is opened. Cache successful Blobs in IndexedDB. Cache a missing status with retry metadata. A missing asset renders a stable unavailable placeholder and never mutates the message part.

## Local Mutation Flow

1. The runtime mutates local state.
2. Legacy IndexedDB persistence completes first.
3. A codec produces only the changed entity operation.
4. The operation is committed to the outbox.
5. The engine flushes the outbox when online.
6. Supabase confirms the row-level write.
7. The outbox operation is removed.

The UI never waits for the cloud request.

## Remote Mutation Flow

1. Realtime delivers one row event.
2. The engine validates ownership and entity shape.
3. A newer pending local operation for the same entity protects the local value.
4. Otherwise the entity cache is updated.
5. The runtime bridge patches the corresponding record.
6. The active-conversation reconciler guarantees a valid visible conversation.
7. Only affected UI surfaces render.

## Migration Rules

- Create the local recovery backup before importing.
- Read both legacy local app data and legacy remote app data.
- Union entities by ID rather than replacing arrays.
- For the same conversation, retain the richer message history.
- Generate deterministic message IDs from conversation ID, sequence, role, creation time, and content hash when an ID is absent.
- Treat `conversation.folderId` as authoritative and discard legacy `folder.conversationIds` conflicts.
- Exclude `folder.isOpen` from cloud import.
- Preserve permanent deletions only when an explicit tombstone exists; absence in one legacy snapshot is not sufficient proof of deletion.
- Mark the migration `ready` only after server counts and canonical hashes match the local imported entities.
- Migration is idempotent and can resume after interruption.

## Failure Handling

- No empty remote response may erase non-empty local entities.
- No missing Storage object may change persisted message content.
- Realtime disconnects fall back to a periodic delta pull.
- Outbox failures expose a non-blocking sync status instead of clearing local data.
- Migration failures leave legacy sync disabled and preserve both backups.
- Conflicting updates to different entities both survive.
- Conflicting metadata edits to the same conversation use server order; message rows are independent and therefore cannot be lost by metadata edits.

## Test Strategy

### Unit tests

- codecs preserve all supported conversation fields;
- folder membership has one source of truth;
- message IDs are deterministic during migration;
- active-conversation reconciliation always returns a visible conversation or requests a new chat;
- missing assets remain references with unavailable status;
- outbox retries are idempotent.

### Two-client integration tests

Use a deterministic in-memory Supabase adapter and two real Sync V2 engine instances:

- A completes an AI response while B expands a folder locally; the response survives;
- A moves a conversation while B receives a message; both changes survive;
- A deletes a conversation while B is displaying it; B selects a valid fallback;
- A and B stream messages in opposite directions;
- Realtime disconnect and reconnect performs a delta pull;
- one client reloads with a missing asset; no repeated request occurs before retry time;
- migration interruption resumes without duplicate rows.

### Browser verification

- reload with existing conversations never shows an empty chat shell;
- model selector and greeting match the selected conversation;
- no false API-key placeholder appears when keys are present;
- folder expansion does not produce a network write;
- only visible attachments are downloaded;
- mobile and desktop converge without manual refresh.

## Cutover Acceptance Criteria

- All two-client integration tests pass repeatedly with randomized event ordering.
- No test uses whole `app_data` replacement as the expected behavior.
- Existing users retain local and remote legacy backups.
- A conversation metadata change cannot remove a message.
- Realtime updates appear on the second device without refresh.
- Startup performs no historical asset downloads.
- A missing asset produces one controlled failure and a stable placeholder.
- The privacy and help text accurately describe Supabase storage before Sync V2 becomes the default.

## Follow-on Security Project

After Sync V2 cutover, replace recovery storage of the encrypted sync password with envelope encryption:

- generate a random vault data-encryption key;
- wrap it with the user sync password-derived key;
- optionally wrap it with a server recovery key after verified Email reauthentication;
- never store or recover the user's original sync password;
- update privacy disclosures to state exactly what Supabase stores and what the server recovery key can decrypt.
