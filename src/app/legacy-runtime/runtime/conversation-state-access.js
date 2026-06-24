export function createConversationStateAccess({
  getConversations,
  getCurrentConversationId,
  setCurrentConversationId
}) {
  const getConversationById = (id) => {
    if (id == null) return undefined;

    const conversations = getConversations();
    if (!Array.isArray(conversations)) return undefined;
    return conversations.find((conversation) => conversation?.id === id);
  };

  const getCurrentConversation = () => (
    getConversationById(getCurrentConversationId())
  );

  const updateCurrentConversationId = (id) => {
    setCurrentConversationId(id);
    return id;
  };

  return {
    getConversations,
    getCurrentConversationId,
    setCurrentConversationId: updateCurrentConversationId,
    getConversationById,
    getCurrentConversation
  };
}
