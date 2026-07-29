import {
  clearAutomaticMemoryOverview,
  removeMemorySummarySources
} from './memory-summary-state.js';

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
    const invalidCandidateIds = asArray(memoryState.profileCandidates)
      .filter(candidate => intersects(asArray(candidate?.sourceRefs).map(ref => ref?.messageId), invalidMessageIds))
      .map(candidate => String(candidate.id));
    const summaryCleanup = removeMemorySummarySources({
      summary: memoryState.memorySummary,
      evidence: memoryState.memoryEvidence,
      conversationId,
      messageIds: [...invalidMessageIds]
    });
    const overviewCleanup = summaryCleanup.changed
      ? clearAutomaticMemoryOverview({ overview: memoryState.memoryOverview })
      : memoryState.memoryOverview;
    index.removeConversation(conversationId);
    replaceMemoryState({
      ...memoryState,
      recentConversationStates: asArray(memoryState.recentConversationStates)
        .filter(state => state?.conversationId !== conversationId),
      conversationCapsules: capsules.filter(capsule => capsule?.conversationId !== conversationId),
      mediaMemories: asArray(memoryState.mediaMemories)
        .filter(memory => memory?.conversationId !== conversationId && !invalidMessageIds.has(memory?.messageId)),
      profileCandidates: asArray(memoryState.profileCandidates)
        .filter(candidate => !intersects(asArray(candidate?.sourceRefs).map(ref => ref?.messageId), invalidMessageIds)),
      resolvedProfileCandidateIds: [
        ...new Set([...asArray(memoryState.resolvedProfileCandidateIds).map(String), ...invalidCandidateIds])
      ],
      longTermTopicSummaries: asArray(memoryState.longTermTopicSummaries)
        .filter(summary => !intersects(summary?.sourceCapsuleIds, invalidCapsuleIds)),
      ...(memoryState.memorySummary ? { memorySummary: summaryCleanup.summary } : {}),
      ...(overviewCleanup ? { memoryOverview: overviewCleanup } : {}),
      ...(asArray(memoryState.memoryEvidence).length > 0 ? { memoryEvidence: summaryCleanup.evidence } : {})
    });
    // This path is an explicit deletion, so it is the only normal flow that
    // may intentionally replace the final persisted index with an empty one.
    if (persistence?.save) {
      await persistence.save({ allowEmpty: true, emptyReason: 'permanent-deletion' });
    }
    return {
      invalidatedCapsuleCount: invalidCapsuleIds.size,
      ...(memoryState.memorySummary ? { memorySummaryRefreshRequired: summaryCleanup.summary.needsRefresh === true } : {})
    };
  }

  return {
    invalidateConversation,
    invalidateSource: ({ conversationId, messageId } = {}) => invalidateConversation({
      conversationId,
      messageIds: messageId ? [messageId] : []
    })
  };
}
