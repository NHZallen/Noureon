// The settings dialog (part of settings-auth-provider-lifecycle.js): built and filled with the current settings when it opens (the
// account part loaded the first time), and every setting saved as it changes.

import { collectSettingsSaveFormValues } from './settings-save-settings-helper.js';
import { getSearchProvider } from '../kernel/search-provider.js';
import { ensureAutoWebSearchSettingsControl as ensureAutoWebSearchControl, ensureFileModeSettingsControl as ensureFileModeControl, ensureProcessOpenSettingsControl } from './settings-vision-check-control.js';

export function createSettingsModalLifecycle({
    window, document, console, elements: ALL_ELEMENTS, getCurrentUser, getMemoryState, getMemory, runtimeStorageAdapter, models: MODELS, i18n, config,
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
                    getCurrentUser,
                    getText: getSettingsText,
                    showNotification
                })
            ));
        }
        return syncVaultControlsPromise;
    };
    const ensureAutoWebSearchSettingsControl = () => ensureAutoWebSearchControl({ document, elements: ALL_ELEMENTS });
    // The rows of the replies card that load with the page; the visual check row loads with the dialog's parts.
    const ensureFileModeSettingsControl = () => {
        ensureProcessOpenSettingsControl({ document, elements: ALL_ELEMENTS, config });
        ensureFileModeControl({ document, elements: ALL_ELEMENTS, config });
    };
    // The heavier parts of the dialog load when it is first built (settings-dialog-parts.js): the visual check row with the Privacy and
    // Permissions tabs, the memory summary and the recall of past conversations. Saving waits for them.
    let dialogParts;
    const loadDialogParts = () => dialogParts ||= import('./settings-dialog-parts.js').then(({ createSettingsDialogParts }) => createSettingsDialogParts({
        document, elements: ALL_ELEMENTS, getMemoryState, getMemory, models: MODELS, i18n, config, getApiKeyForProvider, saveConfig,
        showNotification, showCustomPrompt, showCustomDialog
    }));
    let partsFilled = Promise.resolve();
    // The dialog's stylesheets load with it (styles/settings-dialog.css), not with the page.
    let settingsStyles;
    const loadSettingsStyles = () => settingsStyles ||= import('../../../styles/settings-dialog.css').catch((error) => {
        settingsStyles = null;
        console.warn('Loading the styles of the settings failed.', error);
    });
    const setupSettingsModal = () => {
        const stylesReady = loadSettingsStyles();
        ensureSettingsMobileShell();
        ensureUserSettingsNavigationShell();
        ensureAutoWebSearchSettingsControl();
        ensureFileModeSettingsControl();
        ensureCouncilTranslatorSettingsControls();
        prepareApiKeyInputsForSettings();
        if (ALL_ELEMENTS.tavilySearchDepthSelect) ALL_ELEMENTS.tavilySearchDepthSelect.value = getTavilySearchDepth();
        if (ALL_ELEMENTS.searchProviderSelect) ALL_ELEMENTS.searchProviderSelect.value = getSearchProvider(config);
        syncSearchProviderControls();
        renderTranslatorModelPickers();
        applyLanguage(config.uiLanguage);
        ALL_ELEMENTS.autoNamingToggleSwitch.checked = config.autoNaming;
        ALL_ELEMENTS.autoWebSearchToggleSwitch.checked = config.enableAutoWebSearch;
        if (ALL_ELEMENTS.processToggle) ALL_ELEMENTS.processToggle.checked = config.processOpen === true;
        ALL_ELEMENTS.uiLanguageSelect.value = config.uiLanguage;
        if (ALL_ELEMENTS.colorSchemeSelect) ALL_ELEMENTS.colorSchemeSelect.value = config.colorScheme || 'light';
        ALL_ELEMENTS.aiLanguageSelect.value = config.aiDefaultLanguage;
        ALL_ELEMENTS.enableUpdateNotificationsToggle.checked = config.enableUpdateNotifications;
        updateThemeButtons();
        renderUiColorOptions();
        renderTrash();
        renderSettingsMobileList();
        const navItems = bindDesktopSettingsSections();
        activateDefaultDesktopSettingsSection(navItems);
        syncSettingsSectionForViewport(navItems);
        const rebuildNavigation = () => {
            applyLanguage(config.uiLanguage);
            renderSettingsMobileList();
            const nextNavItems = bindDesktopSettingsSections();
            activateDefaultDesktopSettingsSection(nextNavItems);
            syncSettingsSectionForViewport(nextNavItems);
        };
        partsFilled = loadDialogParts().then((parts) => {
            if (parts.build()) rebuildNavigation();
        });
        partsFilled.catch(error => console.error('Failed to load the settings parts:', error));
        // The account part of the page is built once, when its module has loaded (the first open); the page is then built again from the start.
        // Every later open only refreshes its values: rebuilding the page again while it slides in made it flicker.
        const built = loadSyncVaultControls().then((controls) => {
            const alreadyBuilt = document.getElementById('user-section')?.dataset.syncVaultSettingsInitialized === 'true';
            controls.ensureSyncVaultSettings();
            if (!alreadyBuilt) rebuildNavigation();
            return controls;
        });
        built.then((controls) => controls.refreshSyncVaultControls()).catch(error => console.error('Failed to load sync vault settings:', error));
        // Resolves when the page is built (what the opener may wait for a moment, so it is not built while it moves).
        return Promise.all([built, partsFilled, stylesReady]).then(([controls]) => controls).catch(() => null);
    };
    const saveSettings = async ({ close = true, notify = true } = {}) => {
        await persistApiKeyInputIntents();
        // The toggles of the loaded parts are read from the dialog: they are filled first.
        await partsFilled.catch(() => {});
        const { resolveHistoryRecallEnabled, refreshHistoryRecallStatus } = await loadDialogParts();
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
            replyInputMode: collectedSettings.replyInputMode,
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
