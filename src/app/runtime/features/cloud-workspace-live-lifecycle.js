import { normalizeLoadedLegacyAppData } from '../kernel/app-data-normalization.js';
import { normalizeLoadedLegacyConfig } from '../kernel/config-normalization.js';
import { removeSensitiveConfig } from '../security/sensitive-config-redaction.js';
import {
  cloudValuesEqual,
  mergeRemoteWorkspaceAppData,
  mergeWorkspaceAppData
} from '../../sync/cloud-sync-versioning.js';
import { preserveLocalFolderUiState } from '../../sync/cloud-workspace-app-data.js';
import {
  applyAstraTombstones,
  applyWorkspaceTombstones
} from '../../sync/cloud-sync-v2-deletions.js';
import { mergeSyncedMemoryState } from '../memory/memory-sync-projection.js';

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

function getConversationSidebarState(conversation = {}) {
  const {
    messages: _messages,
    unsentMessage: _unsentMessage,
    genConfig: _genConfig,
    imageConfig: _imageConfig,
    reasoningEffort: _reasoningEffort,
    isWebSearchEnabled: _isWebSearchEnabled,
    astrasId: _astrasId,
    ...sidebarState
  } = conversation;
  return sidebarState;
}

function getWorkspaceSidebarState(workspace = {}) {
  return {
    conversations: (workspace.conversations || []).map(getConversationSidebarState),
    folders: workspace.folders || [],
    astras: workspace.astras || []
  };
}

function getActiveConversationState(workspace = {}, activeConversationId = null) {
  if (!activeConversationId) return null;
  const conversation = (workspace.conversations || [])
    .find(item => item?.id === activeConversationId);
  if (!conversation) return null;
  const {
    folderId: _folderId,
    pinned: _pinned,
    createdAt: _createdAt,
    lastUpdatedAt: _lastUpdatedAt,
    stateUpdatedAt: _stateUpdatedAt,
    isNaming: _isNaming,
    isRenamed: _isRenamed,
    unsentMessage: _unsentMessage,
    ...chatState
  } = conversation;
  return chatState;
}

function getVisibleConfigState(config = {}) {
  const { memorySync: _memorySync, ...visibleConfig } = config;
  return visibleConfig;
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
  renderSidebar,
  renderChat,
  applyLanguage = () => {},
  getActiveConversation = () => null,
  saveAppData = async () => {},
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
      applyAppData(nextAppData.rawData, nextAppData.options);
    }
  };

  const normalizeTombstones = (tombstones = {}) => ({
    conversations: new Set(tombstones.conversationIds || []),
    folders: new Set(tombstones.folderIds || [])
  });

  const renderWorkspaceChanges = ({ sidebarChanged, activeConversationChanged, controlsChanged }) => {
    const hasPreciseRenderers = typeof renderSidebar === 'function' && typeof renderChat === 'function';
    if (!hasPreciseRenderers) {
      renderAll?.({ reason: 'cloud-workspace-applied', animate: false, scrollMode: 'preserve' });
      return;
    }
    if (sidebarChanged) {
      renderSidebar({ reason: 'cloud-sidebar-changed' });
    }
    if (activeConversationChanged) {
      renderChat({
        reason: 'cloud-active-conversation-changed',
        animate: false,
        scrollMode: 'preserve'
      });
    } else if (controlsChanged) {
      renderChat({
        reason: 'cloud-conversation-controls-changed',
        animate: false,
        renderMessages: false
      });
    }
  };

  const applyAppData = (rawData, options = {}) => {
    if (!rawData || !ready) {
      pendingAppData = rawData ? { rawData, options } : null;
      return;
    }
    const activeConversation = busy();
    if (activeConversation) {
      pendingAppData = { rawData, options };
      protectedConversation = activeConversation;
      if (deferredRenderTimer == null) deferredRenderTimer = schedule(renderWhenResponseSettles, 100);
      return;
    }
    const tombstoneIndex = normalizeTombstones(options.tombstones);
    const astraTombstoneIds = new Set(options.tombstones?.astraIds || []);
    const sanitizedRawData = applyAstraTombstones(
      applyWorkspaceTombstones(rawData, tombstoneIndex),
      astraTombstoneIds
    );
    const normalizedRemote = normalizeLoadedLegacyAppData({
      rawData: sanitizedRawData,
      defaultFolder: getDefaultFolder(),
      defaultGenConfig: getDefaultGenConfig(),
      lastCouncilConfig: configAccess.getConfig().lastCouncilConfig,
      normalizeCouncilConfig,
      normalizeConversationModel
    });
    const liveSnapshot = appDataStore.getSnapshot?.() || {};
    const activeConversationId = getActiveConversation()?.id || null;
    const current = applyAstraTombstones(
      applyWorkspaceTombstones(liveSnapshot, tombstoneIndex),
      astraTombstoneIds
    );
    const remoteWithLocalUi = preserveLocalFolderUiState(current, normalizedRemote);
    const protectedRemote = options.recordLevel
      ? mergeWorkspaceAppData(current, remoteWithLocalUi)
      : mergeRemoteWorkspaceAppData(current, remoteWithLocalUi, protectedConversation);
    protectedConversation = null;
    const sidebarChanged = !cloudValuesEqual(
      getWorkspaceSidebarState(liveSnapshot),
      getWorkspaceSidebarState(protectedRemote)
    );
    const activeConversationChanged = !cloudValuesEqual(
      getActiveConversationState(liveSnapshot, activeConversationId),
      getActiveConversationState(protectedRemote, activeConversationId)
    );
    const controlsChanged = !cloudValuesEqual(
      liveSnapshot.astras || [],
      protectedRemote.astras || []
    );
    appDataStore.replaceAll({
      conversations: preserveItemIdentity(current.conversations, protectedRemote.conversations),
      folders: protectedRemote.folders,
      astras: protectedRemote.astras,
      personalMemories: protectedRemote.personalMemories
    });
    renderWorkspaceChanges({ sidebarChanged, activeConversationChanged, controlsChanged });
  };

  const applyConfig = (savedConfig) => {
    if (!savedConfig || !ready) {
      pendingConfig = savedConfig;
      return;
    }
    const responseActive = Boolean(busy());
    const currentConfig = configAccess.getConfig();
    const syncedConfig = removeSensitiveConfig(savedConfig);
    const normalizedConfig = normalizeLoadedLegacyConfig({
      currentConfig,
      savedConfig: syncedConfig,
      models,
      maxCouncilModels,
      councilTranslatorCandidates: getCouncilTranslatorCandidates(),
      singleTranslatorCandidates: getSingleTranslatorCandidates()
    });
    const syncedVisibleConfig = getVisibleConfigState(syncedConfig);
    const changedSyncedKeys = Object.keys(syncedVisibleConfig).filter(key => (
      !cloudValuesEqual(currentConfig[key], normalizedConfig[key])
    ));
    const appearanceKeys = new Set([
      'customWallpaper',
      'wallpaperBrightness',
      'uiTheme',
      'aiBubbleColor',
      'userBubbleColor'
    ]);
    const appearanceChanged = changedSyncedKeys.some(key => appearanceKeys.has(key));
    const languageChanged = changedSyncedKeys.includes('uiLanguage');
    const visibleConfigChanged = changedSyncedKeys.length > 0;
    configAccess.replaceConfig(normalizedConfig);
    if (normalizedConfig.memorySync) {
      appDataStore.replaceMemoryState(mergeSyncedMemoryState(
        appDataStore.getMemoryState?.() || {},
        normalizedConfig.memorySync
      ));
      void saveAppData();
    }
    if (appearanceChanged) {
      applyCustomWallpaper();
      applyUiTheme();
    }
    if (languageChanged) applyLanguage(normalizedConfig.uiLanguage);
    if (!responseActive && visibleConfigChanged) {
      renderChat?.({
        reason: 'cloud-config-changed',
        animate: false,
        renderMessages: false
      });
    }
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
      applyAppData(nextAppData.rawData, nextAppData.options);
    }
  };

  window.addEventListener('astra:cloud-app-data', event => applyAppData(event.detail));
  window.addEventListener('astra:cloud-workspace-committed', event => applyAppData(
    event.detail?.workspace,
    { recordLevel: true, tombstones: event.detail?.tombstones }
  ));
  window.addEventListener('astra:cloud-config', event => applyConfig(event.detail));
  window.__astraCloudRuntimeReady = markReady;

  return { markReady };
}
