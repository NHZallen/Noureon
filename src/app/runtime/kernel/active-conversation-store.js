export function createActiveConversationStore(initialId = null) {
  let activeConversationId = initialId ?? null;

  const getActiveConversationId = () => activeConversationId;

  const setActiveConversationId = (id) => {
    activeConversationId = id ?? null;
    return activeConversationId;
  };

  const clearActiveConversationId = () => {
    activeConversationId = null;
    return activeConversationId;
  };

  const hasActiveConversation = () => (
    activeConversationId !== null &&
    activeConversationId !== undefined &&
    activeConversationId !== ''
  );

  return {
    getActiveConversationId,
    setActiveConversationId,
    clearActiveConversationId,
    hasActiveConversation
  };
}
