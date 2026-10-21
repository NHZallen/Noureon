import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createWorkspaceFeatures } from '../src/app/runtime/shell/workspace-features.js';
import { createShellState } from '../src/app/runtime/shell/shell-state.js';

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
  const elements = {
    batchMoveFolderList: createNode(),
    batchMoveModal: createNode(),
    voiceInputBtnMessage: createNode(),
    voiceInputBtnSearch: createNode(),
    messageInput: createNode(),
    modalSearchInput: createNode(),
    filePreviewContainer: createNode(),
    sidebar: createNode(),
    sidebarOverlay: createNode(),
    appContainer: createNode(),
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
  const shell = createShellState();
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
    Chart: class {},
    loadArchiveVendor: async () => class {},
    requestAnimationFrame: (callback) => callback(),
    setTimeout: (callback) => callback(),
    clearTimeout: noop,
    crypto: { randomUUID: () => 'id' },
    console: { warn: noop, error: noop, log: noop },
    elements,
    i18n: { en: {} },
    ...shell,
    runtimeConfigAccess: { getConfig: () => state.config, getUiLanguage: () => state.config.uiLanguage },
    liveConversationsBridge: {
      getConversations: () => state.conversations,
      replaceConversations: (next) => (state.conversations = next)
    },
    models: [{ id: 'm1', name: 'Model One', provider: 'openai' }],
    runtimeAppDataStore: {
      getFolders: () => state.folders,
      getAstras: () => state.astras,
      getPersonalMemories: () => state.personalMemories,
      getMemoryState: () => ({}),
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
    conversationStateAccess: {
      getCurrentConversationId: () => 'c1',
      setCurrentConversationId: (id) => calls.push(['setCurrentConversationId', id])
    },
    updateInputState: () => calls.push(['updateInputState']),
    setupSettingsModal: () => calls.push(['setupSettingsModal']),
    initChatApp: () => calls.push(['initChatApp']),
    applyUiTheme: () => calls.push(['applyUiTheme']),
    applyLanguage: (...args) => calls.push(['applyLanguage', ...args]),
    setupTimeAnalysis: () => calls.push(['setupTimeAnalysis']),
    getSensitiveApiKeys: () => ({ gemini: 'sensitive-gemini-key' }),
    mergeSensitiveApiKeys: (...args) => calls.push(['mergeSensitiveApiKeys', ...args]),
    saveSensitiveConfig: async () => calls.push(['saveSensitiveConfig']),
    saveConfig: async () => calls.push(['saveConfig']),
    saveAppData: async () => calls.push(['saveAppData']),
    showNotification: (...args) => calls.push(['showNotification', ...args]),
    showCustomConfirm: async () => true,
    showCustomPrompt: async () => 'name',
    toggleModal: (...args) => calls.push(['toggleModal', ...args]),
    toggleSelectionMode: noop,
    escapeHTML: (value = '') => String(value),
    renderUserText: (value = '') => String(value),
    renderMarkdownWithFormulas: (value = '') => String(value),
    startNewChat: noop,
    loadChat: noop,
    getActiveConversation: () => state.conversations[0],
    moveConversationToFolder: noop,
    createNewFolder: () => 'new-folder',
    normalizeConversationModel: (conversation) => conversation,
    isCouncilEnabled: () => false,
    modelSupportsVision: () => false,
    getCouncilValidation: () => ({ valid: true }),
    getApiKeyForProvider: () => '',
    getGeneratedImageRuntime: async () => ({ assetStore: { getBlob: async () => null, put: async () => {} } }),
    callApiWithSchema: async () => ({}),
    getOutputMode: () => 'text',
    hashString: async () => 'hash',
    constantTimeEqual: () => true,
    processInChunks: async (items, callback) => callback(items),
    getBackupUsername: () => 'user',
    createPasswordRecord: async () => ({}),
    getUserKey: (username) => `user:${username}`,
    setItem: async () => {},
    logger: { warn: noop, error: noop, log: noop }
  };
  const dependencies = { ...base, ...overrides };
  const lifecycle = createWorkspaceFeatures(dependencies);
  return { calls, dependencies, elements, lifecycle, state, shell };
}

test('the workspace features are made at once and handed out by name', () => {
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

test('hands out the memory functions once they are made, and works on the live shell state', async () => {
  const { elements, lifecycle, state, shell } = createHarness();

  assert.equal(typeof lifecycle.getMemory().rebuildHistoryIndex, 'function');
  assert.equal(typeof lifecycle.getMemory().retrieveHistory, 'function');
  assert.equal(typeof lifecycle.ensureMemorySummaryFresh, 'function');

  lifecycle.toggleSidebar(true);
  assert.equal(shell.sidebar.isSidebarOpen(), true, 'the sidebar writes the sidebar store it was given');

  // The batch move lists the folders of the shell state as it is now.
  state.folders = [{ id: 'f2', name: 'Folder Two', conversationIds: [] }];
  lifecycle.renderBatchMoveModal();
  assert.ok(elements.batchMoveFolderList.children.some((button) => button.textContent === 'Folder Two'));
});

test('a rebuild never replaces a persisted index when the workspace is temporarily empty', async () => {
  const values = new Map([['noureon:history-index:v1:anonymous', {
    schemaVersion: 1,
    records: [{
      recordId: 'capsule:historical',
      recordType: 'conversation-capsule',
      conversationId: 'historical',
      sourceHash: 'historical-hash',
      vector: [1, 0]
    }]
  }]]);
  const harness = createHarness({
    runtimeStorageAdapter: {
      getItem: async key => values.get(key) ?? null,
      setItem: async (key, value) => values.set(key, value),
      removeItem: async key => values.delete(key)
    }
  });
  harness.state.conversations = [];

  await harness.lifecycle.getMemory().rebuildHistoryIndex();

  assert.deepEqual(
    values.get('noureon:history-index:v1:anonymous').records.map(record => record.recordId),
    ['capsule:historical']
  );
});

test('closing the popovers also collapses the model and thinking buttons', () => {
  const popover = createNode();
  popover.classList.add('popover', 'visible');
  const trigger = createNode();
  const attributes = { 'aria-expanded': 'true' };
  trigger.setAttribute = (name, value) => { attributes[name] = value; };
  const { lifecycle } = createHarness({
    document: {
      body: createNode(),
      createElement: () => createNode(),
      execCommand: () => true,
      querySelectorAll: (selector) => (selector === '.popover.visible' ? [popover]
        : selector.includes('#model-council-control .mp-trigger') ? [trigger] : [])
    }
  });
  lifecycle.closeAllPopovers();
  assert.equal(popover.classList.contains('visible'), false);
  assert.equal(attributes['aria-expanded'], 'false');
});
