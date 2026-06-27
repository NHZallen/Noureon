export function createLiveConversationsBridge({
  getConversations,
  replaceConversations
} = {}) {
  const readConversations = () => getConversations?.();

  return {
    getConversations: readConversations,
    replaceConversations(nextConversations) {
      return replaceConversations?.(nextConversations) ?? nextConversations;
    }
  };
}
