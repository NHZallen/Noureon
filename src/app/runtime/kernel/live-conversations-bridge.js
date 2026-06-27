export function createLiveConversationsBridge({
  getConversations,
  replaceConversations,
  syncLegacyMirror: syncLegacyMirrorCallback
} = {}) {
  const readConversations = () => getConversations?.();

  const syncLegacyMirror = (nextConversations = readConversations()) => {
    syncLegacyMirrorCallback?.(nextConversations);
    return nextConversations;
  };

  return {
    getConversations: readConversations,
    replaceConversations(nextConversations) {
      const replacement = replaceConversations?.(nextConversations) ?? nextConversations;
      return syncLegacyMirror(replacement);
    },
    syncLegacyMirror
  };
}
