export function createRuntimeAppDataStore({
  initialConversations = [],
  initialFolders = [],
  initialAstras = [],
  initialPersonalMemories = [],
  initialMemoryState = null
} = {}) {
  let conversations = initialConversations;
  let folders = initialFolders;
  let astras = initialAstras;
  let personalMemories = initialPersonalMemories;
  // The old memory summary was kept here; it is not used any more and starts empty (the notes of the memory are in memory-store/).
  let memoryState = initialMemoryState || {};

  function getSnapshot() {
    return {
      conversations,
      folders,
      astras,
      personalMemories,
      memoryState
    };
  }

  return {
    getConversations: () => conversations,
    replaceConversations: (nextConversations) => {
      conversations = nextConversations;
      return conversations;
    },

    getFolders: () => folders,
    replaceFolders: (nextFolders) => {
      folders = nextFolders;
      return folders;
    },

    getAstras: () => astras,
    replaceAstras: (nextAstras) => {
      astras = nextAstras;
      return astras;
    },

    getPersonalMemories: () => personalMemories,
    replacePersonalMemories: (nextPersonalMemories) => {
      personalMemories = nextPersonalMemories;
      return personalMemories;
    },

    getMemoryState: () => memoryState,
    replaceMemoryState: (nextMemoryState) => {
      memoryState = nextMemoryState;
      return memoryState;
    },

    replaceAll: ({
      conversations: nextConversations,
      folders: nextFolders,
      astras: nextAstras,
      personalMemories: nextPersonalMemories,
      memoryState: nextMemoryState = memoryState
    }) => {
      conversations = nextConversations;
      folders = nextFolders;
      astras = nextAstras;
      personalMemories = nextPersonalMemories;
      memoryState = nextMemoryState;
      return getSnapshot();
    },

    getSnapshot
  };
}
