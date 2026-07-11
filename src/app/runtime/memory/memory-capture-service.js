const asArray = value => Array.isArray(value) ? value : [];

const sourceRefsForTurns = turns => asArray(turns).map(turn => ({
  messageId: turn.id,
  role: turn.role === 'user' ? 'user' : 'assistant',
  claimType: turn.role === 'user' ? 'source-turn' : 'proposal'
}));

const candidateSourceRefs = (turns, indexes) => asArray(indexes)
  .map(index => turns[index])
  .filter(Boolean)
  .map(turn => ({
    messageId: turn.id,
    role: turn.role === 'user' ? 'user' : 'assistant',
    claimType: turn.role === 'user' ? 'candidate-source' : 'proposal'
  }));

export function createMemoryCaptureService({
  captureClient,
  getMemoryState,
  replaceMemoryState,
  indexCapsule = null,
  indexMediaMemory = null,
  updateTopicSummary = null,
  enrichTurns = null,
  createId = prefix => `${prefix}:${crypto.randomUUID()}`,
  now = () => new Date().toISOString()
} = {}) {
  if (typeof captureClient?.capture !== 'function') throw new TypeError('Memory capture service requires captureClient.capture.');
  if (typeof getMemoryState !== 'function') throw new TypeError('Memory capture service requires getMemoryState.');
  if (typeof replaceMemoryState !== 'function') throw new TypeError('Memory capture service requires replaceMemoryState.');

  return {
    async captureCompletedTurn({
      conversationId,
      sourceHash,
      turns,
      signal,
      collectProfileCandidates = true,
      allowTopicSummary = true
    } = {}) {
      if (!conversationId) throw new TypeError('Memory capture requires conversationId.');
      if (!sourceHash) throw new TypeError('Memory capture requires sourceHash.');
      const memoryState = getMemoryState() || {};
      const recentStates = asArray(memoryState.recentConversationStates);
      const existingRecentState = recentStates.find(state => state.conversationId === conversationId);
      if (existingRecentState?.sourceHash === sourceHash) {
        return { captured: false, reason: 'unchanged-source' };
      }

      const enriched = typeof enrichTurns === 'function'
        ? await enrichTurns({ conversationId, turns, memoryState, signal })
        : { turns, mediaMemories: [] };
      const captureTurns = enriched.turns || turns;
      const capture = await captureClient.capture({
        recentTurnSummary: existingRecentState?.recentTurnSummary || '',
        turns: captureTurns,
        signal
      });
      const updatedAt = now();
      const lastTurn = asArray(turns).at(-1);
      const recentState = {
        conversationId,
        recentTurnSummary: capture.recentTurnSummary,
        coveredThroughMessageId: lastTurn?.id || null,
        sourceHash,
        updatedAt
      };
      const existingCapsule = asArray(memoryState.conversationCapsules)
        .find(capsule => capsule.conversationId === conversationId);
      const capsule = {
        id: existingCapsule?.id || createId('conversation-capsule'),
        conversationId,
        topic: capture.capsule.topic,
        summary: capture.capsule.summary,
        confirmedDecisions: capture.capsule.confirmedDecisions,
        openQuestions: capture.capsule.openQuestions,
        sourceRefs: sourceRefsForTurns(turns),
        updatedAt
      };
      const candidates = (collectProfileCandidates ? asArray(capture.profileCandidates) : []).map(candidate => ({
        id: createId('profile-candidate'),
        kind: candidate.kind,
        content: candidate.content,
        status: 'review',
        confirmedByUser: false,
        extractionConfidence: candidate.extractionConfidence,
        sourceRefs: candidateSourceRefs(turns, candidate.sourceTurnIndexes),
        createdAt: updatedAt
      }));
      replaceMemoryState({
        ...memoryState,
        recentConversationStates: [
          ...recentStates.filter(state => state.conversationId !== conversationId),
          recentState
        ],
        conversationCapsules: [
          ...asArray(memoryState.conversationCapsules).filter(item => item.conversationId !== conversationId),
          capsule
        ],
        mediaMemories: [
          ...asArray(memoryState.mediaMemories),
          ...asArray(enriched.mediaMemories)
        ],
        profileCandidates: [...asArray(memoryState.profileCandidates), ...candidates]
      });
      if (typeof indexCapsule === 'function') await indexCapsule({ capsule, sourceHash });
      if (typeof indexMediaMemory === 'function') {
        for (const media of asArray(enriched.mediaForIndex)) await indexMediaMemory(media);
      }
      if (allowTopicSummary && typeof updateTopicSummary === 'function') {
        await updateTopicSummary({ capsule, signal });
      }
      return { captured: true, capsuleId: capsule.id, candidateCount: candidates.length };
    }
  };
}
