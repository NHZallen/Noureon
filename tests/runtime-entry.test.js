import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  createRuntimeEntry,
  getLegacyRuntimeEntryDependencies,
  loadLegacyRuntimeContext,
  registerCoreTailBindings,
  registerRuntimeEntryBindings,
  startRuntimeEntry
} from '../src/app/runtime-entry.js';
import {
  LEGACY_RUNTIME_ENTRY_REQUIRED_FIELDS,
  createLegacyRuntimeEntryDependencies,
  validateLegacyRuntimeEntryDependencies
} from '../src/app/runtime/runtime-entry-dependencies.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

const assertMarkersInOrder = (source, markers, context) => {
  let cursor = -1;
  for (const marker of markers) {
    const next = source.indexOf(marker, cursor + 1);
    assert.notEqual(next, -1, `${context} should contain ${marker}`);
    assert.ok(next > cursor, `${marker} should remain in ${context} order`);
    cursor = next;
  }
};

const createCompleteGroup = (fields) => Object.fromEntries(
  fields.map((field) => [field, () => {}])
);

const createCompleteDependencies = (overrides = {}) => {
  const appBootstrap = createCompleteGroup(
    LEGACY_RUNTIME_ENTRY_REQUIRED_FIELDS.appBootstrap
  );
  const startup = createCompleteGroup(
    LEGACY_RUNTIME_ENTRY_REQUIRED_FIELDS.startup
  );

  Object.assign(appBootstrap, {
    window: {},
    document: {},
    elements: {},
    Peer: class {},
    QRCode: class {},
    Html5Qrcode: class {},
    JSZip: class {},
    BlobCtor: class {},
    i18n: {},
    logger: {}
  });
  Object.assign(startup, {
    window: {},
    document: {},
    globalObject: {},
    elements: {}
  });

  return createLegacyRuntimeEntryDependencies({
    appBootstrap: {
      ...appBootstrap,
      ...overrides.appBootstrap
    },
    startup: {
      ...startup,
      ...overrides.startup
    }
  });
};

const createElement = (id = 'element') => ({
  id,
  value: '',
  disabled: false,
  dataset: {},
  style: {},
  innerHTML: '',
  textContent: '',
  classList: {
    add() {},
    remove() {},
    toggle() {},
    contains: () => false
  },
  addEventListener() {},
  appendChild() {},
  querySelector: () => null,
  querySelectorAll: () => [],
  contains: () => false
});

const createElementsProxy = () => new Proxy({}, {
  get(target, prop) {
    if (!target[prop]) target[prop] = createElement(prop);
    return target[prop];
  }
});

const createDocumentFake = () => ({
  addEventListener() {},
  createElement: (tag) => createElement(tag),
  getElementById: (id) => createElement(id),
  querySelector: () => null,
  querySelectorAll: () => [],
  body: createElement('body'),
  documentElement: {
    style: { setProperty() {} },
    classList: {
      add() {},
      remove() {},
      toggle() {},
      contains: () => false
    }
  }
});

const createCompleteCoreTailDependencies = ({
  runtimeContext,
  elements = createElementsProxy(),
  document = createDocumentFake(),
  overrides = {}
} = {}) => {
  const noop = () => {};
  const asyncNoop = async () => {};
  return {
    window: {},
    document,
    navigator: {},
    fetch: noop,
    File: class {},
    Event: class {},
    Blob: class {},
    Image: class {},
    FileReader: class {},
    Chart: class { destroy() {} },
    Cropper: class {},
    Peer: class {},
    QRCode: class {},
    Html5Qrcode: class {},
    JSZip: class {},
    ResizeObserver: class {},
    IntersectionObserver: class {},
    requestAnimationFrame: (callback) => callback(),
    setTimeout: (callback) => {
      if (typeof callback === 'function') callback();
      return 1;
    },
    clearTimeout: noop,
    crypto: { randomUUID: () => 'uuid' },
    console,
    globalObject: {},
    getComputedStyle: () => ({}),
    random: () => 0.5,
    elements,
    state: {
      conversations: [],
      folders: [],
      astras: [],
      personalMemories: [],
      config: { uiLanguage: 'zh-TW' },
      currentUser: null,
      sidebarOpen: false,
      sendConfirmed: false,
      abortController: null,
      cropperInstance: null,
      editingAstraForAvatarId: null,
      editingAstrasId: null,
      currentStoreCategory: 'all',
      messageObserver: null,
      timeDistChart: null,
      isAutoScrolling: false
    },
    runtimeConfigAccess: { getUiLanguage: () => 'zh-TW' },
    runtimeAppDataStore: {
      replaceConversations: (next) => next,
      replaceAstras: (next) => next
    },
    runtimeDialogCoordinator: { showNotification: noop },
    legacyRuntimeContext: runtimeContext,
    getCurrentConversationId: () => null,
    setCurrentConversationId: noop,
    i18n: { 'zh-TW': {} },
    OFFICIAL_ASTRAS: [],
    updateLogs: [],
    UI_THEME_COLORS: {},
    setTheme: noop,
    updateThemeButtons: noop,
    setAiBubbleColor: noop,
    setUserBubbleColor: noop,
    saveConfig: asyncNoop,
    saveAppData: asyncNoop,
    showNotification: noop,
    toggleModal: noop,
    renderAstras: noop,
    escapeHTML: (value = '') => String(value),
    sanitizeTrustedHTML: (value = '') => String(value),
    showRenameModal: noop,
    togglePinChat: noop,
    archiveChat: noop,
    deleteChat: noop,
    moveConversationToFolder: noop,
    renderBatchMoveModal: noop,
    showFolderSettingsModal: noop,
    deleteFolder: noop,
    deleteAstras: noop,
    showCustomConfirm: async () => true,
    formatFullTimestamp: () => '',
    renderUserText: (value = '') => String(value),
    renderMarkdownWithFormulas: (value = '') => String(value),
    startNewChat: noop,
    renderAll: noop,
    setupVoiceInput: noop,
    updateFunctionButtonsState: noop,
    toggleSidebar: noop,
    saveSettings: noop,
    handleExport: noop,
    handleImport: noop,
    handleLogout: noop,
    handleFileSelection: noop,
    handleFormSubmit: noop,
    handleRename: noop,
    handleSaveFolderSettings: noop,
    performSearchAndRenderResults: noop,
    loadChat: noop,
    openDashboard: noop,
    getActiveConversation: () => null,
    copyTextToClipboard: noop,
    normalizeConversationModel: () => null,
    getCouncilSelectedModels: () => [],
    isCouncilEnabled: () => false,
    hasCouncilWebSearchAccess: () => false,
    hasSingleWebSearchAccess: () => false,
    hasSingleDocumentAccess: () => false,
    modelSupportsVision: () => false,
    getCouncilTexts: () => [],
    renderInputIndicators: noop,
    toggleLearningMode: noop,
    toggleSelectionMode: noop,
    handleBatchDelete: noop,
    handleBatchArchive: noop,
    handleBatchMove: noop,
    submitChatForm: noop,
    closeAllPopovers: noop,
    showCustomPrompt: async () => '',
    createNewFolder: noop,
    createAstras: noop,
    handleSaveAstras: noop,
    renderPersonalMemoryList: noop,
    handleDeleteAllData: noop,
    updateFileInputUI: noop,
    postJsonWithReadableError: noop,
    openCouncilPopoverFromAttachmentMenu: noop,
    setupHistorySidebarInteractions: noop,
    setupHistorySidebarTriggers: noop,
    getDefaultFolder: () => ({}),
    isMobileSettingsViewport: () => false,
    openSettingsMobileSection: noop,
    getItem: async () => null,
    getUserKey: () => '',
    loadConfig: asyncNoop,
    loadAppData: asyncNoop,
    handleLogin: noop,
    handleImportOnAuth: noop,
    processAuthImport: noop,
    installTouchGuards: noop,
    registerServiceWorker: noop,
    showCustomDialog: noop,
    ...overrides
  };
};

test('runtime entry exports an inert composition API', () => {
  assert.equal(typeof createRuntimeEntry, 'function');
  assert.equal(typeof getLegacyRuntimeEntryDependencies, 'function');
  assert.equal(typeof loadLegacyRuntimeContext, 'function');
  assert.equal(typeof registerCoreTailBindings, 'function');
  assert.equal(typeof registerRuntimeEntryBindings, 'function');
  assert.equal(typeof startRuntimeEntry, 'function');

  const calls = [];
  const dependencies = createCompleteDependencies({
    startup: {
      installTouchGuards: () => calls.push('installTouchGuards'),
      registerServiceWorker: () => calls.push('registerServiceWorker')
    }
  });
  const entry = createRuntimeEntry({ dependencies });

  assert.deepEqual(calls, []);
  assert.equal(entry.dependencies, dependencies);
  assert.equal(typeof entry.initChatApp, 'function');
  assert.equal(typeof entry.initializeApp, 'function');
  assert.equal(typeof entry.adjustTextareaHeight, 'function');
  assert.equal(typeof entry.registerBindings, 'function');
  assert.equal(typeof entry.start, 'function');
});

test('runtime entry source composes core tail before app bootstrap and startup', () => {
  const source = readSource('src/app/runtime-entry.js');

  assert.match(source, /import\s+\{\s*createLegacyCoreTailLifecycle\s*\}/);
  assert.match(source, /resolveBinding\(\s*['"]runtime\.coreTailDependencies['"]\s*\)/);
  assert.match(source, /createLegacyCoreTailLifecycle\(/);
  assert.match(source, /registerCoreTailBindings\(/);
  assertMarkersInOrder(source, [
    'createLegacyCoreTailLifecycle',
    'registerCoreTailBindings',
    'registerRuntimeEntryDependencies',
    'createLegacyAppBootstrapLifecycle',
    'createLegacyStartupLifecycle'
  ], 'runtime-entry production composition');
});

test('runtime entry explicitly registers startup textarea ownership without starting', () => {
  const bindings = new Map();
  const runtimeContext = {
    registerLazyBinding(name, getter) {
      assert.equal(bindings.has(name), false);
      bindings.set(name, getter);
    },
    resolveOptionalBinding(name) {
      return bindings.get(name)?.();
    }
  };
  const adjustTextareaHeight = () => {};
  const initChatApp = () => {};
  const appBootstrapLifecycle = { initChatApp };
  const startupLifecycle = { adjustTextareaHeight };

  assert.deepEqual(
    registerRuntimeEntryBindings({
      runtimeContext,
      appBootstrapLifecycle,
      startupLifecycle
    }),
    { initChatApp, adjustTextareaHeight }
  );
  assert.equal(
    runtimeContext.resolveOptionalBinding('app.initChatApp'),
    initChatApp
  );
  assert.equal(
    runtimeContext.resolveOptionalBinding('runtimeEntry.submit.adjustTextareaHeight'),
    adjustTextareaHeight
  );
  assert.deepEqual(
    registerRuntimeEntryBindings({
      runtimeContext,
      appBootstrapLifecycle,
      startupLifecycle
    }),
    { initChatApp, adjustTextareaHeight }
  );
});

test('createRuntimeEntry binding registration stays inert until explicitly requested', () => {
  const registered = [];
  const runtimeContext = {
    registerLazyBinding(name) {
      registered.push(name);
    },
    resolveOptionalBinding() {
      return undefined;
    }
  };
  const entry = createRuntimeEntry({
    runtimeContext,
    dependencies: createCompleteDependencies()
  });

  assert.deepEqual(registered, []);
  entry.registerBindings();
  assert.deepEqual(registered, [
    'app.initChatApp',
    'runtimeEntry.submit.adjustTextareaHeight'
  ]);
});

test('runtime entry resolves the registered facade from an injected runtime context', () => {
  const calls = [];
  const bindings = new Map();
  const runtimeContext = {
    registerLazyBinding(name, getter) {
      bindings.set(name, getter);
    },
    resolveBinding(name) {
      calls.push(name);
      const getter = bindings.get(name);
      if (!getter) throw new Error(`Missing binding: ${name}`);
      return getter();
    },
    resolveOptionalBinding(name) {
      return bindings.get(name)?.();
    }
  };
  const coreTailDependencies = createCompleteCoreTailDependencies({ runtimeContext });
  bindings.set('runtime.coreTailDependencies', () => coreTailDependencies);

  assert.equal(
    runtimeContext.resolveBinding('runtime.coreTailDependencies'),
    coreTailDependencies
  );
  const entry = createRuntimeEntry({ runtimeContext });

  assert.equal(entry.runtimeContext, runtimeContext);
  assert.equal(entry.dependencies, runtimeContext.resolveBinding('runtime.entryDependencies'));
  assert.equal(typeof runtimeContext.resolveBinding('coreTail.applyLanguage'), 'function');
  assert.deepEqual(calls, [
    'runtime.coreTailDependencies',
    'runtime.coreTailDependencies',
    'runtime.entryDependencies',
    'runtime.entryDependencies',
    'coreTail.applyLanguage'
  ]);
});

test('runtime entry start remains explicit and runs startup composition once', async () => {
  const calls = [];
  const listeners = [];
  const createElement = (id) => ({
    id,
    value: '',
    disabled: false,
    dataset: {},
    style: {},
    classList: {
      add: (name) => calls.push(`class:${id}:add:${name}`),
      remove: () => {},
      toggle: () => {},
      contains: () => false
    },
    addEventListener(type) {
      listeners.push(`${id}:${type}`);
    },
    contains: () => false
  });
  const elements = new Proxy({}, {
    get(target, prop) {
      if (!target[prop]) target[prop] = createElement(prop);
      return target[prop];
    }
  });
  const document = {
    addEventListener: (type) => listeners.push(`document:${type}`),
    getElementById: (id) => createElement(id)
  };
  const dependencies = createCompleteDependencies({
    startup: {
      window: {},
      document,
      globalObject: {},
      elements,
      getConfig: () => ({}),
      setCurrentUser: () => {},
      getItem: async (key) => {
        calls.push(`getItem:${key}`);
        return null;
      },
      getUserKey: () => '',
      loadConfig: async () => {},
      loadAppData: async () => {},
      applyLanguage: (lang) => calls.push(`applyLanguage:${lang}`),
      applyCustomWallpaper: () => {},
      applyUiTheme: () => {},
      handleLogin: () => {},
      handleImportOnAuth: () => {},
      processAuthImport: () => {},
      toggleModal: () => {},
      installTouchGuards: () => calls.push('installTouchGuards'),
      registerServiceWorker: () => calls.push('registerServiceWorker'),
      showCustomDialog: () => {},
      getComputedStyle: () => ({})
    }
  });
  const entry = createRuntimeEntry({ dependencies });

  assert.deepEqual(calls, []);
  const firstStart = entry.start();
  const secondStart = entry.start();
  assert.equal(firstStart, secondStart);
  await firstStart;

  assert.deepEqual(calls, [
    'applyLanguage:zh-TW',
    'getItem:chat_lastUser',
    'installTouchGuards',
    'registerServiceWorker',
    'class:auth-container:add:visible'
  ]);
  assert.equal(
    listeners.filter((listener) => listener === 'authForm:submit').length,
    1
  );
});

test('dependency facade validates required groups and reports missing fields', () => {
  assert.throws(
    () => validateLegacyRuntimeEntryDependencies(),
    /must be an object/
  );
  assert.throws(
    () => createLegacyRuntimeEntryDependencies({
      appBootstrap: {},
      startup: {}
    }),
    /missing appBootstrap fields: window/
  );
  assert.throws(
    () => createRuntimeEntry(),
    /must be an object/
  );

  const dependencies = createCompleteDependencies();
  assert.equal(Object.isFrozen(dependencies), true);
  assert.equal(Object.isFrozen(dependencies.appBootstrap), true);
  assert.equal(Object.isFrozen(dependencies.startup), true);
});

test('runtime entry loads the real legacy core without virtual runtime imports', () => {
  const source = readSource('src/app/runtime-entry.js');

  assert.match(
    source,
    /const\s+\{\s*legacyRuntimeContext\s*\}\s*=\s*await\s+import\('\.\/runtime\/legacy-core\/legacy-core\.js'\)/
  );
  assert.doesNotMatch(source, /virtual:legacy-app-runtime/);
  assert.doesNotMatch(source, /legacy-runtime\/fragments/);
  assert.doesNotMatch(source, /(?:^|\n)\s*(?:void\s+)?(?:start|initializeApp|initChatApp)\(\);/);
});

test('production runtime entry loads the legacy core and starts only once', async () => {
  const listeners = [];
  const document = {
    ...createDocumentFake(),
    addEventListener(type) {
      listeners.push(type);
    },
    getElementById: () => ({
      ...createElement(),
      addEventListener(type) {
        listeners.push(type);
      }
    })
  };
  const elements = new Proxy({}, {
    get(target, prop) {
      if (!target[prop]) {
        target[prop] = {
          ...createElement(prop),
          addEventListener(type) {
            listeners.push(type);
          }
        };
      }
      return target[prop];
    }
  });
  const bindings = new Map([
    ['input.updateInputState', () => () => {}]
  ]);
  const runtimeContext = {
    registerLazyBinding(name, getter) {
      assert.equal(bindings.has(name), false);
      bindings.set(name, getter);
    },
    resolveBinding(name) {
      const getter = bindings.get(name);
      if (!getter) throw new Error(`Missing binding: ${name}`);
      return getter();
    },
    resolveOptionalBinding(name) {
      return bindings.get(name)?.();
    }
  };
  bindings.set('runtime.coreTailDependencies', () => createCompleteCoreTailDependencies({
    runtimeContext,
    document,
    elements
  }));
  let loads = 0;
  const loadRuntimeContext = async () => {
    loads += 1;
    return runtimeContext;
  };

  const firstStart = startRuntimeEntry({ loadRuntimeContext });
  const secondStart = startRuntimeEntry({ loadRuntimeContext });

  assert.equal(firstStart, secondStart);
  const entry = await firstStart;
  assert.equal(loads, 1);
  assert.equal(typeof bindings.get('coreTail.applyLanguage')(), 'function');
  assert.equal(entry.dependencies, bindings.get('runtime.entryDependencies')());
  assert.equal(bindings.get('app.initChatApp')(), entry.initChatApp);
  assert.equal(
    bindings.get('runtimeEntry.submit.adjustTextareaHeight')(),
    entry.adjustTextareaHeight
  );
  assert.equal(listeners.filter((type) => type === 'submit').length, 1);
});

test('legacy production entry starts runtime-entry without importing the legacy core directly', () => {
  const source = readSource('src/app/legacy-app.js');

  assert.match(
    source,
    /import\s+\{\s*startRuntimeEntry\s*\}\s+from\s+['"]\.\/runtime-entry\.js['"]/
  );
  assert.match(source, /startRuntimeEntry\(\);/);
  assert.doesNotMatch(source, /virtual:legacy-app-runtime/);
  assert.doesNotMatch(source, /legacy-core\/legacy-core\.js/);
});
