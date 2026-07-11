const asArray = value => Array.isArray(value) ? value : [];

const cosineSimilarity = (left = [], right = []) => {
  if (!left.length || left.length !== right.length) return 0;
  let dot = 0;
  let leftSize = 0;
  let rightSize = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftSize += left[index] ** 2;
    rightSize += right[index] ** 2;
  }
  return leftSize && rightSize ? dot / Math.sqrt(leftSize * rightSize) : 0;
};

const relatedCapsuleIds = summary => [...new Set(asArray(summary?.sourceCapsuleIds))].sort();
const sourceRefsFor = capsules => capsules.flatMap(capsule => asArray(capsule?.sourceRefs));

export function createTopicSummaryService({
  index,
  topicClient,
  getMemoryState,
  replaceMemoryState,
  createId = prefix => `${prefix}:${crypto.randomUUID()}`,
  now = () => new Date().toISOString(),
  similarityThreshold = 0.82
} = {}) {
  if (typeof index?.getAll !== 'function') throw new TypeError('Topic summaries require a history index.');
  if (typeof topicClient?.summarize !== 'function') throw new TypeError('Topic summaries require a topic client.');
  if (typeof getMemoryState !== 'function' || typeof replaceMemoryState !== 'function') {
    throw new TypeError('Topic summaries require memory state access.');
  }

  return {
    async updateForCapsule({ capsule, signal } = {}) {
      if (!capsule?.id) throw new TypeError('Topic summaries require a capsule.');
      const memoryState = getMemoryState() || {};
      const records = index.getAll();
      const currentRecord = records.find(record => record.capsuleId === capsule.id);
      if (!currentRecord?.vector?.length) return { updated: false, reason: 'missing-index-vector' };
      const relatedIds = records
        .filter(record => record.capsuleId && record.capsuleId !== capsule.id)
        .filter(record => cosineSimilarity(currentRecord.vector, record.vector) >= similarityThreshold)
        .map(record => record.capsuleId);
      if (relatedIds.length === 0) return { updated: false, reason: 'no-related-capsules' };
      const capsulesById = new Map(asArray(memoryState.conversationCapsules).map(item => [item?.id, item]));
      const capsules = [capsule, ...relatedIds.map(id => capsulesById.get(id)).filter(Boolean)];
      const sourceCapsuleIds = relatedCapsuleIds({ sourceCapsuleIds: capsules.map(item => item.id) });
      const existing = asArray(memoryState.longTermTopicSummaries)
        .find(summary => relatedCapsuleIds(summary).join('|') === sourceCapsuleIds.join('|'));
      if (existing) return { updated: false, reason: 'unchanged-topic' };
      const summary = await topicClient.summarize({ capsules, existingSummary: '', signal });
      const topicSummary = {
        id: createId('topic-summary'),
        topic: summary.topic,
        summary: summary.summary,
        sourceCapsuleIds,
        sourceRefs: sourceRefsFor(capsules),
        claimType: 'derived-summary',
        updatedAt: now()
      };
      replaceMemoryState({
        ...memoryState,
        longTermTopicSummaries: [...asArray(memoryState.longTermTopicSummaries), topicSummary]
      });
      return { updated: true, topicSummaryId: topicSummary.id };
    }
  };
}
