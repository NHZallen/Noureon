const isVisibleConversation = conversation =>
  Boolean(conversation?.id) && !conversation.archived && !conversation.deletedAt;

const getConversationTime = conversation => {
  const value = conversation?.lastUpdatedAt
    || conversation?.updatedAt
    || conversation?.lastMessageAt
    || conversation?.createdAt
    || 0;
  return Date.parse(value) || 0;
};

export function selectActiveConversationId({
  currentId = null,
  conversations = []
} = {}) {
  const visible = conversations.filter(isVisibleConversation);
  if (visible.some(conversation => conversation.id === currentId)) return currentId;
  return [...visible].sort((left, right) => getConversationTime(right) - getConversationTime(left))[0]?.id || null;
}

