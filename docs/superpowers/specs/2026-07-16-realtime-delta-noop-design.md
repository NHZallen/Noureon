# Realtime Delta No-op Design

**Date:** 2026-07-16

**Status:** Approved for implementation

## Problem

Saving a conversation updates `workspace_conversations`. Supabase Realtime sends that update back to the same browser, which schedules `fetch_workspace_delta`. Events received while a refresh is running set a trailing boolean, so the client performs another refresh even when the first delta already advanced past every received event. A remote refresh also writes and emits `astra:cloud-workspace-committed` when the reconstructed workspace is identical to the current local workspace. The live lifecycle can consequently replace and render the active chat after generation settles.

## Considered Approaches

1. **Ignore all Realtime events for a fixed cooldown.** This is small but can delay or lose a legitimate update from another device.
2. **Tag writes with a client identifier.** This distinguishes self-writes but requires schema and RPC changes and still needs coalescing for other-device bursts.
3. **Coalesce by `sync_seq` watermark and suppress semantic no-op commits.** This uses the sequence already present in Realtime payloads, catches notification gaps with a forced refresh on subscription, and does not require another database migration.

Approach 3 is selected.

## Design

Create a focused Realtime refresh scheduler. It retains the greatest pending `sync_seq`, compares it with `conversationShadowSync.getStatus().currentRemoteWatermark`, and schedules a retry only when the pending sequence is newer. A forced request without a sequence remains available for `SUBSCRIBED` and reconnect gap checks. After a retry, any pending sequence at or below the new watermark is satisfied, including events that arrived while the request was in flight.

The storage-backed workspace commit compares the latest stored workspace with the merged workspace while holding the existing exclusive lock. It skips the app-data write when they are equal and reports `changed: false`. Refresh continues advancing the persistent remote baseline and watermark, but it dispatches `astra:cloud-workspace-committed` only for a changed workspace. Initialization retains its existing runtime handoff semantics.

When a trusted persistent baseline receives an empty delta whose watermark is unchanged, the remote reader returns the existing snapshot without rewriting the baseline and journal.

## Safety and Recovery

- Realtime payloads without a valid sequence force one refresh, preserving compatibility.
- Reconnect and `SUBSCRIBED` force one refresh to close notification gaps.
- Failed refreshes remain retryable; pending sequences are not declared satisfied without an advanced watermark.
- Tombstones, dirty-journal merging, ID repair, and snapshot fallback behavior remain unchanged.
- No SQL migration or Supabase policy change is required.

## Acceptance Tests

- A Realtime event covered by an in-flight delta does not schedule a trailing retry.
- A stale or duplicate sequence at or below the current watermark is ignored.
- A sequence newer than the watermark schedules exactly one retry.
- A semantically unchanged refresh performs no live workspace handoff.
- A changed refresh still commits and hands off exactly once.
- A trusted empty delta does not rewrite the persistent baseline or journal.

