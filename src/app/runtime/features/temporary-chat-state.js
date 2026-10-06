export const EPHEMERAL_RETENTION_MODE = 'ephemeral';
export const PERSISTENT_RETENTION_MODE = 'persistent';

export function isEphemeralConversation(conversation = {}) {
  return conversation?.retentionMode === EPHEMERAL_RETENTION_MODE;
}

export function canCaptureConversationMessage(conversation = {}, message) {
  if (isEphemeralConversation(conversation)) return false;
  const messageIndex = (conversation.messages || []).indexOf(message);
  const captureStartIndex = Math.max(0, Number(conversation.memoryCaptureStartIndex) || 0);
  return messageIndex >= captureStartIndex;
}

// The empty chat the app opens for the next message is not kept: the next start removes it and opens a new one anyway (startNewChat),
// so storing it only made the stored workspace differ at every start.
export function isEmptyTemporaryConversation(conversation = {}) {
  return conversation?.isTemporary === true && !(conversation.messages?.length > 0);
}

export function createPersistableAppDataSnapshot(snapshot = {}) {
  const conversations = snapshot.conversations || [];
  const persistentConversations = conversations.filter(conversation => (
    !isEphemeralConversation(conversation) && !isEmptyTemporaryConversation(conversation)
  ));
  if (persistentConversations.length === conversations.length) return snapshot;
  return {
    ...snapshot,
    conversations: persistentConversations
  };
}
