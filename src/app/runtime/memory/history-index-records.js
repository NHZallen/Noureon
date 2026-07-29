const asArray = value => Array.isArray(value)
  ? value
  : value && typeof value[Symbol.iterator] === 'function' ? [...value] : [];

export function activeMemoryRecordIds({ memoryState = {}, records = [], conversationIds = [] } = {}) {
  const active = new Set(asArray(conversationIds));
  return new Set([
    ...asArray(memoryState.conversationCapsules)
      .filter(capsule => active.has(capsule?.conversationId))
      .map(capsule => `capsule:${capsule.conversationId}`),
    ...asArray(records)
      .filter(record => record?.recordType === 'conversation-fragment' && active.has(record.conversationId))
      .map(record => record.recordId),
    ...asArray(memoryState.mediaMemories)
      .filter(media => active.has(media?.conversationId))
      .map(media => `media:${media.conversationId}:${media.sourceHash}`)
  ]);
}
