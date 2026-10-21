import assert from 'node:assert/strict';
import test from 'node:test';
import { SERVICES, getService } from '../src/app/runtime/services.js';

import { createLegacyStartupLifecycle } from '../src/app/runtime/features/startup-lifecycle.js';
import { mergeSyncedMemoryState } from '../src/app/runtime/memory/memory-sync-projection.js';

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
    setAttribute(name, value) {
      calls.push(`attr:${id}:${name}:${value}`);
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
    restoreMemorySync: async () => calls.push('restoreMemorySync'),
    applyLanguage: (language) => calls.push(`applyLanguage:${language}`),
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

// The browser's language, for the length of a test (a first visit follows it).
const withBrowserLanguages = async (languages, run) => {
  const before = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: { languages, language: languages[0] }, configurable: true, writable: true });
  try {
    return await run();
  } finally {
    if (before) Object.defineProperty(globalThis, 'navigator', before);
    else delete globalThis.navigator;
  }
};

test('a first visit follows the language of the browser: one of the five, any Chinese as Traditional Chinese, otherwise Traditional Chinese as before', async () => {
  for (const [languages, expected] of [[['fr-FR', 'en'], 'fr'], [['ru'], 'ru'], [['es-MX'], 'es'], [['en-GB'], 'en'], [['zh-CN'], 'zh-TW'], [['ja-JP', 'en'], 'en'], [['ja-JP'], 'zh-TW'], [['de'], 'zh-TW']]) {
    await withBrowserLanguages(languages, async () => {
      const harness = createHarness();
      harness.stored.delete('chatUser_alice');
      await createLegacyStartupLifecycle(harness.dependencies).initializeApp();
      assert.equal(harness.calls[0], `applyLanguage:${expected}`, languages.join());
      assert.equal(harness.config.uiLanguage, expected, languages.join());
    });
  }
});

test('initializeApp restores the user and preserves load and visual handoff order', async () => {
  await withBrowserLanguages(['zh-TW'], async () => {
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
    'restoreMemorySync',
    'applyUiTheme',
    'class:appContainer:remove:hidden',
    'class:appContainer:add:visible',
    'initChatApp'
  ]);
  assert.equal(harness.elements.authContainer.style.display, 'none');
  });
});

test('initializeApp restores synced memory before the first app render', async () => {
  let memoryState = {
    version: 2,
    profileEntries: [],
    profileCandidates: [],
    resolvedProfileCandidateIds: [],
    suppressionRules: [],
    longTermTopicSummaries: [],
    conversationCapsules: [{ id: 'local-capsule' }]
  };
  const projection = {
    version: 1,
    profileEntries: [{ id: 'style', confirmedByUser: true, content: 'Use concise replies' }],
    profileCandidates: [{ id: 'candidate', content: 'Use examples' }],
    resolvedProfileCandidateIds: ['dismissed'],
    suppressionRules: [{ id: 'name-rule', type: 'do-not-mention', target: 'profile-name' }],
    longTermTopicSummaries: [{ id: 'topic', topic: 'Memory rebuild', summary: 'Keep recall relevant.' }]
  };
  const harness = createHarness({
    restoreMemorySync: async () => {
      harness.calls.push('restoreMemorySync');
      memoryState = mergeSyncedMemoryState(memoryState, projection);
    },
    initChatApp: () => {
      harness.calls.push('initChatApp');
      assert.equal(memoryState.profileEntries[0].id, 'style');
      assert.equal(memoryState.profileCandidates[0].id, 'candidate');
      assert.deepEqual(memoryState.resolvedProfileCandidateIds, ['dismissed']);
      assert.equal(memoryState.suppressionRules[0].id, 'name-rule');
      assert.equal(memoryState.longTermTopicSummaries[0].id, 'topic');
      assert.deepEqual(memoryState.conversationCapsules, [{ id: 'local-capsule' }]);
    }
  });

  await createLegacyStartupLifecycle(harness.dependencies).initializeApp();

  assert.ok(harness.calls.indexOf('restoreMemorySync') < harness.calls.indexOf('initChatApp'));
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

test('adjustTextareaHeight caps desktop growth at ten lines and exposes expansion', () => {
  const harness = createHarness();
  const wrapper = {
    classList: createClassList('input-wrapper', harness.calls)
  };
  harness.dependencies.window.innerHeight = 800;
  harness.elements.messageInput.value = 'long draft';
  harness.elements.messageInput.scrollHeight = 520;
  harness.elements.messageInput.closest = () => wrapper;
  const lifecycle = createLegacyStartupLifecycle(harness.dependencies);

  lifecycle.adjustTextareaHeight();

  assert.equal(harness.elements.messageInput.style.height, '248px');
  assert.equal(harness.elements.messageInput.style.maxHeight, '248px');
  assert.equal(harness.elements.messageInput.style.overflowY, 'auto');
  assert.equal(wrapper.classList.contains('has-overflowing-input'), true);
  assert.equal(harness.elements.expandInputButton.classList.contains('hidden'), false);

  wrapper.classList.add('is-composer-expanded');
  lifecycle.adjustTextareaHeight();

  assert.equal(harness.elements.messageInput.style.height, '448px');
  assert.equal(harness.elements.messageInput.style.maxHeight, '448px');
  assert.equal(harness.elements.expandInputButton.classList.contains('hidden'), false);
  assert.equal(wrapper.classList.contains('is-composer-expanded'), true);
});

test('startup postlude preserves update dialog, touch guard, and service worker order', () => {
  const harness = createHarness();
  const lifecycle = createLegacyStartupLifecycle(harness.dependencies);

  lifecycle.runStartupPostlude();

  assert.equal(getService(SERVICES.showUpdateDialog), harness.dependencies.showCustomDialog);
  assert.deepEqual(harness.calls, ['installTouchGuards', 'registerServiceWorker']);
});

// Signing in and importing on the sign-in page belong to the shell; the start of the page only binds what it is given.
test('the sign-in page buttons call the handlers the shell gives', () => {
  const harness = createHarness();
  createLegacyStartupLifecycle(harness.dependencies).bindAuthStartupListeners();

  assert.equal(findListener(harness.listeners, 'authForm', 'submit'), harness.dependencies.handleLogin);
  assert.equal(findListener(harness.listeners, 'importBtnAuth', 'click'), harness.dependencies.handleImportOnAuth);
  assert.equal(findListener(harness.listeners, 'confirmImportBtnAuth', 'click'), harness.dependencies.processAuthImport);
});
