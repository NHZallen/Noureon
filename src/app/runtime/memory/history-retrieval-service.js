import { resolveHistoryQuery } from './history-query-resolver.js';

const TOKEN_PATTERN = /[\p{L}\p{N}_-]{2,}/gu;
const STOP_WORDS = new Set([
  '可以', '這個', '那個', '我們', '你們', '他們', '一下', '怎麼', '為什麼',
  'which', 'what', 'when', 'where', 'with', 'from', 'that', 'this', 'about', 'please'
]);

const asArray = value => Array.isArray(value) ? value : [];

const EXACT_RECALL_PATTERNS = [
  /(?:之前|上次|先前|原本|以前|舊版|原版).{0,100}(?:完整|全文|原文|一樣|相同|同一份|照舊|不要改|不變)/u,
  /(?:完整|全文|原文).{0,100}(?:之前|上次|先前|原本|以前|舊版|原版)/u,
  /(?:same|exact|verbatim|unchanged|identical|full).{0,100}(?:previous|prior|last|earlier)/iu,
  /(?:previous|prior|last|earlier).{0,100}(?:same|exact|verbatim|unchanged|identical|full)/iu
];

const normalizeExactSubject = value => String(value || '')
  .replace(/^(?:那份|那個|這份|這個|關於|聊過的|討論過的)/u, '')
  .replace(/的$/u, '')
  .replace(/[，,。.!！?？]+$/u, '')
  .trim();

export function getExactHistoryRecallRequest(queryText = '') {
  const originalQuery = String(queryText || '').trim();
  if (!EXACT_RECALL_PATTERNS.some(pattern => pattern.test(originalQuery))) {
    return { exact: false, subject: '' };
  }
  const subjectMatch = originalQuery.match(
    /(?:之前|上次|先前|原本|以前|舊版|原版)\s*(.+?)(?:的)?(?:完整(?:食譜|內容|版本|資料)?|全文|原文)/u
  ) || originalQuery.match(
    /(?:之前|上次|先前|原本|以前|舊版|原版)\s*(.+?)(?:，|,|\s)*(?:一樣|相同|同一份|照舊|不要改|不變)/u
  );
  return {
    exact: true,
    subject: normalizeExactSubject(subjectMatch?.[1]).slice(0, 160)
  };
}

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

const recordText = record => [
  record?.snippet,
  ...asArray(record?.normalizedKeywords)
].join('\n').toLocaleLowerCase();

const resultFromMatch = ({ match, capsules, mediaMemories, matchMode = 'semantic' } = {}) => {
  if (match?.recordType === 'conversation-fragment') {
    if (!match.snippet) return null;
    return {
      recordId: match.recordId,
      conversationId: match.conversationId,
      summary: match.snippet,
      sourceIds: asArray(match.sourceIds),
      score: match.score,
      ...(matchMode === 'exact' ? { matchMode } : {})
    };
  }
  if (match?.recordType === 'media-memory') {
    const media = mediaMemories.find(item => item.id === match.mediaMemoryId);
    if (!media?.summary) return null;
    return {
      recordId: match.recordId,
      conversationId: media.conversationId,
      summary: `${media.kind || 'media'} (${media.name || 'attachment'}): ${media.summary}`,
      sourceIds: media.messageId ? [media.messageId] : [],
      score: match.score,
      ...(matchMode === 'exact' ? { matchMode } : {})
    };
  }
  const capsule = capsules.find(item => item.id === match?.capsuleId);
  if (!capsule?.summary) return null;
  return {
    recordId: match.recordId,
    conversationId: capsule.conversationId,
    summary: capsule.summary,
    sourceIds: sourceIdsForCapsule(capsule),
    score: match.score,
    ...(matchMode === 'exact' ? { matchMode } : {})
  };
};

const takeWithinCharacterBudget = (results, maxCharacters) => {
  let usedCharacters = 0;
  return results.filter(result => {
    if (usedCharacters >= maxCharacters || usedCharacters + result.summary.length > maxCharacters) return false;
    usedCharacters += result.summary.length;
    return true;
  });
};

const isAssistantMessage = message => message?.role === 'model' || message?.role === 'assistant';
const formatHistoryTurn = message => `${isAssistantMessage(message) ? 'Assistant' : 'User'}: ${getMessageText(message)}`.trim();

// Exact requests have a stronger, cheaper path than semantic recall: the
// complete local conversations are the source of truth. It also keeps exact
// recall useful when an older chat has not yet received a detailed fragment
// index (or is waiting for an index repair).
const retrieveExactConversationTurns = ({
  conversations = [],
  currentConversationId,
  subject,
  maxCharacters
} = {}) => {
  const normalizedSubject = String(subject || '').toLocaleLowerCase();
  if (!normalizedSubject) return [];
  const candidates = asArray(conversations)
    .filter(item => item?.id && item.id !== currentConversationId && !item.deletedAt && !item.isTemporary)
    .map(conversation => {
      const messages = asArray(conversation.messages).filter(message => getMessageText(message));
      const searchableText = [conversation.title, ...messages.map(getMessageText)].join('\n').toLocaleLowerCase();
      return { conversation, messages, searchableText };
    })
    .filter(item => item.searchableText.includes(normalizedSubject))
    .sort((left, right) => (
      (Date.parse(right.conversation.lastUpdatedAt || right.conversation.createdAt || '') || 0)
      - (Date.parse(left.conversation.lastUpdatedAt || left.conversation.createdAt || '') || 0)
    ));
  const selected = candidates[0];
  if (!selected) return [];

  const matchedIndex = selected.messages.findIndex(message => (
    getMessageText(message).toLocaleLowerCase().includes(normalizedSubject)
  ));
  const anchorIndex = matchedIndex >= 0 ? matchedIndex : Math.max(0, selected.messages.length - 1);
  let startIndex = anchorIndex;
  if (isAssistantMessage(selected.messages[startIndex]) && selected.messages[startIndex - 1]?.role === 'user') {
    startIndex -= 1;
  }
  let endIndex = anchorIndex + 1;
  while (endIndex < selected.messages.length && isAssistantMessage(selected.messages[endIndex])) endIndex += 1;
  const turns = selected.messages.slice(startIndex, endIndex);
  const results = turns.map((message, index) => ({
    recordId: `exact:${selected.conversation.id}:${startIndex + index}`,
    conversationId: selected.conversation.id,
    summary: formatHistoryTurn(message),
    sourceIds: message.id ? [message.id] : [],
    matchMode: 'exact'
  }));
  return takeWithinCharacterBudget(results, maxCharacters);
};

export function createHistoryRetrievalService({
  index,
  embeddingClient,
  getMemoryState,
  getConversations = () => [],
  resolveQuery = resolveHistoryQuery,
  modelQueryResolver = null,
  minimumScore = 0.45,
  candidateLimit = 24,
  maxResults = Infinity,
  maxCharacters = 6000,
  exactMaxCharacters = 16000
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

      const exactRequest = getExactHistoryRecallRequest(query.originalQuery);
      if (exactRequest.exact) {
        const exactConversationTurns = retrieveExactConversationTurns({
          conversations: getConversations(),
          currentConversationId: conversation.id,
          subject: exactRequest.subject,
          maxCharacters: exactMaxCharacters
        });
        if (exactConversationTurns.length > 0) return exactConversationTurns;
      }
      // For an explicit "same as before" request, embed the thing the user
      // wants to recover (for example, "chocolate pie"), not the instruction
      // words surrounding it. That makes short named recipes, commands, and
      // documents much less likely to lose to a broad semantic match.
      const retrievalQuery = exactRequest.subject || query.resolvedQuery;
      const keywords = extractHistoryTerms(retrievalQuery);
      const vector = await embeddingClient.embedHistoryQuery(retrievalQuery);
      const matches = index.queryHybrid({
        vector,
        keywords,
        entities: keywords,
        excludeConversationId: conversation.id,
        limit: candidateLimit
      });
      const capsules = asArray(getMemoryState()?.conversationCapsules);
      const mediaMemories = asArray(getMemoryState()?.mediaMemories);

      if (exactRequest.exact) {
        const allRecords = typeof index.getAll === 'function' ? index.getAll() : matches;
        const normalizedSubject = exactRequest.subject.toLocaleLowerCase();
        const directFragmentMatches = allRecords
          .filter(record => record?.recordType === 'conversation-fragment')
          .filter(record => record.conversationId !== conversation.id)
          .filter(record => !normalizedSubject || recordText(record).includes(normalizedSubject));
        const semanticFragmentMatches = matches
          .filter(record => record?.recordType === 'conversation-fragment')
          .filter(record => record.score >= Math.min(minimumScore, 0.3));
        const rankedFragments = [...directFragmentMatches, ...semanticFragmentMatches]
          .filter((record, index, records) => records.findIndex(item => item.recordId === record.recordId) === index)
          .sort((left, right) => {
            const directDifference = Number(recordText(right).includes(normalizedSubject))
              - Number(recordText(left).includes(normalizedSubject));
            if (directDifference) return directDifference;
            const updatedDifference = (Date.parse(right.updatedAt || '') || 0) - (Date.parse(left.updatedAt || '') || 0);
            return updatedDifference || (right.score || 0) - (left.score || 0);
          });
        const selectedConversationId = rankedFragments[0]?.conversationId;
        if (selectedConversationId) {
          const sourceFragments = allRecords
            .filter(record => record?.recordType === 'conversation-fragment')
            .filter(record => record.conversationId === selectedConversationId)
            .sort((left, right) => (left.fragmentIndex || 0) - (right.fragmentIndex || 0));
          const exactResults = sourceFragments
            .map(match => resultFromMatch({ match, capsules, mediaMemories, matchMode: 'exact' }))
            .filter(Boolean);
          if (exactResults.length > 0) {
            return takeWithinCharacterBudget(exactResults, exactMaxCharacters);
          }
        }
      }

      const results = matches
        .filter(match => match.score >= minimumScore)
        .map(match => resultFromMatch({ match, capsules, mediaMemories }))
        .filter(Boolean);
      return takeWithinCharacterBudget(results, maxCharacters).slice(0, maxResults);
    }
  };
}
