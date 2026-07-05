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

function conversationScore(conversation = {}) {
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

function preferLocalConversation(local, remote) {
  const localScore = conversationScore(local);
  const remoteScore = conversationScore(remote);
  for (let index = 0; index < localScore.length; index += 1) {
    if (localScore[index] !== remoteScore[index]) return localScore[index] > remoteScore[index];
  }
  return true;
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
    conversations: mergeById(remote.conversations, local.conversations, (localConversation, remoteConversation) => (
      preferLocalConversation(localConversation, remoteConversation) ? localConversation : remoteConversation
    )),
    folders: mergeById(remote.folders, local.folders),
    astras: mergeById(remote.astras, local.astras),
    personalMemories: [...memories.values()]
  };
}

export function mergeRemoteWorkspaceAppData(live = {}, remote = {}) {
  const liveConversations = new Map((live.conversations || []).map(conversation => [conversation?.id, conversation]));
  return {
    ...remote,
    conversations: (remote.conversations || []).map(remoteConversation => {
      const liveConversation = liveConversations.get(remoteConversation?.id);
      if (!liveConversation) return remoteConversation;
      return preferLocalConversation(liveConversation, remoteConversation) ? liveConversation : remoteConversation;
    })
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
