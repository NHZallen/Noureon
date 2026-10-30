// The workspace features of the chat page: the search, the uploads and the sidebar; the batch actions, the import and export and the
// voice input; the dashboard, made the first time it is used; the warning on the API key; the
// closing of popovers and the copy to the clipboard. Made once by the application shell (shell.js), which hands in what they use.

import { createBatchImportVoiceLifecycle } from './batch-import-voice-lifecycle.js';
import { createSearchUploadSidebarLifecycle } from './search-upload-sidebar-lifecycle.js';
import { createApiKeyWarningBadgeUpdater } from './api-key-warning-badge.js';
import { createLazyFunctions } from '../kernel/lazy-functions.js';
import { getNotesMemory, setMemoryModelRunner } from '../memory-store/memory-ref.js';

export function createWorkspaceFeatures({
    window, document, navigator, fetch, File, FileReader: FileReaderCtor, Image: ImageCtor, URL, Event,
    Chart, loadArchiveVendor, requestAnimationFrame, setTimeout, clearTimeout, crypto, console = globalThis.console,
    elements: ALL_ELEMENTS, i18n, models: MODELS,
    runtimeConfigAccess, runtimeAppDataStore, liveConversationsBridge, runtimeStorageAdapter = null, runtimeDialogCoordinator,
    conversationStateAccess,
    // Who is signed in, the files waiting to be sent, the sidebar and the batch selection (shell/shell-state.js).
    session, uploads, sidebar, selection,
    // Functions made after these features (the page features, the start of the page): each is called only once the page runs.
    updateInputState, setupSettingsModal, initChatApp, applyUiTheme, applyLanguage, setupTimeAnalysis,
    getSensitiveApiKeys, mergeSensitiveApiKeys, saveSensitiveConfig, saveConfig, saveAppData,
    showNotification, showCustomConfirm, showCustomPrompt, toggleModal, toggleSelectionMode,
    escapeHTML, renderUserText, renderMarkdownWithFormulas,
    startNewChat, loadChat, getActiveConversation, moveConversationToFolder, createNewFolder,
    normalizeConversationModel, isCouncilEnabled, modelSupportsVision, getCouncilValidation, getApiKeyForProvider,
    // The store of generated images (generated-image-runtime.js), loaded when first needed.
    getGeneratedImageRuntime,
    runMemoryModel = null, callApiWithSchema, getOutputMode, hashString, constantTimeEqual,
    processInChunks, getBackupUsername, createPasswordRecord, getUserKey, setItem,
    logger = console
}) {
    const getConfig = () => runtimeConfigAccess.getConfig();
    const getConversations = () => liveConversationsBridge.getConversations();
    // The speech recognition of the voice input running now, and the chart of the dashboard drawn last.
    let currentSpeechRecognition = null;
    let modelPieChart = null;

    const resolveUploadUpdateInputState = (...args) => updateInputState(...args);

    const searchUploadSidebarLifecycle = createSearchUploadSidebarLifecycle({
        window,
        document,
        navigator,
        fetch,
        File,
        FileReaderCtor,
        ImageCtor,
        elements: ALL_ELEMENTS,
        getConfig,
        getConversations,
        getUploadedFiles: uploads.getUploadedFiles,
        setUploadedFiles: uploads.setUploadedFiles,
        getSidebarOpen: sidebar.isSidebarOpen,
        setSidebarOpen: sidebar.setSidebarOpen,
        escapeHTML,
        renderUserText,
        renderMarkdownWithFormulas,
        loadChat,
        toggleModal,
        callApiWithSchema,
        resolveUploadUpdateInputState,
        i18n,
        randomUUID: () => crypto.randomUUID(),
        scheduleTimeout: (...args) => setTimeout(...args),
        clearScheduledTimeout: (...args) => clearTimeout(...args),
        logger
    });

    const {
        performSearchAndRenderResults,
        generateSearchKeywords,
        calculateRelevanceScores,
        renderFilePreviews,
        removeFile,
        handleFileSelection,
        toggleSidebar
    } = searchUploadSidebarLifecycle;

    const batchImportVoiceLifecycle = createBatchImportVoiceLifecycle({
        window,
        document,
        navigator,
        URL,
        File,
        loadArchiveVendor,
        elements: ALL_ELEMENTS,
        setupSettingsModal,
        initChatApp,
        runtimeStorageAdapter,
        getConfig,
        getSensitiveApiKeys,
        mutateConfig: (mutator) => {
            if (typeof mutator === 'function') return mutator(getConfig());
            Object.assign(getConfig(), mutator);
            return getConfig();
        },
        mergeSensitiveApiKeys,
        getCurrentUser: session.getCurrentUser,
        setCurrentUser: session.setCurrentUser,
        getConversations,
        getFolders: () => runtimeAppDataStore.getFolders(),
        getAstras: () => runtimeAppDataStore.getAstras(),
        getPersonalMemories: () => runtimeAppDataStore.getPersonalMemories(),
        replaceAllAppData: (nextAppData) => runtimeAppDataStore.replaceAll(nextAppData),
        replaceFolders: (nextFolders) => runtimeAppDataStore.replaceFolders(nextFolders),
        replacePersonalMemories: (nextPersonalMemories) => runtimeAppDataStore.replacePersonalMemories(nextPersonalMemories),
        getSelectedConversationIds: selection.getSelectedConversationIds,
        conversationStateAccess,
        runtimeDialogCoordinator,
        saveAppData,
        saveConfig,
        saveSensitiveConfig,
        toggleSelectionMode,
        toggleModal,
        showNotification,
        showCustomConfirm,
        showCustomPrompt,
        moveConversationToFolder,
        createNewFolder,
        startNewChat,
        processInChunks,
        getBackupUsername,
        createPasswordRecord,
        getUserKey,
        setItem,
        hashString,
        constantTimeEqual,
        requestAnimationFrame,
        applyUiTheme,
        applyLanguage,
        loadChat,
        getOutputMode,
        resolveUploadUpdateInputState,
        performSearchAndRenderResults,
        getCurrentSpeechRecognition: () => currentSpeechRecognition,
        setCurrentSpeechRecognition: (nextRecognition) => (currentSpeechRecognition = nextRecognition),
        i18n,
        randomUUID: () => crypto.randomUUID(),
        getGeneratedImageBlob: async descriptor => (await getGeneratedImageRuntime()).assetStore.getBlob(descriptor),
        saveGeneratedImageBlob: async (descriptor, blob) => {
            await (await getGeneratedImageRuntime()).assetStore.put(descriptor, blob);
        },
        scheduleTimeout: (callback, ms) => setTimeout(callback, ms),
        delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        logger
    });

    const {
        handleBatchDelete,
        handleBatchArchive,
        handleBatchMove,
        renderBatchMoveModal,
        batchMoveToFolder,
        handleExport,
        performImport,
        handleImport,
        handleImportOnAuth,
        processAuthImport,
        setupVoiceInput,
        toggleVoiceInput
    } = batchImportVoiceLifecycle;

    // The memory of notes reads the old conversations with the same small-request runner (memory-store/page-rebuild.js).
    setMemoryModelRunner((...args) => runMemoryModel(...args));

    const updateApiKeyWarningBadge = createApiKeyWarningBadgeUpdater({
        elements: ALL_ELEMENTS, getActiveConversation, normalizeConversationModel, isCouncilEnabled, getCouncilValidation, getApiKeyForProvider
    });
    // What the memory of notes learns from a turn (memory-store/page-curator.js), loaded the first time a reply is finished.
    const learnFromTurn = (conversation) => import('../memory-store/page-curator.js').then(({ curateNotesTurn }) => curateNotesTurn({ conversation, getConfig, getMemory: getNotesMemory, runMemoryModel, models: MODELS, getApiKeyForProvider, saveAppData, document }));
    // The dashboard loads the first time it is opened.
    const {
        openDashboard,
        renderDashboardStats,
        renderModelUsageChart
    } = createLazyFunctions(() => import('./dashboard-lifecycle.js').then(({ createDashboardLifecycle }) => createDashboardLifecycle({
        Chart,
        document,
        elements: ALL_ELEMENTS,
        getConfig,
        getConversations,
        getFolders: () => runtimeAppDataStore.getFolders(),
        getModelPieChart: () => modelPieChart,
        setModelPieChart: (chart) => {
            modelPieChart = chart;
        },
        models: MODELS,
        i18n,
        toggleModal,
        setupTimeAnalysis
    })), ['openDashboard', 'renderDashboardStats', 'renderModelUsageChart']);

    function closeAllPopovers() {
        document.querySelectorAll('.popover.visible').forEach(popover => {
            popover.classList.remove('visible');
        });
        // The model and thinking buttons stay highlighted while they read as expanded.
        document.querySelectorAll('#model-council-control .mp-trigger[aria-expanded="true"]').forEach(trigger => {
            trigger.setAttribute('aria-expanded', 'false');
        });
    }

    async function copyTextToClipboard(text) {
        if (navigator.clipboard && window.isSecureContext) {
            try {
                await navigator.clipboard.writeText(text);
                return;
            } catch (err) {
                console.warn('Clipboard API failed; falling back to execCommand.', err);
            }
        }
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.top = '-9999px';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            const successful = document.execCommand('copy');
            if (!successful) {
                throw new Error('Fallback copy command failed.');
            }
        } catch (err) {
            document.body.removeChild(textArea);
            throw err;
        }
        document.body.removeChild(textArea);
    }

    return {
        learnFromTurn,
        updateApiKeyWarningBadge,
        openDashboard,
        renderDashboardStats,
        renderModelUsageChart,
        performSearchAndRenderResults,
        generateSearchKeywords,
        calculateRelevanceScores,
        renderFilePreviews,
        removeFile,
        handleFileSelection,
        toggleSidebar,
        handleBatchDelete,
        handleBatchArchive,
        handleBatchMove,
        renderBatchMoveModal,
        batchMoveToFolder,
        handleExport,
        performImport,
        handleImport,
        handleImportOnAuth,
        processAuthImport,
        setupVoiceInput,
        toggleVoiceInput,
        closeAllPopovers,
        copyTextToClipboard
    };
}
