const asArray = value => Array.isArray(value) ? value : [];

export function collectHistorySourceConversationIds(memoryContext = {}) {
  return [...new Set(
    asArray(memoryContext.historyResults)
      .map(result => String(result?.conversationId || '').trim())
      .filter(Boolean)
  )].slice(0, 3);
}

export function normalizeHistorySourceConversationIds(value) {
  return [...new Set(asArray(value).map(item => String(item || '').trim()).filter(Boolean))].slice(0, 3);
}
