export function settleCloudUpload(state = {}, attemptedRevision, remoteUpdatedAt) {
  const complete = state.localRevision === attemptedRevision;
  return {
    complete,
    state: {
      ...state,
      remoteUpdatedAt,
      ...(complete ? { dirty: false } : {})
    }
  };
}

export function shouldApplyCloudRemote(state = {}, remoteUpdatedAt) {
  if (state.dirty) return false;
  return Date.parse(remoteUpdatedAt || 0) > Date.parse(state.remoteUpdatedAt || 0);
}

export function canCommitHydratedRemote({
  startedRevision,
  currentState = {},
  activeUpload = false,
  remoteUnchanged = true
} = {}) {
  return remoteUnchanged
    && !activeUpload
    && !currentState.dirty
    && currentState.localRevision === startedRevision;
}

function conversationContentScore(conversation = {}) {
  const messages = conversation.messages || [];
  const contentSize = messages.reduce((total, message) => total + (message.parts || []).reduce(
    (partTotal, part) => partTotal + (part.text?.length || 0) + (part.inlineData ? 1 : 0) + (part.generatedImage ? 1 : 0),
    0
  ), 0);
  return [
    messages.length,
    contentSize,
    conversation.isNaming ? 0 : 1,
    Date.parse(conversation.lastUpdatedAt || conversation.createdAt || 0) || 0
  ];
}

function shouldPreferLocalConversationContent(local, remote) {
  const localScore = conversationContentScore(local);
  const remoteScore = conversationContentScore(remote);
  for (let index = 0; index < localScore.length; index += 1) {
    if (localScore[index] !== remoteScore[index]) return localScore[index] > remoteScore[index];
  }
  return false;
}

function trashStateTimestamp(conversation = {}) {
  const marker = Date.parse(conversation.trashStateUpdatedAt || '');
  if (Number.isFinite(marker)) return marker;
  const deletedAt = Date.parse(conversation.deletedAt || '');
  return Number.isFinite(deletedAt) ? deletedAt : 0;
}

function trashStatesEqual(left = {}, right = {}) {
  return Boolean(left.deletedAt) === Boolean(right.deletedAt)
    && trashStateTimestamp(left) === trashStateTimestamp(right);
}

export function shouldPreferLocalConversationState(local = {}, remote = {}) {
  const localStateAt = trashStateTimestamp(local);
  const remoteStateAt = trashStateTimestamp(remote);
  if (localStateAt !== remoteStateAt) return localStateAt > remoteStateAt;
  if (Boolean(local.deletedAt) !== Boolean(remote.deletedAt)) return Boolean(local.deletedAt);
  return false;
}

export function mergeConversationVersions(local = {}, remote = {}) {
  const contentWinner = shouldPreferLocalConversationContent(local, remote) ? local : remote;
  const stateWinner = shouldPreferLocalConversationState(local, remote) ? local : remote;
  if (trashStatesEqual(local, remote)) return contentWinner;
  if (contentWinner === stateWinner) return contentWinner;
  const merged = {
    ...contentWinner,
    deletedAt: stateWinner.deletedAt || null,
    stateUpdatedAt: stateWinner.stateUpdatedAt,
    trashStateUpdatedAt: stateWinner.trashStateUpdatedAt || stateWinner.deletedAt || null
  };
  if (Boolean(local.deletedAt) !== Boolean(remote.deletedAt)) {
    merged.folderId = stateWinner.folderId || null;
    merged.archived = Boolean(stateWinner.archived);
  }
  return merged;
}

export function enqueueRecoveringTask(previous, task, onError = () => {}) {
  return previous.catch(onError).then(task).catch(onError);
}

function mergeById(remoteItems = [], localItems = [], select = (_local, remote) => remote) {
  const localById = new Map(localItems.map(item => [item?.id, item]));
  const merged = remoteItems.map(remote => {
    const local = localById.get(remote?.id);
    localById.delete(remote?.id);
    return local ? select(local, remote) : remote;
  });
  return [...merged, ...localById.values()];
}

export function mergeWorkspaceAppData(local = {}, remote = {}) {
  const memories = new Map();
  for (const memory of [...(remote.personalMemories || []), ...(local.personalMemories || [])]) {
    memories.set(JSON.stringify(memory), memory);
  }
  return {
    ...local,
    conversations: mergeById(remote.conversations, local.conversations, (localConversation, remoteConversation) => (
      mergeConversationVersions(localConversation, remoteConversation)
    )),
    folders: mergeById(remote.folders, local.folders),
    astras: mergeById(remote.astras, local.astras),
    personalMemories: [...memories.values()]
  };
}

export function mergeRemoteWorkspaceAppData(live = {}, remote = {}, protectedConversation = null) {
  const liveConversations = new Map((live.conversations || []).map(conversation => [conversation?.id, conversation]));
  const conversations = (remote.conversations || []).map(remoteConversation => {
    const liveConversation = liveConversations.get(remoteConversation?.id);
    if (!liveConversation) return remoteConversation;
    return mergeConversationVersions(liveConversation, remoteConversation);
  });
  const deviceOnlyDrafts = [...liveConversations.values()].filter(conversation => (
    conversation?.id
    && conversation.isTemporary
    && !conversation.archived
    && !conversation.deletedAt
    && (conversation.messages?.length || 0) === 0
  ));
  for (const conversation of [protectedConversation, ...deviceOnlyDrafts]) {
    if (conversation?.id && !conversations.some(item => item?.id === conversation.id)) {
      conversations.push(conversation);
    }
  }
  return {
    ...remote,
    conversations
  };
}

function mergeConcurrentRecord(base = {}, local = {}, remote = {}, resolveConflict = (_key, _local, remoteValue) => remoteValue) {
  const output = {};
  for (const key of new Set([...Object.keys(base || {}), ...Object.keys(local || {}), ...Object.keys(remote || {})])) {
    const baseValue = base?.[key];
    const localValue = local?.[key];
    const remoteValue = remote?.[key];
    const localChanged = !cloudValuesEqual(localValue, baseValue);
    const remoteChanged = !cloudValuesEqual(remoteValue, baseValue);
    const selected = localChanged && !remoteChanged
      ? localValue
      : localChanged && remoteChanged
        ? resolveConflict(key, localValue, remoteValue)
        : remoteValue;
    if (selected !== undefined) output[key] = selected;
  }
  return output;
}

function mergeConcurrentConversation(base = {}, local = {}, remote = {}) {
  const merged = mergeConcurrentRecord(
    base,
    local,
    remote,
    (key, localValue, remoteValue) => {
      if (key !== 'messages') return remoteValue;
      return shouldPreferLocalConversationContent(local, remote) ? localValue : remoteValue;
    }
  );
  const localChanged = !trashStatesEqual(local, base);
  const remoteChanged = !trashStatesEqual(remote, base);
  const stateWinner = localChanged && !remoteChanged
    ? local
    : remoteChanged && !localChanged
      ? remote
      : localChanged && remoteChanged && shouldPreferLocalConversationState(local, remote)
        ? local
        : remote;
  merged.deletedAt = stateWinner?.deletedAt || null;
  merged.trashStateUpdatedAt = stateWinner?.trashStateUpdatedAt || stateWinner?.deletedAt || null;
  if (stateWinner?.stateUpdatedAt !== undefined) merged.stateUpdatedAt = stateWinner.stateUpdatedAt;
  if (merged.deletedAt) {
    merged.folderId = null;
    merged.archived = false;
  }
  return merged;
}

function mergeConcurrentItems(baseItems = [], localItems = [], remoteItems = [], mergeRecord = mergeConcurrentRecord) {
  const baseById = new Map(baseItems.map(item => [item?.id, item]));
  const localById = new Map(localItems.map(item => [item?.id, item]));
  const remoteById = new Map(remoteItems.map(item => [item?.id, item]));
  const orderedIds = [...new Set([...remoteById.keys(), ...localById.keys(), ...baseById.keys()])];
  const output = [];
  for (const id of orderedIds) {
    const base = baseById.get(id);
    const local = localById.get(id);
    const remote = remoteById.get(id);
    const localChanged = !cloudValuesEqual(local, base);
    const remoteChanged = !cloudValuesEqual(remote, base);
    let selected;
    if (localChanged && !remoteChanged) selected = local;
    else if (remoteChanged && !localChanged) selected = remote;
    else if (!localChanged && !remoteChanged) selected = remote ?? local;
    else if (local && remote) selected = mergeRecord(base, local, remote);
    else selected = remote ?? local;
    if (selected) output.push(selected);
  }
  return output;
}

export function mergeConcurrentWorkspaceAppData(base = {}, local = {}, remote = {}) {
  const conversations = mergeConcurrentItems(
    base.conversations,
    local.conversations,
    remote.conversations,
    mergeConcurrentConversation
  );
  const folders = mergeConcurrentItems(base.folders, local.folders, remote.folders);
  const folderIds = new Set(folders.map(folder => folder.id));
  for (const conversation of conversations) {
    if (conversation.folderId && !folderIds.has(conversation.folderId)) conversation.folderId = null;
  }
  for (const folder of folders) {
    folder.conversationIds = conversations
      .filter(conversation => conversation.folderId === folder.id && !conversation.deletedAt)
      .map(conversation => conversation.id);
  }
  const memories = new Map();
  for (const memory of [...(remote.personalMemories || []), ...(local.personalMemories || [])]) {
    memories.set(JSON.stringify(memory), memory);
  }
  return {
    ...local,
    conversations,
    folders,
    astras: mergeConcurrentItems(base.astras, local.astras, remote.astras),
    personalMemories: [...memories.values()]
  };
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, canonicalize(value[key])])
  );
}

export function cloudValuesEqual(left, right) {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}
