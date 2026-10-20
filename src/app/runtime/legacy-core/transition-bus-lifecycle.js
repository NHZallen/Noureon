import { createLegacyBatchImportVoiceLifecycle } from './batch-import-voice-lifecycle.js';
import { createLegacySearchUploadSidebarLifecycle } from './search-upload-sidebar-lifecycle.js';
import { createLegacyModelMemoryDashboardLifecycle } from './model-memory-dashboard-lifecycle.js';
import { createMemoryRuntime } from '../memory/memory-runtime.js';
import { assertLegacyTransitionBusDependencies } from './transition-bus-dependencies.js';

export function createLegacyTransitionBusLifecycle(dependencies = {}) {
    assertLegacyTransitionBusDependencies(dependencies);

    const {
        window, document, navigator, fetch,
        File, FileReader: FileReaderCtor, Image: ImageCtor, URL, Event, Blob,
        Chart, Cropper, loadArchiveVendor, loadSharingVendor,
        ResizeObserver, IntersectionObserver, requestAnimationFrame,
        setTimeout, clearTimeout, crypto,
        console = globalThis.console,
        globalObject = globalThis,
        getComputedStyle, elements: ALL_ELEMENTS, legacyRuntimeContext, state,
        runtimeConfigAccess, runtimeAppDataStore,
        runtimeStorageAdapter = null,
        runtimeDialogCoordinator,
        i18n,
        getCurrentConversationId = () => state.conversationStateAccess?.getCurrentConversationId?.(),
        setCurrentConversationId = (id) => state.conversationStateAccess?.setCurrentConversationId?.(id),
        officialAstras,
        updateLogs,
        productVersion,
        uiThemeColors,
        models: MODELS,
        getSensitiveApiKeys,
        mergeSensitiveApiKeys,
        saveSensitiveConfig,
        setTheme,
        updateThemeButtons,
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
        bindGeneratedImageAssets = async () => {},
        getGeneratedImageBlob = async () => null,
        saveGeneratedImageBlob = async () => {},
        getCouncilTexts,
        renderInputIndicators,
        renderCouncilControls,
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
        runMemoryModel = null,
        getCouncilValidation,
        callApiWithSchema,
        getOutputMode,
        hashString,
        constantTimeEqual,
        processInChunks,
        getBackupUsername,
        createPasswordRecord,
        setItem,
        logger = console
    } = dependencies;

    // The functions of the core tail (core-tail-lifecycle.js), which is made after this bus: each calls the one registered as
    // coreTail.<name> when it is called.
    const resolveCoreTailFunction = (name) => {
        const binding = legacyRuntimeContext.resolveBinding(`coreTail.${name}`);
        if (typeof binding !== 'function') {
            throw new TypeError(`Legacy core tail binding "coreTail.${name}" must be a function.`);
        }
        return binding;
    };
    const coreTail = Object.fromEntries([
        'setupTimeAnalysis', 'updateTimeDistributionChart', 'applyUiTheme', 'renderUiColorOptions', 'openStore',
        'closeStore', 'renderStore', 'handleSubscription', 'openAvatarEditor', 'handleAvatarUpload', 'handleConfirmAvatarCrop',
        'applyLanguage', 'showMobileContextMenu', 'showMobileContextMenuForFolder', 'showMobileContextMenuForAstras',
        'setupScrollToBottomButton', 'checkAndShowLatestUpdate', 'setupMessageIntersectionObserver', 'renderTrash',
        'handleRestoreTrashItem', 'handleDeleteTrashItemPermanently', 'showTrashItemInViewModal', 'toggleTrashSelectionMode',
        'renderTrashBatchActionBar', 'handleBatchRestoreFromTrash', 'handleBatchDeleteFromTrash', 'handleEmptyTrash',
        'updateDisplayedVersion'
    ].map((name) => [name, (...args) => resolveCoreTailFunction(name)(...args)]));
    const {
        setupTimeAnalysis, updateTimeDistributionChart, applyUiTheme, renderUiColorOptions, openStore, closeStore,
        renderStore, handleSubscription, openAvatarEditor, handleAvatarUpload, handleConfirmAvatarCrop, applyLanguage,
        showMobileContextMenu, showMobileContextMenuForFolder, showMobileContextMenuForAstras, setupScrollToBottomButton,
        checkAndShowLatestUpdate, setupMessageIntersectionObserver, renderTrash, handleRestoreTrashItem, handleDeleteTrashItemPermanently,
        showTrashItemInViewModal, toggleTrashSelectionMode, renderTrashBatchActionBar, handleBatchRestoreFromTrash,
        handleBatchDeleteFromTrash, handleEmptyTrash, updateDisplayedVersion
    } = coreTail;

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
        legacyRuntimeContext,
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

    const {
        replaceMemoryState,
        captureCompletedTurnAndPersist,
        invalidateMemoryConversation,
        memoryWorkScheduler,
        ensureMemorySummaryFresh
    } = createMemoryRuntime({
        document, Event, fetch, crypto, setTimeout, clearTimeout, console, state, runtimeAppDataStore, runtimeStorageAdapter,
        legacyRuntimeContext, models: MODELS, runMemoryModel, modelSupportsVision, getApiKeyForProvider, hashString, saveAppData, saveConfig
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
        loadArchiveVendor,
        loadSharingVendor,
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
        state,
        runtimeConfigAccess,
        runtimeAppDataStore,
        runtimeDialogCoordinator,
        legacyRuntimeContext,
        getCurrentConversationId,
        setCurrentConversationId,
        i18n,
        OFFICIAL_ASTRAS: officialAstras,
        updateLogs,
        productVersion,
        UI_THEME_COLORS: uiThemeColors,
        setTheme,
        updateThemeButtons,
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
        bindGeneratedImageAssets,
        getCouncilTexts,
        renderInputIndicators,
        renderCouncilControls,
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
        requestMemorySummaryBootstrap: ensureMemorySummaryFresh,
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
        setupTimeAnalysis,
        updateTimeDistributionChart,
        applyUiTheme,
        renderUiColorOptions,
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
        invalidateMemoryConversation,
        ensureMemorySummaryFresh,
        coreTailDependencies,
        registerSidebarBindings,
        registerCoreTailDependencies
    };
}
