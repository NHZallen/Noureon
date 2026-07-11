import { createLegacyBatchImportVoiceLifecycle } from './batch-import-voice-lifecycle.js';
import { createLegacySearchUploadSidebarLifecycle } from './search-upload-sidebar-lifecycle.js';
import { createLegacyModelMemoryDashboardLifecycle } from './model-memory-dashboard-lifecycle.js';
import { createGeminiMemoryCaptureClient } from '../memory/gemini-memory-capture-client.js';
import { createMemoryCaptureService } from '../memory/memory-capture-service.js';
import { createMemoryWorkScheduler } from '../memory/memory-work-scheduler.js';
import { createGeminiEmbeddingClient } from '../memory/gemini-embedding-client.js';
import { createHistoryIndexStore } from '../memory/history-index-store.js';
import { createHistoryIndexPersistence } from '../memory/history-index-persistence.js';
import { createHistoryIndexingService } from '../memory/history-indexing-service.js';
import { createHistoryRetrievalService } from '../memory/history-retrieval-service.js';
import { createDeviceHistoryRecallConsent } from '../memory/device-history-recall-consent.js';
import { projectMemoryStateForSync } from '../memory/memory-sync-projection.js';
import { createHistoryIndexRebuildService } from '../memory/history-index-rebuild-service.js';

const requiredDependencies = [
    'window',
    'document',
    'elements',
    'legacyRuntimeContext',
    'state',
    'runtimeConfigAccess',
    'runtimeAppDataStore',
    'runtimeDialogCoordinator',
    'i18n',
    'models',
    'getSensitiveApiKeys',
    'mergeSensitiveApiKeys',
    'saveSensitiveConfig',
    'saveConfig',
    'saveAppData',
    'renderAll',
    'loadChat',
    'toggleModal',
    'showNotification'
];

function assertRequiredDependencies(dependencies) {
    const missing = requiredDependencies.filter((key) => dependencies[key] == null);
    if (missing.length > 0) {
        throw new TypeError(`createLegacyTransitionBusLifecycle missing dependencies: ${missing.join(', ')}`);
    }
}

export function createLegacyTransitionBusLifecycle(dependencies = {}) {
    assertRequiredDependencies(dependencies);

    const {
        window,
        document,
        navigator,
        fetch,
        File,
        FileReader: FileReaderCtor,
        Image: ImageCtor,
        URL,
        Event,
        Blob,
        Chart,
        Cropper,
        Peer,
        QRCode,
        Html5Qrcode,
        JSZip,
        ResizeObserver,
        IntersectionObserver,
        requestAnimationFrame,
        setTimeout,
        clearTimeout,
        crypto,
        console = globalThis.console,
        globalObject = globalThis,
        getComputedStyle,
        elements: ALL_ELEMENTS,
        legacyRuntimeContext,
        state,
        runtimeConfigAccess,
        runtimeAppDataStore,
        runtimeStorageAdapter = null,
        runtimeDialogCoordinator,
        i18n,
        getCurrentConversationId = () => state.conversationStateAccess?.getCurrentConversationId?.(),
        setCurrentConversationId = (id) => state.conversationStateAccess?.setCurrentConversationId?.(id),
        officialAstras,
        updateLogs,
        uiThemeColors,
        models: MODELS,
        getSensitiveApiKeys,
        mergeSensitiveApiKeys,
        saveSensitiveConfig,
        setTheme,
        updateThemeButtons,
        setAiBubbleColor,
        setUserBubbleColor,
        saveConfig,
        saveAppData,
        deleteConversationsFromCloud,
        deleteAstrasFromCloud,
        showNotification,
        toggleModal,
        renderAstras,
        escapeHTML,
        sanitizeTrustedHTML,
        showRenameModal,
        togglePinChat,
        archiveChat,
        deleteChat,
        moveConversationToFolder,
        showFolderSettingsModal,
        deleteFolder,
        deleteAstras,
        showCustomConfirm,
        showCustomPrompt,
        showCustomDialog,
        formatFullTimestamp,
        renderUserText,
        renderMarkdownWithFormulas,
        startNewChat,
        renderAll,
        updateFunctionButtonsState,
        saveSettings,
        handleLogout,
        handleFormSubmit,
        handleRename,
        handleSaveFolderSettings,
        loadChat,
        getActiveConversation,
        startMessageEditing = () => {},
        normalizeConversationModel,
        getCouncilSelectedModels,
        isCouncilEnabled,
        hasCouncilWebSearchAccess,
        hasSingleWebSearchAccess,
        hasSingleDocumentAccess,
        modelSupportsVision,
        getGeneratedImageBlob = async () => null,
        saveGeneratedImageBlob = async () => {},
        getCouncilTexts,
        renderInputIndicators,
        toggleLearningMode,
        toggleSelectionMode,
        submitChatForm,
        createNewFolder,
        createAstras,
        handleSaveAstras,
        handleDeleteAllData,
        updateFileInputUI,
        postJsonWithReadableError,
        openCouncilPopoverFromAttachmentMenu,
        setupHistorySidebarInteractions,
        setupHistorySidebarTriggers,
        getDefaultFolder,
        isMobileSettingsViewport,
        openSettingsMobileSection,
        getItem,
        getUserKey,
        loadConfig,
        loadAppData,
        handleLogin,
        installTouchGuards,
        registerServiceWorker,
        getModelTiers,
        getModelApiId,
        getApiKeyForProvider,
        getCouncilValidation,
        callApiWithSchema,
        getOutputMode,
        analyzeImageBrightness: injectedAnalyzeImageBrightness,
        getDominantColorPalette: injectedGetDominantColorPalette,
        hashString,
        constantTimeEqual,
        processInChunks,
        getBackupUsername,
        createPasswordRecord,
        setItem,
        logger = console
    } = dependencies;

    const resolveUploadUpdateInputState = (...args) =>
        legacyRuntimeContext.resolveBinding('input.updateInputState')(...args);

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
        showConversationInViewModal,
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
        JSZip,
        elements: ALL_ELEMENTS,
        legacyRuntimeContext,
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
        conversationStateAccess: state.conversationStateAccess,
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
        analyzeImageBrightness,
        getDominantColorPalette,
        applyCustomWallpaper,
        applyUiTheme,
        applyLanguage,
        setAiBubbleColor,
        setUserBubbleColor,
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
        getGeneratedImageBlob,
        saveGeneratedImageBlob,
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

    const historyIndex = createHistoryIndexStore();
    const historyIndexPersistence = runtimeStorageAdapter?.getItem
        ? createHistoryIndexPersistence({
            index: historyIndex,
            storage: runtimeStorageAdapter,
            storageKey: `noureon:history-index:v1:${state.currentUser?.username || 'anonymous'}`
        })
        : null;
    let historyIndexLoaded = false;
    const historyIndexReady = (historyIndexPersistence
        ? historyIndexPersistence.load().catch(error => console.warn('Memory index could not load.', error))
        : Promise.resolve())
        .finally(() => { historyIndexLoaded = true; });
    const historyIndexingService = createHistoryIndexingService({
        index: historyIndex,
        embeddingClient: createGeminiEmbeddingClient({
            getApiKey: () => getApiKeyForProvider('gemini'),
            fetchImpl: fetch
        }),
        persistence: historyIndexPersistence
    });
    const localMemoryStorage = runtimeStorageAdapter?.getItem
        ? runtimeStorageAdapter
        : {
            getItem: async () => null,
            setItem: async () => {},
            removeItem: async () => {}
        };
    const deviceHistoryRecallConsent = createDeviceHistoryRecallConsent({
        storage: localMemoryStorage,
        storageKey: `noureon:history-recall-device-consent:v1:${state.currentUser?.username || 'anonymous'}`
    });
    const historyRecallConsentReady = deviceHistoryRecallConsent.load()
        .catch(error => console.warn('History recall consent could not load.', error));
    const historyRetrievalService = createHistoryRetrievalService({
        index: historyIndex,
        embeddingClient: createGeminiEmbeddingClient({
            getApiKey: () => getApiKeyForProvider('gemini'),
            fetchImpl: fetch
        }),
        getMemoryState: () => runtimeAppDataStore.getMemoryState?.() || {}
    });
    const retrieveHistory = async options => {
        await Promise.all([historyIndexReady, historyRecallConsentReady]);
        if (!deviceHistoryRecallConsent.isGranted()) return [];
        return historyRetrievalService.retrieve(options);
    };
    legacyRuntimeContext.registerLazyBinding('memory.retrieveHistory', () => retrieveHistory);
    legacyRuntimeContext.registerLazyBinding('memory.grantHistoryRecallConsent', () => (
        () => deviceHistoryRecallConsent.grant()
    ));
    legacyRuntimeContext.registerLazyBinding('memory.revokeHistoryRecallConsent', () => (
        () => deviceHistoryRecallConsent.revoke()
    ));
    let historyIndexRebuildStatus = { state: 'idle', completed: 0, total: 0, indexed: 0, skipped: 0, failed: 0 };
    legacyRuntimeContext.registerLazyBinding('memory.getHistoryRecallStatus', () => (
        () => ({
            consented: deviceHistoryRecallConsent.isGranted(),
            consentLoaded: deviceHistoryRecallConsent.isLoaded(),
            indexLoaded: historyIndexLoaded,
            indexRecordCount: historyIndex.getAll().length,
            rebuild: historyIndexRebuildStatus
        })
    ));
    const replaceMemoryState = nextMemoryState => {
        const savedMemoryState = runtimeAppDataStore.replaceMemoryState?.(nextMemoryState);
        state.config.memorySync = projectMemoryStateForSync(savedMemoryState || nextMemoryState);
        void saveConfig().catch(error => console.warn('Memory sync projection could not save.', error));
        return savedMemoryState;
    };
    const memoryCaptureService = createMemoryCaptureService({
        captureClient: createGeminiMemoryCaptureClient({
            getApiKey: () => getApiKeyForProvider('gemini'),
            fetchImpl: fetch
        }),
        getMemoryState: () => runtimeAppDataStore.getMemoryState?.() || {},
        replaceMemoryState,
        indexCapsule: options => historyIndexingService.indexCapsule(options),
        createId: prefix => `${prefix}:${crypto.randomUUID()}`
    });
    const historyIndexRebuildService = createHistoryIndexRebuildService({
        getConversations: () => state.conversations,
        getMemoryState: () => runtimeAppDataStore.getMemoryState?.() || {},
        captureCompletedTurn: options => memoryCaptureService.captureCompletedTurn(options),
        hashString
    });
    const rebuildHistoryIndex = async options => {
        await historyIndexReady;
        return historyIndexRebuildService.rebuild({
            ...options,
            onProgress: status => { historyIndexRebuildStatus = status; }
        });
    };
    legacyRuntimeContext.registerLazyBinding('memory.rebuildHistoryIndex', () => rebuildHistoryIndex);
    const memoryWorkScheduler = createMemoryWorkScheduler({
        runJob: async job => {
            await historyIndexReady;
            return memoryCaptureService.captureCompletedTurn(job);
        },
        schedule: callback => setTimeout(callback, 15_000),
        cancel: timer => clearTimeout(timer)
    });

    const modelMemoryDashboardLifecycle = createLegacyModelMemoryDashboardLifecycle({
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
        captureCompletedTurn: options => memoryCaptureService.captureCompletedTurn(options),
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
        toggleModal,
        callApiWithSchema,
        getActiveConversation,
        normalizeConversationModel,
        isCouncilEnabled,
        getCouncilValidation,
        getApiKeyForProvider,
        setupTimeAnalysis,
        console
    });

    const {
        renderPersonalMemoryList,
        refineAndStoreMemories,
        extractPersonalMemory,
        updateApiKeyWarningBadge,
        openDashboard,
        renderDashboardStats,
        renderModelUsageChart
    } = modelMemoryDashboardLifecycle;

    function closeAllPopovers() {
        document.querySelectorAll('.popover.visible').forEach(popover => {
            popover.classList.remove('visible');
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

    const coreTailState = {
        get conversations() { return state.conversations; },
        set conversations(next) { state.conversations = next; },
        get folders() { return state.folders; },
        set folders(next) { state.folders = next; },
        get astras() { return state.astras; },
        set astras(next) { state.astras = next; },
        get personalMemories() { return state.personalMemories; },
        set personalMemories(next) { state.personalMemories = next; },
        get config() { return state.config; },
        set config(next) { state.config = next; },
        get currentUser() { return state.currentUser; },
        set currentUser(next) { state.currentUser = next; },
        get sidebarOpen() { return state.sidebarOpen; },
        set sidebarOpen(next) { state.sidebarOpen = next; },
        get sendConfirmed() { return state.sendConfirmed; },
        set sendConfirmed(next) { state.sendConfirmed = next; },
        get abortController() { return state.abortController; },
        set abortController(next) { state.abortController = next; },
        get cropperInstance() { return state.cropperInstance; },
        set cropperInstance(next) { state.cropperInstance = next; },
        get editingAstraForAvatarId() { return state.editingAstraForAvatarId; },
        set editingAstraForAvatarId(next) { state.editingAstraForAvatarId = next; },
        get editingAstrasId() { return state.editingAstrasId; },
        set editingAstrasId(next) { state.editingAstrasId = next; },
        get currentStoreCategory() { return state.currentStoreCategory; },
        set currentStoreCategory(next) { state.currentStoreCategory = next; },
        get messageObserver() { return state.messageObserver; },
        set messageObserver(next) { state.messageObserver = next; },
        get timeDistChart() { return state.timeDistChart; },
        set timeDistChart(next) { state.timeDistChart = next; },
        get isAutoScrolling() { return state.isAutoScrolling; },
        set isAutoScrolling(next) { state.isAutoScrolling = next; }
    };

    const coreTailDependencies = {
        window,
        document,
        navigator,
        fetch,
        File,
        Event,
        Blob,
        Image: ImageCtor,
        FileReader: FileReaderCtor,
        Chart,
        Cropper,
        Peer,
        QRCode,
        Html5Qrcode,
        JSZip,
        ResizeObserver,
        IntersectionObserver,
        requestAnimationFrame,
        setTimeout,
        clearTimeout,
        crypto,
        console,
        globalObject,
        getComputedStyle,
        random: () => Math.random(),
        elements: ALL_ELEMENTS,
        state: coreTailState,
        runtimeConfigAccess,
        runtimeAppDataStore,
        runtimeDialogCoordinator,
        legacyRuntimeContext,
        getCurrentConversationId,
        setCurrentConversationId,
        i18n,
        OFFICIAL_ASTRAS: officialAstras,
        updateLogs,
        UI_THEME_COLORS: uiThemeColors,
        setTheme,
        updateThemeButtons,
        setAiBubbleColor,
        setUserBubbleColor,
        saveConfig,
        saveAppData,
        deleteConversationsFromCloud,
        deleteAstrasFromCloud,
        showNotification,
        toggleModal,
        renderAstras,
        escapeHTML,
        sanitizeTrustedHTML,
        showRenameModal,
        togglePinChat,
        archiveChat,
        deleteChat,
        moveConversationToFolder,
        renderBatchMoveModal,
        showFolderSettingsModal,
        deleteFolder,
        deleteAstras,
        showCustomConfirm,
        formatFullTimestamp,
        renderUserText,
        renderMarkdownWithFormulas,
        startNewChat,
        renderAll,
        setupVoiceInput,
        updateFunctionButtonsState,
        toggleSidebar,
        saveSettings,
        handleExport,
        handleImport,
        handleLogout,
        handleFileSelection,
        handleFormSubmit,
        handleRename,
        handleSaveFolderSettings,
        performSearchAndRenderResults,
        loadChat,
        openDashboard,
        getActiveConversation,
        copyTextToClipboard,
        startMessageEditing,
        normalizeConversationModel,
        getCouncilSelectedModels,
        isCouncilEnabled,
        hasCouncilWebSearchAccess,
        hasSingleWebSearchAccess,
        hasSingleDocumentAccess,
        modelSupportsVision,
        getCouncilTexts,
        renderInputIndicators,
        toggleLearningMode,
        toggleSelectionMode,
        handleBatchDelete,
        handleBatchArchive,
        handleBatchMove,
        submitChatForm,
        closeAllPopovers,
        showCustomPrompt,
        createNewFolder,
        createAstras,
        handleSaveAstras,
        renderPersonalMemoryList,
        handleDeleteAllData,
        updateFileInputUI,
        postJsonWithReadableError,
        openCouncilPopoverFromAttachmentMenu,
        setupHistorySidebarInteractions,
        setupHistorySidebarTriggers,
        getDefaultFolder,
        isMobileSettingsViewport,
        openSettingsMobileSection,
        getItem,
        getUserKey,
        loadConfig,
        loadAppData,
        handleLogin,
        handleImportOnAuth,
        processAuthImport,
        installTouchGuards,
        registerServiceWorker,
        showCustomDialog
    };

    const registerSidebarBindings = () => {
        legacyRuntimeContext.registerLazyBinding('sidebar.toggleSidebar', () => toggleSidebar);
    };

    const registerCoreTailDependencies = () => {
        legacyRuntimeContext.registerLazyBinding(
            'runtime.coreTailDependencies',
            () => coreTailDependencies
        );
    };

    const resolveCoreTailFunction = (name) => {
        const binding = legacyRuntimeContext.resolveBinding(`coreTail.${name}`);
        if (typeof binding !== 'function') {
            throw new TypeError(`Legacy core tail binding "coreTail.${name}" must be a function.`);
        }
        return binding;
    };

    function setupTimeAnalysis(...args) { return resolveCoreTailFunction('setupTimeAnalysis')(...args); }
    function updateTimeDistributionChart(...args) { return resolveCoreTailFunction('updateTimeDistributionChart')(...args); }
    function getDominantColorPalette(...args) {
        if (injectedGetDominantColorPalette) return injectedGetDominantColorPalette(...args);
        return resolveCoreTailFunction('getDominantColorPalette')(...args);
    }
    function applyUiTheme(...args) { return resolveCoreTailFunction('applyUiTheme')(...args); }
    function renderUiColorOptions(...args) { return resolveCoreTailFunction('renderUiColorOptions')(...args); }
    function analyzeImageBrightness(...args) {
        if (injectedAnalyzeImageBrightness) return injectedAnalyzeImageBrightness(...args);
        return resolveCoreTailFunction('analyzeImageBrightness')(...args);
    }
    function applyCustomWallpaper(...args) { return resolveCoreTailFunction('applyCustomWallpaper')(...args); }
    function handleWallpaperUpload(...args) { return resolveCoreTailFunction('handleWallpaperUpload')(...args); }
    function handleConfirmCrop(...args) { return resolveCoreTailFunction('handleConfirmCrop')(...args); }
    function restoreDefaultWallpaper(...args) { return resolveCoreTailFunction('restoreDefaultWallpaper')(...args); }
    function openStore(...args) { return resolveCoreTailFunction('openStore')(...args); }
    function closeStore(...args) { return resolveCoreTailFunction('closeStore')(...args); }
    function renderStore(...args) { return resolveCoreTailFunction('renderStore')(...args); }
    function handleSubscription(...args) { return resolveCoreTailFunction('handleSubscription')(...args); }
    function openAvatarEditor(...args) { return resolveCoreTailFunction('openAvatarEditor')(...args); }
    function handleAvatarUpload(...args) { return resolveCoreTailFunction('handleAvatarUpload')(...args); }
    function handleConfirmAvatarCrop(...args) { return resolveCoreTailFunction('handleConfirmAvatarCrop')(...args); }
    function applyLanguage(...args) { return resolveCoreTailFunction('applyLanguage')(...args); }
    function showMobileContextMenu(...args) { return resolveCoreTailFunction('showMobileContextMenu')(...args); }
    function showMobileContextMenuForFolder(...args) { return resolveCoreTailFunction('showMobileContextMenuForFolder')(...args); }
    function showMobileContextMenuForAstras(...args) { return resolveCoreTailFunction('showMobileContextMenuForAstras')(...args); }
    function setupScrollToBottomButton(...args) { return resolveCoreTailFunction('setupScrollToBottomButton')(...args); }
    function showUpdateHistory(...args) { return resolveCoreTailFunction('showUpdateHistory')(...args); }
    function checkAndShowLatestUpdate(...args) { return resolveCoreTailFunction('checkAndShowLatestUpdate')(...args); }
    function setupMessageIntersectionObserver(...args) { return resolveCoreTailFunction('setupMessageIntersectionObserver')(...args); }
    function renderTrash(...args) { return resolveCoreTailFunction('renderTrash')(...args); }
    function handleRestoreTrashItem(...args) { return resolveCoreTailFunction('handleRestoreTrashItem')(...args); }
    function handleDeleteTrashItemPermanently(...args) { return resolveCoreTailFunction('handleDeleteTrashItemPermanently')(...args); }
    function showTrashItemInViewModal(...args) { return resolveCoreTailFunction('showTrashItemInViewModal')(...args); }
    function toggleTrashSelectionMode(...args) { return resolveCoreTailFunction('toggleTrashSelectionMode')(...args); }
    function renderTrashBatchActionBar(...args) { return resolveCoreTailFunction('renderTrashBatchActionBar')(...args); }
    function handleBatchRestoreFromTrash(...args) { return resolveCoreTailFunction('handleBatchRestoreFromTrash')(...args); }
    function handleBatchDeleteFromTrash(...args) { return resolveCoreTailFunction('handleBatchDeleteFromTrash')(...args); }
    function handleEmptyTrash(...args) { return resolveCoreTailFunction('handleEmptyTrash')(...args); }
    function updateDisplayedVersion(...args) { return resolveCoreTailFunction('updateDisplayedVersion')(...args); }

    return {
        renderPersonalMemoryList,
        refineAndStoreMemories,
        extractPersonalMemory,
        updateApiKeyWarningBadge,
        openDashboard,
        renderDashboardStats,
        renderModelUsageChart,
        performSearchAndRenderResults,
        showConversationInViewModal,
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
        setupTimeAnalysis,
        updateTimeDistributionChart,
        getDominantColorPalette,
        applyUiTheme,
        renderUiColorOptions,
        analyzeImageBrightness,
        applyCustomWallpaper,
        handleWallpaperUpload,
        handleConfirmCrop,
        restoreDefaultWallpaper,
        openStore,
        closeStore,
        renderStore,
        handleSubscription,
        openAvatarEditor,
        handleAvatarUpload,
        handleConfirmAvatarCrop,
        applyLanguage,
        showMobileContextMenu,
        showMobileContextMenuForFolder,
        showMobileContextMenuForAstras,
        setupScrollToBottomButton,
        showUpdateHistory,
        checkAndShowLatestUpdate,
        setupMessageIntersectionObserver,
        renderTrash,
        handleRestoreTrashItem,
        handleDeleteTrashItemPermanently,
        showTrashItemInViewModal,
        toggleTrashSelectionMode,
        renderTrashBatchActionBar,
        handleBatchRestoreFromTrash,
        handleBatchDeleteFromTrash,
        handleEmptyTrash,
        updateDisplayedVersion,
        cancelMemoryCapture: conversationId => memoryWorkScheduler.cancelConversation(conversationId),
        coreTailDependencies,
        registerSidebarBindings,
        registerCoreTailDependencies
    };
}
