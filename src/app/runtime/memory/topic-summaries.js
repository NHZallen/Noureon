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
const intersects = (left, right) => left.some(value => right.has(value));
const timestamp = value => Date.parse(value || '') || 0;

const mergeSourceRefs = summaries => {
  const refs = new Map();
  for (const ref of summaries.flatMap(summary => asArray(summary?.sourceRefs))) {
    const key = [ref?.messageId, ref?.role, ref?.claimType].join(':');
    if (ref?.messageId && !refs.has(key)) refs.set(key, ref);
  }
  return [...refs.values()];
};

export function consolidateOverlappingTopicSummaries(memoryState = {}) {
  const pending = [...asArray(memoryState.longTermTopicSummaries)];
  const consolidated = [];
  const removedIds = [];
  while (pending.length > 0) {
    const group = [pending.shift()];
    const capsuleIds = new Set(relatedCapsuleIds(group[0]));
    let expanded = true;
    while (expanded) {
      expanded = false;
      for (let index = pending.length - 1; index >= 0; index -= 1) {
        if (!intersects(relatedCapsuleIds(pending[index]), capsuleIds)) continue;
        const [match] = pending.splice(index, 1);
        group.push(match);
        relatedCapsuleIds(match).forEach(id => capsuleIds.add(id));
        expanded = true;
      }
    }
    const survivor = group.reduce((latest, item) => (
      timestamp(item?.updatedAt) >= timestamp(latest?.updatedAt) ? item : latest
    ));
    removedIds.push(...group.filter(item => item?.id !== survivor?.id).map(item => String(item.id)));
    consolidated.push({
      ...survivor,
      sourceCapsuleIds: [...capsuleIds].sort(),
      sourceRefs: mergeSourceRefs(group)
    });
  }
  if (removedIds.length === 0) return memoryState;
  return {
    ...memoryState,
    longTermTopicSummaries: consolidated,
    resolvedTopicSummaryIds: [
      ...new Set([...asArray(memoryState.resolvedTopicSummaryIds).map(String), ...removedIds])
    ]
  };
}

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
      const initialMemoryState = getMemoryState() || {};
      const memoryState = consolidateOverlappingTopicSummaries(initialMemoryState);
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
      const sourceIdSet = new Set(sourceCapsuleIds);
      const overlapping = asArray(memoryState.longTermTopicSummaries)
        .filter(item => intersects(relatedCapsuleIds(item), sourceIdSet));
      const existing = overlapping.reduce((latest, item) => (
        !latest || timestamp(item?.updatedAt) >= timestamp(latest?.updatedAt) ? item : latest
      ), null);
      if (existing && overlapping.length === 1 && relatedCapsuleIds(existing).join('|') === sourceCapsuleIds.join('|')) {
        if (memoryState !== initialMemoryState) replaceMemoryState(memoryState);
        return { updated: false, reason: 'unchanged-topic' };
      }
      const mergedCapsuleIds = [...new Set([
        ...sourceCapsuleIds,
        ...overlapping.flatMap(relatedCapsuleIds)
      ])].sort();
      const mergedCapsules = mergedCapsuleIds
        .map(id => id === capsule.id ? capsule : capsulesById.get(id))
        .filter(Boolean);
      const summary = await topicClient.summarize({
        capsules: mergedCapsules,
        existingSummary: existing?.summary || '',
        signal
      });
      const topicSummary = {
        id: existing?.id || createId('topic-summary'),
        topic: summary.topic,
        summary: summary.summary,
        sourceCapsuleIds: mergedCapsuleIds,
        sourceRefs: sourceRefsFor(mergedCapsules),
        claimType: 'derived-summary',
        updatedAt: now()
      };
      replaceMemoryState({
        ...memoryState,
        longTermTopicSummaries: [
          ...asArray(memoryState.longTermTopicSummaries)
            .filter(item => !overlapping.some(match => match.id === item.id)),
          topicSummary
        ],
        resolvedTopicSummaryIds: [
          ...new Set([
            ...asArray(memoryState.resolvedTopicSummaryIds).map(String),
            ...overlapping.filter(item => item.id !== topicSummary.id).map(item => String(item.id))
          ])
        ]
      });
      return { updated: true, topicSummaryId: topicSummary.id };
    }
  };
}
