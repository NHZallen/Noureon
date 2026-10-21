import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { loadLegacyCore, startRuntimeEntry } from '../src/app/runtime-entry.js';
import { createLegacyStartupLifecycle } from '../src/app/runtime/features/startup-lifecycle.js';

// A first visit follows the language of the browser; these tests are about the start in Traditional Chinese.
Object.defineProperty(globalThis, 'navigator', { value: { languages: ['zh-TW'], language: 'zh-TW' }, configurable: true, writable: true });

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('the runtime entry loads the shell once and starts the page once', async () => {
  let loads = 0;
  let starts = 0;
  const loadCore = async () => {
    loads += 1;
    return { startPage: async () => { starts += 1; return 'started'; } };
  };

  const firstStart = startRuntimeEntry({ loadCore });
  const secondStart = startRuntimeEntry({ loadCore });

  assert.equal(firstStart, secondStart);
  assert.equal(await firstStart, 'started');
  assert.equal(loads, 1);
  assert.equal(starts, 1);
  assert.equal(typeof loadLegacyCore, 'function');
});

test('the runtime entry loads the real shell, which starts the page itself', () => {
  const source = readSource('src/app/runtime-entry.js');
  assert.match(source, /return import\('\.\/runtime\/legacy-core\/legacy-core\.js'\)/);
  assert.doesNotMatch(source, /virtual:legacy-app-runtime|legacy-runtime\/fragments/);
  assert.match(readSource('src/app/runtime/legacy-core/legacy-core.js'), /export function startPage\(\)/);
});

// The start of the page (startPage() in legacy-core.js) binds the sign-in page, then loads the workspace, then binds the language
// switcher of the sign-in page and runs the rest of the start.
test('the start of the page binds the sign-in page once and checks for a signed-in person', async () => {
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
  const startup = createLegacyStartupLifecycle({
    window: {},
    document: {
      addEventListener: (type) => listeners.push(`document:${type}`),
      getElementById: (id) => createElement(id)
    },
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
    restoreMemorySync: async () => {},
    applyLanguage: (lang) => calls.push(`applyLanguage:${lang}`),
    applyUiTheme: () => {},
    initChatApp: () => calls.push('initChatApp'),
    handleLogin: () => {},
    handleImportOnAuth: () => {},
    processAuthImport: () => {},
    toggleModal: () => {},
    installTouchGuards: () => calls.push('installTouchGuards'),
    registerServiceWorker: () => calls.push('registerServiceWorker'),
    showCustomDialog: () => {},
    getComputedStyle: () => ({})
  });

  startup.bindAuthStartupListeners();
  const started = startup.initializeApp();
  startup.bindLoginLanguageSwitcher();
  startup.runStartupPostlude();
  await started;

  assert.deepEqual(calls, [
    'applyLanguage:zh-TW',
    'getItem:chat_lastUser',
    'installTouchGuards',
    'registerServiceWorker',
    'class:auth-container:add:visible'
  ]);
  assert.equal(listeners.filter((listener) => listener === 'authForm:submit').length, 1);
});

test('legacy production entry starts runtime-entry without importing the legacy core directly', () => {
  const source = readSource('src/app/legacy-app.js');

  assert.match(
    source,
    /import\s+\{\s*startRuntimeEntry\s*\}\s+from\s+['"]\.\/runtime-entry\.js['"]/
  );
  assert.match(source, /export\s+const\s+legacyAppReady\s*=\s*startRuntimeEntry\(\);/);
  assert.doesNotMatch(source, /virtual:legacy-app-runtime/);
  assert.doesNotMatch(source, /legacy-core\/legacy-core\.js/);
});
