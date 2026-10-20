// Reading the signed-in person's settings and workspace from this device when the page starts or the person signs in (legacy-core.js).
// The workspace is read from its split records first (one per conversation); the single record of old versions is the fallback.

import { normalizeLoadedLegacyConfig } from '../kernel/config-normalization.js';
import { normalizeLoadedLegacyAppData } from '../kernel/app-data-normalization.js';
import { loadSplitWorkspace } from '../kernel/workspace-loading.js';
import { removeSensitiveConfig } from '../security/sensitive-config-redaction.js';
import { applyLoginLanguage } from '../features/login-language.js';
import { COUNCIL_MAX_MODELS, MODELS } from './model-registry.js';
import { getDefaultFolder, getDefaultGenConfig } from './conversation-actions.js';

export function createWorkspaceLoad({
    shell, storage, configAccess, appDataStore, sensitiveConfigPersistence, getConfigKey, getAppDataKey,
    mergeSensitiveApiKeys, saveSensitiveConfig, saveConfig, normalizeCouncilConfig, normalizeConversationModel,
    getCouncilTranslatorCandidates, getSingleTranslatorCandidates, getFolderUiStatePersistence, showNotification,
    loadSplit = loadSplitWorkspace
}) {
    const { getItem, removeItem } = storage;
    const loadConfig = async () => {
        if (!shell.currentUser) return;
        await sensitiveConfigPersistence.loadSensitiveConfig();
        const saved = await getItem(getConfigKey());
        if (saved) {
            const savedConfig = JSON.parse(saved);
            if (savedConfig.apiKeys) {
                mergeSensitiveApiKeys(savedConfig.apiKeys);
                await saveSensitiveConfig();
            }
            const normalSavedConfig = removeSensitiveConfig(savedConfig);
            const normalizedConfig = normalizeLoadedLegacyConfig({
                currentConfig: configAccess.getConfig(),
                savedConfig: normalSavedConfig,
                models: MODELS,
                maxCouncilModels: COUNCIL_MAX_MODELS,
                councilTranslatorCandidates: getCouncilTranslatorCandidates(),
                singleTranslatorCandidates: getSingleTranslatorCandidates()
            });
            configAccess.replaceConfig(normalizedConfig);
        } else {
            const normalizedConfig = normalizeLoadedLegacyConfig({
                currentConfig: configAccess.getConfig(),
                savedConfig: null,
                models: MODELS,
                maxCouncilModels: COUNCIL_MAX_MODELS,
                councilTranslatorCandidates: getCouncilTranslatorCandidates(),
                singleTranslatorCandidates: getSingleTranslatorCandidates()
            });
            configAccess.mutateConfig(normalizedConfig);
        }
        // The language picked on the sign-in page wins over the saved one.
        if (applyLoginLanguage(configAccess.getConfig())) await saveConfig();
    };
    const loadAppData = async () => {
        if (!shell.currentUser) return;
        const split = await loadSplit({ storage, user: shell.currentUser, context: { getDefaultFolder, getDefaultGenConfig, runtimeConfigAccess: configAccess, normalizeCouncilConfig, normalizeConversationModel } });
        if (split) { appDataStore.replaceAll(split.data); await (await getFolderUiStatePersistence()).restore(appDataStore.getFolders()); return; }
        const saved = await getItem(getAppDataKey());
        if (saved) {
            try {
                const data = JSON.parse(saved);
                const normalizedData = normalizeLoadedLegacyAppData({
                    rawData: data,
                    defaultFolder: getDefaultFolder(),
                    defaultGenConfig: getDefaultGenConfig(),
                    lastCouncilConfig: configAccess.getConfig().lastCouncilConfig,
                    normalizeCouncilConfig,
                    normalizeConversationModel
                });
                appDataStore.replaceAll(normalizedData);
            } catch (e) {
                console.error("Failed to parse app data:", e);
                showNotification("Stored app data could not be read and was reset.", "error");
                appDataStore.replaceAll({
                    conversations: [],
                    folders: [],
                    astras: [],
                    personalMemories: []
                });
                await removeItem(getAppDataKey());
            }
        } else {
            appDataStore.replaceAll({
                conversations: [],
                folders: [],
                astras: [],
                personalMemories: []
            });
        }
        await (await getFolderUiStatePersistence()).restore(appDataStore.getFolders());
    };
    return { loadConfig, loadAppData };
}
