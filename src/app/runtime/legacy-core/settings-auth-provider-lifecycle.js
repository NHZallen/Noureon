import {
    buildTavilySearchQuery,
    formatTavilySearchPacket,
    getSearchCurrentDate
} from '../../legacy-runtime/features/model-request-formatting.js';
import { createStreamApiCall } from '../../legacy-runtime/features/stream-api-call.js';
import { createCurrentMemoryContextProvider } from '../memory/current-memory-context-provider.js';
import { createCouncilResponseLifecycle } from '../../legacy-runtime/features/council-response-lifecycle.js';
import { createProviderRequestSupport } from '../../legacy-runtime/features/provider-request-support.js';
import { createSettingsApiKeyControls } from './settings-api-key-controls.js';
import { createSettingsOutputTranslatorControls } from './settings-output-translator-controls.js';
import { createSettingsProviderStructuredHelpers } from './settings-provider-structured-helpers.js';
import { createSettingsTitleSummaryHelpers } from './settings-title-summary-helpers.js';
import { createSettingsHistoryMenuHelper } from './settings-history-menu-helper.js';
import { createSettingsThemeBubbleControls } from './settings-theme-bubble-controls.js';
import { createSettingsMobileShellHelper } from './settings-mobile-shell-helper.js';
import { createSettingsDesktopSectionHelper } from './settings-desktop-section-helper.js';
import { createSettingsAuthActionsHelper } from './settings-auth-actions-helper.js';
import { createSettingsUpdateInputStateHelper } from './settings-update-input-state-helper.js';
import { collectSettingsSaveFormValues } from './settings-save-settings-helper.js';
import { getModelReasoningConfig, normalizeReasoningEffort } from './model-registry.js';

const requiredDependencies = [
    'window',
    'document',
    'fetch',
    'elements',
    'state',
    'legacyRuntimeContext',
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
        throw new TypeError(`createLegacySettingsAuthProviderLifecycle missing dependencies: ${missing.join(', ')}`);
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

export function createLegacySettingsAuthProviderLifecycle(dependencies = {}) {
    assertRequiredDependencies(dependencies);

    const {
        window,
        document,
        fetch,
        AbortSignal: AbortSignalCtor = globalThis.AbortSignal,
        requestAnimationFrame,
        setTimeout = globalThis.setTimeout,
        clearTimeout = globalThis.clearTimeout,
        console = globalThis.console,
        elements: ALL_ELEMENTS,
        state,
        legacyRuntimeContext,
        runtimeStorageAdapter,
        models: MODELS,
        i18n,
        cheapModelId: CHEAP_MODEL_ID,
        councilResponseCharLimit: COUNCIL_RESPONSE_CHAR_LIMIT,
        councilRetryDelayMs: COUNCIL_RETRY_DELAY_MS,
        councilMaxModels: COUNCIL_MAX_MODELS,
        aiBubbleColors: AI_BUBBLE_COLORS,
        userBubbleColors: USER_BUBBLE_COLORS,
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
        getCouncilSharedSearchModel,
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
        getOutputMode = () => 'typewriter',
        escapeHTML,
        hexToRgba,
        renderPersonalMemoryList,
        renderUiColorOptions,
        renderTrash,
        renderModelSwitcher,
        renderChat,
        renderStore,
        updateApiKeyWarningBadge,
        applyUiTheme,
        applyCustomWallpaper = () => {},
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
        createPasswordRecord,
        renderAll,
        logger = console
    } = dependencies;

    const config = createLiveObject(() => state.config);
    const conversations = createLiveObject(() => state.conversations);
    const folders = createLiveObject(() => state.folders);
    const astras = createLiveObject(() => state.astras);
    const personalMemories = createLiveObject(() => state.personalMemories);
    const uploadedFiles = createLiveObject(() => state.uploadedFiles);
    const getMemoryContext = createCurrentMemoryContextProvider({
        getMemoryState: () => state.memoryState
    });
    const AbortSignal = AbortSignalCtor;

function calculateRelevanceScore(summary, keywords) {
    if (!summary || !keywords || keywords.length === 0) {
        return 0;
    }
    const summaryLower = summary.toLowerCase();
    let score = 0;
    keywords.forEach(keyword => {
        if (summaryLower.includes(keyword.toLowerCase())) {
            score++;
        }
    });
    const coverageRatio = score / keywords.length;
    return score * (1 + coverageRatio);
}
const streamApiCall = createStreamApiCall({
    getActiveConversation,
    normalizeConversationModel,
    getModelApiId,
    getApiKeyForProvider,
    getDefaultGenConfig,
    getConfig: () => config,
    getAstras: () => astras,
    getPersonalMemories: () => personalMemories,
    getMemoryContext,
    modelSupportsUploadedFile,
    modelSupportsVision,
    getModelReasoningConfig,
    normalizeReasoningEffort
});
const providerRequestSupport = createProviderRequestSupport({
    buildTavilySearchQuery,
    formatTavilySearchPacket,
    getErrorMessage,
    readErrorBody,
    getApiKeyForProvider,
    getConfig: () => config,
    getActiveConversation,
    streamApiCall,
    getSingleDocumentTranslatorModel,
    modelUsesTavilySearch,
    modelSupportsUploadedFile,
    councilResponseCharLimit: COUNCIL_RESPONSE_CHAR_LIMIT,
    councilRetryDelayMs: COUNCIL_RETRY_DELAY_MS
});
const {
    buildSingleModelTranslatedRequestParts,
    extractTextFromParts,
    fetchTavilySearchPacket,
    filterPartsForModelCapability,
    getSearchQueryFromParts,
    streamCouncilApiCallWithRetry,
    truncateCouncilText
} = providerRequestSupport;
const councilResponseLifecycle = createCouncilResponseLifecycle({
    buildTavilySearchQuery,
    getSearchCurrentDate,
    getConfig: () => config,
    getActiveConversation,
    getCouncilSelectedModels,
    getCouncilTexts,
    getCouncilRuntimeTexts,
    getCouncilAttachmentTranslationNeed,
    getCouncilTranslatorModel,
    getCouncilSharedSearchModel,
    models: MODELS,
    councilMaxModels: COUNCIL_MAX_MODELS,
    extractTextFromParts,
    truncateCouncilText,
    filterPartsForModelCapability,
    getSearchQueryFromParts,
    fetchTavilySearchPacket,
    streamCouncilApiCallWithRetry,
    modelUsesNativeWebSearch,
    modelSupportsVision,
    modelSupportsDocumentUpload
});
const runModelCouncil = (...args) => councilResponseLifecycle.runModelCouncil(...args);
const structuredHelpers = createSettingsProviderStructuredHelpers({
    fetchImpl: fetch,
    AbortSignal,
    getApiKeyForProvider,
    readErrorBody,
    cheapModelId: CHEAP_MODEL_ID,
    logger: console
});
const {
    callApiWithSchema,
    shouldPerformWebSearch
} = structuredHelpers;
const titleSummaryHelpers = createSettingsTitleSummaryHelpers({
    callApiWithSchema
});
const {
    requestTitleSummary
} = titleSummaryHelpers;
const generateTitleAndSummary = async (conv) => {
    const data = await requestTitleSummary(conv, undefined, {
        language: config.aiDefaultLanguage || config.uiLanguage
    });
    if (data && data.title) {
        conv.title = data.title;
        delete conv.summary;
        conv.isNaming = false;
        await saveAppData();
        renderHistorySidebar();
        if (conv.id === conversationStateAccess.getCurrentConversationId()) { ALL_ELEMENTS.headerTitle.textContent = conv.title; }
        showNotification(i18n[config.uiLanguage].autoNamed || '對話已自動命名', 'success');
    } else {
        conv.isNaming = false;
        await saveAppData();
        renderHistorySidebar();
        console.error("Auto-naming failed: No valid JSON found in the response.");
    }
};
const updateInputStateHelper = createSettingsUpdateInputStateHelper({
    elements: ALL_ELEMENTS,
    state,
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
    saveSensitiveConfig
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
    getOutputMode,
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
    ensureOutputModeSettingsControls,
    renderTranslatorModelPickers,
    syncOutputModeSettingsControls
} = outputTranslatorControls;
const getSettingsText = (key, fallback) => i18n[config.uiLanguage]?.[key] || fallback;
const authActionsHelper = createSettingsAuthActionsHelper({
    window,
    requestAnimationFrame,
    setTimeout,
    console,
    elements: ALL_ELEMENTS,
    state,
    getConfig: () => config,
    legacyRuntimeContext,
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
    applyCustomWallpaper,
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
const ensureUserSettingsNavigationShell = () => {
    const settingsNav = ALL_ELEMENTS.settingsNav;
    const personalizationNav = settingsNav?.querySelector('[data-section="personalization"]');
    if (!settingsNav || !personalizationNav) return;

    if (!document.getElementById('user-section-nav')) {
        const nav = document.createElement('li');
        nav.id = 'user-section-nav';
        nav.className = 'settings-nav-item p-3 rounded-md';
        nav.dataset.section = 'user';
        nav.dataset.langKey = 'userSettings';
        nav.textContent = getSettingsText('userSettings', 'User settings');
        personalizationNav.before(nav);
    }

    if (!document.getElementById('user-section')) {
        const personalizationSection = document.getElementById('personalization-section');
        if (!personalizationSection) return;
        const section = document.createElement('div');
        section.id = 'user-section';
        section.className = 'settings-section';
        personalizationSection.before(section);
    }
};
let syncVaultControlsPromise;
const loadSyncVaultControls = () => {
    if (!syncVaultControlsPromise) {
        syncVaultControlsPromise = import('./settings-sync-vault-controls.js').then(({ createSettingsSyncVaultControls }) => (
            createSettingsSyncVaultControls({
                window,
                document,
                storage: runtimeStorageAdapter,
                getCurrentUser: () => state.currentUser,
                getText: getSettingsText,
                showNotification
            })
        ));
    }
    return syncVaultControlsPromise;
};
const ensureAutoWebSearchSettingsControl = () => {
    if (document.getElementById('auto-web-search-toggle-switch')) {
        ALL_ELEMENTS.autoWebSearchToggleSwitch = document.getElementById('auto-web-search-toggle-switch');
        return;
    }
    const section = document.getElementById('accessibility-section');
    if (!section) return;
    const row = document.createElement('div');
    row.className = 'flex items-center justify-between mt-4';
    row.innerHTML = `
        <label for="auto-web-search-toggle-switch" class="flex-1 text-sm font-medium" data-lang-key="enableSmartWebSearch">Enable Smart Search</label>
        <div class="relative inline-block w-12 h-6 mr-2 align-middle select-none transition duration-200 ease-in">
            <input type="checkbox" name="auto-web-search-toggle-switch" id="auto-web-search-toggle-switch" class="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer"/>
            <label for="auto-web-search-toggle-switch" class="toggle-label block overflow-hidden h-6 rounded-full bg-gray-300 cursor-pointer"></label>
        </div>
    `;
    const namingRow = section.querySelector('#auto-naming-toggle-switch')?.closest('.flex.items-center.justify-between');
    if (namingRow) {
        namingRow.after(row);
    } else {
        section.appendChild(row);
    }
    ALL_ELEMENTS.autoWebSearchToggleSwitch = row.querySelector('#auto-web-search-toggle-switch');
};
const setupSettingsModal = () => {
    ensureSettingsMobileShell();
    ensureUserSettingsNavigationShell();
    ensureAutoWebSearchSettingsControl();
    ensureCouncilTranslatorSettingsControls();
    ensureOutputModeSettingsControls();
    prepareApiKeyInputsForSettings();
    if (ALL_ELEMENTS.tavilySearchDepthSelect) ALL_ELEMENTS.tavilySearchDepthSelect.value = getTavilySearchDepth();
    renderTranslatorModelPickers();
    applyLanguage(config.uiLanguage);
    ALL_ELEMENTS.autoNamingToggleSwitch.checked = config.autoNaming;
    ALL_ELEMENTS.autoWebSearchToggleSwitch.checked = config.enableAutoWebSearch;
    if (ALL_ELEMENTS.outputModeSelect) {
        ALL_ELEMENTS.outputModeSelect.value = getOutputMode();
        syncOutputModeSettingsControls();
    }
    ALL_ELEMENTS.memoryToggle1.checked = config.memoryProfileEnabled !== false;
    ALL_ELEMENTS.autoMemoryToggleSwitch.checked = config.enableAutoMemory;
    ALL_ELEMENTS.uiLanguageSelect.value = config.uiLanguage;
    ALL_ELEMENTS.aiLanguageSelect.value = config.aiDefaultLanguage;
    ALL_ELEMENTS.enableUpdateNotificationsToggle.checked = config.enableUpdateNotifications;
    renderPersonalMemoryList();
    updateThemeButtons();
    const aiBubbleColorTitle = document.querySelector('h3[data-lang-key="aiBubbleColor"]');
    const aiBubbleColorDropdown = ALL_ELEMENTS.aiBubbleColorDropdown;
    if (config.customWallpaper) {
        // 只有在自訂桌布模式下才顯示 AI 泡泡顏色選項
        aiBubbleColorTitle.style.display = 'block';
        aiBubbleColorDropdown.style.display = 'block';
        renderAiBubbleColorDropdown();
    } else {
        // 否則隱藏
        aiBubbleColorTitle.style.display = 'none';
        aiBubbleColorDropdown.style.display = 'none';
    }


    // 使用者泡泡顏色設定總是顯示並渲染
    renderUserBubbleColorDropdown();
    renderUiColorOptions();
    renderTrash();
    renderSettingsMobileList();
    const navItems = bindDesktopSettingsSections();
    activateDefaultDesktopSettingsSection(navItems);
    syncSettingsSectionForViewport(navItems);
    void loadSyncVaultControls().then(async (controls) => {
        controls.ensureSyncVaultSettings();
        applyLanguage(config.uiLanguage);
        renderSettingsMobileList();
        const nextNavItems = bindDesktopSettingsSections();
        activateDefaultDesktopSettingsSection(nextNavItems);
        syncSettingsSectionForViewport(nextNavItems);
        await controls.refreshSyncVaultControls();
    }).catch(error => console.error('Failed to load sync vault settings:', error));
};
const saveSettings = async ({ close = true, notify = true } = {}) => {
    await persistApiKeyInputIntents();
    const collectedSettings = collectSettingsSaveFormValues({
        document,
        elements: ALL_ELEMENTS,
        config
    });
    Object.assign(config, {
        tavilySearchDepth: collectedSettings.tavilySearchDepth,
        councilTranslatorModelId: collectedSettings.councilTranslatorModelId,
        singleDocumentTranslatorModelId: collectedSettings.singleDocumentTranslatorModelId,
        enableAutoWebSearch: collectedSettings.enableAutoWebSearch,
        outputMode: collectedSettings.outputMode,
        aiBubbleColor: collectedSettings.aiBubbleColor,
        userBubbleColor: collectedSettings.userBubbleColor,
        autoNaming: collectedSettings.autoNaming,
        memoryEnabled1: collectedSettings.memoryEnabled1,
        memoryProfileEnabled: collectedSettings.memoryEnabled1,
        enableAutoMemory: collectedSettings.enableAutoMemory,
        uiLanguage: collectedSettings.uiLanguage,
        aiDefaultLanguage: collectedSettings.aiDefaultLanguage,
        enableUpdateNotifications: collectedSettings.enableUpdateNotifications
    });
    Object.assign(config.uiTheme, collectedSettings.uiTheme);
    setAiBubbleColor();
    setUserBubbleColor();
    applyUiTheme();
    await saveConfig();
    applyLanguage(config.uiLanguage);
    renderModelSwitcher();
    renderStore();
    if (close) {
        toggleModal(ALL_ELEMENTS.settingsModal, false);
    }
    updateApiKeyWarningBadge();
    updateInputState();
    if (notify) {
        showNotification(i18n[config.uiLanguage].settingsSaved || '設定已儲存！');
    }
};
const themeBubbleControls = createSettingsThemeBubbleControls({
    window,
    document,
    elements: ALL_ELEMENTS,
    config,
    aiBubbleColors: AI_BUBBLE_COLORS,
    userBubbleColors: USER_BUBBLE_COLORS,
    hexToRgba,
    saveConfig
});
const {
    setAiBubbleColor,
    setUserBubbleColor,
    renderAiBubbleColorDropdown,
    renderUserBubbleColorDropdown,
    setTheme,
    updateThemeButtons
} = themeBubbleControls;
const historyMenuHelper = createSettingsHistoryMenuHelper({
    window,
    document,
    requestAnimationFrame,
    getConfig: () => config,
    getConversations: () => conversations,
    getFolders: () => folders,
    i18n,
    showRenameModal,
    togglePinChat,
    archiveChat,
    deleteChat,
    moveConversationToFolder,
    createNewFolder,
    showCustomPrompt
});
const {
    createHistoryMenu
} = historyMenuHelper;


    return {
        streamApiCall,
        providerRequestSupport,
        councilResponseLifecycle,
        buildSingleModelTranslatedRequestParts,
        extractTextFromParts,
        fetchTavilySearchPacket,
        filterPartsForModelCapability,
        getSearchQueryFromParts,
        streamCouncilApiCallWithRetry,
        truncateCouncilText,
        runModelCouncil,
        callApiWithSchema,
        shouldPerformWebSearch,
        generateTitleAndSummary,
        updateSubmitButtonState,
        updateInputState,
        getTavilySearchDepth,
        isMobileSettingsViewport,
        openSettingsMobileSection,
        setupSettingsModal,
        saveSettings,
        setAiBubbleColor,
        setUserBubbleColor,
        renderAiBubbleColorDropdown,
        renderUserBubbleColorDropdown,
        createHistoryMenu,
        setTheme,
        updateThemeButtons,
        handleLogin,
        handleLogout,
        handleDeleteAllData
    };
}
