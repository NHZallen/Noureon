import { normalizeLoadedLegacyAppData } from '../kernel/app-data-normalization.js';
import { normalizeLoadedLegacyConfig } from '../kernel/config-normalization.js';
import { removeSensitiveConfig } from '../security/sensitive-config-redaction.js';
import { mergeRemoteWorkspaceAppData } from '../../sync/cloud-sync-versioning.js';
import { preserveLocalFolderUiState } from '../../sync/cloud-workspace-app-data.js';

function preserveItemIdentity(currentItems = [], nextItems = []) {
  const currentById = new Map(currentItems.map(item => [item?.id, item]));
  return nextItems.map(nextItem => {
    const currentItem = currentById.get(nextItem?.id);
    if (!currentItem || currentItem === nextItem) return nextItem;
    for (const key of Object.keys(currentItem)) {
      if (!(key in nextItem)) delete currentItem[key];
    }
    Object.assign(currentItem, nextItem);
    return currentItem;
  });
}

export function createCloudWorkspaceLiveLifecycle({
  window,
  configAccess,
  appDataStore,
  getDefaultFolder,
  getDefaultGenConfig,
  normalizeCouncilConfig,
  normalizeConversationModel,
  models,
  maxCouncilModels,
  getCouncilTranslatorCandidates,
  getSingleTranslatorCandidates,
  applyCustomWallpaper,
  applyUiTheme,
  renderAll,
  busy = () => false,
  schedule = (callback, delay) => globalThis.setTimeout(callback, delay)
} = {}) {
  let ready = false;
  let pendingAppData = null;
  let pendingConfig = null;
  let deferredRenderTimer = null;
  let protectedConversation = null;

  const renderWhenResponseSettles = () => {
    if (busy()) {
      deferredRenderTimer = schedule(renderWhenResponseSettles, 100);
      return;
    }
    deferredRenderTimer = null;
    if (pendingAppData) {
      const nextAppData = pendingAppData;
      pendingAppData = null;
      applyAppData(nextAppData);
    }
  };

  const applyAppData = (rawData) => {
    if (!rawData || !ready) {
      pendingAppData = rawData;
      return;
    }
    const activeConversation = busy();
    if (activeConversation) {
      pendingAppData = rawData;
      protectedConversation = activeConversation;
      if (deferredRenderTimer == null) deferredRenderTimer = schedule(renderWhenResponseSettles, 100);
      return;
    }
    const normalizedRemote = normalizeLoadedLegacyAppData({
      rawData,
      defaultFolder: getDefaultFolder(),
      defaultGenConfig: getDefaultGenConfig(),
      lastCouncilConfig: configAccess.getConfig().lastCouncilConfig,
      normalizeCouncilConfig,
      normalizeConversationModel
    });
    const current = appDataStore.getSnapshot?.() || {};
    const remoteWithLocalUi = preserveLocalFolderUiState(current, normalizedRemote);
    const protectedRemote = mergeRemoteWorkspaceAppData(current, remoteWithLocalUi, protectedConversation);
    protectedConversation = null;
    appDataStore.replaceAll({
      conversations: preserveItemIdentity(current.conversations, protectedRemote.conversations),
      folders: protectedRemote.folders,
      astras: protectedRemote.astras,
      personalMemories: protectedRemote.personalMemories
    });
    renderAll();
  };

  const applyConfig = (savedConfig) => {
    if (!savedConfig || !ready) {
      pendingConfig = savedConfig;
      return;
    }
    const responseActive = Boolean(busy());
    configAccess.replaceConfig(normalizeLoadedLegacyConfig({
      currentConfig: configAccess.getConfig(),
      savedConfig: removeSensitiveConfig(savedConfig),
      models,
      maxCouncilModels,
      councilTranslatorCandidates: getCouncilTranslatorCandidates(),
      singleTranslatorCandidates: getSingleTranslatorCandidates()
    }));
    applyCustomWallpaper();
    applyUiTheme();
    if (!responseActive) renderAll();
  };

  const markReady = () => {
    ready = true;
    if (pendingConfig) {
      const nextConfig = pendingConfig;
      pendingConfig = null;
      applyConfig(nextConfig);
    }
    if (pendingAppData) {
      const nextAppData = pendingAppData;
      pendingAppData = null;
      applyAppData(nextAppData);
    }
  };

  window.addEventListener('astra:cloud-app-data', event => applyAppData(event.detail));
  window.addEventListener('astra:cloud-config', event => applyConfig(event.detail));
  window.__astraCloudRuntimeReady = markReady;

  return { markReady };
}
