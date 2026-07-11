import { buildMemoryContext } from './memory-context-builder.js';

export function createCurrentMemoryContextProvider({ getMemoryState } = {}) {
  if (typeof getMemoryState !== 'function') {
    throw new TypeError('Current memory context provider requires getMemoryState.');
  }

  return function getMemoryContext({ config = {}, conversation = {} } = {}) {
    const memoryState = getMemoryState() || {};
    return buildMemoryContext({
      currentChatSummary: conversation.recentTurnSummary || '',
      profileEntries: config.memoryProfileEnabled === false
        ? []
        : memoryState.profileEntries,
      suppressionRules: memoryState.suppressionRules
    });
  };
}
