import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createBatchImportLifecycle } from '../src/app/runtime/shell/batch-import-lifecycle.js';

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const noop = () => {};

function createClassList() {
  const values = new Set();
  return {
    values,
    add: (...names) => names.forEach((name) => values.add(name)),
    remove: (...names) => names.forEach((name) => values.delete(name)),
    contains: (name) => values.has(name),
    toggle: (name, force = !values.has(name)) => (force ? values.add(name) : values.delete(name))
  };
}

function createNode() {
  const listeners = new Map();
  return {
    dataset: {},
    style: {},
    textContent: '',
    innerHTML: '',
    className: '',
    classList: createClassList(),
    children: [],
    appendChild(child) { this.children.push(child); return child; },
    addEventListener: (type, listener) => listeners.set(type, listener),
    dispatch: (type, event = {}) => listeners.get(type)?.(event),
    querySelectorAll(selector) {
      if (selector === 'button[data-folder-id]') {
        return this.children.filter((child) => child.dataset && Object.hasOwn(child.dataset, 'folderId'));
      }
      return [];
    }
  };
}

function createHarness(overrides = {}) {
  const calls = [];
  let currentUser = null;
  let config = { uiLanguage: 'en', ...(overrides.config || {}) };
  let conversations = overrides.conversations ?? [
    { id: 'c1', archived: false, deletedAt: null },
    { id: 'c2', archived: false, deletedAt: null }
  ];
  let folders = overrides.folders ?? [{ id: 'f1', name: 'Folder One' }];
  let astras = [];
  let personalMemories = [];
  let selectedConversationIds = overrides.selectedConversationIds ?? new Set(['c1']);
  let currentConversationId = overrides.currentConversationId ?? 'c1';
  const batchMoveFolderList = createNode();
  const elements = {
    batchMoveFolderList,
    batchMoveModal: createNode(),
    messageInput: createNode(),
    modalSearchInput: createNode()
  };
  const document = {
    createElement: () => createNode()
  };
  const base = {
    document,
    window: {},
    navigator: {},
    URL: {},
    File: class {},
    JSZip: class {},
    elements,
    setupSettingsModal: (...args) => calls.push(['setupSettingsModal', ...args]),
    initChatApp: () => calls.push(['initChatApp']),
    getConfig: () => config,
    getSensitiveApiKeys: () => ({ gemini: 'sensitive-gemini-key' }),
    mutateConfig: (mutator) => (typeof mutator === 'function' ? mutator(config) : Object.assign(config, mutator)),
    mergeSensitiveApiKeys: (...args) => calls.push(['mergeSensitiveApiKeys', ...args]),
    getCurrentUser: () => currentUser,
    setCurrentUser: (nextUser) => (currentUser = nextUser),
    getConversations: () => conversations,
    getFolders: () => folders,
    getAstras: () => astras,
    getPersonalMemories: () => personalMemories,
    replaceAllAppData: (nextAppData) => {
      calls.push(['replaceAllAppData']);
      conversations = nextAppData.conversations || [];
      folders = nextAppData.folders || [];
      astras = nextAppData.astras || [];
      personalMemories = nextAppData.personalMemories || [];
      return { conversations, folders, astras, personalMemories };
    },
    replaceFolders: (nextFolders) => (folders = nextFolders),
    replacePersonalMemories: (nextPersonalMemories) => (personalMemories = nextPersonalMemories),
    getSelectedConversationIds: () => selectedConversationIds,
    conversationStateAccess: {
      getCurrentConversationId: () => currentConversationId,
      setCurrentConversationId: (nextId) => { calls.push(['setCurrentConversationId', nextId]); currentConversationId = nextId; }
    },
    runtimeDialogCoordinator: { showNotification: (...args) => calls.push(['runtimeDialogCoordinator.showNotification', ...args]) },
    saveAppData: async (...args) => calls.push(['saveAppData', ...args]),
    saveConfig: async () => calls.push(['saveConfig']),
    saveSensitiveConfig: async () => calls.push(['saveSensitiveConfig']),
    toggleSelectionMode: () => calls.push(['toggleSelectionMode']),
    toggleModal: (...args) => calls.push(['toggleModal', ...args]),
    showNotification: (...args) => calls.push(['showNotification', ...args]),
    showCustomConfirm: async (...args) => { calls.push(['showCustomConfirm', ...args]); return true; },
    showCustomPrompt: async (...args) => { calls.push(['showCustomPrompt', ...args]); return 'New Folder'; },
    moveConversationToFolder: (...args) => calls.push(['moveConversationToFolder', ...args]),
    createNewFolder: (name) => { calls.push(['createNewFolder', name]); return 'new-folder'; },
    startNewChat: () => calls.push(['startNewChat']),
    processInChunks: async (items, callback) => callback(items),
    getBackupUsername: () => 'user',
    createPasswordRecord: async () => ({}),
    getUserKey: (username) => `chatUser_${username}`,
    setItem: async (...args) => calls.push(['setItem', ...args]),
    hashString: async () => 'hash',
    constantTimeEqual: () => true,
    requestAnimationFrame: (callback) => callback(),
    applyUiTheme: noop,
    applyLanguage: noop,
    setAiBubbleColor: noop,
    loadChat: noop,
    getOutputMode: () => 'text',
    i18n: { en: {} },
    randomUUID: () => 'id',
    scheduleTimeout: (callback) => callback(),
    delay: async () => {},
    logger: { warn: noop, error: noop, log: noop }
  };
  const lifecycle = createBatchImportLifecycle({ ...base, ...overrides });
  return {
    calls,
    elements,
    lifecycle,
    get config() { return config; },
    get conversations() { return conversations; },
    get currentConversationId() { return currentConversationId; }
  };
}

test('factory is inert on import and validates required dependencies', () => {
  assert.throws(() => createBatchImportLifecycle(), /missing dependencies: document, window/);
});

test('factory exposes batch, import and auth-import functions', () => {
  const { lifecycle } = createHarness();
  for (const name of ['handleBatchDelete', 'handleBatchArchive', 'handleBatchMove', 'renderBatchMoveModal', 'batchMoveToFolder', 'handleExport',
    'performImport', 'handleImport', 'handleImportOnAuth', 'processAuthImport']) {
    assert.equal(typeof lifecycle[name], 'function', `${name} should be exposed`);
  }
});

test('batch delete uses live selection getters and preserves persistence ordering', async () => {
  const harness = createHarness({ selectedConversationIds: new Set(['c1', 'c2']) });
  await harness.lifecycle.handleBatchDelete();

  assert.equal(harness.conversations[0].deletedAt != null, true);
  assert.equal(harness.conversations[0].stateUpdatedAt, harness.conversations[0].deletedAt);
  assert.equal(harness.conversations[0].trashStateUpdatedAt, harness.conversations[0].deletedAt);
  assert.equal(harness.conversations[0].archived, false);
  assert.equal(harness.conversations[0].lastUpdatedAt, undefined);
  assert.deepEqual(harness.calls.find(call => call[0] === 'saveAppData'), ['saveAppData', { immediateCloudSync: true }]);
  assert.deepEqual(harness.calls.map((call) => call[0]), ['showCustomConfirm', 'startNewChat', 'saveAppData', 'toggleSelectionMode', 'showNotification']);
});

test('batch delete marks every selected conversation as trashed', async () => {
  const harness = createHarness({ selectedConversationIds: new Set(['c1', 'c2']) });

  await harness.lifecycle.handleBatchDelete();

  assert.ok(harness.conversations.every(conversation => conversation.deletedAt));
});

test('batch delete leaves the open conversation for a new chat at once, even when another one could be shown', async () => {
  // The defaults: c1 is open and selected, c2 could be shown.
  const harness = createHarness();

  await harness.lifecycle.handleBatchDelete();

  assert.equal(harness.conversations[0].deletedAt != null, true);
  assert.equal(harness.conversations[1].deletedAt, null);
  assert.deepEqual(harness.calls.map((call) => call[0]), ['showCustomConfirm', 'startNewChat', 'saveAppData', 'toggleSelectionMode', 'showNotification']);
});

test('batch delete clears folder membership before the immediate cloud save', async () => {
  const folder = { id: 'f1', name: 'Folder One', conversationIds: ['c1', 'c2'] };
  const deletedConversation = { id: 'c1', folderId: 'f1', archived: true, deletedAt: null };
  const harness = createHarness({
    selectedConversationIds: new Set(['c1']),
    currentConversationId: 'c2',
    conversations: [deletedConversation, { id: 'c2', folderId: 'f1', archived: false, deletedAt: null }],
    folders: [folder]
  });

  await harness.lifecycle.handleBatchDelete();

  assert.equal(deletedConversation.folderId, null);
  assert.equal(deletedConversation.archived, false);
  assert.deepEqual(folder.conversationIds, ['c2']);
  assert.deepEqual(harness.calls.find(call => call[0] === 'saveAppData'), ['saveAppData', { immediateCloudSync: true }]);
});

test('batch archive uses runtime dialog notification after save and selection toggle', async () => {
  const harness = createHarness({ selectedConversationIds: new Set(['c1', 'c2']) });
  await harness.lifecycle.handleBatchArchive();

  assert.equal(harness.conversations[0].archived, true);
  assert.deepEqual(harness.calls.map((call) => call[0]), ['setCurrentConversationId', 'startNewChat', 'saveAppData', 'toggleSelectionMode', 'runtimeDialogCoordinator.showNotification']);
});

test('batch archive falls back to the next unarchived live conversation without stale selection state', async () => {
  // The defaults: c1 is open and selected, c2 could be shown.
  const harness = createHarness();

  await harness.lifecycle.handleBatchArchive();

  assert.equal(harness.conversations[0].archived, true);
  assert.equal(harness.currentConversationId, 'c2');
  assert.equal(harness.calls.some((call) => call[0] === 'startNewChat'), false);
  assert.deepEqual(harness.calls.map((call) => call[0]), ['setCurrentConversationId', 'saveAppData', 'toggleSelectionMode', 'runtimeDialogCoordinator.showNotification']);
});

test('batch move modal and move handoff use injected folder and selection dependencies', async () => {
  const harness = createHarness();
  harness.lifecycle.handleBatchMove();
  assert.ok(harness.calls.some((call) => call[0] === 'toggleModal' && call[2] === true));
  assert.equal(harness.elements.batchMoveFolderList.children.length, 2);

  await harness.lifecycle.batchMoveToFolder('f1');
  assert.ok(harness.calls.some((call) => call[0] === 'moveConversationToFolder' && call[1] === 'c1' && call[2] === 'f1'));
  assert.ok(harness.calls.some((call) => call[0] === 'toggleSelectionMode'));
});

test('single conversation batch move preserves selection mode and routes only the requested id', async () => {
  const harness = createHarness({ selectedConversationIds: new Set(['c1', 'c2']) });
  harness.lifecycle.renderBatchMoveModal('c2');

  await harness.lifecycle.batchMoveToFolder('f1');

  assert.ok(harness.calls.some((call) => call[0] === 'moveConversationToFolder' && call[1] === 'c2' && call[2] === 'f1'));
  assert.equal(harness.calls.some((call) => call[0] === 'moveConversationToFolder' && call[1] === 'c1'), false);
  assert.equal(harness.calls.some((call) => call[0] === 'toggleSelectionMode'), false);
});

test('importing a backup replaces the data, keeps its settings and API keys, and saves them', async () => {
  const harness = createHarness({ getCurrentUser: () => ({ username: 'user' }) });
  await harness.lifecycle.performImport({ conversations: [{ id: 'imported' }], settings: { uiLanguage: 'fr' }, apiKeys: { gemini: 'imported-key' } });

  assert.deepEqual(harness.conversations, [{ id: 'imported' }]);
  assert.equal(harness.config.uiLanguage, 'fr');
  assert.deepEqual(harness.calls.map(([name]) => name), ['replaceAllAppData', 'saveAppData', 'mergeSensitiveApiKeys', 'saveSensitiveConfig', 'saveConfig']);
  assert.deepEqual(harness.calls[2][1], { gemini: 'imported-key' });
});

test('importing a backup from the sign-in page signs in, restores the data and keys, then starts the app', async () => {
  const harness = createHarness({ processInChunks: async (items, callback) => { for (const item of items) await callback(item); } });
  const backup = { conversations: [{ id: 'restored', messages: [] }], settings: { uiLanguage: 'fr' }, apiKeys: { gemini: 'auth-key' } };
  Object.assign(harness.elements, {
    usernameInput: { value: 'user' },
    passwordInput: { value: 'secret' },
    importFileInputAuth: { files: [{ name: 'backup.json', type: 'application/json', text: async () => JSON.stringify(backup) }] }
  });
  for (const name of ['importProgressContainerAuth', 'importProgressBarAuth', 'importStatusTextAuth', 'importPercentageAuth', 'confirmImportBtnAuth', 'importDataModalAuth', 'authContainer', 'appContainer']) {
    harness.elements[name] = Object.assign(createNode(), { setAttribute: noop, removeAttribute: noop });
  }
  await harness.lifecycle.processAuthImport();

  const at = (name) => harness.calls.findIndex(([called]) => called === name);
  assert.deepEqual(harness.conversations.map(({ id }) => id), ['restored']);
  assert.equal(harness.config.uiLanguage, 'fr');
  assert.deepEqual(harness.calls[at('mergeSensitiveApiKeys')][1], { gemini: 'auth-key' });
  assert.ok(at('replaceAllAppData') >= 0 && at('replaceAllAppData') < at('saveAppData') && at('saveAppData') < at('saveSensitiveConfig') && at('saveSensitiveConfig') < at('initChatApp'));
});

test('the lifecycle does not reach into the legacy fragments or the virtual runtime', () => {
  const source = readSource('src/app/runtime/shell/batch-import-lifecycle.js');
  assert.doesNotMatch(source, /legacy-runtime\/fragments|virtual:legacy-app-runtime/);
});
