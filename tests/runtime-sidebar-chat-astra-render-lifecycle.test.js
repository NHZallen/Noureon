import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createLegacySidebarChatAstraRenderLifecycle } from '../src/app/runtime/legacy-core/sidebar-chat-astra-render-lifecycle.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');
const noop = () => {};

function createElement() {
  return {
    children: [],
    classList: {
      add: noop,
      remove: noop,
      toggle: noop
    },
    dataset: {},
    innerHTML: '',
    style: {},
    textContent: '',
    value: '',
    addEventListener: noop,
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    closest() {
      return this;
    },
    getBoundingClientRect() {
      return { bottom: 0, left: 0, top: 0 };
    },
    querySelector() {
      return createElement();
    },
    querySelectorAll() {
      return [];
    },
    remove: noop
  };
}

function createDependencies(overrides = {}) {
  const elements = new Proxy({}, {
    get(target, key) {
      if (!(key in target)) target[key] = createElement();
      return target[key];
    }
  });
  const folderList = createElement();
  const state = {
    config: { uiLanguage: 'en', autoNaming: false },
    conversations: [],
    folders: [],
    astras: [],
    currentUser: { username: 'tester' },
    editingAstrasId: null,
    selectedConversationIds: new Set(),
    isSelectionMode: false,
    isAutoScrolling: false
  };
  const calls = [];
  const createdElements = [];
  const document = {
    body: createElement(),
    createElement: () => {
      const element = createElement();
      createdElements.push(element);
      return element;
    },
    getElementById: () => null,
    querySelector: () => createElement(),
    querySelectorAll: () => []
  };

  return {
    window: { innerHeight: 800, innerWidth: 1024 },
    document,
    navigator: {},
    fetch: async () => ({}),
    File: class {},
    crypto: { randomUUID: () => 'new-astra-id' },
    requestAnimationFrame: (callback) => callback(),
    elements,
    legacyRuntimeContext: {
      resolveBinding: (name) => {
        calls.push(`resolve:${name}`);
        return noop;
      }
    },
    state,
    runtimeDomAccess: {
      getRequiredElement: (id) => {
        if (id === 'folderList') return folderList;
        return createElement();
      }
    },
    runtimeConfigAccess: { getUiLanguage: () => state.config.uiLanguage },
    conversationStateAccess: { getCurrentConversationId: () => 'active-conv' },
    runtimeRenderCoordinator: { renderSidebar: () => calls.push('renderSidebar') },
    runtimeDialogCoordinator: { showNotification: (...args) => calls.push(['runtimeNotify', ...args]) },
    i18n: { en: { noArchivedChats: 'No archived', createAstras: 'Create Astra', confirmDeleteAstras: 'Delete?' } },
    getActiveConversation: () => state.conversations[0] || null,
    saveAppData: async () => calls.push('saveAppData'),
    saveFolderUiState: async () => calls.push('saveFolderUiState'),
    renderAstras: () => calls.push('renderAstras'),
    renderAll: () => calls.push('renderAllDirect'),
    renderBatchActionBar: () => calls.push('renderBatchActionBar'),
    loadChat: (id) => calls.push(['loadChat', id]),
    createHistoryMenu: noop,
    createFolderMenu: noop,
    deleteChat: noop,
    showArchivedChatPreview: noop,
    unarchiveChat: noop,
    showMobileContextMenu: noop,
    showMobileContextMenuForFolder: noop,
    toggleModal: noop,
    showNotification: (...args) => calls.push(['notify', ...args]),
    showCustomConfirm: async () => true,
    deleteAstrasFromCloud: async (...args) => calls.push(['deleteAstrasFromCloud', ...args]),
    buildMessageRenderView: () => ({ role: 'model', html: '' }),
    replaceAstras: (nextAstras) => {
      calls.push('replaceAstras');
      state.astras = nextAstras;
      return state.astras;
    },
    _folderList: folderList,
    _createdElements: createdElements,
    _calls: calls,
    ...overrides
  };
}

test('factory exports createLegacySidebarChatAstraRenderLifecycle', () => {
  assert.equal(typeof createLegacySidebarChatAstraRenderLifecycle, 'function');
});

test('import is inert and module avoids fragments and virtual runtime', () => {
  const source = readSource('src/app/runtime/legacy-core/sidebar-chat-astra-render-lifecycle.js');

  assert.match(source, /export\s+function\s+createLegacySidebarChatAstraRenderLifecycle/);
  assert.doesNotMatch(source, /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-app/);
});

test('factory validates required dependencies', () => {
  assert.throws(
    () => createLegacySidebarChatAstraRenderLifecycle(),
    /missing dependency: window/
  );
});

test('factory exposes sidebar chat Astra render API', () => {
  const lifecycle = createLegacySidebarChatAstraRenderLifecycle(createDependencies());

  for (const name of [
    'renderFolders',
    'createConversationElement',
    'renderArchivedChats',
    'renderChat',
    'addMessageToUI',
    'getActiveAstrasId',
    'setAstrasForConversation',
    'deactivateAstras',
    'createAstras',
    'handleSaveAstras',
    'deleteAstras',
    'createAstrasMenu'
  ]) {
    assert.equal(typeof lifecycle[name], 'function', `${name} should be exposed`);
  }
});

test('selecting and deactivating a Noura refreshes its composer indicator', async () => {
  const dependencies = createDependencies({
    renderInputIndicators: () => dependencies._calls.push('renderInputIndicators')
  });
  const conversation = { id: 'active-conv', astrasId: null };
  dependencies.state.conversations = [conversation];
  const lifecycle = createLegacySidebarChatAstraRenderLifecycle(dependencies);

  await lifecycle.setAstrasForConversation('astra-1');

  assert.equal(conversation.astrasId, 'astra-1');
  assert.deepEqual(dependencies._calls.slice(0, 4), [
    'saveAppData',
    'renderSidebar',
    'renderInputIndicators',
    'resolve:input.updateInputState'
  ]);

  dependencies._calls.length = 0;
  await lifecycle.deactivateAstras();

  assert.equal(conversation.astrasId, null);
  assert.deepEqual(dependencies._calls.slice(0, 4), [
    'saveAppData',
    'renderSidebar',
    'renderInputIndicators',
    'resolve:input.updateInputState'
  ]);
});

test('renderFolders reads live folders and conversations', () => {
  const dependencies = createDependencies();
  const lifecycle = createLegacySidebarChatAstraRenderLifecycle(dependencies);

  dependencies.state.conversations = [
    { id: 'conv-1', title: 'One', model: { name: 'Model (A)' }, createdAt: '2024-01-01' }
  ];
  dependencies.state.folders = [
    { id: 'folder-1', name: 'Folder', icon: 'default', color: 'gray', textColor: 'gray', isOpen: true, conversationIds: ['conv-1'] }
  ];

  lifecycle.renderFolders();

  assert.equal(dependencies._folderList.children.length, 1);
});

test('sidebar identifies a council conversation by the council label instead of its fallback model', () => {
  const dependencies = createDependencies({
    isCouncilEnabled: (conversation) => Boolean(conversation?.council?.enabled),
    getCouncilTexts: () => ({ title: 'Model Council' }),
    normalizeConversationModel: () => ({ name: 'Fallback model' })
  });
  const lifecycle = createLegacySidebarChatAstraRenderLifecycle(dependencies);

  lifecycle.createConversationElement({
    id: 'council-conversation',
    title: 'Council discussion',
    council: { enabled: true }
  });

  const renderedContent = dependencies._createdElements.map(element => element.innerHTML).join('\n');
  assert.match(renderedContent, /Model Council/);
  assert.doesNotMatch(renderedContent, /Fallback model/);
});

test('folder expansion persists device-local UI state instead of app data', () => {
  const source = readSource('src/app/runtime/legacy-core/sidebar-chat-astra-render-lifecycle.js');
  const renderFoldersStart = source.indexOf('const renderFolders = () => {');
  const createConversationStart = source.indexOf('const createConversationElement =', renderFoldersStart);
  const renderFoldersBody = source.slice(renderFoldersStart, createConversationStart);

  assert.match(renderFoldersBody, /await\s+saveFolderUiState\(getFolders\(\)\)/);
  assert.doesNotMatch(renderFoldersBody, /await\s+saveAppData\(\)/);
});

test('Astra delete path uses injected replacement bridge and live conversations', async () => {
  const dependencies = createDependencies();
  const lifecycle = createLegacySidebarChatAstraRenderLifecycle(dependencies);
  dependencies.state.astras = [{ id: 'astra-1', name: 'Astra' }];
  dependencies.state.conversations = [{ id: 'conv-1', astrasId: 'astra-1' }];

  await lifecycle.deleteAstras('astra-1');

  assert.deepEqual(dependencies.state.astras, []);
  assert.equal(dependencies.state.conversations[0].astrasId, null);
  assert.deepEqual(dependencies._calls.slice(0, 4), [
    ['deleteAstrasFromCloud', ['astra-1'], { astras: [{ id: 'astra-1', name: 'Astra' }] }],
    'replaceAstras',
    'saveAppData',
    'renderSidebar'
  ]);
});

test('Astra delete path clears astrasId on the latest conversations pointer only', async () => {
  const dependencies = createDependencies();
  const lifecycle = createLegacySidebarChatAstraRenderLifecycle(dependencies);
  const staleConversation = { id: 'stale', astrasId: 'astra-1' };
  const activeConversation = { id: 'active', astrasId: 'astra-1' };
  const staleConversations = [staleConversation];

  dependencies.state.astras = [{ id: 'astra-1', name: 'Astra' }];
  dependencies.state.conversations = staleConversations;
  dependencies.state.conversations = [activeConversation];

  await lifecycle.deleteAstras('astra-1');

  assert.equal(activeConversation.astrasId, null);
  assert.equal(staleConversation.astrasId, 'astra-1');
  assert.deepEqual(dependencies._calls.slice(0, 4), [
    ['deleteAstrasFromCloud', ['astra-1'], { astras: [{ id: 'astra-1', name: 'Astra' }] }],
    'replaceAstras',
    'saveAppData',
    'renderSidebar'
  ]);
});

test('Astra delete path keeps local data when durable cloud deletion fails', async () => {
  const dependencies = createDependencies({
    deleteAstrasFromCloud: async () => { throw new Error('cloud down'); }
  });
  const lifecycle = createLegacySidebarChatAstraRenderLifecycle(dependencies);
  const astra = { id: 'astra-1', name: 'Astra' };
  dependencies.state.astras = [astra];

  await lifecycle.deleteAstras('astra-1');

  assert.deepEqual(dependencies.state.astras, [astra]);
  assert.equal(dependencies._calls.some(call => call === 'replaceAstras'), false);
  assert.equal(dependencies._calls.some(call => Array.isArray(call) && call[0] === 'runtimeNotify'), true);
});
