import { registerConversationInUse } from './on-demand-loading.js';

export function createConversationStateAccess({
  getConversations,
  getCurrentConversationId,
  setCurrentConversationId
}) {
  // With on-demand loading, the conversation that is shown stays in memory.
  registerConversationInUse((conversation) => conversation?.id === getCurrentConversationId());

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
