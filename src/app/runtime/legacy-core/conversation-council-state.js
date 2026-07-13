export function createDisabledCouncilConfig(value, cloneCouncilConfig = (council) => ({ ...(council || {}) })) {
  return {
    ...cloneCouncilConfig(value),
    enabled: false
  };
}

export function disableConversationCouncil(conversation, cloneCouncilConfig) {
  if (!conversation) return false;

  const wasEnabled = Boolean(conversation.council?.enabled);
  conversation.council = createDisabledCouncilConfig(conversation.council, cloneCouncilConfig);
  return wasEnabled;
}
