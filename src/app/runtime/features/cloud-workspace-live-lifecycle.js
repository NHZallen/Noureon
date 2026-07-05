import { normalizeLoadedLegacyAppData } from '../kernel/app-data-normalization.js';
import { normalizeLoadedLegacyConfig } from '../kernel/config-normalization.js';
import { removeSensitiveConfig } from '../security/sensitive-config-redaction.js';

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
  renderAll
} = {}) {
  let ready = false;
  let pendingAppData = null;
  let pendingConfig = null;

  const applyAppData = (rawData) => {
    if (!rawData || !ready) {
      pendingAppData = rawData;
      return;
    }
    appDataStore.replaceAll(normalizeLoadedLegacyAppData({
      rawData,
      defaultFolder: getDefaultFolder(),
      defaultGenConfig: getDefaultGenConfig(),
      lastCouncilConfig: configAccess.getConfig().lastCouncilConfig,
      normalizeCouncilConfig,
      normalizeConversationModel
    }));
    renderAll();
  };

  const applyConfig = (savedConfig) => {
    if (!savedConfig || !ready) {
      pendingConfig = savedConfig;
      return;
    }
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
    renderAll();
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
