export function createLegacyRuntimeAppDataStore({
  initialConversations = [],
  initialFolders = [],
  initialAstras = [],
  initialPersonalMemories = []
} = {}) {
  let conversations = initialConversations;
  let folders = initialFolders;
  let astras = initialAstras;
  let personalMemories = initialPersonalMemories;

  function getSnapshot() {
    return {
      conversations,
      folders,
      astras,
      personalMemories
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

    replaceAll: ({
      conversations: nextConversations,
      folders: nextFolders,
      astras: nextAstras,
      personalMemories: nextPersonalMemories
    }) => {
      conversations = nextConversations;
      folders = nextFolders;
      astras = nextAstras;
      personalMemories = nextPersonalMemories;
      return getSnapshot();
    },

    getSnapshot
  };
}
