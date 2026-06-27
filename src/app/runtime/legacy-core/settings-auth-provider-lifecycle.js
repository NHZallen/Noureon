import {
    buildTavilySearchQuery,
    formatTavilySearchPacket,
    getSearchCurrentDate
} from '../../legacy-runtime/features/model-request-formatting.js';
import { createStreamApiCall } from '../../legacy-runtime/features/stream-api-call.js';
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
        renderModelManagementUI,
        renderUiColorOptions,
        renderTrash,
        renderModelSwitcher,
        renderChat,
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
    modelSupportsUploadedFile,
    modelSupportsVision
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
    const data = await requestTitleSummary(conv);
    if (data && data.title && data.summary) {
        conv.title = data.title;
        conv.summary = data.summary;
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
const updateSubmitButtonState = (isGenerating) => {
    const { submitButton, submitButtonIcon } = ALL_ELEMENTS;
    if (isGenerating) {
        submitButton.disabled = false;
        submitButtonIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>`;
    } else {
        updateInputState();
    }
};
const updateInputState = () => {
    const hasContent = ALL_ELEMENTS.messageInput.value.trim() !== '' || uploadedFiles.length > 0;
    const { submitButton, submitButtonIcon } = ALL_ELEMENTS;
    const sendIconHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"></path><path d="m5 12 7-7 7 7"></path></svg>`;
    const disabledIconHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="m5.7 5.7 12.6 12.6"></path></svg>`;
    if (state.abortController) {
        submitButton.disabled = false;
        submitButtonIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>`;
        return;
    }
    const conv = getActiveConversation();
    if (!conv) {
        submitButton.disabled = true;
        submitButtonIcon.innerHTML = disabledIconHTML;
        return;
    }
    if (conv.archived) {
        ALL_ELEMENTS.messageInput.disabled = true;
        submitButton.disabled = true;
        ALL_ELEMENTS.messageInput.placeholder = i18n[config.uiLanguage].viewingArchived || '正在檢視封存的對話，無法傳送訊息。';
        return;
    }
    const modelInfo = normalizeConversationModel(conv);
    const provider = modelInfo?.provider;
    const councilValidation = getCouncilValidation(conv);
    const hasTavilyKey = !conversationNeedsTavilySearch(conv) || !!getApiKeyForProvider('tavily');
    const hasModelApiKey = isCouncilEnabled(conv)
        ? councilValidation.reason !== 'missingApiKey'
        : !!getApiKeyForProvider(provider);
    const canSubmitWithSearch = hasTavilyKey;
    const hasApiKey = hasModelApiKey && canSubmitWithSearch;
    ALL_ELEMENTS.messageInput.disabled = !hasModelApiKey;
    ALL_ELEMENTS.messageInput.placeholder = hasModelApiKey
        ? (isCouncilEnabled(conv) && !councilValidation.ok ? councilValidation.message : i18n[config.uiLanguage].enterMessagePlaceholder)
        : i18n[config.uiLanguage].enterApiKeyPlaceholder;
    if (!hasApiKey || !hasContent || (isCouncilEnabled(conv) && !councilValidation.ok)) {
        submitButton.disabled = true;
        submitButtonIcon.innerHTML = disabledIconHTML;
    } else {
        submitButton.disabled = false;
submitButtonIcon.innerHTML = sendIconHTML;
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
    bindDesktopSettingsSections,
    syncSettingsSectionForViewport
} = desktopSectionHelper;
const setupSettingsModal = () => {
    ensureSettingsMobileShell();
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
    ALL_ELEMENTS.memoryToggle1.checked = config.memoryEnabled1;
    ALL_ELEMENTS.autoMemoryToggleSwitch.checked = config.enableAutoMemory;
    ALL_ELEMENTS.uiLanguageSelect.value = config.uiLanguage;
    ALL_ELEMENTS.aiLanguageSelect.value = config.aiDefaultLanguage;
    ALL_ELEMENTS.enableUpdateNotificationsToggle.checked = config.enableUpdateNotifications;
    renderPersonalMemoryList();
    updateThemeButtons();
    renderModelManagementUI();
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
    syncSettingsSectionForViewport(navItems);
};
const saveSettings = async ({ close = true, notify = true } = {}) => {
    await persistApiKeyInputIntents();
    config.tavilySearchDepth = ALL_ELEMENTS.tavilySearchDepthSelect?.value === 'advanced' ? 'advanced' : 'basic';
    config.councilTranslatorModelId = ALL_ELEMENTS.councilTranslatorModelSelect?.value || null;
    config.singleDocumentTranslatorModelId = ALL_ELEMENTS.singleDocumentTranslatorModelSelect?.value || null;
    config.enableAutoWebSearch = ALL_ELEMENTS.autoWebSearchToggleSwitch.checked;
    config.outputMode = ALL_ELEMENTS.outputModeSelect?.value === 'realtime' ? 'realtime' : 'typewriter';
    config.aiBubbleColor = ALL_ELEMENTS.aiBubbleColorDropdown.querySelector('.color-dropdown-btn')?.dataset.color || 'default';
    config.userBubbleColor = ALL_ELEMENTS.userBubbleColorDropdown.querySelector('.color-dropdown-btn')?.dataset.color || 'default';
    config.autoNaming = ALL_ELEMENTS.autoNamingToggleSwitch.checked;
    config.memoryEnabled1 = ALL_ELEMENTS.memoryToggle1.checked;
    config.enableAutoMemory = ALL_ELEMENTS.autoMemoryToggleSwitch.checked;
    config.uiLanguage = ALL_ELEMENTS.uiLanguageSelect.value;
    config.aiDefaultLanguage = ALL_ELEMENTS.aiLanguageSelect.value;
    config.enableUpdateNotifications = ALL_ELEMENTS.enableUpdateNotificationsToggle.checked;
    const selectedThemeMode = document.querySelector('input[name="color-theme"]:checked').value;
    const selectedCustomColor = ALL_ELEMENTS.customColorSwatches.querySelector('.selected')?.dataset.color || config.uiTheme.customColor;
    const selectedStyle = document.querySelector('input[name="color-style"]:checked')?.value || 'single';
    const selectedGradientSwatch = ALL_ELEMENTS.gradientSwatches.querySelector('.selected-gradient');
    const selectedGradient = selectedGradientSwatch ? selectedGradientSwatch.dataset.gradient : (config.uiTheme.adaptivePalette?.length > 1 ? `linear-gradient(to right, ${config.uiTheme.adaptivePalette[0]}, ${config.uiTheme.adaptivePalette[1]})` : '');
    config.uiTheme.mode = selectedThemeMode;
    config.uiTheme.customColor = selectedCustomColor;
    config.uiTheme.style = selectedStyle;
    config.uiTheme.adaptiveGradient = selectedGradient;
    setAiBubbleColor();
    setUserBubbleColor();
    applyUiTheme();
    await saveConfig();
    applyLanguage(config.uiLanguage);
    renderModelSwitcher();
    renderChat();
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
const handleLogin = async (e) => {
    e.preventDefault();
    const username = ALL_ELEMENTS.usernameInput.value.trim();
    const password = ALL_ELEMENTS.passwordInput.value;
    if (!username || !password) {
showNotification(i18n[config.uiLanguage].usernamePasswordRequired || '使用者名稱和密碼皆為必填項目。', 'error');
return;
    }
    const userKey = getUserKey(username);
    const savedUser = await getItem(userKey);
    if (savedUser) {
const parsedUser = JSON.parse(savedUser);
if (!(await verifyPasswordRecord(password, parsedUser))) {
    showNotification(i18n[config.uiLanguage].passwordIncorrect || '密碼錯誤。', 'error');
    return;
}
state.currentUser = await upgradeLegacyPasswordRecord(password, userKey, parsedUser);
    } else {
state.currentUser = await createPasswordRecord(username, password);
await setItem(userKey, JSON.stringify(state.currentUser));
    }
    await setItem('chat_lastUser', username);


    // --- ✨ 這是唯一的修改處 START ---
    // 在執行淡出前，先移除我們為了顯示登入畫面而加入的 'visible' class
    ALL_ELEMENTS.authContainer.classList.remove('visible'); 
    // --- ✨ 這是唯一的修改處 END ---


    ALL_ELEMENTS.authContainer.classList.add('fade-out');
    ALL_ELEMENTS.appContainer.classList.remove('hidden');
    requestAnimationFrame(() => {
ALL_ELEMENTS.appContainer.classList.add('visible');
    });
    ALL_ELEMENTS.authContainer.addEventListener('transitionend', () => {
ALL_ELEMENTS.authContainer.style.display = 'none';
    }, { once: true });
    legacyRuntimeContext.resolveBinding('app.initChatApp')();
};
const handleLogout = async () => {
    if (await showCustomConfirm(i18n[config.uiLanguage].confirmLogout || '您確定要登出嗎？', i18n[config.uiLanguage].logoutConfirmation || '登出確認')) {
        await removeItem('chat_lastUser');
        window.location.reload();
    }
};
const handleDeleteAllData = async () => {
    const confirmation = await showCustomDialog({
        title: i18n[config.uiLanguage].deleteAllDataTitle || '永久刪除所有資料',
        message: i18n[config.uiLanguage].deleteAllDataMessage || '此操作將會刪除您所有的對話紀錄、設定、Astras 及 API 金鑰。此動作無法復原。請輸入「DELETE」以確認刪除。',
        input: { type: 'text', placeholder: 'DELETE' },
        dialogClass: 'dialog-warning-border',
        buttons: [
            { text: i18n[config.uiLanguage].cancel || '取消', class: 'bg-[var(--hover-bg)] px-4 py-2 rounded-md hover:bg-[var(--active-bg)]', value: () => null },
            { text: i18n[config.uiLanguage].confirmDelete || '確認刪除', class: 'bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700', value: (val) => val }
        ]
    });
    if (confirmation === 'DELETE') {
        try {
            await runtimeStorageAdapter.clear();
            showNotification(i18n[config.uiLanguage].deleteAllDataSuccess || '所有資料已成功刪除。頁面即將重新整理。', 'success');
            setTimeout(() => {
                window.location.reload();
            }, 2000);
        } catch (error) {
            console.error('刪除資料時發生錯誤:', error);
            showNotification(i18n[config.uiLanguage].deleteAllDataError || '刪除資料失敗。', 'error');
        }
    } else if (confirmation !== null) {
        showNotification(i18n[config.uiLanguage].incorrectInput || '輸入錯誤，操作已取消。', 'warning');
    }
};


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
