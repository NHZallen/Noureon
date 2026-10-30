// The past conversations a reply drew on (the slip of the memory brings pieces of them, see inject.js): their ids are kept with the reply and shown under it as "references".
// Plain functions on lists of ids; no window, no document, no browser storage.

const asArray = value => Array.isArray(value) ? value : [];

export function collectHistorySourceConversationIds(memoryContext = {}) {
  return [...new Set(
    asArray(memoryContext.historyResults)
      .map(result => String(result?.conversationId || '').trim())
      .filter(Boolean)
  )];
}

export function normalizeHistorySourceConversationIds(value) {
  return [...new Set(asArray(value).map(item => String(item || '').trim()).filter(Boolean))];
}
