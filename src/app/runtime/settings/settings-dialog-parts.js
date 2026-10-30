// The heavier parts of the settings dialog (settings-modal-lifecycle.js): the visual check row with the Privacy and Permissions tabs and
// the storage lines, and the memory of notes. They are loaded when the dialog is first built, not with the page.

import { ensureVisionCheckSettingsControl } from './settings-vision-check-section.js';
import { createMemoryNotesSettings } from '../../ui/memory-notes/memory-notes-settings.js';
import { getNotesMemory, getMemoryModelRunner, getPageHistory, getPageVectors, getRebuildController } from '../memory-store/memory-ref.js';
import { createRebuildController } from '../memory-store/page-rebuild.js';
import { getAnnouncedUser } from '../features/user-ready.js';

export function createSettingsDialogParts({
    document, elements: ALL_ELEMENTS, models: MODELS, i18n, config, getApiKeyForProvider, saveConfig,
    showNotification, showCustomPrompt, showCustomDialog
}) {
    const rebuildController = getRebuildController() || createRebuildController({
        getStore: () => getNotesMemory()?.getStore?.() || null,
        getConversations: () => getPageHistory()?.conversations() || [],
        getConfig: () => config,
        getModelRunner: getMemoryModelRunner,
        models: MODELS,
        getApiKeyForProvider
    });
    const memoryNotesSettings = createMemoryNotesSettings({
        getRebuild: () => rebuildController,
        getVectors: getPageVectors,
        document, getConfig: () => config, saveConfig, getMemory: getNotesMemory, getUser: getAnnouncedUser,
        getModels: () => MODELS.filter((model) => model.category !== 'image_generation' && model.outputModality !== 'image' && getApiKeyForProvider?.(model.provider)).map((model) => ({ id: model.id, name: model.name })),
        getText: (key) => i18n[config.uiLanguage]?.[key] || i18n['zh-TW']?.[key] || '', showNotification, showCustomDialog
    });
    let built = false;
    /** Builds the controls (once) and fills them from the settings. True when they were built now. */
    const build = () => {
        const fresh = !built;
        built = true;
        ensureVisionCheckSettingsControl({ document, elements: ALL_ELEMENTS, config, saveConfig, showNotification });
        if (ALL_ELEMENTS.visionCheckToggleSwitch) ALL_ELEMENTS.visionCheckToggleSwitch.checked = config.visionCheckEnabled !== false;
        if (ALL_ELEMENTS.processToggle) ALL_ELEMENTS.processToggle.checked = config.processOpen === true;
        // The memory of notes fills the memory section.
        memoryNotesSettings.mount();
        return fresh;
    };
    return { build };
}
