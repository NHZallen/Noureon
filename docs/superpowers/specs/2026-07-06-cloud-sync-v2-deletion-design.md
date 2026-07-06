# Cloud Sync V2 Deletion Design

## Goal

Make deletion consistent across signed-in devices without returning to destructive whole-workspace synchronization. Refresh remains the synchronization boundary; realtime updates are out of scope.

## User-visible semantics

### Move a conversation to trash

- Keep the conversation, messages, and assets in Supabase.
- Synchronize the conversation's `deleted_at` value.
- Hide it from normal history and show it in trash on every device after refresh.
- Restoring the conversation clears `deleted_at` and makes it visible again.

### Permanently delete a conversation

- Permanently remove the conversation's messages and conversation row.
- Leave Supabase Storage objects unchanged in this phase. Safe physical asset cleanup requires a normalized reference table and is deferred to the asset-sync phase.
- Retain only a content-free tombstone containing the user ID, entity type, entity ID, and deletion time.
- The operation cannot be restored from the application after completion.

### Delete a folder

- Permanently remove the folder row and retain a content-free folder tombstone.
- Keep its conversations and set their `folder_id` to `null`.
- A stale device must not recreate the deleted folder or move conversations back into it.

Moving a conversation out of a folder is an update, not a deletion, and must not create a tombstone.

## Architecture

Add a normalized `workspace_tombstones` table with these fields:

- `user_id uuid not null`
- `entity_type text not null`, initially `conversation` or `folder`
- `entity_id uuid not null`
- `deleted_at timestamptz not null`
- Primary key: `(user_id, entity_type, entity_id)`

Row-level security permits an authenticated user to read only their own tombstones. Tombstones are created by the validated deletion functions and cannot be updated or deleted directly by browser clients. The table is designed to support later entity types such as `astra`, `message`, and `asset` without another deletion architecture.

Permanent deletion and normalized writes are exposed through security-definer database functions rather than direct browser mutations. Each function validates `auth.uid()` and takes the same per-entity transaction lock. Deletion writes the tombstone before removing normalized database rows; stale writes wait for the lock and then reject the tombstoned ID. Browser roles have no direct insert, update, or delete grants on folders, conversations, or messages.

## Synchronization order

On refresh, Sync V2 must:

1. Fetch tombstones before uploading local workspace data.
2. Remove tombstoned folders and conversations from the local synchronization candidate.
3. Fetch and decode active normalized rows.
4. Merge active remote rows with the sanitized local workspace.
5. Persist the merged workspace locally.
6. Upload only non-tombstoned local rows.

Tombstones always win over stale local rows regardless of message count, timestamps, or the existing conversation preference score.

During ordinary saves, the client keeps the most recently fetched tombstone set and filters uploads against it. A device that has been offline must complete a refresh synchronization before its queued workspace can upload.

## Permanent deletion flow

1. Keep the existing confirmation dialog.
2. Call the permanent-delete database function.
3. Remove the deleted entity from local application data only after the database function succeeds.
4. Refresh the affected UI and persist local data.

If the database operation fails, the local conversation remains in trash and the user receives an error.

## Conflict rules

- Tombstone versus active row: tombstone wins.
- Trashed conversation versus active conversation: the newest normalized conversation update wins, allowing an intentional restore.
- Deleted folder versus stale folder: tombstone wins.
- Deleted folder versus conversation membership: the conversation survives with `folder_id = null`.
- Folder removal versus stale membership: the normalized conversation's current `folder_id` is authoritative; `folder.conversationIds` is derived after merge.
- Existing tombstones are immutable from browser clients.

## Compatibility and rollout

- Existing trash entries continue using `workspace_conversations.deleted_at` and remain restorable.
- Existing normalized conversations and messages require no destructive migration.
- The new migration adds the tombstone table, protected normalized-write functions, deletion functions, policies, and indexes.
- If the migration is missing or permission checks fail, Sync V2 stays in local-safe retry mode and must not modify local data.
- No realtime subscriptions are added.

## Testing

Unit tests must cover:

- Tombstones remove stale local conversations and folders before merge and upload.
- Moving to trash and restoring round-trip through `deleted_at`.
- Permanent deletion removes content but retains only the expected tombstone fields.
- Deleting a folder preserves conversations and clears membership.
- Moving a conversation out of a folder does not create a tombstone.
- A stale offline workspace cannot resurrect a permanently deleted entity.
- Database failure leaves the local trash item intact.
- Concurrent stale writes wait for deletion and cannot recreate tombstoned entities.

Integration verification must cover two devices using refresh-based synchronization for trash, restore, permanent conversation deletion, folder deletion, and an offline stale-device reconnect.

## Out of scope

- Realtime synchronization.
- Automatic tombstone expiry or compaction.
- Astras, personal memories, API keys, and physical Storage asset cleanup. Storage cleanup will be designed with normalized asset references so shared content cannot be deleted accidentally.
- Restoring permanently deleted content.
