import { resolveHistoryQuery } from './history-query-resolver.js';

const TOKEN_PATTERN = /[\p{L}\p{N}_-]{2,}/gu;
const STOP_WORDS = new Set([
  '可以', '這個', '那個', '我們', '你們', '他們', '一下', '怎麼', '為什麼',
  'which', 'what', 'when', 'where', 'with', 'from', 'that', 'this', 'about', 'please'
]);

const asArray = value => Array.isArray(value) ? value : [];

export const getMessageText = message => asArray(message?.parts)
  .map(part => String(part?.text || '').trim())
  .filter(Boolean)
  .join('\n');

export const extractHistoryTerms = text => [...new Set(
  (String(text || '').match(TOKEN_PATTERN) || [])
    .map(term => term.toLocaleLowerCase())
    .filter(term => !STOP_WORDS.has(term))
)];

const getConversationContext = conversation => {
  const messages = asArray(conversation?.messages);
  const assistantMessages = messages.filter(message => message?.role === 'model' || message?.role === 'assistant');
  const numberedReferences = assistantMessages
    .slice(-1)
    .flatMap(message => getMessageText(message).split(/\r?\n/u))
    .map((text, index) => ({ number: index + 1, text: text.trim() }))
    .filter(item => item.text);

  return {
    currentTopic: String(conversation?.title || ''),
    numberedReferences,
    recentMessages: messages.slice(-6).map(getMessageText).filter(Boolean)
  };
};

const sourceIdsForCapsule = capsule => asArray(capsule?.sourceRefs)
  .map(source => source?.messageId)
  .filter(Boolean);

export function createHistoryRetrievalService({
  index,
  embeddingClient,
  getMemoryState,
  resolveQuery = resolveHistoryQuery,
  modelQueryResolver = null,
  minimumScore = 0.45,
  limit = 3
} = {}) {
  if (typeof index?.queryHybrid !== 'function') {
    throw new TypeError('History retrieval requires a history index store.');
  }
  if (typeof embeddingClient?.embedHistoryQuery !== 'function') {
    throw new TypeError('History retrieval requires embedHistoryQuery.');
  }
  if (typeof getMemoryState !== 'function') {
    throw new TypeError('History retrieval requires getMemoryState.');
  }

  return {
    async retrieve({ currentMessage, conversation = {} } = {}) {
      let query = await resolveQuery({
        queryText: getMessageText(currentMessage),
        conversationContext: getConversationContext(conversation),
        allowModelResolution: Boolean(modelQueryResolver?.resolve)
      });
      if (query.resolutionMethod === 'model-resolution-needed' && typeof modelQueryResolver?.resolve === 'function') {
        const modelResult = await modelQueryResolver.resolve({
          queryText: query.originalQuery,
          conversationContext: getConversationContext(conversation)
        });
        query = {
          ...query,
          resolvedQuery: modelResult.resolvedQuery,
          confidence: modelResult.confidence,
          shouldRetrieve: modelResult.shouldRetrieve && modelResult.confidence >= 0.7,
          resolutionMethod: 'model-fallback'
        };
      }
      if (!query.shouldRetrieve || !query.resolvedQuery) return [];

      const keywords = extractHistoryTerms(query.resolvedQuery);
      const vector = await embeddingClient.embedHistoryQuery(query.resolvedQuery);
      const matches = index.queryHybrid({
        vector,
        keywords,
        entities: keywords,
        excludeConversationId: conversation.id,
        limit
      });
      const capsules = asArray(getMemoryState()?.conversationCapsules);
      const mediaMemories = asArray(getMemoryState()?.mediaMemories);

      return matches
        .filter(match => match.score >= minimumScore)
        .map(match => {
          if (match.recordType === 'media-memory') {
            const media = mediaMemories.find(item => item.id === match.mediaMemoryId);
            if (!media?.summary) return null;
            return {
              recordId: match.recordId,
              summary: `${media.kind || 'media'} (${media.name || 'attachment'}): ${media.summary}`,
              sourceIds: media.messageId ? [media.messageId] : [],
              score: match.score
            };
          }
          const capsule = capsules.find(item => item.id === match.capsuleId);
          if (!capsule?.summary) return null;
          return {
            recordId: match.recordId,
            summary: capsule.summary,
            sourceIds: sourceIdsForCapsule(capsule),
            score: match.score
          };
        })
        .filter(Boolean);
    }
  };
}
