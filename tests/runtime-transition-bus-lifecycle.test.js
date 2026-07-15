import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createLegacyTransitionBusLifecycle } from '../src/app/runtime/legacy-core/transition-bus-lifecycle.js';

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const noop = () => {};

function createClassList() {
  const values = new Set();
  return {
    values,
    add: (...names) => names.forEach((name) => values.add(name)),
    remove: (...names) => names.forEach((name) => values.delete(name)),
    contains: (name) => values.has(name),
    toggle(name, force) {
      const enabled = force ?? !values.has(name);
      if (enabled) values.add(name);
      else values.delete(name);
    }
  };
}

function createNode() {
  const listeners = new Map();
  return {
    dataset: {},
    style: {},
    value: '',
    textContent: '',
    innerHTML: '',
    className: '',
    classList: createClassList(),
    children: [],
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    remove() {},
    focus() {},
    select() {},
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    dispatch(type, event = {}) {
      return listeners.get(type)?.(event);
    },
    querySelector() {
      return createNode();
    },
    querySelectorAll() {
      return [];
    },
    getBoundingClientRect() {
      return { bottom: 0, top: 0, left: 0, height: 0 };
    }
  };
}

function createHarness(overrides = {}) {
  const calls = [];
  const bindings = new Map();
  const elements = {
    batchMoveFolderList: createNode(),
    batchMoveModal: createNode(),
    voiceInputBtnMessage: createNode(),
    voiceInputBtnSearch: createNode(),
    messageInput: createNode(),
    modalSearchInput: createNode(),
    filePreviewContainer: createNode(),
    sidebar: createNode(),
    overlay: createNode()
  };
  const state = {
    config: { uiLanguage: 'en', theme: 'light', selectedModel: 'm1', customModels: [], modelOrder: [] },
    conversations: [{ id: 'c1', messages: [], archived: false, deletedAt: null }],
    folders: [{ id: 'f1', name: 'Folder One' }],
    astras: [],
    personalMemories: [],
    uploadedFiles: [],
    sidebarOpen: false,
    currentUser: null,
    currentSpeechRecognition: null,
    currentVoiceTarget: null,
    selectedConversationIds: new Set(['c1']),
    conversationStateAccess: {
      getCurrentConversationId: () => 'c1',
      setCurrentConversationId: (id) => calls.push(['setCurrentConversationId', id])
    },
    modelPieChart: null,
    sendConfirmed: false,
    abortController: null,
    cropperInstance: null,
    editingAstraForAvatarId: null,
    editingAstrasId: null,
    currentStoreCategory: 'all',
    messageObserver: null,
    timeDistChart: null,
    isAutoScrolling: false
  };
  const document = {
    body: createNode(),
    createElement: () => createNode(),
    querySelectorAll: () => [],
    execCommand: () => true
  };
  const base = {
    window: { innerWidth: 1200, innerHeight: 900 },
    document,
    navigator: {},
    fetch: noop,
    File: class {},
    FileReader: class {},
    Image: class {},
    URL: {},
    Event: class {},
    Blob: class {},
    Chart: class {},
    Cropper: class {},
    loadArchiveVendor: async () => class {},
    loadSharingVendor: async () => ({
      Peer: class {},
      QRCode: class {},
      Html5Qrcode: class {}
    }),
    Peer: class {},
    QRCode: class {},
    Html5Qrcode: class {},
    JSZip: class {},
    ResizeObserver: class {},
    IntersectionObserver: class {},
    requestAnimationFrame: (callback) => callback(),
    setTimeout: (callback) => callback(),
    clearTimeout: noop,
    crypto: { randomUUID: () => 'id' },
    console: { warn: noop, error: noop, log: noop },
    globalObject: {},
    getComputedStyle: () => ({}),
    elements,
    legacyRuntimeContext: {
      registerLazyBinding(name, getter) {
        calls.push(['registerLazyBinding', name]);
        bindings.set(name, getter);
      },
      resolveBinding(name) {
        calls.push(['resolveBinding', name]);
        return bindings.get(name)?.();
      }
    },
    state,
    runtimeConfigAccess: {},
    runtimeAppDataStore: {
      replaceAll(next) {
        state.conversations = next.conversations || [];
        state.folders = next.folders || [];
        state.astras = next.astras || [];
        state.personalMemories = next.personalMemories || [];
        return {
          conversations: state.conversations,
          folders: state.folders,
          astras: state.astras,
          personalMemories: state.personalMemories
        };
      },
      replaceFolders(next) {
        state.folders = next;
        return state.folders;
      },
      replacePersonalMemories(next) {
        state.personalMemories = next;
        return state.personalMemories;
      }
    },
    runtimeDialogCoordinator: { showNotification: (...args) => calls.push(['dialogNotification', ...args]) },
    i18n: { en: {} },
    getCurrentConversationId: () => state.conversationStateAccess.getCurrentConversationId(),
    setCurrentConversationId: (id) => state.conversationStateAccess.setCurrentConversationId(id),
    officialAstras: [],
    updateLogs: [],
    uiThemeColors: {},
    models: [{ id: 'm1', name: 'Model One', provider: 'openai' }],
    getSensitiveApiKeys: () => ({ gemini: 'sensitive-gemini-key' }),
    mergeSensitiveApiKeys: (...args) => calls.push(['mergeSensitiveApiKeys', ...args]),
    saveSensitiveConfig: async () => calls.push(['saveSensitiveConfig']),
    setTheme: noop,
    updateThemeButtons: noop,
    setAiBubbleColor: noop,
    setUserBubbleColor: noop,
    saveConfig: async () => calls.push(['saveConfig']),
    saveAppData: async () => calls.push(['saveAppData']),
    deleteConversationsFromCloud: async (...args) => calls.push(['deleteConversationsFromCloud', ...args]),
    deleteAstrasFromCloud: async (...args) => calls.push(['deleteAstrasFromCloud', ...args]),
    showNotification: (...args) => calls.push(['showNotification', ...args]),
    toggleModal: (...args) => calls.push(['toggleModal', ...args]),
    renderAstras: noop,
    escapeHTML: (value = '') => String(value),
    sanitizeTrustedHTML: (value = '') => String(value),
    showRenameModal: noop,
    togglePinChat: noop,
    archiveChat: noop,
    deleteChat: noop,
    moveConversationToFolder: noop,
    showFolderSettingsModal: noop,
    deleteFolder: noop,
    deleteAstras: noop,
    showCustomConfirm: async () => true,
    showCustomPrompt: async () => 'name',
    showCustomDialog: noop,
    formatFullTimestamp: () => '',
    renderUserText: (value = '') => String(value),
    renderMarkdownWithFormulas: (value = '') => String(value),
    startNewChat: noop,
    renderAll: noop,
    updateFunctionButtonsState: noop,
    saveSettings: noop,
    handleLogout: noop,
    handleFormSubmit: noop,
    handleRename: noop,
    handleSaveFolderSettings: noop,
    loadChat: noop,
    getActiveConversation: () => state.conversations[0],
    normalizeConversationModel: (conversation) => conversation,
    getCouncilSelectedModels: () => [],
    isCouncilEnabled: () => false,
    hasCouncilWebSearchAccess: () => false,
    hasSingleWebSearchAccess: () => false,
    hasSingleDocumentAccess: () => false,
    modelSupportsVision: () => false,
    getCouncilTexts: () => ({}),
    renderInputIndicators: noop,
    toggleLearningMode: noop,
    toggleSelectionMode: noop,
    submitChatForm: noop,
    createNewFolder: () => 'new-folder',
    createAstras: noop,
    handleSaveAstras: noop,
    handleDeleteAllData: noop,
    updateFileInputUI: noop,
    postJsonWithReadableError: noop,
    openCouncilPopoverFromAttachmentMenu: noop,
    setupHistorySidebarInteractions: noop,
    setupHistorySidebarTriggers: noop,
    getDefaultFolder: () => ({ id: 'default' }),
    isMobileSettingsViewport: () => false,
    openSettingsMobileSection: noop,
    getItem: async () => null,
    getUserKey: (username) => `user:${username}`,
    loadConfig: async () => {},
    loadAppData: async () => {},
    handleLogin: noop,
    installTouchGuards: noop,
    registerServiceWorker: noop,
    getModelTiers: () => ({}),
    getModelApiId: (model) => model.id,
    getApiKeyForProvider: () => '',
    getCouncilValidation: () => ({ valid: true }),
    callApiWithSchema: async () => ({}),
    getOutputMode: () => 'text',
    hashString: async () => 'hash',
    constantTimeEqual: () => true,
    processInChunks: async (items, callback) => callback(items),
    getBackupUsername: () => 'user',
    createPasswordRecord: async () => ({}),
    setItem: async () => {},
    logger: { warn: noop, error: noop, log: noop }
  };
  const dependencies = { ...base, ...overrides };
  const lifecycle = createLegacyTransitionBusLifecycle(dependencies);
  return { bindings, calls, dependencies, elements, lifecycle, state };
}

test('factory is inert on import and validates required dependencies', () => {
  assert.throws(
    () => createLegacyTransitionBusLifecycle(),
    /missing dependencies: window, document/
  );
});

test('factory composes extracted lifecycles and exposes former aliases', () => {
  const { lifecycle } = createHarness();
  for (const name of [
    'renderPersonalMemoryList',
    'openDashboard',
    'performSearchAndRenderResults',
    'toggleSidebar',
    'handleBatchDelete',
    'handleBatchArchive',
    'handleBatchMove',
    'handleExport',
    'handleImport',
    'handleImportOnAuth',
    'processAuthImport',
    'setupVoiceInput',
    'toggleVoiceInput'
  ]) {
    assert.equal(typeof lifecycle[name], 'function', `${name} should be exposed`);
  }
});

test('factory exposes former 04 bridge functions with clear missing-binding errors', () => {
  const { lifecycle } = createHarness();
  for (const name of [
    'applyLanguage',
    'applyUiTheme',
    'applyCustomWallpaper',
    'renderUiColorOptions',
    'renderStore',
    'renderTrash',
    'setupTimeAnalysis',
    'setupMessageIntersectionObserver',
    'showMobileContextMenuForAstras'
  ]) {
    assert.equal(typeof lifecycle[name], 'function', `${name} should be exposed`);
  }
  assert.throws(
    () => lifecycle.applyLanguage('en'),
    /Legacy core tail binding "coreTail\.applyLanguage" must be a function/
  );
});

test('registers sidebar.toggleSidebar and runtime.coreTailDependencies with live state', () => {
  const { bindings, calls, lifecycle, state } = createHarness();
  lifecycle.registerSidebarBindings();
  lifecycle.registerCoreTailDependencies();

  assert.equal(typeof bindings.get('sidebar.toggleSidebar')(), 'function');
  const dependencies = bindings.get('runtime.coreTailDependencies')();
  assert.equal(dependencies.state.config.uiLanguage, 'en');
  state.config = { uiLanguage: 'fr' };
  assert.equal(dependencies.state.config.uiLanguage, 'fr');
  dependencies.state.sidebarOpen = true;
  assert.equal(state.sidebarOpen, true);
  assert.equal(dependencies.getCurrentConversationId(), 'c1');
  assert.equal(typeof dependencies.deleteConversationsFromCloud, 'function');
  assert.equal(typeof dependencies.deleteAstrasFromCloud, 'function');
  dependencies.setCurrentConversationId('c2');
  assert.deepEqual(calls.at(-1), ['setCurrentConversationId', 'c2']);
});

test('legacy core passes cloud deletion through the production transition bus composition', () => {
  const source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  assert.match(
    source,
    /createLegacyTransitionBusLifecycle\(\{[\s\S]*?saveAppData,\s*deleteConversationsFromCloud,\s*deleteAstrasFromCloud,\s*showNotification,/
  );
});

test('module owns transition wiring without fragments or virtual runtime imports', () => {
  const source = readSource('src/app/runtime/legacy-core/transition-bus-lifecycle.js');
  assert.match(source, /createLegacyModelMemoryDashboardLifecycle/);
  assert.match(source, /createLegacySearchUploadSidebarLifecycle/);
  assert.match(source, /createLegacyBatchImportVoiceLifecycle/);
  assert.match(source, /registerLazyBinding\('sidebar\.toggleSidebar'/);
  assert.match(source, /registerLazyBinding\(\s*'runtime\.coreTailDependencies'/);
  assert.doesNotMatch(source, /legacy-runtime\/fragments|virtual:legacy-app-runtime/);
});
