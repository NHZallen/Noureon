import { normalizeSearchProvider } from '../kernel/search-provider.js';

export function collectSettingsSaveFormValues({
    document,
    elements,
    config
} = {}) {
    const selectedThemeMode = document.querySelector('input[name="color-theme"]:checked').value;
    const selectedCustomColor = elements.customColorSwatches.querySelector('.selected')?.dataset.color || config.uiTheme.customColor;

    return {
        // Kept as it was where the setting is not shown.
        searchProvider: elements.searchProviderSelect ? normalizeSearchProvider(elements.searchProviderSelect.value) : normalizeSearchProvider(config.searchProvider),
        tavilySearchDepth: elements.tavilySearchDepthSelect?.value === 'advanced' ? 'advanced' : 'basic',
        councilTranslatorModelId: elements.councilTranslatorModelSelect?.value || null,
        singleDocumentTranslatorModelId: elements.singleDocumentTranslatorModelSelect?.value || null,
        enableAutoWebSearch: elements.autoWebSearchToggleSwitch.checked,
        visionCheckEnabled: elements.visionCheckToggleSwitch?.checked !== false,
        // Kept as it was where the setting is not shown.
        processOpen: elements.processToggle ? elements.processToggle.checked : config.processOpen === true,
        // Kept as it was where the setting is not shown.
        fileModeDefault: elements.fileModeDefaultSelect?.value === 'standard' ? 'standard'
            : elements.fileModeDefaultSelect ? 'advanced' : (config.fileModeDefault === 'standard' ? 'standard' : 'advanced'),
        userBubbleColor: elements.userBubbleColorDropdown.querySelector('.color-dropdown-btn')?.dataset.color || 'default',
        autoNaming: elements.autoNamingToggleSwitch.checked,
        memoryEnabled1: elements.memoryToggle1?.isConnected !== false
            ? elements.memoryToggle1.checked
            : config.memoryEnabled1 !== false,
        historyRecallEnabled: elements.historyRecallToggleSwitch?.checked === true,
        enableAutoMemory: elements.autoMemoryToggleSwitch?.isConnected !== false
            ? elements.autoMemoryToggleSwitch.checked
            : config.enableAutoMemory !== false,
        uiLanguage: elements.uiLanguageSelect.value,
        aiDefaultLanguage: elements.aiLanguageSelect.value,
        enableUpdateNotifications: elements.enableUpdateNotificationsToggle.checked,
        uiTheme: {
            mode: selectedThemeMode,
            customColor: selectedCustomColor
        }
    };
}
