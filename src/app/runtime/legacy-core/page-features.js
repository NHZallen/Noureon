// The page features of the chat page: the theme and its colours, the time analysis chart, the Noura store and the avatar editor, the
// change of the interface language, the menus of a long press on a phone, the scroll button and the visibility of messages, the
// notice of the latest update and the trash. Made once by the application shell (legacy-core.js), which hands in what they use.

import { createLegacyTrashLifecycle } from '../features/trash-lifecycle.js';
import { createTimeAnalysisChart } from '../features/time-analysis-chart.js';
import { createAstraStoreLifecycle } from '../features/astra-store-lifecycle.js';
import { createLanguageApply } from '../features/language-apply.js';
import { createChatScrollLifecycle } from '../features/chat-scroll-lifecycle.js';
import { createLatestUpdateNotice } from '../features/latest-update-notice.js';
import { createMobileContextMenus } from '../features/mobile-context-menus.js';
import { createThemeAppearanceLifecycle } from '../features/theme-appearance-lifecycle.js';

export function createPageFeatures({
    window, document, navigator, fetch, File, Event, Image, FileReader, Chart, Cropper,
    ResizeObserver, IntersectionObserver, requestAnimationFrame, setTimeout, clearTimeout, crypto, console,
    elements: ALL_ELEMENTS, state, runtimeConfigAccess, runtimeAppDataStore, runtimeDialogCoordinator, i18n,
    OFFICIAL_ASTRAS, updateLogs, productVersion, UI_THEME_COLORS,
    // The memory functions (memory-runtime.js), or null while memory is not set up.
    getMemory = () => null,
    updateInputState, setTheme, updateThemeButtons, saveConfig, saveAppData,
    deleteConversationsFromCloud, deleteAstrasFromCloud = async () => {},
    showNotification, showCustomConfirm, toggleModal, escapeHTML, sanitizeTrustedHTML,
    renderAll, renderAstras, renderInputIndicators, renderCouncilControls = () => {}, renderPersonalMemoryList,
    showRenameModal, togglePinChat, archiveChat, deleteChat, moveConversationToFolder, renderBatchMoveModal,
    showFolderSettingsModal, deleteFolder, deleteAstras,
    formatFullTimestamp, renderUserText, renderMarkdownWithFormulas, bindGeneratedImageAssets = async () => {}
}) {
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
        window, document, elements: ALL_ELEMENTS, i18n, updateInputState, console,
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
        getI18n: () => i18n,
        getUiLanguage: () => state.config.uiLanguage,
        showCustomConfirm,
        showNotification,
        showCoordinatedNotification: (...args) => runtimeDialogCoordinator.showNotification(...args),
        deleteConversationsFromCloud,
        invalidateConversationMemory: options => {
            const invalidate = getMemory()?.invalidateConversation;
            return typeof invalidate === 'function' ? invalidate(options) : Promise.resolve();
        },
        rebuildHistoryIndex: options => {
            const rebuild = getMemory()?.rebuildHistoryIndex;
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
        updateDisplayedVersion
    });
}
