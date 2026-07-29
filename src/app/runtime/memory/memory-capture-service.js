import {
  normalizeMemoryEvidence,
  normalizeMemoryOverview,
  reconcileMemorySummary
} from './memory-summary-state.js';

const asArray = value => Array.isArray(value) ? value : [];

const activeProfileEntryIds = memoryState => new Set(asArray(memoryState.profileEntries)
  .filter(entry => entry?.status === 'active' && entry?.confirmedByUser === true)
  .map(entry => String(entry.id)));

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

const normalizeCandidateContent = value => String(value || '')
  .normalize('NFKC')
  .trim()
  .replace(/\s+/gu, ' ')
  .toLocaleLowerCase();

const memoryStateForTurn = (capture, index) => {
  const matching = asArray(capture?.evidenceStates)
    .find(item => Number(item?.sourceTurnIndex) === index);
  return matching?.state || 'current-state';
};

const mapSummaryPatchSources = ({ patch = {}, turns = [], conversationId }) => ({
  overview: String(patch?.overview || '').trim(),
  sections: asArray(patch?.sections).map(section => {
    const sourceTurnIndexes = asArray(section?.sourceTurnIndexes)
      .map(Number)
      .filter(Number.isInteger)
      .filter(index => turns[index]?.role === 'user');
    return {
      key: section?.key,
      title: section?.title,
      content: section?.content,
      state: section?.state,
      expiresAt: section?.expiresAt,
      sourceConversationIds: sourceTurnIndexes.length ? [conversationId] : [],
      sourceMessageIds: sourceTurnIndexes.map(index => turns[index]?.id).filter(Boolean)
    };
  }),
  removeSectionKeys: asArray(patch?.removeSectionKeys).map(String)
});

export function createMemoryCaptureService({
  captureClient,
  getMemoryState,
  replaceMemoryState,
  indexCapsule = null,
  indexConversationFragments = null,
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
      captureTurns = turns,
      signal,
      collectProfileCandidates = true,
      allowTopicSummary = true,
      forceCapture = false
    } = {}) {
      if (!conversationId) throw new TypeError('Memory capture requires conversationId.');
      if (!sourceHash) throw new TypeError('Memory capture requires sourceHash.');
      const memoryState = getMemoryState() || {};
      const recentStates = asArray(memoryState.recentConversationStates);
      const existingRecentState = recentStates.find(state => state.conversationId === conversationId);
      if (!forceCapture && existingRecentState?.sourceHash === sourceHash) {
        return { captured: false, reason: 'unchanged-source' };
      }

      const enriched = typeof enrichTurns === 'function'
        ? await enrichTurns({ conversationId, turns: captureTurns, memoryState, signal })
        : { turns: captureTurns, mediaMemories: [] };
      const modelTurns = enriched.turns || captureTurns;
      const capture = await captureClient.capture({
        recentTurnSummary: existingRecentState?.recentTurnSummary || '',
        turns: modelTurns,
        activeProfileEntries: asArray(memoryState.profileEntries)
          .filter(entry => entry?.status === 'active' && entry?.confirmedByUser === true)
          .map(({ id, kind, content }) => ({ id, kind, content })),
        memorySummary: memoryState.memorySummary || {},
        existingCapsule: asArray(memoryState.conversationCapsules)
          .find(capsule => capsule?.conversationId === conversationId) || null,
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
      const activeEntries = asArray(memoryState.profileEntries)
        .filter(entry => entry?.status === 'active' && entry?.confirmedByUser === true);
      const activeIds = activeProfileEntryIds(memoryState);
      const activeEntriesById = new Map(activeEntries.map(entry => [String(entry.id), entry]));
      const knownCandidateContents = new Set(activeEntries.map(entry => normalizeCandidateContent(entry.content)));
      const candidates = [];
      for (const candidate of collectProfileCandidates ? asArray(capture.profileCandidates) : []) {
        const content = String(candidate?.content || '').trim();
        const normalizedContent = normalizeCandidateContent(content);
        const kind = candidate?.kind === 'identity' ? 'identity' : 'preference';
        const sourceRefs = candidateSourceRefs(turns, candidate?.sourceTurnIndexes);
        if (!normalizedContent || knownCandidateContents.has(normalizedContent)) continue;
        if (!sourceRefs.some(ref => ref.role === 'user')) continue;
        knownCandidateContents.add(normalizedContent);
        candidates.push({
          id: createId('profile-candidate'),
          kind,
          content,
          status: 'review',
          confirmedByUser: false,
          extractionConfidence: candidate.extractionConfidence,
          suggestedSupersedes: asArray(candidate.suggestedSupersedes)
            .map(String)
            .filter(id => activeIds.has(id))
            .filter(id => (activeEntriesById.get(id)?.kind || 'preference') === kind),
          sourceRefs,
          createdAt: updatedAt
        });
      }
      const evidence = normalizeMemoryEvidence([
        ...asArray(memoryState.memoryEvidence),
        ...asArray(captureTurns).flatMap((turn, index) => turn?.role === 'user' && String(turn?.text || '').trim()
          ? [{
            conversationId,
            messageId: turn.id,
            sourceHash,
            content: String(turn.text).trim(),
            state: memoryStateForTurn(capture, index),
            createdAt: updatedAt,
            updatedAt
          }]
          : [])
      ], { now });
      const summaryPatch = mapSummaryPatchSources({
        patch: capture.memorySummaryPatch,
        turns: captureTurns,
        conversationId
      });
      const memorySummary = reconcileMemorySummary({
        summary: memoryState.memorySummary,
        patch: { ...summaryPatch, modelId: capture.modelId },
        allowedConversationIds: [conversationId],
        allowedMessageIds: asArray(captureTurns)
          .filter(turn => turn?.role === 'user')
          .map(turn => turn.id)
          .filter(Boolean),
        now,
        createId
      });
      // The complete summary stays fresh automatically. Its short display
      // overview deliberately does not regenerate on every message; Settings
      // shows an explicit update action when this marker is true.
      const memoryOverview = normalizeMemoryOverview({
        ...(memoryState.memoryOverview || {}),
        status: memoryState.memoryOverview?.status === 'pending' ? 'pending' : 'idle',
        needsRefresh: true
      }, { now });
      const nextMemoryState = {
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
        profileCandidates: [...asArray(memoryState.profileCandidates), ...candidates],
        memoryEvidence: evidence,
        memorySummary,
        memoryOverview
      };
      replaceMemoryState(nextMemoryState);
      try {
        if (typeof indexCapsule === 'function') await indexCapsule({ capsule, sourceHash });
        if (typeof indexConversationFragments === 'function') {
          await indexConversationFragments({
            conversationId,
            turns,
            sourceHash,
            updatedAt
          });
        }
        if (typeof indexMediaMemory === 'function') {
          for (const media of asArray(enriched.mediaForIndex)) await indexMediaMemory(media);
        }
      } catch (error) {
        // The derived metadata and vectors form one recoverable unit. Do not
        // persist a new source hash if the local vector replacement failed.
        replaceMemoryState(memoryState);
        throw error;
      }
      if (allowTopicSummary && typeof updateTopicSummary === 'function') {
        await updateTopicSummary({ capsule, signal });
      }
      return {
        captured: true,
        capsuleId: capsule.id,
        candidateCount: candidates.length,
        memorySummarySectionCount: memorySummary.sections.length
      };
    }
  };
}
