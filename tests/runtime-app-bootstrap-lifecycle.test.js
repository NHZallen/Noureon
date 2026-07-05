import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createLegacyAppBootstrapLifecycle } from '../src/app/runtime/features/app-bootstrap-lifecycle.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

const createClassList = (id, calls) => ({
  add: (...names) => calls.push(`class:${id}:add:${names.join(',')}`),
  remove: (...names) => calls.push(`class:${id}:remove:${names.join(',')}`),
  toggle: (name, force) => {
    calls.push(`class:${id}:toggle:${name}:${force}`);
    return Boolean(force);
  },
  contains: () => false
});

function createFakeDom() {
  const calls = [];
  const listeners = [];
  const elementsById = new Map();

  const createElement = (id) => {
    const element = {
      id,
      value: '',
      textContent: '',
      innerHTML: '',
      disabled: false,
      dataset: {},
      style: {
        setProperty: (...args) => calls.push(`style:${id}:${args.join(':')}`)
      },
      classList: createClassList(id, calls),
      addEventListener(type, handler, options) {
        listeners.push({ id, type, handler, options });
      },
      removeEventListener() {},
      click() {
        calls.push(`click:${id}`);
      },
      focus() {
        calls.push(`focus:${id}`);
      },
      remove() {
        calls.push(`remove:${id}`);
      },
      setAttribute(name, value) {
        calls.push(`attr:${id}:${name}:${value}`);
      },
      removeAttribute(name) {
        calls.push(`removeAttr:${id}:${name}`);
      },
      appendChild(child) {
        calls.push(`append:${id}:${child.id || 'node'}`);
        return child;
      },
      querySelector(selector) {
        return getElement(`${id}:${selector}`);
      },
      querySelectorAll() {
        return [];
      },
      closest() {
        return null;
      },
      contains() {
        return false;
      },
      getBoundingClientRect() {
        return { left: 0, top: 0, bottom: 0, height: 0 };
      }
    };
    elementsById.set(id, element);
    return element;
  };

  const getElement = (id) => elementsById.get(id) || createElement(id);

  const elements = new Proxy({}, {
    get(target, prop) {
      if (typeof prop !== 'string') return target[prop];
      if (!target[prop]) target[prop] = getElement(prop);
      return target[prop];
    }
  });

  const document = {
    body: getElement('body'),
    documentElement: getElement('documentElement'),
    getElementById: getElement,
    createElement: (tag) => getElement(`created:${tag}:${elementsById.size}`),
    querySelector: (selector) => getElement(selector),
    querySelectorAll: () => [],
    addEventListener(type, handler, options) {
      listeners.push({ id: 'document', type, handler, options });
    }
  };

  const window = {
    innerWidth: 1280,
    visualViewport: {
      height: 800,
      addEventListener(type, handler, options) {
        listeners.push({ id: 'visualViewport', type, handler, options });
      }
    },
    scrollY: 0,
    scrollTo: (...args) => calls.push(`scrollTo:${args.length}`)
  };

  return { calls, listeners, elements, document, window, getElement };
}

const findListener = (listeners, id, type) => {
  const listener = listeners.find((entry) => entry.id === id && entry.type === type);
  assert.ok(listener, `${id}:${type} listener should be bound`);
  return listener.handler;
};

function createLifecycleHarness(overrides = {}) {
  const dom = createFakeDom();
  const calls = dom.calls;
  const config = {
    theme: 'dark',
    uiLanguage: 'en',
    isLearningMode: false
  };
  const conversations = [{ id: 'conv-1', archived: false, deletedAt: null, messages: [], isWebSearchEnabled: false }];
  const folders = [];
  const astras = [];
  const personalMemories = [];
  let sidebarOpen = false;
  let sendConfirmed = true;
  let cropperDestroyed = false;
  let cropperInstance = { destroy: () => { cropperDestroyed = true; calls.push('cropper:destroy'); } };
  let editingAstraForAvatarId = 'astra-1';
  let abortController = null;
  let currentConversationId = overrides.currentConversationId ?? 'conv-1';

  const dependencies = {
    window: dom.window,
    document: dom.document,
    elements: dom.elements,
    Peer: class {},
    QRCode: class {},
    Html5Qrcode: class {},
    JSZip: class {},
    BlobCtor: class {},
    getCurrentUser: () => {
      calls.push('getCurrentUser');
      return { username: 'alice' };
    },
    getConfig: () => {
      calls.push('getConfig');
      return config;
    },
    getConversations: () => {
      calls.push('getConversations');
      return conversations;
    },
    getFolders: () => folders,
    getAstras: () => astras,
    getPersonalMemories: () => personalMemories,
    getCurrentConversationId: () => currentConversationId,
    setCurrentConversationId: (nextId) => {
      currentConversationId = nextId;
      calls.push(`setCurrentConversationId:${nextId}`);
      return currentConversationId;
    },
    setSidebarOpen: (next) => {
      sidebarOpen = next;
      calls.push(`setSidebarOpen:${next}`);
      return sidebarOpen;
    },
    setSendConfirmed: (next) => {
      sendConfirmed = next;
      calls.push(`setSendConfirmed:${next}`);
      return sendConfirmed;
    },
    getAbortController: () => abortController,
    getCropperInstance: () => cropperInstance,
    setCropperInstance: (next) => {
      cropperInstance = next;
      calls.push(`setCropperInstance:${next}`);
      return cropperInstance;
    },
    setEditingAstraForAvatarId: (next) => {
      editingAstraForAvatarId = next;
      calls.push(`setEditingAstraForAvatarId:${next}`);
      return editingAstraForAvatarId;
    },
    startNewChat: () => calls.push('startNewChat'),
    renderAll: () => calls.push('renderAll'),
    setTheme: (theme) => calls.push(`setTheme:${theme}`),
    setupVoiceInput: () => calls.push('setupVoiceInput'),
    setupScrollToBottomButton: () => calls.push('setupScrollToBottomButton'),
    updateDisplayedVersion: () => calls.push('updateDisplayedVersion'),
    checkAndShowLatestUpdate: () => calls.push('checkAndShowLatestUpdate'),
    updateFunctionButtonsState: () => calls.push('updateFunctionButtonsState'),
    updateInputState: () => calls.push('updateInputState'),
    setupSettingsModal: () => calls.push('setupSettingsModal'),
    toggleSidebar: (...args) => calls.push(`toggleSidebar:${args.join(':')}`),
    toggleModal: (element, open) => calls.push(`toggleModal:${element.id}:${open}`),
    saveSettings: (...args) => calls.push(`saveSettings:${JSON.stringify(args[0] || {})}`),
    saveAppData: () => calls.push('saveAppData'),
    handleExport: () => calls.push('handleExport'),
    handleImport: () => calls.push('handleImport'),
    handleLogout: () => calls.push('handleLogout'),
    handleFileSelection: () => calls.push('handleFileSelection'),
    handleFormSubmit: () => calls.push('handleFormSubmit'),
    handleRename: () => calls.push('handleRename'),
    handleSaveFolderSettings: () => calls.push('handleSaveFolderSettings'),
    performSearchAndRenderResults: () => calls.push('performSearchAndRenderResults'),
    loadChat: (id) => calls.push(`loadChat:${id}`),
    openDashboard: () => calls.push('openDashboard'),
    getActiveConversation: () => conversations[0],
    copyTextToClipboard: () => Promise.resolve(),
    showNotification: (...args) => calls.push(`showNotification:${args.join(':')}`),
    normalizeConversationModel: (conv) => conv,
    getCouncilSelectedModels: () => ({ participants: [], synthesizer: null }),
    isCouncilEnabled: () => false,
    hasCouncilWebSearchAccess: () => false,
    hasSingleWebSearchAccess: () => true,
    hasSingleDocumentAccess: () => true,
    modelSupportsVision: () => true,
    getCouncilTexts: () => ({ title: 'Council' }),
    renderInputIndicators: () => calls.push('renderInputIndicators'),
    toggleLearningMode: () => calls.push('toggleLearningMode'),
    toggleSelectionMode: () => calls.push('toggleSelectionMode'),
    handleBatchDelete: () => calls.push('handleBatchDelete'),
    handleBatchArchive: () => calls.push('handleBatchArchive'),
    handleBatchMove: () => calls.push('handleBatchMove'),
    adjustTextareaHeight: () => calls.push('adjustTextareaHeight'),
    submitChatForm: () => calls.push('submitChatForm'),
    closeAllPopovers: () => calls.push('closeAllPopovers'),
    showCustomPrompt: async () => null,
    createNewFolder: () => calls.push('createNewFolder'),
    createAstras: () => calls.push('createAstras'),
    handleSaveAstras: () => calls.push('handleSaveAstras'),
    renderPersonalMemoryList: () => calls.push('renderPersonalMemoryList'),
    handleWallpaperUpload: () => calls.push('handleWallpaperUpload'),
    restoreDefaultWallpaper: () => calls.push('restoreDefaultWallpaper'),
    handleConfirmCrop: () => calls.push('handleConfirmCrop'),
    handleDeleteAllData: () => calls.push('handleDeleteAllData'),
    applyLanguage: (lang) => calls.push(`applyLanguage:${lang}`),
    openStore: () => calls.push('openStore'),
    closeStore: () => calls.push('closeStore'),
    handleAvatarUpload: () => calls.push('handleAvatarUpload'),
    handleConfirmAvatarCrop: () => calls.push('handleConfirmAvatarCrop'),
    showUpdateHistory: () => calls.push('showUpdateHistory'),
    toggleTrashSelectionMode: () => calls.push('toggleTrashSelectionMode'),
    handleBatchRestoreFromTrash: () => calls.push('handleBatchRestoreFromTrash'),
    handleBatchDeleteFromTrash: () => calls.push('handleBatchDeleteFromTrash'),
    handleEmptyTrash: () => calls.push('handleEmptyTrash'),
    updateFileInputUI: () => calls.push('updateFileInputUI'),
    postJsonWithReadableError: () => Promise.resolve(),
    openCouncilPopoverFromAttachmentMenu: () => calls.push('openCouncilPopoverFromAttachmentMenu'),
    setupHistorySidebarInteractions: () => calls.push('setupHistorySidebarInteractions'),
    setupHistorySidebarTriggers: () => calls.push('setupHistorySidebarTriggers'),
    escapeHTML: (value) => String(value),
    getDefaultFolder: () => ({}),
    isMobileSettingsViewport: () => false,
    openSettingsMobileSection: (section) => calls.push(`openSettingsMobileSection:${section}`),
    i18n: {
      en: {
        searchPrompt: 'Search',
        copySuccess: 'Copied',
        copyFailed: 'Copy failed',
        webSearchNotAvailable: 'Search unavailable',
        enterFolderName: 'Folder name',
        createFolder: 'Create folder',
        folderCreated: 'Folder created',
        enterNewMemory: 'New memory',
        addMemory: 'Add memory',
        memoryAdded: 'Memory added',
        attachFile: 'Attach file',
        camera: 'Camera',
        image: 'Image',
        file: 'File',
        search: 'Search',
        learning: 'Learning'
      }
    },
    randomUUID: () => 'uuid-1',
    random: () => 0.1,
    scheduleTimeout: (handler) => {
      calls.push('scheduleTimeout');
      return handler();
    },
    clearScheduledTimeout: () => calls.push('clearScheduledTimeout'),
    scheduleAnimationFrame: (handler) => {
      calls.push('scheduleAnimationFrame');
      return handler();
    },
    logger: {
      error: (...args) => calls.push(`error:${args.join(':')}`)
    },
    ...overrides
  };

  return {
    ...dom,
    dependencies,
    getState: () => ({ sidebarOpen, sendConfirmed, cropperInstance, cropperDestroyed, editingAstraForAvatarId, personalMemories })
  };
}

test('factory exports initChatApp from the app bootstrap lifecycle', () => {
  const { initChatApp } = createLegacyAppBootstrapLifecycle(createLifecycleHarness().dependencies);

  assert.equal(typeof initChatApp, 'function');
});

test('initChatApp uses live getters and preserves startup setup order', async () => {
  const harness = createLifecycleHarness();
  const { initChatApp } = createLegacyAppBootstrapLifecycle(harness.dependencies);

  await initChatApp();

  const expectedOrder = [
    'getConfig',
    'getCurrentUser',
    'getConversations',
    'setSidebarOpen:false',
    'renderAll',
    'updateFunctionButtonsState',
    'updateInputState',
    'setupVoiceInput',
    'setupScrollToBottomButton',
    'updateDisplayedVersion',
    'checkAndShowLatestUpdate'
  ];
  let cursor = -1;
  for (const marker of expectedOrder) {
    const next = harness.calls.indexOf(marker);
    assert.ok(next > cursor, `${marker} should occur in startup order`);
    cursor = next;
  }
  assert.equal(harness.elements.usernameDisplay.textContent, 'alice');
  assert.equal(harness.document.querySelector('.user-avatar').textContent, 'A');
  assert.equal(harness.getState().sidebarOpen, false);
  assert.ok(
    harness.calls.includes('class:appContainer:remove:sidebar-open'),
    'desktop startup should explicitly keep the sidebar closed'
  );
  assert.equal(
    harness.calls.some((call) => call === 'class:appContainer:add:sidebar-open'),
    false
  );
});

test('desktop sidebar remains closed on startup and manual toggle wiring remains active', async () => {
  const harness = createLifecycleHarness();
  const { initChatApp } = createLegacyAppBootstrapLifecycle(harness.dependencies);

  await initChatApp();

  assert.equal(harness.getState().sidebarOpen, false);
  assert.equal(
    harness.calls.some((call) => call === 'class:appContainer:add:sidebar-open'),
    false
  );

  findListener(harness.listeners, 'menuToggleBtn', 'click')();
  findListener(harness.listeners, 'sidebarOverlay', 'click')();

  assert.ok(harness.calls.includes('toggleSidebar:'));
  assert.ok(harness.calls.includes('toggleSidebar:false'));
});

test('initChatApp binds settings, import/export, trash, P2P, file, and form listeners', async () => {
  const harness = createLifecycleHarness();
  const { initChatApp } = createLegacyAppBootstrapLifecycle(harness.dependencies);

  await initChatApp();

  for (const [id, type] of [
    ['settingsBtn', 'click'],
    ['settingsModal', 'change'],
    ['confirmExportBtn', 'click'],
    ['confirmImportBtn', 'click'],
    ['logoutBtn', 'click'],
    ['trashBatchSelectBtn', 'click'],
    ['trashBatchRestoreBtn', 'click'],
    ['trashBatchDeleteBtn', 'click'],
    ['emptyTrashBtn', 'click'],
    ['imageVideoInput', 'change'],
    ['fileUploadInput', 'change'],
    ['messageInput', 'input'],
    ['messageInput', 'keydown'],
    ['chatForm', 'submit'],
    ['share-astras-btn', 'click'],
    ['share-folders-btn', 'click'],
    ['p2p-start-scan-btn', 'click']
  ]) {
    findListener(harness.listeners, id, type);
  }
});

test('bound handlers preserve state bridges and injected handoffs', async () => {
  const harness = createLifecycleHarness();
  const { initChatApp } = createLegacyAppBootstrapLifecycle(harness.dependencies);

  await initChatApp();

  findListener(harness.listeners, 'messageInput', 'input')({ target: { closest: () => null } });
  findListener(harness.listeners, 'cancelCropBtn', 'click')();
  findListener(harness.listeners, 'cancelAvatarCropBtn', 'click')();
  await findListener(harness.listeners, 'addPersonalMemoryBtn', 'click')();

  assert.equal(harness.getState().sendConfirmed, false);
  assert.equal(harness.getState().cropperDestroyed, true);
  assert.equal(harness.getState().cropperInstance, null);
  assert.equal(harness.getState().editingAstraForAvatarId, null);
  assert.deepEqual(harness.getState().personalMemories, []);
});

test('app bootstrap lifecycle module avoids startup, storage, auth ownership, fragments, and runtime entry', () => {
  const source = readSource('src/app/runtime/features/app-bootstrap-lifecycle.js');

  assert.doesNotMatch(source, /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-app/);
  assert.doesNotMatch(source, /loadConfig|loadAppData|getItem\(|setItem\(|const\s+handleLogin|const\s+handleLogout|function\s+handleLogin|function\s+handleLogout/);
  const currentUserAssignments = source.match(/currentUser\s*=/g) ?? [];
  assert.equal(currentUserAssignments.length, 1);
  assert.match(source, /const\s+currentUser\s*=\s*getCurrentUser\(\)/);
  assert.match(source, /export\s+function\s+createLegacyAppBootstrapLifecycle/);
  assert.match(source, /createAppBootstrapComposition\(\{/);
  assert.match(source, /createLegacyP2PLifecycle\(\{/);
  assert.match(source, /settings-desktop-logout-btn/);
  assert.match(source, /nav\.closest\('nav'\)\?\.appendChild\(button\)/);
  assert.doesNotMatch(source, /nav\.appendChild\(item\)/);
});

test('mobile attachment trigger reuses the desktop file options popover', async () => {
  const harness = createLifecycleHarness();
  harness.window.innerWidth = 599;
  const { initChatApp } = createLegacyAppBootstrapLifecycle(harness.dependencies);

  await initChatApp();
  harness.calls.length = 0;
  findListener(harness.listeners, 'addFileBtn', 'click')({ stopPropagation: () => harness.calls.push('stopPropagation') });

  assert.deepEqual(harness.calls, [
    'stopPropagation',
    'updateFunctionButtonsState',
    'closeAllPopovers',
    'class:fileOptionsPopover:add:visible'
  ]);
});
