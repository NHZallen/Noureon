// The state the parts of the application shell share (legacy-core.js): who is signed in, the files waiting to be sent, the reply being
// made, the open dialogs' subjects… One object, handed to each lifecycle as its `state`, instead of a hand-written copy of getters per
// lifecycle. The settings, the conversations and the other workspace data stay in their stores; here they are only reachable by name.

export function createShellState({ configAccess, conversations, appDataStore, conversationStateAccess }) {
    const state = {
        currentUser: null,
        abortController: null,
        isCouncilRunning: false,
        isSelectionMode: false,
        selectedConversationIds: new Set(),
        uploadedFiles: [],
        quoteReference: null,
        sendConfirmed: false,
        sidebarOpen: false,
        editingAstrasId: null,
        currentSpeechRecognition: null,
        currentVoiceTarget: null,
        modelPieChart: null,
        timeDistChart: null,
        cropperInstance: null,
        messageObserver: null,
        currentStoreCategory: 'all',
        editingAstraForAvatarId: null,
        isAutoScrolling: false
    };
    return Object.defineProperties(state, {
        config: { get: () => configAccess.getConfig(), set: (next) => configAccess.replaceConfig(next) },
        conversations: { get: () => conversations.getConversations(), set: (next) => conversations.replaceConversations(next) },
        folders: { get: () => appDataStore.getFolders(), set: (next) => appDataStore.replaceFolders(next) },
        astras: { get: () => appDataStore.getAstras(), set: (next) => appDataStore.replaceAstras(next) },
        personalMemories: { get: () => appDataStore.getPersonalMemories(), set: (next) => appDataStore.replacePersonalMemories(next) },
        memoryState: { get: () => appDataStore.getMemoryState() },
        conversationStateAccess: { get: () => conversationStateAccess }
    });
}
