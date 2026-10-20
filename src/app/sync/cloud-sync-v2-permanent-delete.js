// Deleting forever in the cloud (Sync V2): conversations, a folder, Nouras. Each waits for the upload under way, deletes, then reads the
// cloud again to check that the deletion markers are there (and, for conversations, that no copy under another id is left), and keeps the
// baseline of the next upload in step. `ctx` is the sync's own (cloud-sync-v2-controller.js); `remote` is cloud-sync-v2-remote-apply.js.

import { decodeWorkspaceConversationShadow, deterministicUuid, encodeWorkspaceConversationShadow, isUuid } from './cloud-sync-v2-codecs.js';
import { createAstraTombstoneIndex, createTombstoneIndex } from './cloud-sync-v2-deletions.js';
import { conversationDeleteFingerprint, conversationDeleteMatchKeys, uniqueConversationsById } from './cloud-sync-v2-delete-match.js';
import { ShadowSyncStoppedError, cloneShadowRows, describeShadowError } from './cloud-sync-v2-shared.js';

export function createPermanentDeletes(ctx, remote) {
  const { state, options } = ctx;
  const { repository, userId, cryptoProvider, now, logger } = options;

  // The cloud id of a local id (an old local id is turned into the cloud's the same way the upload does).
  const cloudIdOf = async (kind, id) => (isUuid(id) ? id : deterministicUuid(`astra-sync-v2:${userId}:${kind}:${id}`, cryptoProvider));

  // A delete waits for the upload under way and drops the one queued (the workspace is uploaded again after the delete). Resolves the
  // check that the sync was not stopped meanwhile.
  async function pauseUploads() {
    const assertCurrent = ctx.guard();
    if (state.timer != null) options.cancel(state.timer);
    state.timer = null;
    state.pendingWorkspace = null;
    ctx.setStatus({ pending: false });
    await state.work.catch(() => {});
    assertCurrent();
    return assertCurrent;
  }

  // A delete that failed: the baseline is dropped (the next upload sends everything), and the sync waits to try again.
  function failed(error, fields) {
    ctx.setStatus({
      state: 'retry',
      enabled: state.enabled,
      pending: false,
      ...fields,
      lastErrorAt: now(),
      ...describeShadowError(error)
    });
    return error;
  }

  const done = fields => ctx.setStatus({ state: 'ready', enabled: state.enabled, pending: false, ...fields, lastCompletedAt: now() });

  /**
   * Deletes conversations forever. `options.conversations`: their local copies, when they are no longer in the workspace; with
   * `options.requireSnapshots`, every conversation must have one (they are how a copy under another cloud id is found).
   */
  async function permanentlyDeleteConversations(conversationIds, deleteOptions = {}) {
    const ids = [...new Set((conversationIds || []).filter(Boolean))];
    const validIds = new Set();
    for (const id of ids) validIds.add(await cloudIdOf('conversation', String(id)));
    if (!ids.length) return state.status;
    if (!state.enabled) throw new Error('Cloud conversation sync is not ready yet.');
    const assertCurrent = await pauseUploads();
    const deleteFailed = error => failed(error, {
      lastPermanentDeleteAt: now(),
      lastPermanentDeleteCount: validIds.size,
      lastPermanentDeleteError: describeShadowError(error)
    });

    let localSnapshots = [];
    try {
      const localWorkspace = await options.readWorkspace();
      assertCurrent();
      localSnapshots = (localWorkspace?.conversations || []).filter(conversation => {
        if (!conversation?.id) return false;
        const id = String(conversation.id);
        return ids.includes(id) || validIds.has(id);
      });
    } catch (error) {
      if (error instanceof ShadowSyncStoppedError) throw error;
      logger.warn('Noureon Sync V2 shadow could not read local delete snapshots.', error);
    }
    const conversationSnapshots = uniqueConversationsById([
      ...(Array.isArray(deleteOptions.conversations) ? deleteOptions.conversations : []),
      ...localSnapshots
    ]);
    const snapshotError = (code, message) => {
      const error = new Error(message);
      error.code = code;
      error.details = {
        requestedIds: ids.slice(0, 10),
        snapshotIds: conversationSnapshots.map(conversation => conversation?.id).filter(Boolean).slice(0, 10)
      };
      return deleteFailed(error);
    };
    if (deleteOptions.requireSnapshots && conversationSnapshots.length < ids.length) {
      throw snapshotError('ASTRA_DELETE_SNAPSHOT_REQUIRED', 'Cloud permanent delete requires local conversation snapshots.');
    }
    const selectedFingerprints = new Set(conversationSnapshots.map(conversationDeleteFingerprint).filter(Boolean));
    const selectedMatchKeys = new Set(conversationSnapshots.flatMap(conversation => [...conversationDeleteMatchKeys(conversation)]).filter(Boolean));
    if (deleteOptions.requireSnapshots && !selectedFingerprints.size && !selectedMatchKeys.size) {
      throw snapshotError('ASTRA_DELETE_MATCH_KEYS_REQUIRED', 'Cloud permanent delete could not build remote match keys.');
    }

    // The cloud's conversations that are these ones: by id, or by their content (a copy uploaded under another id).
    const collectMatchingRemoteIds = async () => {
      if (!validIds.size && !selectedFingerprints.size && !selectedMatchKeys.size) return [];
      const remoteWorkspace = decodeWorkspaceConversationShadow(await repository.fetchWorkspace());
      assertCurrent();
      const matches = [];
      for (const remoteConversation of remoteWorkspace.conversations || []) {
        if (!remoteConversation?.id) continue;
        if (validIds.has(String(remoteConversation.id))) {
          matches.push(remoteConversation.id);
          continue;
        }
        const fingerprint = conversationDeleteFingerprint(remoteConversation);
        const matched = (fingerprint && selectedFingerprints.has(fingerprint))
          || [...conversationDeleteMatchKeys(remoteConversation)].some(key => selectedMatchKeys.has(key));
        if (matched) matches.push(remoteConversation.id);
      }
      return [...new Set(matches)];
    };
    for (const remoteId of await collectMatchingRemoteIds()) validIds.add(remoteId);
    try {
      await repository.permanentlyDeleteConversations([...validIds]);
      assertCurrent();
      const residualRemoteIds = [];
      for (const remoteId of await collectMatchingRemoteIds()) {
        if (validIds.has(remoteId)) continue;
        validIds.add(remoteId);
        residualRemoteIds.push(remoteId);
      }
      if (residualRemoteIds.length) {
        await repository.permanentlyDeleteConversations(residualRemoteIds);
        assertCurrent();
      }
      const refreshedTombstoneIndex = createTombstoneIndex(await repository.fetchTombstones());
      assertCurrent();
      const missingTombstoneIds = [...validIds].filter(id => !refreshedTombstoneIndex.conversations.has(id));
      if (missingTombstoneIds.length) {
        const error = new Error('Cloud permanent delete did not create durable deletion markers.');
        error.code = 'ASTRA_TOMBSTONE_VERIFY_FAILED';
        error.details = { missingConversationIds: missingTombstoneIds.slice(0, 10) };
        throw error;
      }
      const finalResidualRemoteIds = await collectMatchingRemoteIds();
      if (finalResidualRemoteIds.length) {
        const error = new Error('Cloud permanent delete left matching remote conversations behind.');
        error.code = 'ASTRA_REMOTE_DELETE_VERIFY_FAILED';
        error.details = { remainingConversationIds: finalResidualRemoteIds.slice(0, 10) };
        throw error;
      }
      state.tombstoneIndex = refreshedTombstoneIndex;
      const finalDeleteIds = [...validIds];
      if (state.baselineTrusted && state.uploadBaseline) {
        const deletedIds = new Set(finalDeleteIds.map(String));
        state.uploadBaseline = {
          ...cloneShadowRows(state.uploadBaseline),
          conversations: state.uploadBaseline.conversations.filter(row => !deletedIds.has(String(row?.id || ''))),
          messages: state.uploadBaseline.messages.filter(row => !deletedIds.has(String(row?.conversation_id || '')))
        };
      }
      return done({
        lastPermanentDeleteAt: now(),
        lastPermanentDeleteCount: finalDeleteIds.length,
        lastPermanentDeleteVerifiedCount: finalDeleteIds.length,
        lastPermanentDeleteError: undefined
      });
    } catch (error) {
      ctx.invalidateUploadBaseline();
      if (error instanceof ShadowSyncStoppedError) throw error;
      throw deleteFailed(error);
    }
  }

  /** Deletes Nouras forever. `options.astras`: their local copies, when they are no longer in the workspace (every one must have one). */
  async function permanentlyDeleteAstras(astraIds, deleteOptions = {}) {
    const requestedIds = [...new Set((astraIds || []).filter(Boolean).map(String))];
    if (!requestedIds.length) return state.status;
    if (!state.enabled) throw new Error('Cloud Noura sync is not ready yet.');
    const assertCurrent = await pauseUploads();

    const localWorkspace = await options.readWorkspace() || {};
    assertCurrent();
    const snapshotById = new Map(
      [...(localWorkspace.astras || []), ...(Array.isArray(deleteOptions.astras) ? deleteOptions.astras : [])]
        .filter(astra => requestedIds.includes(String(astra?.id || '')))
        .map(astra => [String(astra.id), astra])
    );
    if (snapshotById.size < requestedIds.length) {
      const error = new Error('Cloud Noura deletion requires local snapshots.');
      error.code = 'ASTRA_ASTRA_DELETE_SNAPSHOT_REQUIRED';
      throw error;
    }
    const deletionWorkspace = await options.normalizeWorkspace({ conversations: [], folders: [], astras: [...snapshotById.values()] });
    assertCurrent();
    const encoded = await encodeWorkspaceConversationShadow({ workspace: deletionWorkspace, userId, cryptoProvider });
    assertCurrent();
    if (encoded.astras.length !== requestedIds.length) {
      const error = new Error('Cloud Noura deletion could not encode every Noura.');
      error.code = 'ASTRA_ASTRA_DELETE_ENCODE_FAILED';
      throw error;
    }

    try {
      const deletedAt = now();
      await repository.permanentlyDeleteAstras(encoded.astras, deletedAt);
      assertCurrent();
      const rows = await repository.fetchWorkspace();
      assertCurrent();
      const nextAstraTombstoneIds = createAstraTombstoneIndex(rows.astras);
      const deletedIds = encoded.astras.map(row => row.id);
      const missingIds = deletedIds.filter(id => !nextAstraTombstoneIds.has(id));
      if (missingIds.length) {
        const error = new Error('Cloud Noura deletion did not create durable deletion markers.');
        error.code = 'ASTRA_ASTRA_TOMBSTONE_VERIFY_FAILED';
        error.details = { missingAstraIds: missingIds.slice(0, 10) };
        throw error;
      }
      state.astraTombstoneIds = nextAstraTombstoneIds;
      remote.acceptFetchedUploadBaseline(rows);
      return done({ lastAstraDeleteAt: deletedAt, lastAstraDeleteCount: deletedIds.length, lastAstraDeleteError: undefined });
    } catch (error) {
      ctx.invalidateUploadBaseline();
      if (error instanceof ShadowSyncStoppedError) throw error;
      throw failed(error, { lastAstraDeleteAt: now(), lastAstraDeleteCount: 0, lastAstraDeleteError: describeShadowError(error) });
    }
  }

  /** Deletes a folder forever (its conversations stay, out of any folder). */
  async function permanentlyDeleteFolder(folderId) {
    const requestedId = String(folderId || '');
    if (!requestedId) return state.status;
    if (!state.enabled) throw new Error('Cloud folder sync is not ready yet.');
    const assertCurrent = await pauseUploads();
    const cloudFolderId = await cloudIdOf('folder', requestedId);
    assertCurrent();

    try {
      await repository.permanentlyDeleteFolder(cloudFolderId);
      assertCurrent();
      const refreshedTombstoneIndex = createTombstoneIndex(await repository.fetchTombstones());
      assertCurrent();
      if (!refreshedTombstoneIndex.folders.has(cloudFolderId)) {
        const error = new Error('Cloud folder delete did not create a durable deletion marker.');
        error.code = 'ASTRA_FOLDER_TOMBSTONE_VERIFY_FAILED';
        error.details = { missingFolderId: cloudFolderId };
        throw error;
      }
      state.tombstoneIndex = refreshedTombstoneIndex;
      if (state.baselineTrusted && state.uploadBaseline) {
        const nextBaseline = cloneShadowRows(state.uploadBaseline);
        nextBaseline.folders = nextBaseline.folders.filter(row => row?.id !== cloudFolderId);
        nextBaseline.conversations = nextBaseline.conversations.map(row => (
          row?.folder_id === cloudFolderId ? { ...row, folder_id: null } : row
        ));
        state.uploadBaseline = nextBaseline;
      }
      return done({ lastFolderDeleteAt: now(), lastFolderDeleteCount: 1, lastFolderDeleteError: undefined });
    } catch (error) {
      ctx.invalidateUploadBaseline();
      if (error instanceof ShadowSyncStoppedError) throw error;
      throw failed(error, { lastFolderDeleteAt: now(), lastFolderDeleteCount: 0, lastFolderDeleteError: describeShadowError(error) });
    }
  }

  return { permanentlyDeleteConversations, permanentlyDeleteAstras, permanentlyDeleteFolder };
}
