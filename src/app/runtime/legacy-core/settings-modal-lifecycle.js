// The settings dialog (part of settings-auth-provider-lifecycle.js): built and filled with the current settings when it opens (the
// account part loaded the first time), and every setting saved as it changes.

import { collectSettingsSaveFormValues } from './settings-save-settings-helper.js';
import { createSettingsHistoryRecallControls } from './settings-history-recall-controls.js';
import { createSettingsMemorySummaryControls } from './settings-memory-summary-controls.js';
import { getSearchProvider } from '../kernel/search-provider.js';
import { ensureVisionCheckSettingsControl as ensureVisionControl, ensureAutoWebSearchSettingsControl as ensureAutoWebSearchControl, ensureFileModeSettingsControl as ensureFileModeControl } from './settings-vision-check-control.js';

export function createSettingsModalLifecycle({
    window, document, console, elements: ALL_ELEMENTS, state, legacyRuntimeContext, runtimeStorageAdapter, models: MODELS, i18n, config,
    getSettingsText, getTavilySearchDepth, getApiKeyForProvider, saveConfig, showNotification, showCustomPrompt, showCustomDialog,
    showCustomConfirm, toggleModal, applyUiTheme, applyLanguage, renderModelSwitcher, renderStore, renderTrash, renderUiColorOptions,
    updateThemeButtons, updateApiKeyWarningBadge, updateInputState, ensureSettingsMobileShell, renderSettingsMobileList,
    bindDesktopSettingsSections, activateDefaultDesktopSettingsSection, syncSettingsSectionForViewport,
    ensureCouncilTranslatorSettingsControls, prepareApiKeyInputsForSettings, persistApiKeyInputIntents, syncSearchProviderControls,
    renderTranslatorModelPickers
}) {
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
    const ensureAutoWebSearchSettingsControl = () => ensureAutoWebSearchControl({ document, elements: ALL_ELEMENTS });
    const ensureVisionCheckSettingsControl = () => {
        ensureVisionControl({ document, elements: ALL_ELEMENTS, config, saveConfig, showNotification });
        ensureFileModeControl({ document, elements: ALL_ELEMENTS, config });
    };
    const historyRecallControls = createSettingsHistoryRecallControls({
        document,
        elements: ALL_ELEMENTS,
        legacyRuntimeContext,
        getConfig: () => config,
        getText: (key, fallback) => i18n[config.uiLanguage]?.[key] || fallback
    });
    const {
        ensureHistoryRecallSettingsControl,
        refreshHistoryRecallStatus,
        resolveHistoryRecallEnabled,
        bindHistoryIndexRebuild,
        bindHistoryIndexAudit,
        bindHistoryIndexStatusUpdates
    } = historyRecallControls;
    const memorySummaryControls = createSettingsMemorySummaryControls({
        document,
        models: MODELS,
        getConfig: () => config,
        getMemoryState: () => state.memoryState,
        legacyRuntimeContext,
        saveConfig,
        isModelReady: model => Boolean(getApiKeyForProvider?.(model?.provider)),
        showNotification,
        showCustomPrompt,
        showCustomDialog
    });
    const {
        ensureControls: ensureMemorySummarySettingsControls,
        render: renderMemorySummary
    } = memorySummaryControls;
    const setupSettingsModal = () => {
        ensureSettingsMobileShell();
        ensureUserSettingsNavigationShell();
        ensureAutoWebSearchSettingsControl();
        ensureVisionCheckSettingsControl();
        ensureMemorySummarySettingsControls();
        ensureHistoryRecallSettingsControl();
        bindHistoryIndexRebuild();
        bindHistoryIndexAudit({ showCustomDialog });
        bindHistoryIndexStatusUpdates();
        ensureCouncilTranslatorSettingsControls();
        prepareApiKeyInputsForSettings();
        if (ALL_ELEMENTS.tavilySearchDepthSelect) ALL_ELEMENTS.tavilySearchDepthSelect.value = getTavilySearchDepth();
        if (ALL_ELEMENTS.searchProviderSelect) ALL_ELEMENTS.searchProviderSelect.value = getSearchProvider(config);
        syncSearchProviderControls();
        renderTranslatorModelPickers();
        applyLanguage(config.uiLanguage);
        ALL_ELEMENTS.autoNamingToggleSwitch.checked = config.autoNaming;
        ALL_ELEMENTS.autoWebSearchToggleSwitch.checked = config.enableAutoWebSearch;
        if (ALL_ELEMENTS.visionCheckToggleSwitch) ALL_ELEMENTS.visionCheckToggleSwitch.checked = config.visionCheckEnabled !== false;
        if (ALL_ELEMENTS.processToggle) ALL_ELEMENTS.processToggle.checked = config.processOpen === true;
        if (ALL_ELEMENTS.memoryToggle1?.isConnected) ALL_ELEMENTS.memoryToggle1.checked = config.memoryProfileEnabled !== false;
        if (ALL_ELEMENTS.autoMemoryToggleSwitch?.isConnected) ALL_ELEMENTS.autoMemoryToggleSwitch.checked = config.enableAutoMemory;
        if (ALL_ELEMENTS.historyRecallToggleSwitch) {
            ALL_ELEMENTS.historyRecallToggleSwitch.checked = config.historyRecallEnabled === true;
        }
        void refreshHistoryRecallStatus();
        ALL_ELEMENTS.uiLanguageSelect.value = config.uiLanguage;
        if (ALL_ELEMENTS.colorSchemeSelect) ALL_ELEMENTS.colorSchemeSelect.value = config.colorScheme || 'light';
        ALL_ELEMENTS.aiLanguageSelect.value = config.aiDefaultLanguage;
        ALL_ELEMENTS.enableUpdateNotificationsToggle.checked = config.enableUpdateNotifications;
        renderMemorySummary();
        updateThemeButtons();
        renderUiColorOptions();
        renderTrash();
        renderSettingsMobileList();
        const navItems = bindDesktopSettingsSections();
        activateDefaultDesktopSettingsSection(navItems);
        syncSettingsSectionForViewport(navItems);
        // The account part of the page is built once, when its module has loaded (the first open); the page is then built again from the start.
        // Every later open only refreshes its values: rebuilding the page again while it slides in made it flicker.
        const built = loadSyncVaultControls().then((controls) => {
            const alreadyBuilt = document.getElementById('user-section')?.dataset.syncVaultSettingsInitialized === 'true';
            controls.ensureSyncVaultSettings();
            if (!alreadyBuilt) {
                applyLanguage(config.uiLanguage);
                renderSettingsMobileList();
                const nextNavItems = bindDesktopSettingsSections();
                activateDefaultDesktopSettingsSection(nextNavItems);
                syncSettingsSectionForViewport(nextNavItems);
            }
            return controls;
        });
        built.then((controls) => controls.refreshSyncVaultControls()).catch(error => console.error('Failed to load sync vault settings:', error));
        // Resolves when the page is built (what the opener may wait for a moment, so it is not built while it moves).
        return built.catch(() => null);
    };
    const saveSettings = async ({ close = true, notify = true } = {}) => {
        await persistApiKeyInputIntents();
        const collectedSettings = collectSettingsSaveFormValues({
            document,
            elements: ALL_ELEMENTS,
            config
        });
        const historyRecallEnabled = await resolveHistoryRecallEnabled({
            requested: collectedSettings.historyRecallEnabled,
            showCustomConfirm
        });
        if (!historyRecallEnabled && ALL_ELEMENTS.historyRecallToggleSwitch) {
            ALL_ELEMENTS.historyRecallToggleSwitch.checked = false;
        }
        Object.assign(config, {
            searchProvider: collectedSettings.searchProvider,
            tavilySearchDepth: collectedSettings.tavilySearchDepth,
            councilTranslatorModelId: collectedSettings.councilTranslatorModelId,
            singleDocumentTranslatorModelId: collectedSettings.singleDocumentTranslatorModelId,
            enableAutoWebSearch: collectedSettings.enableAutoWebSearch,
            visionCheckEnabled: collectedSettings.visionCheckEnabled,
            colorScheme: collectedSettings.colorScheme,
            processOpen: collectedSettings.processOpen,
            fileModeDefault: collectedSettings.fileModeDefault,
            autoNaming: collectedSettings.autoNaming,
            memoryEnabled1: collectedSettings.memoryEnabled1,
            memoryProfileEnabled: collectedSettings.memoryEnabled1,
            historyRecallEnabled,
            enableAutoMemory: collectedSettings.enableAutoMemory,
            uiLanguage: collectedSettings.uiLanguage,
            aiDefaultLanguage: collectedSettings.aiDefaultLanguage,
            enableUpdateNotifications: collectedSettings.enableUpdateNotifications
        });
        Object.assign(config.uiTheme, collectedSettings.uiTheme);
        applyUiTheme();
        await saveConfig();
        await refreshHistoryRecallStatus();
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
    return { setupSettingsModal, saveSettings };
}
