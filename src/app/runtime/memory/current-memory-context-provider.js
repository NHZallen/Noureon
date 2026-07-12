import { buildMemoryContext } from './memory-context-builder.js';

const asArray = value => Array.isArray(value) ? value : [];

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
      profileEntries: config.memoryProfileEnabled === false
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
