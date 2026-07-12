const REQUIRED_APP_BOOTSTRAP_FIELDS = [
  'window',
  'document',
  'elements',
  'Peer',
  'QRCode',
  'Html5Qrcode',
  'JSZip',
  'BlobCtor',
  'getCurrentUser',
  'getConfig',
  'getConversations',
  'getFolders',
  'getAstras',
  'getPersonalMemories',
  'getCurrentConversationId',
  'setCurrentConversationId',
  'setSidebarOpen',
  'setSendConfirmed',
  'getAbortController',
  'getCropperInstance',
  'setCropperInstance',
  'setEditingAstraForAvatarId',
  'startNewChat',
  'renderAll',
  'setTheme',
  'setupVoiceInput',
  'setupScrollToBottomButton',
  'updateDisplayedVersion',
  'checkAndShowLatestUpdate',
  'updateFunctionButtonsState',
  'updateInputState',
  'setupSettingsModal',
  'toggleSidebar',
  'toggleModal',
  'saveSettings',
  'saveAppData',
  'handleExport',
  'handleImport',
  'handleLogout',
  'handleFileSelection',
  'handleFormSubmit',
  'handleRename',
  'handleSaveFolderSettings',
  'performSearchAndRenderResults',
  'loadChat',
  'openDashboard',
  'getActiveConversation',
  'copyTextToClipboard',
  'showNotification',
  'normalizeConversationModel',
  'getCouncilSelectedModels',
  'isCouncilEnabled',
  'hasCouncilWebSearchAccess',
  'hasSingleWebSearchAccess',
  'hasSingleDocumentAccess',
  'modelSupportsVision',
  'getCouncilTexts',
  'renderInputIndicators',
  'toggleLearningMode',
  'toggleSelectionMode',
  'handleBatchDelete',
  'handleBatchArchive',
  'handleBatchMove',
  'adjustTextareaHeight',
  'submitChatForm',
  'closeAllPopovers',
  'showCustomPrompt',
  'createNewFolder',
  'createAstras',
  'handleSaveAstras',
  'renderPersonalMemoryList',
  'handleWallpaperUpload',
  'restoreDefaultWallpaper',
  'handleConfirmCrop',
  'handleDeleteAllData',
  'applyLanguage',
  'openStore',
  'closeStore',
  'handleAvatarUpload',
  'handleConfirmAvatarCrop',
  'showUpdateHistory',
  'toggleTrashSelectionMode',
  'handleBatchRestoreFromTrash',
  'handleBatchDeleteFromTrash',
  'handleEmptyTrash',
  'updateFileInputUI',
  'postJsonWithReadableError',
  'openCouncilPopoverFromAttachmentMenu',
  'setupHistorySidebarInteractions',
  'setupHistorySidebarTriggers',
  'escapeHTML',
  'getDefaultFolder',
  'isMobileSettingsViewport',
  'openSettingsMobileSection',
  'i18n',
  'randomUUID',
  'random',
  'scheduleTimeout',
  'clearScheduledTimeout',
  'scheduleAnimationFrame',
  'logger'
];

const REQUIRED_STARTUP_FIELDS = [
  'window',
  'document',
  'globalObject',
  'elements',
  'getConfig',
  'setCurrentUser',
  'getItem',
  'getUserKey',
  'loadConfig',
  'loadAppData',
  'restoreMemorySync',
  'applyLanguage',
  'applyCustomWallpaper',
  'applyUiTheme',
  'handleLogin',
  'handleImportOnAuth',
  'processAuthImport',
  'toggleModal',
  'installTouchGuards',
  'registerServiceWorker',
  'showCustomDialog',
  'getComputedStyle'
];

const assertDependencyGroup = (groupName, group, requiredFields) => {
  if (!group || typeof group !== 'object') {
    throw new TypeError(`Legacy runtime entry dependencies require an "${groupName}" object.`);
  }

  const missingFields = requiredFields.filter((field) => group[field] == null);
  if (missingFields.length > 0) {
    throw new TypeError(
      `Legacy runtime entry dependencies are missing ${groupName} fields: ${missingFields.join(', ')}.`
    );
  }
};

export function validateLegacyRuntimeEntryDependencies(dependencies) {
  if (!dependencies || typeof dependencies !== 'object') {
    throw new TypeError('Legacy runtime entry dependencies must be an object.');
  }

  assertDependencyGroup('appBootstrap', dependencies.appBootstrap, REQUIRED_APP_BOOTSTRAP_FIELDS);
  assertDependencyGroup('startup', dependencies.startup, REQUIRED_STARTUP_FIELDS);
  return dependencies;
}

export function createLegacyRuntimeEntryDependencies({
  appBootstrap,
  startup
} = {}) {
  validateLegacyRuntimeEntryDependencies({ appBootstrap, startup });

  return Object.freeze({
    appBootstrap: Object.freeze({ ...appBootstrap }),
    startup: Object.freeze({ ...startup })
  });
}

export const LEGACY_RUNTIME_ENTRY_REQUIRED_FIELDS = Object.freeze({
  appBootstrap: Object.freeze([...REQUIRED_APP_BOOTSTRAP_FIELDS]),
  startup: Object.freeze([...REQUIRED_STARTUP_FIELDS])
});
