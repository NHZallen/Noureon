// The workspace features of the chat page: the search, the uploads and the sidebar; the batch actions, the import and export and the
// voice input; the memory (memory-runtime.js) and its dashboard, made the first time it is used; the warning on the API key; the
// closing of popovers and the copy to the clipboard. Made once by the application shell (legacy-core.js), which hands in what they use.

import { createLegacyBatchImportVoiceLifecycle } from './batch-import-voice-lifecycle.js';
import { createLegacySearchUploadSidebarLifecycle } from './search-upload-sidebar-lifecycle.js';
import { createApiKeyWarningBadgeUpdater } from './api-key-warning-badge.js';
import { createLazyFunctions } from '../kernel/lazy-functions.js';
import { createMemoryRuntime } from '../memory/memory-runtime.js';

export function createWorkspaceFeatures({
    window, document, navigator, fetch, File, FileReader: FileReaderCtor, Image: ImageCtor, URL, Event,
    Chart, loadArchiveVendor, requestAnimationFrame, setTimeout, clearTimeout, crypto, console = globalThis.console,
    elements: ALL_ELEMENTS, state, i18n, models: MODELS,
    runtimeAppDataStore, runtimeStorageAdapter = null, runtimeDialogCoordinator, conversationStateAccess,
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
    // The memory functions (memory-runtime.js, made further down), or null before.
    let memory = null;
    const getMemory = () => memory;

    const resolveUploadUpdateInputState = (...args) => updateInputState(...args);

    const searchUploadSidebarLifecycle = createLegacySearchUploadSidebarLifecycle({
        window,
        document,
        navigator,
        fetch,
        File,
        FileReaderCtor,
        ImageCtor,
        elements: ALL_ELEMENTS,
        getConfig: () => state.config,
        getConversations: () => state.conversations,
        getUploadedFiles: () => state.uploadedFiles,
        setUploadedFiles: (files) => {
            state.uploadedFiles = files;
            return state.uploadedFiles;
        },
        getSidebarOpen: () => state.sidebarOpen,
        setSidebarOpen: (nextSidebarOpen) => {
            state.sidebarOpen = nextSidebarOpen;
            return state.sidebarOpen;
        },
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

    const batchImportVoiceLifecycle = createLegacyBatchImportVoiceLifecycle({
        window,
        document,
        navigator,
        URL,
        File,
        loadArchiveVendor,
        elements: ALL_ELEMENTS,
        getMemory,
        setupSettingsModal,
        initChatApp,
        runtimeStorageAdapter,
        getConfig: () => state.config,
        getSensitiveApiKeys,
        mutateConfig: (mutator) => {
            if (typeof mutator === 'function') return mutator(state.config);
            Object.assign(state.config, mutator);
            return state.config;
        },
        mergeSensitiveApiKeys,
        getCurrentUser: () => state.currentUser,
        setCurrentUser: (nextUser) => {
            state.currentUser = nextUser;
            return state.currentUser;
        },
        getConversations: () => state.conversations,
        getFolders: () => state.folders,
        getAstras: () => state.astras,
        getPersonalMemories: () => state.personalMemories,
        replaceAllAppData: (nextAppData) => {
            const snapshot = runtimeAppDataStore.replaceAll(nextAppData);
            state.conversations = snapshot.conversations;
            state.folders = snapshot.folders;
            state.astras = snapshot.astras;
            state.personalMemories = snapshot.personalMemories;
            return snapshot;
        },
        replaceFolders: (nextFolders) => {
            state.folders = runtimeAppDataStore.replaceFolders(nextFolders);
            return state.folders;
        },
        replacePersonalMemories: (nextPersonalMemories) => {
            state.personalMemories = runtimeAppDataStore.replacePersonalMemories(nextPersonalMemories);
            return state.personalMemories;
        },
        getSelectedConversationIds: () => state.selectedConversationIds,
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
        getCurrentSpeechRecognition: () => state.currentSpeechRecognition,
        setCurrentSpeechRecognition: (nextRecognition) => {
            state.currentSpeechRecognition = nextRecognition;
            return state.currentSpeechRecognition;
        },
        setCurrentVoiceTarget: (nextTarget) => {
            state.currentVoiceTarget = nextTarget;
            return state.currentVoiceTarget;
        },
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

    const {
        replaceMemoryState,
        captureCompletedTurnAndPersist,
        invalidateMemoryConversation,
        memoryWorkScheduler,
        ensureMemorySummaryFresh,
        memory: memoryFunctions
    } = createMemoryRuntime({
        document, Event, fetch, crypto, setTimeout, clearTimeout, console, state, runtimeAppDataStore, runtimeStorageAdapter,
        models: MODELS, runMemoryModel, modelSupportsVision, getApiKeyForProvider, hashString, saveAppData, saveConfig
    });
    memory = memoryFunctions;

    const updateApiKeyWarningBadge = createApiKeyWarningBadgeUpdater({
        elements: ALL_ELEMENTS, getActiveConversation, normalizeConversationModel, isCouncilEnabled, getCouncilValidation, getApiKeyForProvider
    });
    // The memory list, the memories taken from replies and the dashboard (model-memory-dashboard-lifecycle.js) load the first time one
    // of them is used.
    const {
        renderPersonalMemoryList,
        refineAndStoreMemories,
        extractPersonalMemory,
        openDashboard,
        renderDashboardStats,
        renderModelUsageChart
    } = createLazyFunctions(() => import('./model-memory-dashboard-lifecycle.js').then(({ createLegacyModelMemoryDashboardLifecycle }) => createLegacyModelMemoryDashboardLifecycle({
        Chart,
        document,
        requestAnimationFrame,
        crypto,
        elements: ALL_ELEMENTS,
        getConfig: () => state.config,
        getConversations: () => state.conversations,
        getFolders: () => state.folders,
        getPersonalMemories: () => state.personalMemories,
        replacePersonalMemories: (nextPersonalMemories) => {
            state.personalMemories = runtimeAppDataStore.replacePersonalMemories(nextPersonalMemories);
            return state.personalMemories;
        },
        getMemoryState: () => runtimeAppDataStore.getMemoryState?.() || null,
        replaceMemoryState,
        captureCompletedTurn: options => captureCompletedTurnAndPersist(options),
        enqueueMemoryCapture: options => memoryWorkScheduler.enqueueCapture(options),
        hashString,
        getModelPieChart: () => state.modelPieChart,
        setModelPieChart: (chart) => {
            state.modelPieChart = chart;
        },
        models: MODELS,
        i18n,
        saveAppData,
        runtimeDialogCoordinator,
        showNotification,
        showCustomConfirm,
        showCustomPrompt,
        toggleModal,
        callApiWithSchema,
        getActiveConversation,
        setupTimeAnalysis,
        console
    })), ['renderPersonalMemoryList', 'refineAndStoreMemories', 'extractPersonalMemory', 'openDashboard', 'renderDashboardStats',
        'renderModelUsageChart']);

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
        renderPersonalMemoryList,
        refineAndStoreMemories,
        extractPersonalMemory,
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
        copyTextToClipboard,
        cancelMemoryCapture: conversationId => memoryWorkScheduler.cancelConversation(conversationId),
        invalidateMemoryConversation,
        ensureMemorySummaryFresh,
        getMemory
    };
}
