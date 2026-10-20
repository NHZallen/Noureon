import { createLegacyTrashLifecycle } from '../features/trash-lifecycle.js';
import { createTimeAnalysisChart } from '../features/time-analysis-chart.js';
import { createAstraStoreLifecycle } from '../features/astra-store-lifecycle.js';
import { createLanguageApply } from '../features/language-apply.js';
import { createChatScrollLifecycle } from '../features/chat-scroll-lifecycle.js';
import { createLatestUpdateNotice } from '../features/latest-update-notice.js';
import { createMobileContextMenus } from '../features/mobile-context-menus.js';
import { createThemeAppearanceLifecycle } from '../features/theme-appearance-lifecycle.js';
import { createLegacyRuntimeEntryDependencies } from '../runtime-entry-dependencies.js';
import {
    memorySyncProjectionEquals,
    mergeSyncedMemoryState,
    projectMemoryStateForSync
} from '../memory/memory-sync-projection.js';
import { consolidateOverlappingTopicSummaries } from '../memory/topic-summaries.js';
import { SERVICES, getService } from '../services.js';

const REQUIRED_DEPENDENCIES = [
    'window',
    'document',
    'elements',
    'state',
    'runtimeConfigAccess',
    'runtimeAppDataStore',
    'runtimeDialogCoordinator',
    'legacyRuntimeContext',
    'getCurrentConversationId',
    'setCurrentConversationId',
    'i18n'
];

const validateDependencies = (dependencies) => {
    if (!dependencies || typeof dependencies !== 'object') {
        throw new TypeError('Legacy core tail lifecycle dependencies must be an object.');
    }
    const missing = REQUIRED_DEPENDENCIES.filter((name) => dependencies[name] == null);
    if (missing.length > 0) {
        throw new TypeError(`Legacy core tail lifecycle is missing dependencies: ${missing.join(', ')}.`);
    }
};

export function createLegacyCoreTailLifecycle(dependencies = {}) {
    validateDependencies(dependencies);
    const {
        window,
        document,
        navigator,
        fetch,
        File,
        Event,
        Blob,
        Image,
        FileReader,
        Chart,
        Cropper,
        loadArchiveVendor,
        loadSharingVendor,
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
        random,
        elements: ALL_ELEMENTS,
        state,
        runtimeConfigAccess,
        runtimeAppDataStore,
        runtimeDialogCoordinator,
        legacyRuntimeContext,
        getCurrentConversationId,
        setCurrentConversationId,
        i18n,
        OFFICIAL_ASTRAS,
        updateLogs,
        productVersion,
        UI_THEME_COLORS,
        setTheme,
        updateThemeButtons,
        saveConfig,
        saveAppData,
        deleteConversationsFromCloud,
        deleteAstrasFromCloud = async () => {},
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
        renderSidebar,
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
        startMessageEditing = () => {},
        normalizeConversationModel,
        getCouncilSelectedModels,
        isCouncilEnabled,
        hasCouncilWebSearchAccess,
        hasSingleWebSearchAccess,
        hasSingleDocumentAccess,
        modelSupportsVision,
        bindGeneratedImageAssets = async () => {},
        getCouncilTexts,
        renderInputIndicators,
        renderCouncilControls = () => {},
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
        requestMemorySummaryBootstrap = () => Promise.resolve({ skipped: true }),
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
    } = dependencies;

    const resolvedLoadArchiveVendor = typeof loadArchiveVendor === 'function'
        ? loadArchiveVendor
        : () => Promise.resolve(JSZip);
    const resolvedLoadSharingVendor = typeof loadSharingVendor === 'function'
        ? loadSharingVendor
        : () => Promise.resolve({ Peer, QRCode, Html5Qrcode });

        const themeAppearanceLifecycle = createThemeAppearanceLifecycle({
            window,
            document,
            Image,
            FileReader,
            Cropper,
            elements: ALL_ELEMENTS,
            state,
            i18n,
            UI_THEME_COLORS,
            setTheme,
            updateThemeButtons,
            saveConfig,
            showNotification,
            toggleModal,
            logger: console
        });
        const applyUiTheme = (...args) => themeAppearanceLifecycle.applyUiTheme(...args);
        const renderUiColorOptions = (...args) => themeAppearanceLifecycle.renderUiColorOptions(...args);
        const { setupTimeAnalysis, updateTimeDistributionChart } = createTimeAnalysisChart({ document, elements: ALL_ELEMENTS, state, runtimeConfigAccess, i18n, Chart });
        const {
            openStore,
            closeStore,
            renderStore,
            handleSubscription,
            openAvatarEditor,
            handleAvatarUpload,
            handleConfirmAvatarCrop
        } = createAstraStoreLifecycle({
            document, elements: ALL_ELEMENTS, state, i18n, OFFICIAL_ASTRAS, runtimeAppDataStore, requestAnimationFrame, crypto, console,
            FileReader, Cropper, escapeHTML, deleteAstrasFromCloud, showNotification, toggleModal, saveAppData, renderAstras
        });
        const applyLanguage = createLanguageApply({
            window, document, elements: ALL_ELEMENTS, i18n, legacyRuntimeContext, console,
            renderAstras, renderInputIndicators, renderCouncilControls, renderStore,
            renderTrash: (...args) => renderTrash(...args),
            renderPersonalMemoryList: (...args) => renderPersonalMemoryList(...args)
        });
        const { showMobileContextMenu, showMobileContextMenuForFolder, showMobileContextMenuForAstras } = createMobileContextMenus({
            document, elements: ALL_ELEMENTS, state, i18n, requestAnimationFrame, setTimeout,
            showRenameModal, togglePinChat, archiveChat, deleteChat, moveConversationToFolder, renderBatchMoveModal,
            showFolderSettingsModal, deleteFolder, deleteAstras, openAvatarEditor, toggleModal
        });
        const { setupScrollToBottomButton, setupMessageIntersectionObserver } = createChatScrollLifecycle({
            elements: ALL_ELEMENTS, state, requestAnimationFrame, setTimeout, clearTimeout, ResizeObserver, IntersectionObserver
        });
        const { checkAndShowLatestUpdate, updateDisplayedVersion } = createLatestUpdateNotice({
            document, elements: ALL_ELEMENTS, state, i18n, updateLogs, productVersion, sanitizeTrustedHTML, toggleModal, saveConfig
        });
        const {
            renderTrash,
            handleRestoreTrashItem,
            handleDeleteTrashItemPermanently,
            showTrashItemInViewModal,
            toggleTrashSelectionMode,
            renderTrashBatchActionBar,
            handleBatchRestoreFromTrash,
            handleBatchDeleteFromTrash,
            handleEmptyTrash
        } = createLegacyTrashLifecycle({
            document,
            navigator,
            fetch,
            File,
            elements: ALL_ELEMENTS,
            getConversations: () => state.conversations,
            replaceConversations: (nextConversations) => {
                state.conversations = nextConversations;
                return state.conversations;
            },
            saveAppData,
            renderAll,
            renderSidebar,
            getI18n: () => i18n,
            getUiLanguage: () => state.config.uiLanguage,
            showCustomConfirm,
            showNotification,
            showCoordinatedNotification: (...args) => runtimeDialogCoordinator.showNotification(...args),
            deleteConversationsFromCloud,
            invalidateConversationMemory: options => {
                const invalidate = typeof legacyRuntimeContext.resolveOptionalBinding === 'function'
                    ? legacyRuntimeContext.resolveOptionalBinding('memory.invalidateConversation')
                    : null;
                return typeof invalidate === 'function' ? invalidate(options) : Promise.resolve();
            },
            rebuildHistoryIndex: options => {
                const rebuild = typeof legacyRuntimeContext.resolveOptionalBinding === 'function'
                    ? legacyRuntimeContext.resolveOptionalBinding('memory.rebuildHistoryIndex')
                    : null;
                return typeof rebuild === 'function' ? rebuild(options) : Promise.resolve();
            },
            toggleModal,
            formatFullTimestamp,
            renderUserText,
            renderModelText: renderMarkdownWithFormulas,
            bindGeneratedImageAssets,
            escapeHTML,
            scheduleTimeout: setTimeout,
            clearScheduledTimeout: clearTimeout,
            createChangeEvent: () => new Event('change')
        });
        const runtimeEntryDependencies = createLegacyRuntimeEntryDependencies({
            appBootstrap: {
                window,
                document,
                elements: ALL_ELEMENTS,
                loadArchiveVendor: resolvedLoadArchiveVendor,
                loadSharingVendor: resolvedLoadSharingVendor,
                BlobCtor: Blob,
                getCurrentUser: () => state.currentUser,
                getConfig: () => state.config,
                getConversations: () => state.conversations,
                getFolders: () => state.folders,
                getAstras: () => state.astras,
                getPersonalMemories: () => state.personalMemories,
                getMemoryState: () => runtimeAppDataStore.getMemoryState(),
                replaceMemoryState: (nextMemoryState) => {
                    const savedMemoryState = runtimeAppDataStore.replaceMemoryState(nextMemoryState);
                    const nextProjection = projectMemoryStateForSync(savedMemoryState);
                    const hasLegacySummaryProjection = Boolean(
                        state.config.memorySync?.memorySummary || state.config.memorySync?.memoryOverview
                    );
                    if (hasLegacySummaryProjection || !memorySyncProjectionEquals(state.config.memorySync, nextProjection)) {
                        state.config.memorySync = nextProjection;
                        void saveConfig().catch(error => console.warn('Memory sync projection could not save.', error));
                    }
                    void getService(SERVICES.memorySummarySync)?.captureMemoryState(savedMemoryState);
                    return savedMemoryState;
                },
                getCurrentConversationId,
                setCurrentConversationId,
                setSidebarOpen: (next) => {
                    state.sidebarOpen = next;
                    return state.sidebarOpen;
                },
                setSendConfirmed: (next) => {
                    state.sendConfirmed = next;
                    return state.sendConfirmed;
                },
                getAbortController: () => state.abortController,
                getCropperInstance: () => state.cropperInstance,
                setCropperInstance: (next) => {
                    state.cropperInstance = next;
                    return state.cropperInstance;
                },
                setEditingAstraForAvatarId: (next) => {
                    state.editingAstraForAvatarId = next;
                    return state.editingAstraForAvatarId;
                },
                startNewChat,
                renderAll,
                setTheme,
                setupVoiceInput,
                setupScrollToBottomButton,
                updateDisplayedVersion,
                checkAndShowLatestUpdate,
                updateFunctionButtonsState,
                updateInputState: (...args) =>
                    legacyRuntimeContext.resolveBinding('input.updateInputState')(...args),
                setupSettingsModal: (...args) =>
                    legacyRuntimeContext.resolveBinding('settings.setupSettingsModal')(...args),
                toggleSidebar,
                toggleModal,
                saveSettings,
                saveAppData,
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
                showNotification,
                showCustomConfirm,
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
                adjustTextareaHeight: (...args) =>
                    legacyRuntimeContext.resolveBinding('submit.adjustTextareaHeight')(...args),
                submitChatForm,
                closeAllPopovers,
                showCustomPrompt,
                createNewFolder,
                createAstras,
                handleSaveAstras,
                renderPersonalMemoryList,
                handleDeleteAllData,
                applyLanguage,
                applyUiTheme,
                openStore,
                closeStore,
                handleAvatarUpload,
                handleConfirmAvatarCrop,
                toggleTrashSelectionMode,
                handleBatchRestoreFromTrash,
                handleBatchDeleteFromTrash,
                handleEmptyTrash,
                updateFileInputUI,
                postJsonWithReadableError,
                openCouncilPopoverFromAttachmentMenu,
                setupHistorySidebarInteractions,
                setupHistorySidebarTriggers,
                requestMemorySummaryBootstrap,
                escapeHTML,
                getDefaultFolder,
                isMobileSettingsViewport,
                openSettingsMobileSection,
                i18n,
                randomUUID: () => crypto.randomUUID(),
                random,
                scheduleTimeout: setTimeout,
                clearScheduledTimeout: clearTimeout,
                scheduleAnimationFrame: requestAnimationFrame,
                logger: console
            },
            startup: {
                window,
                document,
                globalObject,
                elements: ALL_ELEMENTS,
                getConfig: () => state.config,
                setCurrentUser: (nextUser) => {
                    state.currentUser = nextUser;
                    return state.currentUser;
                },
                getItem,
                getUserKey,
                loadConfig,
                loadAppData,
                getText: (key) => i18n[state.config.uiLanguage]?.[key] || '',
                restoreMemorySync: async () => {
                    const projection = state.config.memorySync;
                    if (!projection) return;
                    const currentMemoryState = runtimeAppDataStore.getMemoryState?.() || {};
                    const restoredMemoryState = consolidateOverlappingTopicSummaries(
                        mergeSyncedMemoryState(currentMemoryState, projection)
                    );
                    runtimeAppDataStore.replaceMemoryState(restoredMemoryState);
                    const nextProjection = projectMemoryStateForSync(restoredMemoryState);
                    const hasLegacySummaryProjection = Boolean(projection.memorySummary || projection.memoryOverview);
                    if (hasLegacySummaryProjection || !memorySyncProjectionEquals(state.config.memorySync, nextProjection)) {
                        state.config.memorySync = nextProjection;
                        await saveConfig();
                    }
                    await saveAppData();
                    void getService(SERVICES.memorySummarySync)?.captureMemoryState(restoredMemoryState);
                },
                applyLanguage,
                applyUiTheme,
                handleLogin,
                handleImportOnAuth,
                processAuthImport,
                toggleModal,
                installTouchGuards,
                registerServiceWorker,
                showCustomDialog,
                getComputedStyle
            }
        });
        const registerRuntimeEntryDependencies = () => {
            legacyRuntimeContext.registerLazyBinding(
                'runtime.entryDependencies',
                () => runtimeEntryDependencies
            );
            return runtimeEntryDependencies;
        };

        return Object.freeze({
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
            runtimeEntryDependencies,
            registerRuntimeEntryDependencies
        });
    }
