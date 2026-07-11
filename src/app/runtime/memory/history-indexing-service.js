const normalizeKeyword = value => String(value || '')
  .trim()
  .replace(/[。！？.!?]+$/u, '');

const capsuleText = capsule => [
  capsule?.summary,
  ...(capsule?.confirmedDecisions || []),
  ...(capsule?.openQuestions || [])
].filter(Boolean).join('\n');

const supportsMultimodalEmbedding = mimeType => new Set([
  'image/png', 'image/jpeg',
  'audio/mpeg', 'audio/mp3', 'audio/wav',
  'video/mp4', 'video/quicktime',
  'application/pdf'
]).has(String(mimeType || '').toLowerCase());

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
    },
    async indexMediaMemory({ mediaMemory, attachment } = {}) {
      if (!mediaMemory?.id || !mediaMemory?.conversationId || !mediaMemory?.sourceHash) {
        throw new TypeError('Media indexing requires a persisted media memory.');
      }
      const recordId = `media:${mediaMemory.id}`;
      const existing = index.getAll().find(record => record.recordId === recordId);
      if (existing?.sourceHash === mediaMemory.sourceHash) return { indexed: false, reason: 'unchanged-source' };
      let vector;
      let embeddingMode = 'multimodal';
      try {
        if (!supportsMultimodalEmbedding(attachment?.mimeType)) throw new Error('unsupported-media-embedding');
        vector = await embeddingClient.embedMedia({
          mimeType: attachment?.mimeType,
          data: attachment?.data,
          name: attachment?.name || mediaMemory.name,
          size: attachment?.size
        });
      } catch {
        embeddingMode = 'text-fallback';
        vector = await embeddingClient.embedHistoryDocument({
          title: mediaMemory.name,
          text: [mediaMemory.summary, ...(mediaMemory.keyFacts || [])].filter(Boolean).join('\n')
        });
      }
      index.put({
        recordId,
        recordType: 'media-memory',
        conversationId: mediaMemory.conversationId,
        mediaMemoryId: mediaMemory.id,
        sourceHash: mediaMemory.sourceHash,
        vector,
        embeddingMode,
        normalizedKeywords: [mediaMemory.name, mediaMemory.summary, ...(mediaMemory.keyFacts || [])].filter(Boolean),
        entities: [],
        updatedAt: mediaMemory.createdAt || null
      });
      if (persistence?.save) await persistence.save();
      return { indexed: true, recordId, embeddingMode };
    }
  };
}
