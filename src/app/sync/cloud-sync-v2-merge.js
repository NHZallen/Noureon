// How the local workspace and the cloud's rows are put together (Sync V2): the message ids of an upload made to match the ones the cloud
// already has, a conversation whose folder change waits, and the merge of a cloud workspace into a local one (with the entities changed
// here kept as they are).

import { mergeConversationVersions, mergeWorkspaceAppData } from './cloud-sync-versioning.js';
import { messageSequenceKey } from './cloud-sync-v2-shared.js';

export function preserveDeferredConversationFolderRows(encoded, baseline, deferredIds) {
  if (!deferredIds.size) return encoded;
  const baselineById = new Map((baseline?.conversations || []).map(row => [row?.id, row]));
  const encodedIds = new Set();
  const conversations = (encoded?.conversations || []).map(row => {
    if (!row?.id || !deferredIds.has(row.id)) return row;
    encodedIds.add(row.id);
    const baselineRow = baselineById.get(row.id);
    const currentFolderId = row.folder_id || null;
    const baselineFolderId = baselineRow?.folder_id || null;
    if (currentFolderId === baselineFolderId) {
      deferredIds.delete(row.id);
      return row;
    }
    const metadata = { ...(row.metadata || {}) };
    const baselineLegacyFolderId = baselineRow?.metadata?.legacyFolderId || baselineFolderId;
    if (baselineLegacyFolderId) metadata.legacyFolderId = baselineLegacyFolderId;
    else delete metadata.legacyFolderId;
    return { ...row, folder_id: baselineFolderId, metadata };
  });
  for (const id of deferredIds) {
    if (!encodedIds.has(id)) deferredIds.delete(id);
  }
  return { ...encoded, conversations };
}

export function reconcileEncodedMessageIds(encoded, baseline) {
  const remoteIdByKey = new Map();
  const remoteKeyById = new Map();
  const remoteDeletedIds = new Set();
  for (const row of baseline?.messages || []) {
    const key = messageSequenceKey(row);
    if (!key || !row?.id || remoteIdByKey.has(key)) {
      return { encoded, safe: false, reason: 'ambiguous-remote-message-sequence' };
    }
    const existingKey = remoteKeyById.get(row.id);
    if (existingKey && existingKey !== key) {
      return { encoded, safe: false, reason: 'ambiguous-remote-message-id' };
    }
    remoteIdByKey.set(key, row.id);
    remoteKeyById.set(row.id, key);
    if (row.deleted_at) remoteDeletedIds.add(row.id);
  }

  const localKeys = new Set();
  const finalLocalIds = new Set();
  const messages = [];
  for (const row of encoded?.messages || []) {
    const key = messageSequenceKey(row);
    const remoteOwnerKey = row?.id ? remoteKeyById.get(row.id) : null;
    // The cloud moved this message out of its place and deleted it (the server's reply took the place, or another device cut it away): the
    // cloud's deletion stands, so the stale local copy is left out of the upload instead of stopping the whole sync.
    if (remoteOwnerKey && key && remoteOwnerKey !== key && remoteDeletedIds.has(row.id)) continue;
    if (!key || !row?.id || localKeys.has(key)) {
      return { encoded, safe: false, reason: 'ambiguous-local-message-sequence' };
    }
    if (remoteOwnerKey && remoteOwnerKey !== key) {
      return { encoded, safe: false, reason: 'local-message-id-owned-by-another-sequence' };
    }
    localKeys.add(key);
    const remoteId = remoteIdByKey.get(key);
    const finalId = remoteId || row.id;
    if (finalLocalIds.has(finalId)) {
      return { encoded, safe: false, reason: 'duplicate-reconciled-message-id' };
    }
    finalLocalIds.add(finalId);
    messages.push(finalId !== row.id ? { ...row, id: finalId } : row);
  }
  return { encoded: { ...encoded, messages }, safe: true, reason: null };
}

export function mergeWorkspacePreservingLocalTopLevel(local = {}, remote = {}) {
  return { ...local, ...mergeWorkspaceAppData(local, remote) };
}

export function mergeRemoteIntoEntityDirtyLocal(local = {}, remote = {}, dirtyEntities = {}) {
  const normallyMerged = mergeWorkspacePreservingLocalTopLevel(local, remote);
  const localConversations = new Map((local.conversations || []).map(item => [item?.id, item]));
  const remoteConversations = new Map((remote.conversations || []).map(item => [item?.id, item]));
  const dirtyConversationIds = new Set(dirtyEntities.conversations || []);
  const dirtyFolderIds = new Set(dirtyEntities.folders || []);
  const dirtyAstraIds = new Set(dirtyEntities.astras || []);
  const conversations = normallyMerged.conversations.map(preferred => {
    if (!dirtyConversationIds.has(preferred?.id)) return preferred;
    const localConversation = localConversations.get(preferred?.id);
    const remoteConversation = remoteConversations.get(preferred?.id);
    if (!localConversation || !remoteConversation) return preferred;
    const stateResolved = mergeConversationVersions(localConversation, remoteConversation);
    const merged = {
      ...remoteConversation,
      ...localConversation,
      messages: preferred.messages
    };
    merged.deletedAt = stateResolved.deletedAt || null;
    if (stateResolved.stateUpdatedAt !== undefined) {
      merged.stateUpdatedAt = stateResolved.stateUpdatedAt;
    }
    merged.trashStateUpdatedAt = stateResolved.trashStateUpdatedAt || stateResolved.deletedAt || null;
    if (Boolean(localConversation.deletedAt) !== Boolean(remoteConversation.deletedAt)) {
      merged.folderId = stateResolved.folderId || null;
      merged.archived = Boolean(stateResolved.archived);
    }
    return merged;
  });
  const localFolders = new Map((local.folders || []).map(item => [item?.id, item]));
  const folders = normallyMerged.folders.map(folder => {
    const selected = dirtyFolderIds.has(folder?.id) && localFolders.has(folder.id)
      ? localFolders.get(folder.id)
      : folder;
    return {
      ...selected,
      conversationIds: conversations
        .filter(conversation => conversation?.folderId === folder?.id && !conversation.deletedAt)
        .map(conversation => conversation.id)
    };
  });
  const localAstras = new Map((local.astras || []).map(item => [item?.id, item]));
  const astras = normallyMerged.astras.map(astra => (
    dirtyAstraIds.has(astra?.id) && localAstras.has(astra.id) ? localAstras.get(astra.id) : astra
  ));
  return {
    ...normallyMerged,
    conversations,
    folders,
    astras
  };
}
