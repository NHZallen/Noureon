import assert from 'node:assert/strict';
import test from 'node:test';

import { createAppBootstrapLifecycle } from '../src/app/runtime/features/app-bootstrap-lifecycle.js';
import { createAppShellEnhancements } from '../src/app/runtime/features/app-shell-enhancements.js';
import { setupConversationSearchModal } from '../src/app/runtime/features/conversation-search-modal.js';
import { createDom } from './behaviours/helpers/create-dom.js';

const flush = () => new Promise((resolve) => setImmediate(resolve));

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
  const announced = [];
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
      focus(options) {
        element.focusOptions = options;
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
    },
    dispatchEvent(event) {
      announced.push(event);
      return true;
    }
  };
  document.documentElement.clientHeight = 800;

  const window = {
    innerWidth: 1280,
    innerHeight: 800,
    visualViewport: {
      height: 800,
      offsetTop: 0,
      addEventListener(type, handler, options) {
        listeners.push({ id: 'visualViewport', type, handler, options });
      }
    },
    scrollY: 0,
    scrollTo: (...args) => calls.push(`scrollTo:${args.length}`)
  };

  return { calls, listeners, elements, document, window, getElement, announced };
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
    // The picture editor of a Noura belongs to the store (features/astra-store-lifecycle.js); its cancel button only asks it to close.
    cancelAvatarCrop: () => {
      cropperInstance?.destroy();
      cropperInstance = null;
      editingAstraForAvatarId = null;
      calls.push('cancelAvatarCrop');
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
    handleDeleteAllData: () => calls.push('handleDeleteAllData'),
    applyLanguage: (lang) => calls.push(`applyLanguage:${lang}`),
    openStore: () => calls.push('openStore'),
    closeStore: () => calls.push('closeStore'),
    handleAvatarUpload: () => calls.push('handleAvatarUpload'),
    handleConfirmAvatarCrop: () => calls.push('handleConfirmAvatarCrop'),
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
  const { initChatApp } = createAppBootstrapLifecycle(createLifecycleHarness().dependencies);

  assert.equal(typeof initChatApp, 'function');
});

test('initChatApp uses live getters and preserves startup setup order', async () => {
  const harness = createLifecycleHarness();
  const { initChatApp } = createAppBootstrapLifecycle(harness.dependencies);

  await initChatApp();

  const expectedOrder = [
    'getConfig',
    'getCurrentUser',
    'setSidebarOpen:false',
    'startNewChat',
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
  assert.equal(harness.calls.includes('renderAll'), false);
  assert.equal(harness.elements.usernameDisplay.textContent, 'alice');
  // The round picture is drawn by ui/user-avatar/: the page only says who is signed in.
  assert.deepEqual(harness.announced.map((event) => [event.type, event.detail.user.username]), [['noureon:user-ready', 'alice']]);
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
  const { initChatApp } = createAppBootstrapLifecycle(harness.dependencies);

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

test('search controls expose the natural-language Enter hint and follow the visual viewport', async () => {
  const harness = createLifecycleHarness();
  const { initChatApp } = createAppBootstrapLifecycle(harness.dependencies);

  await initChatApp();
  harness.window.visualViewport.width = 360;
  harness.window.visualViewport.height = 510;
  harness.window.visualViewport.offsetTop = 10;
  harness.window.visualViewport.offsetLeft = 3;
  findListener(harness.listeners, 'visualViewport', 'resize')();

  assert.ok(harness.calls.includes('style:searchModal:--search-viewport-width:360px'));
  assert.ok(harness.calls.includes('style:searchModal:--search-viewport-height:510px'));
  assert.ok(harness.calls.includes('style:searchModal:--search-viewport-top:10px'));
  assert.ok(harness.calls.includes('style:searchModal:--search-viewport-left:3px'));
  assert.equal(findListener(harness.listeners, 'visualViewport', 'scroll') instanceof Function, true);
});

test('search opens and focuses within one animation frame without scrolling the page', async () => {
  const harness = createLifecycleHarness();
  const { initChatApp } = createAppBootstrapLifecycle(harness.dependencies);

  await initChatApp();
  harness.calls.length = 0;
  // The dialog's stylesheet is loaded first (the first time it opens).
  await findListener(harness.listeners, 'openSearchBtn', 'click')();

  const openIndex = harness.calls.indexOf('toggleModal:searchModal:true');
  const frameIndex = harness.calls.indexOf('scheduleAnimationFrame');
  const focusIndex = harness.calls.indexOf('focus:modalSearchInput');
  assert.ok(openIndex >= 0);
  assert.ok(frameIndex > openIndex);
  assert.ok(focusIndex > frameIndex);
  assert.equal(harness.calls.includes('scheduleTimeout'), false);
  assert.deepEqual(harness.elements.modalSearchInput.focusOptions, { preventScroll: true });
});

test('initChatApp binds settings, import/export, trash, P2P, file, and form listeners', async () => {
  const harness = createLifecycleHarness();
  const { initChatApp } = createAppBootstrapLifecycle(harness.dependencies);

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
    ['expandInputButton', 'click'],
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
  const { initChatApp } = createAppBootstrapLifecycle(harness.dependencies);

  await initChatApp();

  findListener(harness.listeners, 'messageInput', 'input')({ target: { closest: () => null } });
  findListener(harness.listeners, 'cancelAvatarCropBtn', 'click')();
  await findListener(harness.listeners, 'addPersonalMemoryBtn', 'click')();

  assert.equal(harness.getState().sendConfirmed, false);
  assert.equal(harness.getState().cropperDestroyed, true);
  assert.equal(harness.getState().cropperInstance, null);
  assert.equal(harness.getState().editingAstraForAvatarId, null);
  assert.deepEqual(harness.getState().personalMemories, []);
});

test('composer expand control toggles the expanded state and recalculates textarea height', async () => {
  const harness = createLifecycleHarness();
  const wrapper = harness.getElement('composer-wrapper');
  harness.elements.messageInput.closest = () => wrapper;
  const { initChatApp } = createAppBootstrapLifecycle(harness.dependencies);

  await initChatApp();
  harness.calls.length = 0;
  findListener(harness.listeners, 'expandInputButton', 'click')();

  assert.ok(harness.calls.includes('class:composer-wrapper:toggle:is-composer-expanded:undefined'));
  assert.ok(harness.calls.includes('adjustTextareaHeight'));
  assert.ok(harness.calls.includes('focus:messageInput'));
});

test('mobile attachment trigger reuses the desktop file options popover', async () => {
  const harness = createLifecycleHarness();
  harness.window.innerWidth = 599;
  const { initChatApp } = createAppBootstrapLifecycle(harness.dependencies);

  await initChatApp();
  harness.calls.length = 0;
  findListener(harness.listeners, 'addFileBtn', 'click')({ stopPropagation: () => harness.calls.push('stopPropagation') });

  assert.deepEqual(harness.calls, [
    'stopPropagation',
    'updateFunctionButtonsState',
    'closeAllPopovers',
    'class:fileOptionsPopover:add:visible',
    'attr:addFileBtn:aria-expanded:true'
  ]);
});

test('initChatApp starts one new chat and binds the sharing buttons last, once each', async () => {
  const harness = createLifecycleHarness();
  const { initChatApp } = createAppBootstrapLifecycle(harness.dependencies);

  await initChatApp();

  assert.equal(harness.calls.filter((call) => call === 'startNewChat').length, 1);
  const lastSetup = harness.calls.indexOf('checkAndShowLatestUpdate');
  assert.ok(harness.calls.indexOf('setupHistorySidebarInteractions') > lastSetup);
  assert.ok(harness.calls.indexOf('setupHistorySidebarTriggers') > harness.calls.indexOf('setupHistorySidebarInteractions'));
  for (const id of ['share-astras-btn', 'p2p-start-scan-btn', 'p2p-connect-btn', 'settings-desktop-logout-btn']) {
    assert.equal(harness.listeners.filter((entry) => entry.id === id && entry.type === 'click').length, 1, id);
  }
  assert.equal(findListener(harness.listeners, 'settings-desktop-logout-btn', 'click'), harness.dependencies.handleLogout);
});

test('the sharing buttons open the share dialog, check the code and start the QR scanner', async () => {
  const harness = createLifecycleHarness({
    loadSharingVendor: async () => ({
      Peer: class {},
      QRCode: class {},
      Html5Qrcode: class {
        constructor(id) { harness.calls.push(`scanner:new:${id}`); }
        start() { harness.calls.push('scanner:start'); return Promise.resolve(); }
        stop() { return Promise.resolve(); }
      }
    })
  });
  const { initChatApp } = createAppBootstrapLifecycle(harness.dependencies);
  await initChatApp();
  harness.calls.length = 0;

  findListener(harness.listeners, 'share-astras-btn', 'click')({ stopPropagation() {} });
  assert.ok(harness.calls.includes('toggleModal:p2p-share-modal:true'));

  harness.getElement('p2p-code-input').value = ' abc ';
  findListener(harness.listeners, 'p2p-connect-btn', 'click')();
  assert.ok(harness.calls.some((call) => call.startsWith('showNotification:') && call.endsWith(':warning')));

  findListener(harness.listeners, 'p2p-start-scan-btn', 'click')();
  await flush();
  assert.ok(harness.calls.includes('class:p2p-reader:remove:hidden'));
  assert.ok(harness.calls.indexOf('scanner:start') > harness.calls.indexOf('scanner:new:p2p-reader'));
});

// The search dialog itself (conversation-search-modal.js), on a real DOM.
function setupSearch({ scope = 'keyword-title' } = {}) {
  const dom = createDom(`
    <div id="search-modal">
      <div><button id="close-search-modal-btn"></button></div>
      <div>
        <select id="modal-search-scope-select">
          <option value="keyword-title">t</option><option value="keyword-content">c</option><option value="natural">n</option>
        </select>
        <input id="modal-search-input">
      </div>
    </div>
    <button id="open-search-btn"></button><button id="perform-search-btn"></button>`);
  const { document } = dom;
  const byId = (id) => document.getElementById(id);
  const elements = {
    searchModal: byId('search-modal'),
    closeSearchModalBtn: byId('close-search-modal-btn'),
    modalSearchScopeSelect: byId('modal-search-scope-select'),
    modalSearchInput: byId('modal-search-input'),
    openSearchBtn: byId('open-search-btn'),
    performSearchBtn: byId('perform-search-btn')
  };
  elements.modalSearchScopeSelect.value = scope;
  const frames = [];
  const viewportListeners = [];
  const timers = [];
  let searches = 0;
  const fakeWindow = {
    innerWidth: 1280,
    innerHeight: 800,
    visualViewport: {
      width: 1280, height: 800, offsetTop: 0, offsetLeft: 0,
      addEventListener: (type, handler) => viewportListeners.push({ type, handler })
    },
    requestAnimationFrame: (handler) => frames.push(handler)
  };
  setupConversationSearchModal({
    window: fakeWindow, document, elements, i18n: { en: {} }, config: { uiLanguage: 'en' },
    toggleModal: () => {}, performSearchAndRenderResults: () => { searches += 1; },
    scheduleAnimationFrame: (handler) => handler(),
    scheduleTimeout: (handler, delay) => timers.push(delay),
    clearScheduledTimeout: () => {},
    loadStyles: async () => {}
  });
  const hint = document.querySelector('.conversation-search-enter-hint');
  const style = (name) => elements.searchModal.style.getPropertyValue(`--search-viewport-${name}`);
  const fireViewport = (type) => viewportListeners.filter((entry) => entry.type === type).forEach((entry) => entry.handler());
  return { ...dom, elements, frames, viewport: fakeWindow.visualViewport, fireViewport, timers, hint, style, getSearches: () => searches };
}

test('the search dialog shows the Enter hint only when searching by meaning, and searches by meaning only on Enter', () => {
  const search = setupSearch();
  try {
    const { elements, hint, timers, window } = search;
    assert.equal(hint.classList.contains('is-visible'), false);
    assert.equal(hint.getAttribute('aria-hidden'), 'true');
    elements.modalSearchInput.dispatchEvent(new window.Event('input'));
    assert.deepEqual(timers, [180]);

    elements.modalSearchInput.value = 'cats';
    search.document.querySelector('[data-scope="natural"]').click();
    assert.equal(hint.classList.contains('is-visible'), true);
    assert.equal(hint.getAttribute('aria-hidden'), 'false');
    assert.equal(search.getSearches(), 0);

    elements.modalSearchInput.dispatchEvent(new window.Event('input'));
    assert.deepEqual(timers, [180]);
    elements.modalSearchInput.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter' }));
    assert.equal(search.getSearches(), 1);
  } finally {
    search.cleanup();
  }
});

test('the search dialog follows the visual viewport in whole pixels, once per animation frame and without timers', () => {
  const search = setupSearch();
  try {
    assert.equal(search.style('height'), '800px');
    Object.assign(search.viewport, { width: 360.4, height: 510.6, offsetTop: 10.2, offsetLeft: -3 });
    search.fireViewport('resize');
    search.fireViewport('scroll');
    search.fireViewport('resize');

    assert.equal(search.frames.length, 1);
    assert.equal(search.style('height'), '800px');
    search.frames[0]();
    assert.equal(search.style('width'), '360px');
    assert.equal(search.style('height'), '511px');
    assert.equal(search.style('top'), '10px');
    assert.equal(search.style('left'), '0px');
    assert.deepEqual(search.timers, []);
  } finally {
    search.cleanup();
  }
});

test('the desktop sign-out button of the settings is added once, under the menu, in the language in use', () => {
  const { document, cleanup } = createDom('<nav><div id="settings-nav"></div></nav><button id="logout-btn"></button>');
  try {
    const enhancements = createAppShellEnhancements({
      document,
      elements: { settingsNav: document.getElementById('settings-nav'), logoutBtn: document.getElementById('logout-btn') },
      i18n: { en: { logout: 'Sign out' } },
      getConfig: () => ({ uiLanguage: 'en' })
    });

    const button = enhancements.ensureSettingsDesktopLogoutButton();
    assert.equal(enhancements.ensureSettingsDesktopLogoutButton(), button);
    assert.equal(button.parentElement.tagName, 'NAV');
    assert.equal(document.querySelectorAll('#settings-desktop-logout-btn').length, 1);
    assert.ok(button.querySelector('svg.settings-desktop-logout-icon'));
    assert.equal(button.querySelector('[data-lang-key="logout"]').textContent, 'Sign out');

    enhancements.enhanceSettingsLogoutButton();
    enhancements.enhanceSettingsLogoutButton();
    assert.equal(document.querySelectorAll('#logout-btn .settings-logout-label').length, 1);
  } finally {
    cleanup();
  }
});
