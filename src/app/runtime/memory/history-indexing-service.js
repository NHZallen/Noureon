const normalizeKeyword = value => String(value || '')
  .trim()
  .replace(/[。！？.!?]+$/u, '');

const capsuleText = capsule => [
  capsule?.summary,
  ...(capsule?.confirmedDecisions || []),
  ...(capsule?.openQuestions || [])
].filter(Boolean).join('\n');

const FRAGMENT_MAX_CHARACTERS = 1_800;

const turnLabel = role => role === 'user' ? 'User' : 'Assistant';

const textPieces = (text, maxCharacters) => {
  const value = String(text || '').trim();
  if (!value) return [];
  if (value.length <= maxCharacters) return [value];
  const pieces = [];
  let remaining = value;
  while (remaining.length > maxCharacters) {
    const boundary = Math.max(
      remaining.lastIndexOf('\n', maxCharacters),
      remaining.lastIndexOf(' ', maxCharacters)
    );
    const end = boundary > Math.floor(maxCharacters * 0.6) ? boundary : maxCharacters;
    pieces.push(remaining.slice(0, end).trim());
    remaining = remaining.slice(end).trim();
  }
  if (remaining) pieces.push(remaining);
  return pieces;
};

/**
 * Keep a small amount of verbatim conversational detail locally so a later
 * question can retrieve the relevant exchange rather than just a whole-chat
 * capsule. These fragments are never put into cloud memory sync.
 */
export function buildConversationFragments(turns = [], { maxCharacters = FRAGMENT_MAX_CHARACTERS } = {}) {
  const fragments = [];
  let lines = [];
  let sourceIds = [];
  let length = 0;
  const flush = () => {
    const text = lines.join('\n').trim();
    if (!text) return;
    fragments.push({ text, sourceIds: [...new Set(sourceIds)] });
    lines = [];
    sourceIds = [];
    length = 0;
  };

  for (const turn of turns) {
    const id = String(turn?.id || '').trim();
    const prefix = `${turnLabel(turn?.role)}: `;
    for (const piece of textPieces(turn?.text, Math.max(240, maxCharacters - prefix.length))) {
      const line = `${prefix}${piece}`;
      if (lines.length > 0 && length + line.length + 1 > maxCharacters) flush();
      lines.push(line);
      if (id) sourceIds.push(id);
      length += line.length + 1;
    }
  }
  flush();
  return fragments;
}

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
  if (typeof index?.getAll !== 'function' || typeof index?.put !== 'function' || typeof index?.removeRecord !== 'function') {
    throw new TypeError('History indexing requires a history index store.');
  }
  if (typeof embeddingClient?.embedHistoryDocument !== 'function') {
    throw new TypeError('History indexing requires embedHistoryDocument.');
  }

  return {
    async indexCapsule({ capsule, sourceHash } = {}) {
      if (!capsule?.id || !capsule?.conversationId) throw new TypeError('History indexing requires a conversation capsule.');
      if (!sourceHash) throw new TypeError('History indexing requires sourceHash.');
      const recordId = `capsule:${capsule.conversationId}`;
      const staleRecords = index.getAll().filter(record => record.recordType === 'conversation-capsule'
        && record.conversationId === capsule.conversationId
        && record.recordId !== recordId);
      staleRecords.forEach(record => index.removeRecord(record.recordId));
      const existing = index.getAll().find(record => record.recordId === recordId);
      if (existing?.sourceHash === sourceHash) {
        if (staleRecords.length > 0 && persistence?.save) await persistence.save();
        return { indexed: false, reason: 'unchanged-source' };
      }
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
    async indexConversationFragments({ conversationId, turns = [], sourceHash, updatedAt = null } = {}) {
      if (!conversationId) throw new TypeError('History fragment indexing requires a conversationId.');
      if (!sourceHash) throw new TypeError('History fragment indexing requires sourceHash.');
      const fragments = buildConversationFragments(turns);
      const prefix = `fragment:${conversationId}:`;
      const expectedIds = new Set(fragments.map((_fragment, index) => `${prefix}${index}`));
      const existing = index.getAll().filter(record => (
        record.recordType === 'conversation-fragment' && record.conversationId === conversationId
      ));
      if (existing.length === fragments.length && existing.every(record => (
        record.sourceHash === sourceHash && expectedIds.has(record.recordId)
      ))) {
        return { indexed: false, reason: 'unchanged-source', count: fragments.length };
      }
      existing.forEach(record => index.removeRecord(record.recordId));
      for (const [fragmentIndex, fragment] of fragments.entries()) {
        const vector = await embeddingClient.embedHistoryDocument({
          title: `Conversation detail ${fragmentIndex + 1}`,
          text: fragment.text
        });
        index.put({
          recordId: `${prefix}${fragmentIndex}`,
          recordType: 'conversation-fragment',
          conversationId,
          fragmentIndex,
          sourceHash,
          vector,
          normalizedKeywords: [fragment.text],
          entities: [],
          snippet: fragment.text,
          sourceIds: fragment.sourceIds,
          updatedAt
        });
      }
      if (persistence?.save) await persistence.save();
      return { indexed: true, count: fragments.length };
    },
    async indexMediaMemory({ mediaMemory, attachment } = {}) {
      if (!mediaMemory?.id || !mediaMemory?.conversationId || !mediaMemory?.sourceHash) {
        throw new TypeError('Media indexing requires a persisted media memory.');
      }
      const recordId = `media:${mediaMemory.conversationId}:${mediaMemory.sourceHash}`;
      index.getAll()
        .filter(record => record.recordType === 'media-memory'
          && record.conversationId === mediaMemory.conversationId
          && record.sourceHash === mediaMemory.sourceHash
          && record.recordId !== recordId)
        .forEach(record => index.removeRecord(record.recordId));
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
