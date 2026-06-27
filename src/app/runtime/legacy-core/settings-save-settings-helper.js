export function collectSettingsSaveFormValues({
    document,
    elements,
    config
} = {}) {
    const selectedThemeMode = document.querySelector('input[name="color-theme"]:checked').value;
    const selectedCustomColor = elements.customColorSwatches.querySelector('.selected')?.dataset.color || config.uiTheme.customColor;
    const selectedStyle = document.querySelector('input[name="color-style"]:checked')?.value || 'single';
    const selectedGradientSwatch = elements.gradientSwatches.querySelector('.selected-gradient');
    const selectedGradient = selectedGradientSwatch
        ? selectedGradientSwatch.dataset.gradient
        : (config.uiTheme.adaptivePalette?.length > 1
            ? `linear-gradient(to right, ${config.uiTheme.adaptivePalette[0]}, ${config.uiTheme.adaptivePalette[1]})`
            : '');

    return {
        tavilySearchDepth: elements.tavilySearchDepthSelect?.value === 'advanced' ? 'advanced' : 'basic',
        councilTranslatorModelId: elements.councilTranslatorModelSelect?.value || null,
        singleDocumentTranslatorModelId: elements.singleDocumentTranslatorModelSelect?.value || null,
        enableAutoWebSearch: elements.autoWebSearchToggleSwitch.checked,
        outputMode: elements.outputModeSelect?.value === 'realtime' ? 'realtime' : 'typewriter',
        aiBubbleColor: elements.aiBubbleColorDropdown.querySelector('.color-dropdown-btn')?.dataset.color || 'default',
        userBubbleColor: elements.userBubbleColorDropdown.querySelector('.color-dropdown-btn')?.dataset.color || 'default',
        autoNaming: elements.autoNamingToggleSwitch.checked,
        memoryEnabled1: elements.memoryToggle1.checked,
        enableAutoMemory: elements.autoMemoryToggleSwitch.checked,
        uiLanguage: elements.uiLanguageSelect.value,
        aiDefaultLanguage: elements.aiLanguageSelect.value,
        enableUpdateNotifications: elements.enableUpdateNotificationsToggle.checked,
        uiTheme: {
            mode: selectedThemeMode,
            customColor: selectedCustomColor,
            style: selectedStyle,
            adaptiveGradient: selectedGradient
        }
    };
}
