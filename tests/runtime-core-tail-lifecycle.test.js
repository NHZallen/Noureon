import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createLegacyCoreTailLifecycle } from '../src/app/runtime/legacy-core/core-tail-lifecycle.js';

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const noop = () => {};

function createStyle() {
  const values = new Map();
  return {
    values,
    setProperty(name, value) {
      values.set(name, value);
    },
    removeProperty(name) {
      values.delete(name);
    }
  };
}

function createHarness(overrides = {}) {
  const registrations = new Map();
  const calls = [];
  const documentStyle = createStyle();
  const bodyClasses = new Set();
  const state = {
    conversations: [],
    folders: [],
    astras: [],
    personalMemories: [],
    config: {
      theme: 'light',
      uiLanguage: 'zh-TW',
      customWallpaper: null,
      wallpaperBrightness: 'light',
      uiTheme: {
        mode: 'default',
        style: 'solid',
        customColor: '#3b82f6',
        adaptiveColor: '#3b82f6',
        adaptivePalette: [],
        adaptiveGradient: ''
      }
    },
    currentUser: null,
    sidebarOpen: false,
    sendConfirmed: false,
    abortController: null,
    cropperInstance: null,
    editingAstraForAvatarId: null,
    editingAstrasId: null,
    currentStoreCategory: '全部',
    messageObserver: null,
    timeDistChart: null,
    isAutoScrolling: false
  };
  const elements = new Proxy({
    wallpaperContainer: { style: {} }
  }, {
    get(target, property) {
      return target[property] ?? {
        style: {},
        classList: { add: noop, remove: noop, toggle: noop },
        addEventListener: noop,
        querySelector: () => null,
        querySelectorAll: () => []
      };
    }
  });
  const document = {
    documentElement: {
      lang: '',
      classList: { add: noop, remove: noop, toggle: noop },
      style: documentStyle
    },
    body: {
      classList: {
        add: (...names) => names.forEach((name) => bodyClasses.add(name)),
        remove: (...names) => names.forEach((name) => bodyClasses.delete(name)),
        toggle: (name, enabled) => enabled ? bodyClasses.add(name) : bodyClasses.delete(name)
      },
      appendChild: noop
    },
    createElement: () => ({
      style: {},
      classList: { add: noop, remove: noop, toggle: noop },
      addEventListener: noop,
      appendChild: noop,
      querySelector: () => null,
      querySelectorAll: () => []
    }),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => []
  };
  const base = {
    window: { innerWidth: 1280, innerHeight: 720 },
    document,
    navigator: {},
    fetch: async () => {},
    File: class {},
    Event: class {},
    Blob: class {},
    Image: class {},
    FileReader: class {},
    Chart: class {},
    Cropper: class {},
    Peer: class {},
    QRCode: class {},
    Html5Qrcode: class {},
    JSZip: class {},
    ResizeObserver: class { observe() {} },
    IntersectionObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame: (callback) => callback(),
    setTimeout,
    clearTimeout,
    crypto: { randomUUID: () => 'uuid' },
    console,
    globalObject: {},
    getComputedStyle: () => ({}),
    random: () => 0.5,
    elements,
    state,
    runtimeConfigAccess: { getUiLanguage: () => state.config.uiLanguage },
    runtimeAppDataStore: {
      replaceAstras: (next) => next,
      replaceConversations: (next) => next
    },
    runtimeDialogCoordinator: { showNotification: noop },
    legacyRuntimeContext: {
      registerLazyBinding(name, resolver) {
        registrations.set(name, resolver);
      },
      resolveBinding: () => noop
    },
    i18n: { 'zh-TW': {} },
    OFFICIAL_ASTRAS: [],
    updateLogs: [],
    UI_THEME_COLORS: {},
    setTheme: (theme) => calls.push(['setTheme', theme]),
    updateThemeButtons: () => calls.push(['updateThemeButtons']),
    setAiBubbleColor: () => calls.push(['setAiBubbleColor']),
    setUserBubbleColor: () => calls.push(['setUserBubbleColor']),
    saveConfig: async () => {},
    saveAppData: async () => {},
    showNotification: noop,
    toggleModal: noop,
    renderAstras: noop,
    escapeHTML: String,
    sanitizeTrustedHTML: String,
    formatFullTimestamp: String,
    renderUserText: String,
    renderMarkdownWithFormulas: String
  };
  const dependencies = new Proxy({ ...base, ...overrides }, {
    get(target, property) {
      return property in target ? target[property] : noop;
    }
  });

  return {
    calls,
    documentStyle,
    bodyClasses,
    elements,
    registrations,
    state,
    lifecycle: createLegacyCoreTailLifecycle(dependencies)
  };
}

test('factory is inert on import and validates the core dependency boundary', () => {
  assert.throws(
    () => createLegacyCoreTailLifecycle(),
    /missing dependencies: window, document, elements, state/
  );
});

test('factory exposes the former 04 public lifecycle API', () => {
  const { lifecycle } = createHarness();
  for (const name of [
    'setupTimeAnalysis',
    'applyUiTheme',
    'renderUiColorOptions',
    'applyCustomWallpaper',
    'renderStore',
    'applyLanguage',
    'showMobileContextMenu',
    'setupMessageIntersectionObserver',
    'renderTrash',
    'setupTimeAnalysis',
    'registerRuntimeEntryDependencies'
  ]) {
    assert.equal(typeof lifecycle[name], 'function', `${name} should be exposed`);
  }
});

test('runtime entry dependency facade is built and registered only when requested', () => {
  const { lifecycle, registrations } = createHarness();
  assert.equal(registrations.size, 0);
  const facade = lifecycle.registerRuntimeEntryDependencies();
  assert.equal(registrations.has('runtime.entryDependencies'), true);
  assert.equal(registrations.get('runtime.entryDependencies')(), facade);
  assert.equal(facade, lifecycle.runtimeEntryDependencies);
});

test('theme and wallpaper helpers use injected live state and DOM dependencies', () => {
  const { lifecycle, calls, documentStyle, elements, state } = createHarness();
  lifecycle.applyUiTheme();
  assert.equal(documentStyle.values.get('--button-primary-bg'), '#3b82f6');
  assert.deepEqual(calls.shift(), ['updateThemeButtons']);

  lifecycle.applyCustomWallpaper();
  assert.equal(elements.wallpaperContainer.style.backgroundImage, 'none');
  assert.deepEqual(calls, [
    ['setTheme', 'light'],
    ['setAiBubbleColor'],
    ['setUserBubbleColor']
  ]);

  state.config.customWallpaper = 'data:image/png;base64,wallpaper';
  state.config.wallpaperBrightness = 'dark';
  lifecycle.applyCustomWallpaper();
  assert.equal(
    elements.wallpaperContainer.style.backgroundImage,
    'url(data:image/png;base64,wallpaper)'
  );
});

test('core tail module owns trash composition without importing legacy fragments or virtual runtime', () => {
  const source = readSource('src/app/runtime/legacy-core/core-tail-lifecycle.js');
  assert.match(source, /createLegacyTrashLifecycle\(\{/);
  assert.doesNotMatch(source, /legacy-runtime\/fragments|virtual:legacy-app-runtime/);
  assert.match(source, /createLegacyRuntimeEntryDependencies\(\{/);
});
