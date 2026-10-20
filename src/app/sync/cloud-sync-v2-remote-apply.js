// The cloud brought into this device (Sync V2): its state read (the changes since the last watermark, or the whole of it), the cloud's
// workspace made as the page keeps it, put together with the local one and written, and the rows read taken as the baseline of the next
// upload. `ctx` is the sync's own (cloud-sync-v2-controller.js): its state, its options, and setStatus.

import { decodeWorkspaceConversationShadow } from './cloud-sync-v2-codecs.js';
import { applyAstraTombstones, applyWorkspaceTombstones, createAstraTombstoneIndex, createTombstoneIndex } from './cloud-sync-v2-deletions.js';
import { mergeWorkspacePreservingLocalTopLevel } from './cloud-sync-v2-merge.js';
import { cloneShadowRows, normalizeWorkspaceCommitResult } from './cloud-sync-v2-shared.js';

// A workspace without what was deleted forever (conversations and folders by their markers, Nouras by theirs).
export const withoutDeleted = (workspace, tombstoneIndex, astraTombstoneIds) => applyAstraTombstones(
  applyWorkspaceTombstones(workspace, tombstoneIndex),
  astraTombstoneIds
);

export function createRemoteApply(ctx) {
  const { state, options } = ctx;
  const { repository } = options;

  const loadRemoteState = async (assertCurrent = () => {}) => {
    if (typeof options.fetchRemoteState === 'function') {
      const remoteState = await options.fetchRemoteState({ assertCurrent });
      assertCurrent();
      if (!remoteState || !remoteState.rows || !Array.isArray(remoteState.tombstones)) {
        const error = new Error('Cloud remote state reader returned an invalid snapshot.');
        error.code = 'ASTRA_SHADOW_INVALID_REMOTE_STATE';
        throw error;
      }
      if (remoteState.snapshotFallback === true) state.fullSnapshotFallbackCount += 1;
      ctx.setStatus({
        deltaSupported: typeof remoteState.deltaSupported === 'boolean' ? remoteState.deltaSupported : state.status.deltaSupported,
        deltaPages: Number.isInteger(remoteState.pageCount) ? remoteState.pageCount : 0,
        deltaRows: Number.isInteger(remoteState.rowCount) ? remoteState.rowCount : 0,
        baselineReset: remoteState.baselineReset === true,
        fullSnapshotFallbackCount: state.fullSnapshotFallbackCount,
        lastSnapshotFallbackReason: remoteState.snapshotFallback === true
          ? (remoteState.fallbackReason || 'unspecified')
          : state.status.lastSnapshotFallbackReason,
        currentRemoteWatermark: remoteState.watermark ?? null
      });
      return remoteState;
    }
    const tombstones = await repository.fetchTombstones();
    assertCurrent();
    const rows = await repository.fetchWorkspace();
    assertCurrent();
    state.fullSnapshotFallbackCount += 1;
    ctx.setStatus({
      deltaSupported: false,
      deltaPages: 0,
      deltaRows: 0,
      baselineReset: false,
      fullSnapshotFallbackCount: state.fullSnapshotFallbackCount,
      lastSnapshotFallbackReason: 'legacy-reader',
      currentRemoteWatermark: null
    });
    return { tombstones, rows };
  };

  // The rows read are what the cloud holds, so the next upload sends only what differs from them (when the reader is known to give all rows).
  const acceptFetchedUploadBaseline = rows => {
    if (repository?.paginatedSnapshotsAreComplete !== true) {
      ctx.invalidateUploadBaseline();
      return false;
    }
    state.uploadBaseline = cloneShadowRows(rows);
    state.baselineTrusted = true;
    ctx.setStatus({ baselineTrusted: true });
    return true;
  };

  const adopt = (tombstoneIndex, astraTombstoneIds, rows) => {
    state.tombstoneIndex = tombstoneIndex;
    state.astraTombstoneIds = astraTombstoneIds;
    acceptFetchedUploadBaseline(rows);
  };

  const refreshCompleteUploadBaseline = async assertCurrent => {
    if (repository?.paginatedSnapshotsAreComplete !== true) return false;
    const { tombstones, rows } = await loadRemoteState(assertCurrent);
    assertCurrent();
    state.tombstoneIndex = createTombstoneIndex(tombstones);
    state.astraTombstoneIds = createAstraTombstoneIndex(rows.astras);
    return acceptFetchedUploadBaseline(rows);
  };

  // The cloud's workspace as the page keeps it: decoded, its files brought here, without what was deleted forever.
  const readRemoteWorkspace = async (rows, tombstoneIndex, astraTombstoneIds, assertCurrent) => {
    const hydrated = await options.hydrateRemoteWorkspace(decodeWorkspaceConversationShadow(rows), { allowNetwork: true });
    assertCurrent();
    return withoutDeleted(hydrated, tombstoneIndex, astraTombstoneIds);
  };

  const announce = (workspace, tombstoneIndex, astraTombstoneIds, failureMessage) => {
    try {
      options.onWorkspaceCommitted({
        workspace,
        tombstones: {
          conversationIds: [...tombstoneIndex.conversations],
          folderIds: [...tombstoneIndex.folders],
          astraIds: [...astraTombstoneIds]
        }
      });
    } catch (error) {
      options.logger.warn(failureMessage, error);
    }
  };

  /**
   * Puts the cloud's state (`tombstones`, `rows`) together with the local workspace and writes it, then takes the rows as the next upload's
   * baseline and tells the live page. `localWorkspace` (already normalized) is used when there is no `commitWorkspace`; without it, it is read.
   * `announceUnchanged`: the page is told even when the commit changed nothing (the first time). Resolves the committed workspace.
   */
  async function commitRemoteState({ tombstones, rows, assertCurrent, localWorkspace = null, announceUnchanged = false, failureMessage }) {
    const tombstoneIndex = createTombstoneIndex(tombstones);
    assertCurrent();
    const astraTombstoneIds = createAstraTombstoneIndex(rows.astras);
    const remoteWorkspace = await readRemoteWorkspace(rows, tombstoneIndex, astraTombstoneIds, assertCurrent);
    let committedWorkspace;
    let changed = true;
    if (options.commitWorkspace) {
      const commitResult = await options.commitWorkspace({ remoteWorkspace, tombstoneIndex, astraTombstoneIds, assertCurrent });
      ({ workspace: committedWorkspace, changed } = normalizeWorkspaceCommitResult(commitResult));
    } else {
      const local = localWorkspace || await options.normalizeWorkspace(await options.readWorkspace() || {});
      assertCurrent();
      committedWorkspace = withoutDeleted(
        mergeWorkspacePreservingLocalTopLevel(withoutDeleted(local, tombstoneIndex, astraTombstoneIds), remoteWorkspace),
        tombstoneIndex,
        astraTombstoneIds
      );
      await options.writeWorkspace(committedWorkspace);
    }
    assertCurrent();
    adopt(tombstoneIndex, astraTombstoneIds, rows);
    if (changed || announceUnchanged) announce(committedWorkspace, tombstoneIndex, astraTombstoneIds, failureMessage);
    return committedWorkspace;
  }

  // The cloud read again now and written into the local workspace.
  async function refreshWorkspaceNow(assertCurrent = () => {}) {
    const { tombstones, rows } = await loadRemoteState(assertCurrent);
    return commitRemoteState({
      tombstones,
      rows,
      assertCurrent,
      failureMessage: 'Noureon could not hand the refreshed cloud workspace to the live runtime.'
    });
  }

  // The cloud put together with `localWorkspace` and given back (nothing is written).
  async function pullWorkspace(localWorkspace = {}) {
    const assertCurrent = ctx.guard();
    try {
      let tombstones;
      let rows;
      if (typeof options.fetchRemoteState === 'function') {
        ({ tombstones, rows } = await loadRemoteState(assertCurrent));
      } else {
        tombstones = await repository.fetchTombstones();
        assertCurrent();
      }
      const tombstoneIndex = createTombstoneIndex(tombstones);
      const conversationSanitizedLocal = applyWorkspaceTombstones(localWorkspace, tombstoneIndex);
      if (typeof options.fetchRemoteState !== 'function') {
        rows = await repository.fetchWorkspace();
      }
      assertCurrent();
      const astraTombstoneIds = createAstraTombstoneIndex(rows.astras);
      const sanitizedLocal = applyAstraTombstones(conversationSanitizedLocal, astraTombstoneIds);
      const remoteWorkspace = await readRemoteWorkspace(rows, tombstoneIndex, astraTombstoneIds, assertCurrent);
      const merged = mergeWorkspacePreservingLocalTopLevel(sanitizedLocal, remoteWorkspace);
      assertCurrent();
      adopt(tombstoneIndex, astraTombstoneIds, rows);
      return withoutDeleted(merged, state.tombstoneIndex, state.astraTombstoneIds);
    } catch (error) {
      ctx.invalidateUploadBaseline();
      throw error;
    }
  }

  return {
    loadRemoteState,
    acceptFetchedUploadBaseline,
    refreshCompleteUploadBaseline,
    commitRemoteState,
    refreshWorkspaceNow,
    pullWorkspace
  };
}
