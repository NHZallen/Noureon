// An upload of the local workspace (Sync V2): the workspace as it is now (with its journal), encoded into cloud rows, its message ids
// matched to the cloud's, only what differs from the baseline sent (all of it when there is no trusted baseline), read back to check, and
// the journal told what was sent. `ctx` is the sync's own (cloud-sync-v2-controller.js); `remote` is cloud-sync-v2-remote-apply.js.

import { encodeWorkspaceConversationShadow } from './cloud-sync-v2-codecs.js';
import { filterEncodedWorkspaceByTombstones } from './cloud-sync-v2-deletions.js';
import { countShadowUploadRows, createShadowUploadDelta, markCutMessagesDeleted, mergeShadowUploadIntoBaseline } from './cloud-sync-v2-delta.js';
import { preserveDeferredConversationFolderRows, reconcileEncodedMessageIds } from './cloud-sync-v2-merge.js';
import { emptyShadowRows, normalizeVerifiedShadowBaseline } from './cloud-sync-v2-shared.js';

// What an upload counts, for the status (the same while it runs and when it is done).
const uploadCounts = (encoded, uploadRows) => ({
  conversations: encoded.conversations.length,
  messages: encoded.messages.length,
  folders: encoded.folders.length,
  astras: encoded.astras.length,
  fullConversations: encoded.conversations.length,
  fullMessages: encoded.messages.length,
  fullFolders: encoded.folders.length,
  fullAstras: encoded.astras.length,
  uploadedConversations: uploadRows.conversations.length,
  uploadedMessages: uploadRows.messages.length,
  uploadedFolders: uploadRows.folders.length,
  uploadedAstras: uploadRows.astras.length,
  uploadedRows: countShadowUploadRows(uploadRows)
});

export function createCapture(ctx, remote) {
  const { state, options } = ctx;
  const { repository } = options;

  // The workspace to upload with its journal and revision (the storage's own reader when there is one).
  async function resolveCaptureState(workspace, metadata, assertCurrent) {
    if (typeof options.readCaptureState !== 'function') {
      return { workspace, revision: metadata?.revision || null, journal: null };
    }
    const resolved = await options.readCaptureState({ workspace, metadata, assertCurrent });
    assertCurrent();
    return {
      ...resolved,
      workspace: resolved?.workspace ?? workspace,
      revision: resolved?.revision ?? resolved?.journal?.workspaceRevision ?? null
    };
  }

  // The workspace as cloud rows, its message ids matched to the baseline's, with what waits (a folder change) and what was cut kept as the
  // cloud has it. Resolves { encoded, hadTrustedBaseline }. Throws when the message ids cannot be matched safely (the baseline is then
  // dropped, and the next upload sends everything).
  async function encodeForUpload(uploadWorkspace, assertCurrent) {
    const initiallyEncoded = filterEncodedWorkspaceByTombstones(
      await encodeWorkspaceConversationShadow({ workspace: uploadWorkspace, userId: options.userId, cryptoProvider: options.cryptoProvider }),
      state.tombstoneIndex,
      state.astraTombstoneIds
    );
    assertCurrent();
    if (initiallyEncoded.skippedConversationIds.length) {
      options.logger.warn('Noureon Sync V2 shadow skipped conversations with invalid IDs.', {
        count: initiallyEncoded.skippedConversationIds.length,
        ids: initiallyEncoded.skippedConversationIds.slice(0, 10)
      });
    }
    const hadTrustedBaseline = Boolean(state.baselineTrusted && state.uploadBaseline);
    const reconciliation = hadTrustedBaseline
      ? reconcileEncodedMessageIds(initiallyEncoded, state.uploadBaseline)
      : { encoded: initiallyEncoded, safe: true, reason: null };
    if (!reconciliation.safe) {
      ctx.invalidateUploadBaseline();
      const error = new Error('Cloud message IDs could not be reconciled safely.');
      error.code = 'ASTRA_MESSAGE_ID_RECONCILIATION_AMBIGUOUS';
      error.details = { reason: reconciliation.reason };
      throw error;
    }
    const baseline = hadTrustedBaseline ? state.uploadBaseline : emptyShadowRows();
    const encoded = markCutMessagesDeleted(preserveDeferredConversationFolderRows(
      reconciliation.encoded,
      baseline,
      state.deferredConversationFolderIds
    ), baseline);
    return { encoded, hadTrustedBaseline };
  }

  // The rows sent and read back. The baseline becomes what the cloud now holds (when it was trusted before), else it is dropped.
  async function sendRows(uploadRows, { writeMigrationState, hadTrustedBaseline, baselineBeforeUpload, assertCurrent }) {
    try {
      if (writeMigrationState) {
        await repository.setMigrationState('shadow', state.backupMarker);
        assertCurrent();
      }
      if (uploadRows.folders.length) {
        await repository.upsertFolders(uploadRows.folders);
        assertCurrent();
      }
      if (uploadRows.conversations.length) {
        await repository.upsertConversations(uploadRows.conversations);
        assertCurrent();
      }
      if (uploadRows.messages.length) {
        await repository.upsertMessages(uploadRows.messages, { idsReconciled: Boolean(hadTrustedBaseline) });
        assertCurrent();
      }
      if (uploadRows.astras.length) {
        await repository.upsertAstras(uploadRows.astras);
        assertCurrent();
      }
      const verification = await repository.verify(uploadRows);
      assertCurrent();
      const verified = typeof verification === 'boolean' ? verification : verification?.verified === true;
      if (!verified) {
        const error = new Error('Sync V2 shadow verification did not match the local workspace.');
        error.code = 'ASTRA_SHADOW_VERIFY_MISMATCH';
        if (verification?.mismatch) error.details = verification.mismatch;
        throw error;
      }
      if (writeMigrationState) {
        await repository.setMigrationState('ready');
        assertCurrent();
        state.migrationPending = false;
        state.backupMarker = null;
      }
      if (hadTrustedBaseline) {
        state.uploadBaseline = normalizeVerifiedShadowBaseline(mergeShadowUploadIntoBaseline(baselineBeforeUpload, uploadRows));
        state.baselineTrusted = true;
      } else {
        ctx.invalidateUploadBaseline();
      }
    } catch (error) {
      ctx.invalidateUploadBaseline();
      throw error;
    }
  }

  /**
   * Uploads `workspace` now. `allowDisabled`: while the sync starts (it is not enabled yet). `resolvedCapture`: the capture state already
   * read. Resolves the status; throws when the upload failed (the caller puts the sync in 'retry').
   */
  async function captureNow(workspace, allowDisabled = false, assertCurrent = () => {}, resolvedCapture = null, metadata = null) {
    if ((!state.enabled && !allowDisabled) || !workspace || !options.online()) {
      return ctx.setStatus({ state: options.online() ? 'idle' : 'offline' });
    }
    assertCurrent();
    const capture = resolvedCapture || await resolveCaptureState(workspace, metadata, assertCurrent);
    const latestWorkspace = capture.workspace;
    const attemptedRevision = capture.revision;
    assertCurrent();
    ctx.setStatus({ state: 'uploading' });
    assertCurrent();
    const normalizedWorkspace = await options.normalizeWorkspace(latestWorkspace);
    assertCurrent();
    const uploadWorkspace = await options.prepareWorkspaceForUpload(normalizedWorkspace);
    assertCurrent();
    const baselineMissingAtStart = !(state.baselineTrusted && state.uploadBaseline);
    if (baselineMissingAtStart) {
      try {
        await remote.refreshCompleteUploadBaseline(assertCurrent);
      } catch (error) {
        ctx.invalidateUploadBaseline();
        throw error;
      }
      assertCurrent();
    }
    const { encoded, hadTrustedBaseline } = await encodeForUpload(uploadWorkspace, assertCurrent);
    const baselineBeforeUpload = hadTrustedBaseline ? state.uploadBaseline : emptyShadowRows();
    const deferredFolderSyncCount = state.deferredConversationFolderIds.size;
    const fullResyncRequired = capture.journal?.fullResyncRequired === true;
    const forceFullUpload = fullResyncRequired || baselineMissingAtStart || !hadTrustedBaseline;
    const uploadRows = createShadowUploadDelta(encoded, baselineBeforeUpload, { forceFull: forceFullUpload });
    const writeMigrationState = state.migrationPending || forceFullUpload;
    ctx.setStatus({
      state: 'uploading',
      enabled: state.enabled,
      pending: false,
      ...uploadCounts(encoded, uploadRows),
      fullUpload: forceFullUpload,
      fullUploadReason: fullResyncRequired
        ? 'journal-full-resync'
        : baselineMissingAtStart || !hadTrustedBaseline ? 'missing-trusted-baseline' : null,
      baselineTrusted: Boolean(hadTrustedBaseline),
      deferredFolderSyncCount,
      skipped: encoded.skippedConversationIds.length,
      skippedConversationIds: encoded.skippedConversationIds.slice(0, 10),
      lastUploadStartedAt: options.now(),
      error: undefined,
      code: undefined,
      status: undefined,
      details: undefined,
      hint: undefined
    });
    assertCurrent();
    await sendRows(uploadRows, { writeMigrationState, hadTrustedBaseline, baselineBeforeUpload, assertCurrent });
    // The journal is told what was sent (not while a folder change waits: that one is not in the cloud yet). A journal changed meanwhile
    // keeps its dirty mark, and the workspace is queued again.
    let acknowledgement = null;
    if (typeof options.acknowledgeCapture === 'function' && attemptedRevision && deferredFolderSyncCount === 0) {
      acknowledgement = await options.acknowledgeCapture({ attemptedRevision, capture, assertCurrent });
      assertCurrent();
      if (acknowledgement?.acknowledged === false && !state.pendingWorkspace) {
        state.pendingWorkspace = { workspace: latestWorkspace, metadata: null, generation: state.generation };
        if (state.enabled && state.timer == null) ctx.scheduleDrain();
      }
    }
    const readyStatus = ctx.setStatus({
      state: 'ready',
      enabled: state.enabled,
      pending: Boolean(state.pendingWorkspace),
      ...uploadCounts(encoded, uploadRows),
      fullUpload: forceFullUpload,
      baselineTrusted: state.baselineTrusted,
      deferredFolderSyncCount,
      skipped: encoded.skippedConversationIds.length,
      journalAcknowledged: acknowledgement?.acknowledged,
      lastCompletedAt: options.now()
    });
    assertCurrent();
    return readyStatus;
  }

  return { resolveCaptureState, captureNow };
}
