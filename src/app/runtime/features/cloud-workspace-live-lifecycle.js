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
import { mergeMemoryStateWithSummaryRecords } from '../memory/memory-summary-records.js';

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

// These projections decide whether a committed workspace is worth repainting. They must compare
// what the user can see, not how a record happens to be stored.
//
// Our own upload comes back through the codec, and conversationFromRow / messageFromRow
// materialize every optional field: a live record that simply omits `council` or `archived` comes
// back as `council: null` / `archived: false`. Comparing raw shapes therefore made every answered
// turn look like a remote change, repainting the sidebar and the whole message list each time.
//
// Normalising instead of listing the fields keeps this correct if the codec later materializes
// another one. A genuine change still differs: only nullish-vs-absent and false-vs-absent collapse.
const OPTIONAL_BOOLEAN_FIELDS = [
  'archived', 'pinned', 'isNaming', 'isTemporary', 'isRenamed', 'isWebSearchEnabled'
];

function normalizeComparableRecord(record = {}) {
  const normalized = {};
  for (const [key, value] of Object.entries(record)) {
    if (value === null || value === undefined) continue;
    normalized[key] = value;
  }
  for (const field of OPTIONAL_BOOLEAN_FIELDS) {
    if (field in record) normalized[field] = Boolean(record[field]);
    if (normalized[field] === false) delete normalized[field];
  }
  return normalized;
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
    // Merge bookkeeping: rewritten on every save and never painted.
    stateUpdatedAt: _stateUpdatedAt,
    trashStateUpdatedAt: _trashStateUpdatedAt,
    ...sidebarState
  } = conversation;
  return normalizeComparableRecord(sidebarState);
}

function getWorkspaceSidebarState(workspace = {}) {
  return {
    conversations: (workspace.conversations || []).map(getConversationSidebarState),
    folders: workspace.folders || [],
    astras: workspace.astras || []
  };
}

const getComparableMessage = ({
  id: _id,           // identity only; the message list keys by index, not by id
  council: _council, // attached in memory after a Council turn, never persisted by the codec
  status,
  ...message
}) => normalizeComparableRecord({
  ...message,
  // messageFromRow always fills status in; a bare in-memory message has none.
  status: status === 'error' ? 'error' : 'complete'
});

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
    reasoningEffort: _reasoningEffort, // not encoded by the conversation metadata codec
    trashStateUpdatedAt: _trashStateUpdatedAt,
    messages,
    ...chatState
  } = conversation;
  return {
    ...normalizeComparableRecord(chatState),
    messages: (messages || []).map(getComparableMessage)
  };
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
  isActiveConversationViewCurrent = () => false,
  applyLanguage = () => {},
  getActiveConversation = () => null,
  hydrateConversation = conversation => window?.__astraCloudAssets?.hydrateConversation?.(conversation),
  onActiveConversationUnavailable = () => {},
  onRemoteConversationsApplied = () => {},
  onRemoteConversationsPermanentlyDeleted = () => {},
  onMemorySyncApplied = () => {},
  saveAppData = async () => {},
  busy = () => false,
  schedule = (callback, delay) => globalThis.setTimeout(callback, delay),
  logger = console
} = {}) {
  let ready = false;
  let pendingAppData = null;
  let pendingConfig = null;
  let pendingMemorySummaryRecords = null;
  let deferredRenderTimer = null;
  let protectedConversation = null;
  let hydrationGeneration = 0;

  const hydrateActiveConversation = async () => {
    const requestGeneration = ++hydrationGeneration;
    const activeConversation = getActiveConversation();
    if (!activeConversation || busy() || typeof hydrateConversation !== 'function') return false;
    const result = await hydrateConversation(activeConversation);
    if (requestGeneration !== hydrationGeneration || result?.resolvedCount <= 0) return false;
    const currentConversation = getActiveConversation();
    if (!result?.conversation || currentConversation?.id !== activeConversation.id) return false;
    const conversations = appDataStore.getConversations();
    const hydratedConversation = preserveItemIdentity(
      [currentConversation],
      [result.conversation]
    )[0];
    appDataStore.replaceConversations(conversations.map(conversation => (
      conversation?.id === activeConversation.id ? hydratedConversation : conversation
    )));
    await saveAppData();
    renderChat?.({
      reason: 'cloud-active-conversation-hydrated',
      animate: false,
      scrollMode: 'preserve'
    });
    return true;
  };

  const requestActiveConversationHydration = () => {
    void hydrateActiveConversation().catch(error => {
      logger.warn('Noureon could not hydrate the active cloud conversation.', error);
    });
  };

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

  const renderWorkspaceChanges = ({
    sidebarChanged,
    activeConversationChanged,
    controlsChanged,
    activeConversationViewCurrent = false
  }) => {
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
        scrollMode: 'preserve',
        // A completed local stream already has the same visible message data. The cloud codec
        // can still differ in storage-only fields, so do not clear and recreate the message list.
        renderMessages: !activeConversationViewCurrent
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
    const conversationsChanged = !cloudValuesEqual(
      liveSnapshot.conversations || [],
      protectedRemote.conversations || []
    );
    appDataStore.replaceAll({
      conversations: preserveItemIdentity(current.conversations, protectedRemote.conversations),
      folders: protectedRemote.folders,
      astras: protectedRemote.astras,
      personalMemories: protectedRemote.personalMemories
    });
    const activeConversationViewCurrent = activeConversationChanged
      && Boolean(isActiveConversationViewCurrent());
    const permanentMemoryPurge = tombstoneIndex.conversations.size > 0
      ? Promise.resolve(onRemoteConversationsPermanentlyDeleted({
        conversationIds: [...tombstoneIndex.conversations]
      })).catch(error => logger.warn('Memory summary could not remove cloud-deleted conversations.', error))
      : Promise.resolve();
    const committedActiveConversation = activeConversationId
      ? appDataStore.getConversations().find(conversation => conversation?.id === activeConversationId)
      : null;
    if (activeConversationId && (!committedActiveConversation || committedActiveConversation.deletedAt)) {
      onActiveConversationUnavailable({
        conversationId: activeConversationId,
        workspace: protectedRemote
      });
    }
    renderWorkspaceChanges({
      sidebarChanged,
      activeConversationChanged,
      controlsChanged,
      activeConversationViewCurrent
    });
    if (conversationsChanged) {
      void permanentMemoryPurge.then(() => Promise.resolve(onRemoteConversationsApplied({
        conversations: appDataStore.getConversations(),
        options
      }))).catch(error => logger.warn('Memory summary could not refresh after a cloud conversation update.', error));
    }
    requestActiveConversationHydration();
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
      const mergedMemoryState = mergeSyncedMemoryState(
        appDataStore.getMemoryState?.() || {},
        normalizedConfig.memorySync
      );
      appDataStore.replaceMemoryState(mergedMemoryState);
      void saveAppData();
      if (mergedMemoryState.memorySummary?.needsRefresh === true) {
        void Promise.resolve(onMemorySyncApplied(mergedMemoryState.memorySummary))
          .catch(error => logger.warn('Memory summary could not reconcile a sync merge.', error));
      }
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

  const applyMemorySummaryRecords = records => {
    if (!ready) {
      pendingMemorySummaryRecords = records;
      return;
    }
    if (!Array.isArray(records)) return;
    const currentMemoryState = appDataStore.getMemoryState?.() || {};
    const mergedMemoryState = mergeMemoryStateWithSummaryRecords(currentMemoryState, records);
    if (cloudValuesEqual(currentMemoryState, mergedMemoryState)) return;
    appDataStore.replaceMemoryState(mergedMemoryState);
    void saveAppData();
    if (mergedMemoryState.memorySummary?.needsRefresh === true) {
      void Promise.resolve(onMemorySyncApplied(mergedMemoryState.memorySummary))
        .catch(error => logger.warn('Memory summary could not reconcile a record sync merge.', error));
    }
  };

  const markReady = () => {
    ready = true;
    if (pendingConfig) {
      const nextConfig = pendingConfig;
      pendingConfig = null;
      applyConfig(nextConfig);
    }
    if (pendingMemorySummaryRecords) {
      const nextRecords = pendingMemorySummaryRecords;
      pendingMemorySummaryRecords = null;
      applyMemorySummaryRecords(nextRecords);
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
  window.addEventListener('astra:cloud-memory-summary', event => applyMemorySummaryRecords(event.detail?.records));
  window.addEventListener('astra:active-conversation-changed', requestActiveConversationHydration);
  window.__astraCloudRuntimeReady = markReady;

  return { markReady, hydrateActiveConversation };
}
