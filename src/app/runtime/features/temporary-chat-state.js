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

export function createPersistableAppDataSnapshot(snapshot = {}) {
  const conversations = snapshot.conversations || [];
  const persistentConversations = conversations.filter(conversation => !isEphemeralConversation(conversation));
  if (persistentConversations.length === conversations.length) return snapshot;
  return {
    ...snapshot,
    conversations: persistentConversations
  };
}
