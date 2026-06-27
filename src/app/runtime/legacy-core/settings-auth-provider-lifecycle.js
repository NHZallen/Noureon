import {
    buildTavilySearchQuery,
    formatTavilySearchPacket,
    getSearchCurrentDate
} from '../../legacy-runtime/features/model-request-formatting.js';
import { createStreamApiCall } from '../../legacy-runtime/features/stream-api-call.js';
import { createCouncilResponseLifecycle } from '../../legacy-runtime/features/council-response-lifecycle.js';
import { createProviderRequestSupport } from '../../legacy-runtime/features/provider-request-support.js';
import {
    SETTINGS_MOBILE_ICON_MAP,
    getSettingsMobileGroups as getSettingsMobileGroupsBase
} from '../../legacy-runtime/features/settings-mobile-metadata.js';
import { createSettingsApiKeyControls } from './settings-api-key-controls.js';
import { createSettingsOutputTranslatorControls } from './settings-output-translator-controls.js';
import { createSettingsProviderStructuredHelpers } from './settings-provider-structured-helpers.js';
import { createSettingsTitleSummaryHelpers } from './settings-title-summary-helpers.js';
import { createSettingsHistoryMenuHelper } from './settings-history-menu-helper.js';

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
        setTimeout,
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
const isMobileSettingsViewport = () => window.matchMedia('(max-width: 768px)').matches;
const SETTINGS_MOBILE_VIEW_TRANSITION_MS = 280;
let settingsMobileViewTransitionTimer = null;
const getSettingsText = (key, fallback) => i18n[config.uiLanguage]?.[key] || fallback;
const getSettingsMobileGroups = () => getSettingsMobileGroupsBase(getSettingsText);
const renderSettingsMobileList = () => {
    const settingsMobileList = document.getElementById('settings-mobile-list');
    if (!settingsMobileList) return;
    settingsMobileList.innerHTML = getSettingsMobileGroups().map(group => `
        <section class="settings-mobile-group">
            <h3 class="settings-mobile-group-title">${escapeHTML(group.title)}</h3>
            <div class="settings-mobile-card">
                ${group.items.map(item => `
                    <button type="button" class="settings-mobile-list-item settings-nav-item" data-section="${escapeHTML(item.section)}" data-mobile-title="${escapeHTML(item.label)}">
                        <span class="settings-mobile-row-icon">${SETTINGS_MOBILE_ICON_MAP[item.section] || SETTINGS_MOBILE_ICON_MAP.about}</span>
                        <span class="settings-mobile-row-label">${escapeHTML(item.label)}</span>
                        <span class="settings-mobile-chevron" aria-hidden="true">&rsaquo;</span>
                    </button>
                `).join('')}
            </div>
        </section>
    `).join('') + `
        <section class="settings-mobile-group settings-mobile-logout-group">
            <div class="settings-mobile-card">
                <button type="button" id="settings-mobile-logout-btn" class="settings-mobile-list-item settings-mobile-list-item-danger">
                    <span class="settings-mobile-row-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><path d="M16 17l5-5-5-5"></path><path d="M21 12H9"></path></svg>
                    </span>
                    <span class="settings-mobile-row-label">${escapeHTML(getSettingsText('logout', '登出'))}</span>
                </button>
            </div>
        </section>
    `;
    settingsMobileList.querySelector('#settings-mobile-logout-btn')?.addEventListener('click', handleLogout);
};
const ensureSettingsMobileShell = () => {
    const settingsBody = ALL_ELEMENTS.settingsModal?.querySelector('.flex.flex-1.overflow-hidden');
    if (!settingsBody || document.getElementById('settings-mobile-header')) return;
    const mobileHeader = document.createElement('div');
    mobileHeader.id = 'settings-mobile-header';
    mobileHeader.innerHTML = `
        <button type="button" id="settings-mobile-back-btn" aria-label="返回">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"></path></svg>
        </button>
        <h2 id="settings-mobile-title">${escapeHTML(getSettingsText('settings', '設定'))}</h2>
    `;
    const mobileList = document.createElement('div');
    mobileList.id = 'settings-mobile-list';
    settingsBody.prepend(mobileList);
    settingsBody.prepend(mobileHeader);
    const settingsMobileBackBtn = document.getElementById('settings-mobile-back-btn');
    settingsMobileBackBtn.addEventListener('click', () => showSettingsMobileList());
    mobileList.addEventListener('click', (event) => {
        const item = event.target.closest('.settings-mobile-list-item');
        if (!item?.dataset.section) return;
        openSettingsMobileSection(item.dataset.section);
    });
};
const clearSettingsMobileViewTransition = () => {
    if (!settingsMobileViewTransitionTimer) return;
    clearTimeout(settingsMobileViewTransitionTimer);
    settingsMobileViewTransitionTimer = null;
};
const showSettingsMobileList = ({ animate = true } = {}) => {
    ensureSettingsMobileShell();
    renderSettingsMobileList();
    const settingsModal = ALL_ELEMENTS.settingsModal;
    const finishReturn = () => {
        settingsModal.classList.remove('settings-mobile-detail-open', 'settings-mobile-returning');
        document.getElementById('settings-mobile-title').textContent = getSettingsText('settings', '閮剖?');
        document.querySelectorAll('.settings-section').forEach(section => section.classList.remove('active'));
        settingsMobileViewTransitionTimer = null;
    };
    clearSettingsMobileViewTransition();
    if (animate && isMobileSettingsViewport() && settingsModal.classList.contains('settings-mobile-detail-open')) {
        settingsModal.classList.add('settings-mobile-returning');
        document.getElementById('settings-mobile-title').textContent = getSettingsText('settings', '閮剖?');
        settingsMobileViewTransitionTimer = setTimeout(finishReturn, SETTINGS_MOBILE_VIEW_TRANSITION_MS);
        return;
    }
    finishReturn();
    document.getElementById('settings-mobile-title').textContent = getSettingsText('settings', '設定');
    document.querySelectorAll('.settings-section').forEach(section => section.classList.remove('active'));
};
const openSettingsMobileSection = (sectionName) => {
    ensureSettingsMobileShell();
    clearSettingsMobileViewTransition();
    const targetSection = document.getElementById(`${sectionName}-section`);
    if (!targetSection) return;
    ALL_ELEMENTS.settingsModal.classList.remove('settings-mobile-returning');
    document.querySelectorAll('.settings-section').forEach(section => section.classList.remove('active'));
    targetSection.classList.add('active');
    const listItem = Array.from(document.querySelectorAll('#settings-mobile-list [data-section]')).find(item => item.dataset.section === sectionName);
    document.getElementById('settings-mobile-title').textContent = listItem?.dataset.mobileTitle || sectionName;
    ALL_ELEMENTS.settingsModal.classList.add('settings-mobile-detail-open');
};
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
    const navItems = ALL_ELEMENTS.settingsNav.querySelectorAll('.settings-nav-item');
    navItems.forEach(item => {
        if (item.dataset.settingsDesktopBound === 'true') return;
        item.dataset.settingsDesktopBound = 'true';
        item.addEventListener('click', () => {
            navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            const sectionId = item.dataset.section + '-section';
            document.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));
            document.getElementById(sectionId).classList.add('active');
        });
    });
    if (isMobileSettingsViewport()) {
        showSettingsMobileList({ animate: false });
    } else {
        clearSettingsMobileViewTransition();
        ALL_ELEMENTS.settingsModal.classList.remove('settings-mobile-detail-open', 'settings-mobile-returning');
        const activeNavItem = ALL_ELEMENTS.settingsNav.querySelector('.settings-nav-item.active') || ALL_ELEMENTS.settingsNav.querySelector('.settings-nav-item');
        if (activeNavItem) {
            navItems.forEach(i => i.classList.toggle('active', i === activeNavItem));
            document.querySelectorAll('.settings-section').forEach(section => section.classList.remove('active'));
            document.getElementById(`${activeNavItem.dataset.section}-section`)?.classList.add('active');
        }
    }
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
const setAiBubbleColor = () => {
    const root = document.documentElement;
    const isWallpaperActive = document.body.classList.contains('custom-wallpaper-active');
    const mode = config.theme;
    const colors = AI_BUBBLE_COLORS[config.aiBubbleColor] || AI_BUBBLE_COLORS.default;
    const hexColor = colors[mode];
    if (isWallpaperActive) {
        const rgbaColor = hexToRgba(hexColor, 0.75);
        root.style.setProperty('--ai-bubble-bg', rgbaColor);
    } else {
        root.style.setProperty('--ai-bubble-bg', 'transparent');
    }
};
const setUserBubbleColor = () => {
    const root = document.documentElement;
    const isWallpaperActive = document.body.classList.contains('custom-wallpaper-active');
    const mode = config.theme;
    const colors = USER_BUBBLE_COLORS[config.userBubbleColor] || USER_BUBBLE_COLORS.default;
    const hexColor = colors[mode];
    if (isWallpaperActive) {
        const rgbaColor = hexToRgba(hexColor, 0.7);
        root.style.setProperty('--user-bubble-bg', rgbaColor);
    } else {
        // 這是關鍵修正：在非桌布模式下，直接使用您選擇的實心顏色
        root.style.setProperty('--user-bubble-bg', hexColor);
    }
};
const renderAiBubbleColorDropdown = () => {
    const container = ALL_ELEMENTS.aiBubbleColorDropdown;
    container.innerHTML = '';
    const currentColor = config.aiBubbleColor;
    const currentName = currentColor.charAt(0).toUpperCase() + currentColor.slice(1);
    const currentHex = AI_BUBBLE_COLORS[currentColor][config.theme];
    const btn = document.createElement('button');
    btn.className = 'color-dropdown-btn';
    btn.dataset.color = currentColor;
    btn.innerHTML = `
        <div class="color-preview" style="background-color: ${currentHex};"></div>
        <span>${currentName}</span>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
    `;
    const menu = document.createElement('div');
    menu.className = 'color-dropdown-menu';
    Object.keys(AI_BUBBLE_COLORS).forEach(color => {
        const option = document.createElement('div');
        option.className = 'color-option';
        option.dataset.color = color;
        const preview = document.createElement('div');
        preview.className = 'color-preview';
        preview.style.backgroundColor = AI_BUBBLE_COLORS[color][config.theme];
        const name = color.charAt(0).toUpperCase() + color.slice(1);
        option.appendChild(preview);
        option.appendChild(document.createTextNode(name));
        option.addEventListener('click', () => {
            config.aiBubbleColor = color;
            renderAiBubbleColorDropdown();
            setAiBubbleColor();
            menu.classList.remove('show');
        });
        menu.appendChild(option);
    });
    btn.addEventListener('click', () => {
        menu.classList.toggle('show');
        const rect = btn.getBoundingClientRect();
        const menuRect = menu.getBoundingClientRect();
        if (rect.bottom + menuRect.height > window.innerHeight) {
            menu.style.top = 'auto';
            menu.style.bottom = '100%';
        } else {
            menu.style.top = '100%';
            menu.style.bottom = 'auto';
        }
    });
    container.appendChild(btn);
    container.appendChild(menu);
};
const renderUserBubbleColorDropdown = () => {
    const container = ALL_ELEMENTS.userBubbleColorDropdown;
    container.innerHTML = '';
    const currentColor = config.userBubbleColor;
    const currentName = currentColor.charAt(0).toUpperCase() + currentColor.slice(1);
    const currentHex = USER_BUBBLE_COLORS[currentColor][config.theme];
    const btn = document.createElement('button');
    btn.className = 'color-dropdown-btn';
    btn.dataset.color = currentColor;
    btn.innerHTML = `
        <div class="color-preview" style="background-color: ${currentHex};"></div>
        <span>${currentName}</span>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
    `;
    const menu = document.createElement('div');
    menu.className = 'color-dropdown-menu';
    Object.keys(USER_BUBBLE_COLORS).forEach(color => {
        const option = document.createElement('div');
        option.className = 'color-option';
        option.dataset.color = color;
        const preview = document.createElement('div');
        preview.className = 'color-preview';
        preview.style.backgroundColor = USER_BUBBLE_COLORS[color][config.theme];
        const name = color.charAt(0).toUpperCase() + color.slice(1);
        option.appendChild(preview);
        option.appendChild(document.createTextNode(name));
        option.addEventListener('click', () => {
            config.userBubbleColor = color;
            renderUserBubbleColorDropdown();
            setUserBubbleColor();
            menu.classList.remove('show');
        });
        menu.appendChild(option);
    });
    btn.addEventListener('click', () => {
        menu.classList.toggle('show');
        const rect = btn.getBoundingClientRect();
        const menuRect = menu.getBoundingClientRect();
        if (rect.bottom + menuRect.height > window.innerHeight) {
            menu.style.top = 'auto';
            menu.style.bottom = '100%';
        } else {
            menu.style.top = '100%';
            menu.style.bottom = 'auto';
        }
    });
    container.appendChild(btn);
    container.appendChild(menu);
};
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
const setTheme = async (theme) => {
    if (document.body.classList.contains('custom-wallpaper-active')) {
        return;
    }
    document.documentElement.classList.toggle('dark', theme === 'dark');
    config.theme = theme;
    setAiBubbleColor();
    setUserBubbleColor();
    await saveConfig();
    updateThemeButtons();
    if (!ALL_ELEMENTS.settingsModal.classList.contains('hidden')) {
        renderAiBubbleColorDropdown();
        renderUserBubbleColorDropdown();
    }
};
const updateThemeButtons = () => {
    ALL_ELEMENTS.themeDarkBtn.classList.remove('active');
    ALL_ELEMENTS.themeLightBtn.classList.remove('active');
    if (config.theme === 'dark') {
        ALL_ELEMENTS.themeDarkBtn.classList.add('active');
    } else {
        ALL_ELEMENTS.themeLightBtn.classList.add('active');
    }
};
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
