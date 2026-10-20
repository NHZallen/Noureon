// The heavier parts of the settings dialog (settings-modal-lifecycle.js): the visual check row with the Privacy and Permissions tabs and
// the storage lines, the memory summary controls, and the recall of past conversations with its index tools.
// They are loaded when the dialog is first built, not with the page.

import { createSettingsHistoryRecallControls } from './settings-history-recall-controls.js';
import { createSettingsMemorySummaryControls } from './settings-memory-summary-controls.js';
import { ensureVisionCheckSettingsControl } from './settings-vision-check-section.js';

export function createSettingsDialogParts({
    document, elements: ALL_ELEMENTS, state, legacyRuntimeContext, models: MODELS, i18n, config, getApiKeyForProvider, saveConfig,
    showNotification, showCustomPrompt, showCustomDialog
}) {
    const historyRecallControls = createSettingsHistoryRecallControls({
        document,
        elements: ALL_ELEMENTS,
        legacyRuntimeContext,
        getConfig: () => config,
        getText: (key, fallback) => i18n[config.uiLanguage]?.[key] || fallback
    });
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
    let built = false;
    /** Builds the controls (once) and fills them from the settings. True when they were built now. */
    const build = () => {
        const fresh = !built;
        built = true;
        ensureVisionCheckSettingsControl({ document, elements: ALL_ELEMENTS, config, saveConfig, showNotification });
        memorySummaryControls.ensureControls();
        historyRecallControls.ensureHistoryRecallSettingsControl();
        historyRecallControls.bindHistoryIndexRebuild();
        historyRecallControls.bindHistoryIndexAudit({ showCustomDialog });
        historyRecallControls.bindHistoryIndexStatusUpdates();
        if (ALL_ELEMENTS.visionCheckToggleSwitch) ALL_ELEMENTS.visionCheckToggleSwitch.checked = config.visionCheckEnabled !== false;
        if (ALL_ELEMENTS.processToggle) ALL_ELEMENTS.processToggle.checked = config.processOpen === true;
        if (ALL_ELEMENTS.memoryToggle1?.isConnected) ALL_ELEMENTS.memoryToggle1.checked = config.memoryProfileEnabled !== false;
        if (ALL_ELEMENTS.autoMemoryToggleSwitch?.isConnected) ALL_ELEMENTS.autoMemoryToggleSwitch.checked = config.enableAutoMemory;
        if (ALL_ELEMENTS.historyRecallToggleSwitch) {
            ALL_ELEMENTS.historyRecallToggleSwitch.checked = config.historyRecallEnabled === true;
        }
        void historyRecallControls.refreshHistoryRecallStatus();
        memorySummaryControls.render();
        return fresh;
    };
    return {
        build,
        refreshHistoryRecallStatus: historyRecallControls.refreshHistoryRecallStatus,
        resolveHistoryRecallEnabled: historyRecallControls.resolveHistoryRecallEnabled
    };
}
