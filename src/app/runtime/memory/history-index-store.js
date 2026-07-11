const normalizeTerms = (values) => new Set((values || [])
  .map(value => String(value || '').trim().toLocaleLowerCase())
  .filter(Boolean));

const cosineSimilarity = (left = [], right = []) => {
  if (!left.length || left.length !== right.length) return 0;
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] ** 2;
    rightMagnitude += right[index] ** 2;
  }
  if (!leftMagnitude || !rightMagnitude) return 0;
  return dot / Math.sqrt(leftMagnitude * rightMagnitude);
};

const overlapScore = (queryTerms, recordTerms) => {
  if (!queryTerms.size) return 0;
  let matches = 0;
  for (const term of queryTerms) if (recordTerms.has(term)) matches += 1;
  return matches / queryTerms.size;
};

export function createHistoryIndexStore() {
  const records = new Map();

  function put(record = {}) {
    if (!record.recordId) throw new TypeError('History index records require recordId.');
    const normalized = {
      ...record,
      vector: [...(record.vector || [])],
      normalizedKeywords: [...normalizeTerms(record.normalizedKeywords)],
      entities: [...normalizeTerms(record.entities)]
    };
    records.set(normalized.recordId, normalized);
    return normalized;
  }

  return {
    put,
    getAll: () => [...records.values()],
    removeConversation(conversationId) {
      for (const [recordId, record] of records) {
        if (record.conversationId === conversationId) records.delete(recordId);
      }
    },
    removeSource({ conversationId, sourceHash } = {}) {
      for (const [recordId, record] of records) {
        if (record.conversationId === conversationId && record.sourceHash === sourceHash) {
          records.delete(recordId);
        }
      }
    },
    clear() {
      records.clear();
    },
    queryHybrid({ vector, keywords, entities, excludeConversationId, limit = 5 } = {}) {
      const queryKeywords = normalizeTerms(keywords);
      const queryEntities = normalizeTerms(entities);
      return [...records.values()]
        .filter(record => record.conversationId !== excludeConversationId)
        .map(record => ({
          ...record,
          score: (cosineSimilarity(vector, record.vector) * 0.8)
            + (overlapScore(queryKeywords, normalizeTerms(record.normalizedKeywords)) * 0.1)
            + (overlapScore(queryEntities, normalizeTerms(record.entities)) * 0.1)
        }))
        .sort((left, right) => right.score - left.score)
        .slice(0, limit);
    }
  };
}
