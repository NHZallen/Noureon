import { createSettingsApiKeyControls } from './settings-api-key-controls.js';
import { createSettingsOutputTranslatorControls } from './settings-output-translator-controls.js';
import { createSettingsThemeBubbleControls } from './settings-theme-bubble-controls.js';
import { createSettingsMobileShellHelper } from './settings-mobile-shell-helper.js';
import { createSettingsDesktopSectionHelper } from './settings-desktop-section-helper.js';
import { createSettingsAuthActionsHelper } from './settings-auth-actions-helper.js';
import { createSettingsUpdateInputStateHelper } from './settings-update-input-state-helper.js';
import { createLazyFunctions } from '../kernel/lazy-functions.js';
import { createModelRequestRuntime } from '../shell/model-request-runtime.js';
import { createSettingsModalLifecycle } from './settings-modal-lifecycle.js';

const requiredDependencies = [
    'window',
    'document',
    'fetch',
    'elements',
    'runtimeConfigAccess',
    'runtimeAppDataStore',
    'session',
    'uploads',
    'reply',
    'quote',
    'runtimeStorageAdapter',
    'models',
    'i18n',
    'saveConfig',
    'saveAppData',
    'showNotification',
    'showCustomDialog',
    'toggleModal'
];

function assertRequiredDependencies(dependencies) {
    const missing = requiredDependencies.filter((key) => dependencies[key] == null);
    if (missing.length > 0) {
        throw new TypeError(`createSettingsAuthProviderLifecycle missing dependencies: ${missing.join(', ')}`);
    }
}

function createLiveObject(getter) {
    return new Proxy({}, {
        get(_target, property) {
            const target = getter();
            const value = target?.[property];
            return typeof value === 'function' ? value.bind(target) : value;
        },
        set(_target, property, value) {
            getter()[property] = value;
            return true;
        },
        deleteProperty(_target, property) {
            delete getter()[property];
            return true;
        },
        has(_target, property) {
            return property in getter();
        },
        ownKeys() {
            return Reflect.ownKeys(getter());
        },
        getOwnPropertyDescriptor(_target, property) {
            const descriptor = Object.getOwnPropertyDescriptor(getter(), property);
            return descriptor || { configurable: true, enumerable: true, writable: true, value: getter()?.[property] };
        }
    });
}

export function createSettingsAuthProviderLifecycle(dependencies = {}) {
    assertRequiredDependencies(dependencies);

    const {
        window,
        document,
        fetch,
        requestAnimationFrame,
        setTimeout = globalThis.setTimeout,
        clearTimeout = globalThis.clearTimeout,
        console = globalThis.console,
        elements: ALL_ELEMENTS,
        // The settings and the workspace data, and who is signed in, the files waiting to be sent, the reply being made and the
        // quoted text (shell/shell-state.js).
        runtimeConfigAccess,
        runtimeAppDataStore,
        session,
        uploads,
        reply,
        quote,
        // The memory functions (memory-runtime.js), or null while memory is not set up.
        getMemory = () => null,
        // Starts the chat page after signing in.
        initChatApp,
        runtimeStorageAdapter,
        models: MODELS,
        i18n,
        cheapModelId: CHEAP_MODEL_ID,
        councilResponseCharLimit: COUNCIL_RESPONSE_CHAR_LIMIT,
        councilRetryDelayMs: COUNCIL_RETRY_DELAY_MS,
        councilMaxModels: COUNCIL_MAX_MODELS,
        getActiveConversation,
        normalizeConversationModel,
        getModelApiId,
        getApiKeyForProvider,
        getDefaultGenConfig,
        modelSupportsUploadedFile,
        modelSupportsVision,
        getErrorMessage,
        readErrorBody,
        getSingleDocumentTranslatorModel,
        modelUsesTavilySearch,
        getCouncilSelectedModels,
        getCouncilTexts,
        getCouncilRuntimeTexts,
        getCouncilAttachmentTranslationNeed,
        getCouncilTranslatorModel,
        modelUsesNativeWebSearch,
        modelSupportsDocumentUpload,
        conversationNeedsTavilySearch,
        getCouncilValidation,
        isCouncilEnabled,
        renderHistorySidebar,
        conversationStateAccess,
        getProviderLabel,
        getModelPriceLabel,
        setApiKeyForProvider,
        mergeSensitiveApiKeys = (apiKeys) => {
            config.apiKeys = { ...config.apiKeys, ...apiKeys };
            return config.apiKeys;
        },
        clearSensitiveApiKeys = () => {
            config.apiKeys = {};
            return config.apiKeys;
        },
        saveSensitiveConfig = async () => {},
        getCouncilTranslatorCandidates,
        getSingleTranslatorCandidates,
        escapeHTML,
        renderUiColorOptions,
        renderTrash,
        renderModelSwitcher,
        renderStore,
        updateApiKeyWarningBadge,
        applyUiTheme,
        applyLanguage,
        togglePinChat,
        archiveChat,
        deleteChat,
        showRenameModal,
        moveConversationToFolder,
        createNewFolder,
        showCustomPrompt,
        showCustomConfirm,
        showCustomDialog,
        showNotification,
        toggleModal,
        saveConfig,
        saveAppData,
        loadConfig = async () => {},
        loadAppData = async () => {},
        getUserKey,
        getItem,
        setItem,
        removeItem,
        verifyPasswordRecord,
        upgradeLegacyPasswordRecord,
        createPasswordRecord
    } = dependencies;

    const config = createLiveObject(() => runtimeConfigAccess.getConfig());
    const astras = createLiveObject(() => runtimeAppDataStore.getAstras());
    const personalMemories = createLiveObject(() => runtimeAppDataStore.getPersonalMemories());
    const uploadedFiles = createLiveObject(() => uploads.getUploadedFiles());
    const getMemoryState = () => runtimeAppDataStore.getMemoryState();
    const {
        streamApiCall,
        runMemoryModel,
        buildSingleModelTranslatedRequestParts,
        fetchTavilySearchPacket,
        streamCouncilApiCallWithRetry,
        runModelCouncil,
        callApiWithSchema,
        generateTitleAndSummary,
        prepareModelRequests
    } = createModelRequestRuntime({
        // Loaded ahead a few seconds after the start, when the page is idle, so the first message does not wait for it.
        whenIdle: (run) => window?.setTimeout?.(() => (window.requestIdleCallback ? window.requestIdleCallback(run, { timeout: 8000 }) : run()), 4000),
        fetch, console, elements: ALL_ELEMENTS, getMemoryState, getMemory, models: MODELS, i18n, config, astras, personalMemories,
        cheapModelId: CHEAP_MODEL_ID, councilResponseCharLimit: COUNCIL_RESPONSE_CHAR_LIMIT, councilRetryDelayMs: COUNCIL_RETRY_DELAY_MS,
        councilMaxModels: COUNCIL_MAX_MODELS, getActiveConversation, normalizeConversationModel, getModelApiId, getApiKeyForProvider,
        getDefaultGenConfig, modelSupportsUploadedFile, modelSupportsVision, modelSupportsDocumentUpload, modelUsesTavilySearch,
        modelUsesNativeWebSearch, getErrorMessage, readErrorBody, getSingleDocumentTranslatorModel, getCouncilSelectedModels, getCouncilTexts,
        getCouncilRuntimeTexts, getCouncilAttachmentTranslationNeed, getCouncilTranslatorModel, renderHistorySidebar, conversationStateAccess,
        saveAppData, showNotification
    });
    const updateInputStateHelper = createSettingsUpdateInputStateHelper({
        elements: ALL_ELEMENTS,
        getQuoteReference: quote.getQuoteReference,
        getAbortController: reply.getAbortController,
        getConfig: () => config,
        getUploadedFiles: () => uploadedFiles,
        i18n,
        getActiveConversation,
        normalizeConversationModel,
        getApiKeyForProvider,
        conversationNeedsTavilySearch,
        getCouncilValidation,
        isCouncilEnabled
    });
    const {
        updateInputState
    } = updateInputStateHelper;
    const updateSubmitButtonState = (isGenerating) => {
        const { submitButton, submitButtonIcon } = ALL_ELEMENTS;
        if (isGenerating) {
            submitButton.disabled = false;
            submitButtonIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>`;
        } else {
            updateInputState();
        }
    };
    const getTavilySearchDepth = () => config.tavilySearchDepth === 'advanced' ? 'advanced' : 'basic';
    const apiKeyControls = createSettingsApiKeyControls({
        document,
        elements: ALL_ELEMENTS,
        getApiKeyForProvider,
        setApiKeyForProvider,
        mergeSensitiveApiKeys,
        clearSensitiveApiKeys,
        saveSensitiveConfig,
        getUiLanguage: () => config.uiLanguage
    });
    const {
        prepareApiKeyInputsForSettings,
        persistApiKeyInputIntents
    } = apiKeyControls;

    const outputTranslatorControls = createSettingsOutputTranslatorControls({
        document,
        elements: ALL_ELEMENTS,
        config,
        i18n,
        getCouncilTranslatorCandidates,
        getSingleTranslatorCandidates,
        getProviderLabel,
        getModelPriceLabel,
        modelSupportsVision,
        modelSupportsDocumentUpload,
        escapeHTML
    });
    const {
        ensureCouncilTranslatorSettingsControls,
        renderTranslatorModelPickers,
        syncSearchProviderControls
    } = outputTranslatorControls;
    const getSettingsText = (key, fallback) => i18n[config.uiLanguage]?.[key] || fallback;
    const authActionsHelper = createSettingsAuthActionsHelper({
        window,
        requestAnimationFrame,
        setTimeout,
        console,
        elements: ALL_ELEMENTS,
        session,
        getConfig: () => config,
        initChatApp,
        runtimeStorageAdapter,
        i18n,
        showNotification,
        showCustomConfirm,
        showCustomDialog,
        getUserKey,
        getItem,
        setItem,
        removeItem,
        verifyPasswordRecord,
        upgradeLegacyPasswordRecord,
        createPasswordRecord,
        loadConfig,
        loadAppData,
        applyUiTheme
    });
    const {
        handleLogin,
        handleLogout,
        handleDeleteAllData
    } = authActionsHelper;
    const mobileShellHelper = createSettingsMobileShellHelper({
        window,
        document,
        elements: ALL_ELEMENTS,
        escapeHTML,
        getSettingsText,
        handleLogout: (...args) => handleLogout(...args),
        setTimeout,
        clearTimeout
    });
    const {
        ensureSettingsMobileShell,
        renderSettingsMobileList,
        clearSettingsMobileViewTransition,
        showSettingsMobileList,
        openSettingsMobileSection,
        isMobileSettingsViewport
    } = mobileShellHelper;
    const desktopSectionHelper = createSettingsDesktopSectionHelper({
        document,
        elements: ALL_ELEMENTS,
        isMobileSettingsViewport,
        showSettingsMobileList,
        clearSettingsMobileViewTransition
    });
    const {
        activateDefaultDesktopSettingsSection,
        bindDesktopSettingsSections,
        syncSettingsSectionForViewport
    } = desktopSectionHelper;
    const { setupSettingsModal, saveSettings } = createSettingsModalLifecycle({
        window, document, console, elements: ALL_ELEMENTS, getCurrentUser: session.getCurrentUser, getMemoryState, getMemory,
        runtimeStorageAdapter, models: MODELS, i18n, config,
        getSettingsText, getTavilySearchDepth, getApiKeyForProvider, saveConfig, showNotification, showCustomPrompt, showCustomDialog,
        showCustomConfirm, toggleModal, applyUiTheme, applyLanguage, renderModelSwitcher, renderStore, renderTrash, renderUiColorOptions,
        updateThemeButtons: (...args) => updateThemeButtons(...args), updateApiKeyWarningBadge, updateInputState, ensureSettingsMobileShell,
        renderSettingsMobileList, bindDesktopSettingsSections, activateDefaultDesktopSettingsSection, syncSettingsSectionForViewport,
        ensureCouncilTranslatorSettingsControls, prepareApiKeyInputsForSettings, persistApiKeyInputIntents, syncSearchProviderControls,
        renderTranslatorModelPickers
    });
    const themeBubbleControls = createSettingsThemeBubbleControls({
        config,
        saveConfig
    });
    const {
        setTheme,
        updateThemeButtons
    } = themeBubbleControls;
    // The menu of a conversation in the history (settings-history-menu-helper.js) loads the first time one is opened.
    const historyMenuHelper = createLazyFunctions(() => import('./settings-history-menu-helper.js').then(({ createSettingsHistoryMenuHelper }) => createSettingsHistoryMenuHelper({
        window,
        document,
        requestAnimationFrame,
        getConfig: () => config,
        getConversations: () => runtimeAppDataStore.getConversations(),
        getFolders: () => runtimeAppDataStore.getFolders(),
        i18n,
        showRenameModal,
        togglePinChat,
        archiveChat,
        deleteChat,
        moveConversationToFolder,
        createNewFolder,
        showCustomPrompt
    })), ['createHistoryMenu']);
    const {
        createHistoryMenu
    } = historyMenuHelper;

    return {
        streamApiCall,
        runMemoryModel,
        buildSingleModelTranslatedRequestParts,
        fetchTavilySearchPacket,
        streamCouncilApiCallWithRetry,
        runModelCouncil,
        callApiWithSchema,
        generateTitleAndSummary,
        prepareModelRequests,
        updateSubmitButtonState,
        updateInputState,
        getTavilySearchDepth,
        isMobileSettingsViewport,
        openSettingsMobileSection,
        setupSettingsModal,
        saveSettings,
        createHistoryMenu,
        setTheme,
        updateThemeButtons,
        handleLogin,
        handleLogout,
        handleDeleteAllData
    };
}
