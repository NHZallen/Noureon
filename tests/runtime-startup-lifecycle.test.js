import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createLegacyStartupLifecycle } from '../src/app/runtime/features/startup-lifecycle.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

const createClassList = (id, calls) => {
  const values = new Set();
  return {
    add(...names) {
      names.forEach((name) => values.add(name));
      calls.push(`class:${id}:add:${names.join(',')}`);
    },
    remove(...names) {
      names.forEach((name) => values.delete(name));
      calls.push(`class:${id}:remove:${names.join(',')}`);
    },
    toggle(name, force) {
      const next = force === undefined ? !values.has(name) : Boolean(force);
      if (next) values.add(name);
      else values.delete(name);
      calls.push(`class:${id}:toggle:${name}:${next}`);
      return next;
    },
    contains(name) {
      return values.has(name);
    }
  };
};

function createHarness(overrides = {}) {
  const calls = [];
  const listeners = [];
  const elementsById = new Map();
  let canvasCount = 0;

  const createElement = (id) => ({
    id,
    value: '',
    disabled: false,
    dataset: {},
    scrollHeight: 24,
    clientWidth: 240,
    style: {},
    classList: createClassList(id, calls),
    addEventListener(type, handler) {
      listeners.push({ id, type, handler });
      calls.push(`bind:${id}:${type}`);
    },
    contains() {
      return false;
    },
    closest() {
      return null;
    }
  });
  const getElement = (id) => {
    if (!elementsById.has(id)) elementsById.set(id, createElement(id));
    return elementsById.get(id);
  };
  const elements = new Proxy({}, {
    get(target, prop) {
      if (typeof prop !== 'string') return target[prop];
      if (!target[prop]) target[prop] = getElement(prop);
      return target[prop];
    }
  });
  const document = {
    getElementById: getElement,
    addEventListener(type, handler) {
      listeners.push({ id: 'document', type, handler });
      calls.push(`bind:document:${type}`);
    },
    createElement(tag) {
      assert.equal(tag, 'canvas');
      canvasCount += 1;
      return {
        getContext: () => ({
          font: '',
          measureText: (text) => ({ width: text.length * 10 })
        })
      };
    }
  };
  const config = { uiLanguage: 'zh-TW', aiDefaultLanguage: 'zh-TW' };
  const stored = new Map([
    ['chat_lastUser', 'alice'],
    ['chatUser_alice', JSON.stringify({ username: 'alice' })]
  ]);
  const globalObject = {};
  const dependencies = {
    window: {
      matchMedia: () => ({ matches: true })
    },
    document,
    globalObject,
    elements,
    getConfig: () => config,
    setCurrentUser: (user) => {
      calls.push(`setCurrentUser:${user.username}`);
      return user;
    },
    getItem: async (key) => {
      calls.push(`getItem:${key}`);
      return stored.get(key) ?? null;
    },
    getUserKey: (username) => {
      calls.push(`getUserKey:${username}`);
      return `chatUser_${username}`;
    },
    loadConfig: async () => calls.push('loadConfig'),
    loadAppData: async () => calls.push('loadAppData'),
    applyLanguage: (language) => calls.push(`applyLanguage:${language}`),
    applyCustomWallpaper: () => calls.push('applyCustomWallpaper'),
    applyUiTheme: () => calls.push('applyUiTheme'),
    initChatApp: () => calls.push('initChatApp'),
    handleLogin: () => calls.push('handleLogin'),
    handleImportOnAuth: () => calls.push('handleImportOnAuth'),
    processAuthImport: () => calls.push('processAuthImport'),
    toggleModal: (element, open) => calls.push(`toggleModal:${element.id}:${open}`),
    installTouchGuards: () => calls.push('installTouchGuards'),
    registerServiceWorker: () => calls.push('registerServiceWorker'),
    showCustomDialog: () => calls.push('showCustomDialog'),
    getComputedStyle: () => ({
      fontStyle: 'normal',
      fontVariant: 'normal',
      fontWeight: '400',
      fontSize: '16px',
      fontFamily: 'sans-serif',
      lineHeight: '24px',
      paddingTop: '4px',
      paddingBottom: '4px',
      paddingLeft: '8px',
      paddingRight: '8px',
      letterSpacing: '0px'
    }),
    ...overrides
  };

  return {
    calls,
    listeners,
    elements,
    document,
    globalObject,
    config,
    stored,
    dependencies,
    getCanvasCount: () => canvasCount
  };
}

const findListener = (listeners, id, type) => {
  const entry = listeners.find((listener) => listener.id === id && listener.type === type);
  assert.ok(entry, `${id}:${type} should be bound`);
  return entry.handler;
};

test('factory exports the complete startup lifecycle API', () => {
  const lifecycle = createLegacyStartupLifecycle(createHarness().dependencies);

  for (const name of [
    'bindAuthStartupListeners',
    'initializeApp',
    'bindLoginLanguageSwitcher',
    'adjustTextareaHeight',
    'runStartupPostlude'
  ]) {
    assert.equal(typeof lifecycle[name], 'function', `${name} should be exported`);
  }
});

test('auth startup listeners preserve binding order and import enablement behavior', () => {
  const harness = createHarness();
  const lifecycle = createLegacyStartupLifecycle(harness.dependencies);

  lifecycle.bindAuthStartupListeners();

  assert.deepEqual(harness.calls.slice(0, 6), [
    'bind:authForm:submit',
    'bind:usernameInput:input',
    'bind:passwordInput:input',
    'bind:importBtnAuth:click',
    'bind:confirmImportBtnAuth:click',
    'bind:cancelImportBtnAuth:click'
  ]);

  const updateFromUsername = findListener(harness.listeners, 'usernameInput', 'input');
  harness.elements.usernameInput.value = 'alice';
  harness.elements.passwordInput.value = '';
  updateFromUsername();
  assert.equal(harness.elements.importBtnAuth.disabled, true);

  harness.elements.passwordInput.value = 'secret';
  updateFromUsername();
  assert.equal(harness.elements.importBtnAuth.disabled, false);

  findListener(harness.listeners, 'cancelImportBtnAuth', 'click')();
  assert.match(harness.calls.at(-1), /^toggleModal:importDataModalAuth:false$/);
});

test('initializeApp restores the user and preserves load and visual handoff order', async () => {
  const harness = createHarness();
  const lifecycle = createLegacyStartupLifecycle(harness.dependencies);

  await lifecycle.initializeApp();

  assert.deepEqual(harness.calls, [
    'applyLanguage:zh-TW',
    'getItem:chat_lastUser',
    'getUserKey:alice',
    'getItem:chatUser_alice',
    'setCurrentUser:alice',
    'loadConfig',
    'loadAppData',
    'applyCustomWallpaper',
    'applyUiTheme',
    'class:appContainer:remove:hidden',
    'class:appContainer:add:visible',
    'initChatApp'
  ]);
  assert.equal(harness.elements.authContainer.style.display, 'none');
});

test('initializeApp preserves missing-user fallback behavior', async () => {
  const harness = createHarness();
  harness.stored.delete('chatUser_alice');
  const lifecycle = createLegacyStartupLifecycle(harness.dependencies);

  await lifecycle.initializeApp();

  assert.equal(harness.elements.usernameInput.value, 'alice');
  assert.ok(harness.calls.includes('class:auth-container:add:visible'));
  assert.equal(harness.calls.includes('loadConfig'), false);
  assert.equal(harness.calls.includes('initChatApp'), false);
});

test('login language switcher mutates the live config and applies language', () => {
  const harness = createHarness();
  const lifecycle = createLegacyStartupLifecycle(harness.dependencies);

  lifecycle.bindLoginLanguageSwitcher();
  const menuClick = findListener(harness.listeners, 'loginLangMenu', 'click');
  menuClick({
    preventDefault: () => harness.calls.push('preventDefault'),
    target: { dataset: { lang: 'en' } }
  });

  assert.equal(harness.config.uiLanguage, 'en');
  assert.equal(harness.config.aiDefaultLanguage, 'en');
  assert.ok(harness.calls.includes('applyLanguage:en'));
});

test('adjustTextareaHeight preserves layout behavior and caches its measurement canvas', () => {
  const harness = createHarness();
  const wrapper = {
    classList: createClassList('input-wrapper', harness.calls)
  };
  harness.elements.messageInput.value = 'a sufficiently long line to measure';
  harness.elements.messageInput.scrollHeight = 60;
  harness.elements.messageInput.clientWidth = 120;
  harness.elements.messageInput.closest = () => wrapper;
  const lifecycle = createLegacyStartupLifecycle(harness.dependencies);

  lifecycle.adjustTextareaHeight();
  lifecycle.adjustTextareaHeight();

  assert.equal(harness.getCanvasCount(), 1);
  assert.equal(wrapper.classList.contains('has-multiline-input'), true);
  assert.equal(harness.elements.messageInput.style.height, '60px');
});

test('startup postlude preserves update dialog, touch guard, and service worker order', () => {
  const harness = createHarness();
  const lifecycle = createLegacyStartupLifecycle(harness.dependencies);

  lifecycle.runStartupPostlude();

  assert.equal(harness.globalObject.__astraShowUpdateDialog, harness.dependencies.showCustomDialog);
  assert.deepEqual(harness.calls, ['installTouchGuards', 'registerServiceWorker']);
});

test('startup lifecycle has explicit boundaries and no fragment or runtime-entry imports', () => {
  const source = readSource('src/app/runtime/features/startup-lifecycle.js');

  assert.match(source, /export\s+function\s+createLegacyStartupLifecycle/);
  assert.doesNotMatch(source, /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-app/);
  assert.doesNotMatch(source, /legacyRuntimeContext|indexedDB|openDB|createLegacyRuntimeStorageAdapter/);
  assert.doesNotMatch(source, /function\s+handleLogin|function\s+handleImportOnAuth|function\s+processAuthImport/);
  assert.doesNotMatch(source, /(?:^|\n)\s*currentUser\s*=/);
});
