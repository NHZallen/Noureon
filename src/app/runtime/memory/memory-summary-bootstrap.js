const hasNormalConversation = conversations => (Array.isArray(conversations) ? conversations : [])
  .some(conversation => (
    conversation?.id && !conversation.deletedAt && !conversation.isTemporary && conversation.retentionMode !== 'ephemeral'
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
    // A rebuild that failed is not run again by every start of the app (each try writes the whole workspace twice and calls the memory
    // and embedding models again for what failed): it runs again when a chat finishes, when synced data arrives, or when it is asked for in Settings.
    if (!force && memoryState.memorySummary?.status === 'failed') {
      return Promise.resolve({ skipped: true, reason: 'previous-rebuild-failed' });
    }
    return rebuildSummary();
  };
}
