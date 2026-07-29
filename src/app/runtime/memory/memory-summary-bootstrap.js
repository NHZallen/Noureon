const hasNormalConversation = conversations => (Array.isArray(conversations) ? conversations : [])
  .some(conversation => (
    conversation?.id && !conversation.deletedAt && !conversation.isTemporary
    && Array.isArray(conversation.messages) && conversation.messages.length > 0
  ));

/** Starts the one-time/background synthesis for existing or remotely changed chats. */
export function createMemorySummaryBootstrap({
  getMemoryState,
  getConversations,
  rebuildSummary
} = {}) {
  if (typeof getMemoryState !== 'function' || typeof getConversations !== 'function') {
    throw new TypeError('Memory summary bootstrap requires memory state and conversations.');
  }
  if (typeof rebuildSummary !== 'function') {
    throw new TypeError('Memory summary bootstrap requires a rebuild function.');
  }

  return ({ force = false } = {}) => {
    const memoryState = getMemoryState() || {};
    if (!hasNormalConversation(getConversations()) || memoryState.memorySummary?.status === 'pending') {
      return Promise.resolve({ skipped: true });
    }
    if (!force && memoryState.memorySummary && memoryState.memorySummary.needsRefresh !== true) {
      return Promise.resolve({ skipped: true });
    }
    return rebuildSummary();
  };
}
