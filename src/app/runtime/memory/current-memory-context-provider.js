import { buildMemoryContext } from './memory-context-builder.js';

const asArray = value => Array.isArray(value) ? value : [];
const messageText = message => asArray(message?.parts)
  .map(part => String(part?.text || '').trim())
  .filter(Boolean)
  .join('\n');

export function createCurrentMemoryContextProvider({
  getMemoryState,
  retrieveHistory = null
} = {}) {
  if (typeof getMemoryState !== 'function') {
    throw new TypeError('Current memory context provider requires getMemoryState.');
  }

  return function getMemoryContext({ config = {}, conversation = {}, currentMessage } = {}) {
    const memoryState = getMemoryState() || {};
    const recentState = asArray(memoryState.recentConversationStates)
      .find(state => state?.conversationId === conversation.id);
    const buildContext = historyResults => buildMemoryContext({
      currentChatSummary: recentState?.recentTurnSummary || conversation.recentTurnSummary || '',
      memorySummary: memoryState.memorySummary || {},
      currentMessageText: messageText(currentMessage),
      // V2 profile rows can contain an older interpretation of the user. Once
      // the fresh summary exists, it is the single global-memory source that
      // may guide an answer; exact old details come from history retrieval.
      profileEntries: config.memoryProfileEnabled === false || memoryState.memorySummary
        ? []
        : memoryState.profileEntries,
      historyResults,
      suppressionRules: memoryState.suppressionRules
    });
    if (config.historyRecallEnabled !== true || typeof retrieveHistory !== 'function') {
      return buildContext([]);
    }
    return Promise.resolve(retrieveHistory({ currentMessage, conversation }))
      .then(results => buildContext(results))
      .catch(() => buildContext([]));
  };
}
