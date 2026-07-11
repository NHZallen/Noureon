const normalizeKeyword = value => String(value || '')
  .trim()
  .replace(/[。！？.!?]+$/u, '');

const capsuleText = capsule => [
  capsule?.summary,
  ...(capsule?.confirmedDecisions || []),
  ...(capsule?.openQuestions || [])
].filter(Boolean).join('\n');

export function createHistoryIndexingService({
  index,
  embeddingClient,
  persistence = null
} = {}) {
  if (typeof index?.getAll !== 'function' || typeof index?.put !== 'function') {
    throw new TypeError('History indexing requires a history index store.');
  }
  if (typeof embeddingClient?.embedHistoryDocument !== 'function') {
    throw new TypeError('History indexing requires embedHistoryDocument.');
  }

  return {
    async indexCapsule({ capsule, sourceHash } = {}) {
      if (!capsule?.id || !capsule?.conversationId) throw new TypeError('History indexing requires a conversation capsule.');
      if (!sourceHash) throw new TypeError('History indexing requires sourceHash.');
      const recordId = `capsule:${capsule.id}`;
      const existing = index.getAll().find(record => record.recordId === recordId);
      if (existing?.sourceHash === sourceHash) return { indexed: false, reason: 'unchanged-source' };
      const text = capsuleText(capsule);
      const vector = await embeddingClient.embedHistoryDocument({ title: capsule.topic, text });
      const normalizedKeywords = [
        capsule.topic,
        capsule.summary,
        ...(capsule.confirmedDecisions || [])
      ].map(normalizeKeyword).filter(Boolean);
      index.put({
        recordId,
        recordType: 'conversation-capsule',
        conversationId: capsule.conversationId,
        capsuleId: capsule.id,
        sourceHash,
        vector,
        normalizedKeywords,
        entities: [],
        updatedAt: capsule.updatedAt || null
      });
      if (persistence?.save) await persistence.save();
      return { indexed: true, recordId };
    }
  };
}
