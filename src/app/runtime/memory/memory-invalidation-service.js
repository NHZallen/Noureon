const asArray = value => Array.isArray(value) ? value : [];

const sourceMessageIds = capsule => new Set(asArray(capsule?.sourceRefs).map(ref => ref?.messageId).filter(Boolean));
const intersects = (values, targets) => asArray(values).some(value => targets.has(value));

export function createMemoryInvalidationService({
  index,
  persistence = null,
  getMemoryState,
  replaceMemoryState
} = {}) {
  if (typeof index?.removeConversation !== 'function') throw new TypeError('Memory invalidation requires a history index.');
  if (typeof getMemoryState !== 'function' || typeof replaceMemoryState !== 'function') {
    throw new TypeError('Memory invalidation requires memory state access.');
  }

  async function invalidateConversation({ conversationId, messageIds = [] } = {}) {
    if (!conversationId) throw new TypeError('Memory invalidation requires a conversationId.');
    const memoryState = getMemoryState() || {};
    const capsules = asArray(memoryState.conversationCapsules);
    const invalidCapsuleIds = new Set(capsules
      .filter(capsule => capsule?.conversationId === conversationId)
      .map(capsule => capsule.id));
    const invalidMessageIds = new Set(messageIds);
    for (const capsule of capsules) {
      if (capsule?.conversationId === conversationId) {
        for (const id of sourceMessageIds(capsule)) invalidMessageIds.add(id);
      }
    }
    index.removeConversation(conversationId);
    replaceMemoryState({
      ...memoryState,
      recentConversationStates: asArray(memoryState.recentConversationStates)
        .filter(state => state?.conversationId !== conversationId),
      conversationCapsules: capsules.filter(capsule => capsule?.conversationId !== conversationId),
      profileCandidates: asArray(memoryState.profileCandidates)
        .filter(candidate => !intersects(asArray(candidate?.sourceRefs).map(ref => ref?.messageId), invalidMessageIds)),
      longTermTopicSummaries: asArray(memoryState.longTermTopicSummaries)
        .filter(summary => !intersects(summary?.sourceCapsuleIds, invalidCapsuleIds)),
      memoryUsageRecords: asArray(memoryState.memoryUsageRecords)
        .filter(record => !intersects(record?.sourceIds, invalidCapsuleIds))
    });
    if (persistence?.save) await persistence.save();
    return { invalidatedCapsuleCount: invalidCapsuleIds.size };
  }

  return {
    invalidateConversation,
    invalidateSource: ({ conversationId, messageId } = {}) => invalidateConversation({
      conversationId,
      messageIds: messageId ? [messageId] : []
    })
  };
}
