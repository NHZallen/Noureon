import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createSidebarChatAstraRenderLifecycle } from '../src/app/runtime/shell/sidebar-chat-astra-render-lifecycle.js';

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
    toggleSidebar: () => calls.push('toggleSidebar'),
    updateInputState: () => calls.push('updateInputState'),
    generateTitleAndSummary: noop,
    state,
    runtimeAppDataStore: {
      getFolders: () => state.folders,
      getAstras: () => state.astras,
      replaceAstras: (nextAstras) => {
        calls.push('replaceAstras');
        state.astras = nextAstras;
        return state.astras;
      }
    },
    liveConversationsBridge: { getConversations: () => state.conversations },
    session: { getCurrentUser: () => state.currentUser },
    selection: {
      isSelectionMode: () => state.isSelectionMode,
      getSelectedConversationIds: () => new Set(state.selectedConversationIds),
      selectConversation: (id, selected) => (selected ? state.selectedConversationIds.add(id) : state.selectedConversationIds.delete(id))
    },
    isAutoScrolling: () => state.isAutoScrolling,
    runtimeDomAccess: {
      getRequiredElement: (id) => {
        if (id === 'folderList') return folderList;
        return createElement();
      }
    },
    runtimeConfigAccess: { getConfig: () => state.config, getUiLanguage: () => state.config.uiLanguage },
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
    _folderList: folderList,
    _createdElements: createdElements,
    _calls: calls,
    ...overrides
  };
}

test('factory exports createSidebarChatAstraRenderLifecycle', () => {
  assert.equal(typeof createSidebarChatAstraRenderLifecycle, 'function');
});

test('import is inert and module avoids fragments and virtual runtime', () => {
  const source = readSource('src/app/runtime/shell/sidebar-chat-astra-render-lifecycle.js');

  assert.match(source, /export\s+function\s+createSidebarChatAstraRenderLifecycle/);
  assert.doesNotMatch(source, /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-app/);
});

test('factory validates required dependencies', () => {
  assert.throws(
    () => createSidebarChatAstraRenderLifecycle(),
    /missing dependency: window/
  );
});

test('factory exposes sidebar chat Astra render API', () => {
  const lifecycle = createSidebarChatAstraRenderLifecycle(createDependencies());

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

test('creating a high-risk custom Nouras warns but still saves it', async () => {
  const dependencies = createDependencies({
    i18n: { en: { createAstras: 'Create Nouras', highRiskNourasWarning: 'High-risk role warning' } }
  });
  dependencies.elements.astrasNameInput.value = 'Therapist';
  dependencies.elements.astrasInstructionsInput.value = 'Provide mental-health diagnosis.';
  const lifecycle = createSidebarChatAstraRenderLifecycle(dependencies);

  await lifecycle.handleSaveAstras();

  assert.ok(dependencies._calls.some((entry) => Array.isArray(entry) && entry[0] === 'notify' && entry[1] === 'High-risk role warning' && entry[2] === 'warning'));
  assert.equal(dependencies.state.astras.length, 1);
  assert.ok(dependencies._calls.includes('saveAppData'));
});

test('selecting and deactivating a Noura refreshes its composer indicator', async () => {
  const dependencies = createDependencies({
    renderInputIndicators: () => dependencies._calls.push('renderInputIndicators')
  });
  const conversation = { id: 'active-conv', astrasId: null };
  dependencies.state.conversations = [conversation];
  const lifecycle = createSidebarChatAstraRenderLifecycle(dependencies);

  await lifecycle.setAstrasForConversation('astra-1');

  assert.equal(conversation.astrasId, 'astra-1');
  assert.deepEqual(dependencies._calls.slice(0, 4), [
    'saveAppData',
    'renderSidebar',
    'renderInputIndicators',
    'updateInputState'
  ]);

  dependencies._calls.length = 0;
  await lifecycle.deactivateAstras();

  assert.equal(conversation.astrasId, null);
  assert.deepEqual(dependencies._calls.slice(0, 4), [
    'saveAppData',
    'renderSidebar',
    'renderInputIndicators',
    'updateInputState'
  ]);
});

test('activating a Noura while learning mode is on explains the combined rules', async () => {
  const dependencies = createDependencies({
    renderInputIndicators: noop,
    i18n: { en: { learningWithNouraNotice: 'Both rule sets are active; Learning Mode wins on conflict.' } }
  });
  dependencies.state.config.isLearningMode = true;
  const conversation = { id: 'active-conv', astrasId: null };
  dependencies.state.conversations = [conversation];
  const lifecycle = createSidebarChatAstraRenderLifecycle(dependencies);

  await lifecycle.setAstrasForConversation('astra-1');

  assert.deepEqual(
    dependencies._calls.at(-1),
    ['runtimeNotify', 'Both rule sets are active; Learning Mode wins on conflict.', 'success']
  );

  // Without learning mode the activation stays silent, as before.
  dependencies._calls.length = 0;
  dependencies.state.config.isLearningMode = false;
  await lifecycle.setAstrasForConversation('astra-2');

  assert.ok(
    !dependencies._calls.some((entry) => Array.isArray(entry) && entry[0] === 'runtimeNotify'),
    'no notification should fire when learning mode is off'
  );
});

test('renderFolders draws nothing: the folders are the projects and have their own page', () => {
  const dependencies = createDependencies();
  const lifecycle = createSidebarChatAstraRenderLifecycle(dependencies);

  dependencies.state.conversations = [
    { id: 'conv-1', title: 'One', model: { name: 'Model (A)' }, createdAt: '2024-01-01' }
  ];
  dependencies.state.folders = [
    { id: 'folder-1', name: 'Folder', icon: 'default', color: 'gray', textColor: 'gray', isOpen: true, conversationIds: ['conv-1'] }
  ];

  lifecycle.renderFolders();

  assert.equal(dependencies._folderList.children.length, 0);
});

test('sidebar identifies a council conversation by the council label instead of its fallback model', () => {
  const dependencies = createDependencies({
    isCouncilEnabled: (conversation) => Boolean(conversation?.council?.enabled),
    getCouncilTexts: () => ({ title: 'Model Council' }),
    normalizeConversationModel: () => ({ name: 'Fallback model' })
  });
  const lifecycle = createSidebarChatAstraRenderLifecycle(dependencies);

  lifecycle.createConversationElement({
    id: 'council-conversation',
    title: 'Council discussion',
    council: { enabled: true }
  });

  const renderedContent = dependencies._createdElements.map(element => element.innerHTML).join('\n');
  assert.match(renderedContent, /Model Council/);
  assert.doesNotMatch(renderedContent, /Fallback model/);
});

test('the archived conversation renderer escapes imported markup', () => {
  const dependencies = createDependencies();
  const lifecycle = createSidebarChatAstraRenderLifecycle(dependencies);
  const maliciousText = '<img src=x onerror="stealKeys()">安全名稱';
  const maliciousId = 'unsafe" onclick="stealKeys()';
  dependencies.state.folders = [{
    id: maliciousId,
    name: maliciousText,
    icon: 'default',
    color: 'gray',
    textColor: 'gray',
    isOpen: true,
    conversationIds: []
  }];
  dependencies.state.conversations = [{
    id: maliciousId,
    title: maliciousText,
    archived: true,
    createdAt: '2026-07-14T00:00:00.000Z'
  }];

  lifecycle.renderFolders();
  lifecycle.renderArchivedChats();

  const archivedMarkup = dependencies._createdElements[0].innerHTML;
  for (const markup of [archivedMarkup]) {
    assert.doesNotMatch(markup, /<img\b/i);
    assert.doesNotMatch(markup, /onclick="stealKeys\(\)"/i);
    assert.match(markup, /&lt;img src=x onerror=&quot;stealKeys\(\)&quot;&gt;安全名稱/);
  }
});

test('sidebar keeps the council label after the council toggle is disabled', () => {
  const dependencies = createDependencies({
    isCouncilEnabled: (conversation) => Boolean(conversation?.council?.enabled),
    getCouncilTexts: () => ({ title: 'Model Council' }),
    normalizeConversationModel: () => ({ name: 'Fallback model' })
  });
  const lifecycle = createSidebarChatAstraRenderLifecycle(dependencies);

  lifecycle.createConversationElement({
    id: 'completed-council-conversation',
    title: 'Completed council discussion',
    council: { enabled: false },
    messages: [{
      role: 'model',
      parts: [{ text: 'Council answer' }],
      council: {
        participantModelIds: ['model-a', 'model-b'],
        synthesizerModelId: 'model-c'
      }
    }]
  });

  const renderedContent = dependencies._createdElements.map(element => element.innerHTML).join('\n');
  assert.match(renderedContent, /Model Council/);
  assert.doesNotMatch(renderedContent, /Fallback model/);
});

test('Astra delete path uses injected replacement bridge and live conversations', async () => {
  const dependencies = createDependencies();
  const lifecycle = createSidebarChatAstraRenderLifecycle(dependencies);
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
  const lifecycle = createSidebarChatAstraRenderLifecycle(dependencies);
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
  const lifecycle = createSidebarChatAstraRenderLifecycle(dependencies);
  const astra = { id: 'astra-1', name: 'Astra' };
  dependencies.state.astras = [astra];

  await lifecycle.deleteAstras('astra-1');

  assert.deepEqual(dependencies.state.astras, [astra]);
  assert.equal(dependencies._calls.some(call => call === 'replaceAstras'), false);
  assert.equal(dependencies._calls.some(call => Array.isArray(call) && call[0] === 'runtimeNotify'), true);
});
