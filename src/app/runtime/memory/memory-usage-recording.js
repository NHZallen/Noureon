const asArray = value => Array.isArray(value) ? value : [];
const unique = values => [...new Set(values.filter(Boolean).map(String))];

export const MAX_MEMORY_USAGE_RECORDS = 60;

const preview = (value, limit = 220) => {
  const text = String(value || '').replace(/\s+/gu, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
};

export function snapshotMemoryContextUsage(context = {}) {
  const sources = [
    ...asArray(context.profileEntries).map(entry => ({
      type: 'profile-entry',
      id: entry.id,
      label: preview(entry.content),
      selectedReason: 'confirmed-profile'
    })),
    ...asArray(context.historyResults).map(result => ({
      type: 'history-result',
      id: result.recordId,
      sourceIds: unique(asArray(result.sourceIds)),
      label: preview(result.summary),
      selectedReason: 'relevant-history'
    }))
  ];

  if (context.currentChatSummary) {
    sources.unshift({
      type: 'current-conversation-state',
      id: 'current-conversation-state',
      label: preview(context.currentChatSummary),
      selectedReason: 'current-chat-continuity'
    });
  }
  return sources;
}

export function appendMemoryUsageRecord(memoryState = {}, {
  id,
  conversationId,
  responseMessageId,
  sources = [],
  now = new Date().toISOString(),
  limit = MAX_MEMORY_USAGE_RECORDS
} = {}) {
  if (!id || !conversationId || !responseMessageId) {
    throw new TypeError('Memory usage records require an id, conversation id, and response message id.');
  }
  const normalizedSources = asArray(sources)
    .filter(source => source?.type && source?.id)
    .map(source => ({
      type: source.type,
      id: String(source.id),
      sourceIds: unique(asArray(source.sourceIds)),
      label: preview(source.label),
      selectedReason: source.selectedReason || 'memory-context'
    }));
  if (normalizedSources.length === 0) return memoryState;

  const record = {
    id,
    conversationId: String(conversationId),
    responseMessageId: String(responseMessageId),
    sourceIds: unique(normalizedSources.flatMap(source => source.sourceIds)),
    sources: normalizedSources,
    createdAt: now
  };
  const existing = asArray(memoryState.memoryUsageRecords)
    .filter(item => item?.responseMessageId !== record.responseMessageId);
  return {
    ...memoryState,
    memoryUsageRecords: [...existing, record].slice(-Math.max(1, limit))
  };
}
