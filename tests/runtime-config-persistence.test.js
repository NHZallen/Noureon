import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createRuntimeConfigPersistence } from '../src/app/runtime/kernel/config-persistence.js';
import { normalizeLoadedLegacyConfig } from '../src/app/runtime/kernel/config-normalization.js';
import { getStoredUserWorkspaceKeys } from '../src/app/runtime/kernel/user-data-retention.js';
import { createSettingsAuthProviderLifecycle } from '../src/app/runtime/settings/settings-auth-provider-lifecycle.js';
import { createAppBootstrapLifecycle } from '../src/app/runtime/features/app-bootstrap-lifecycle.js';
import { createDom } from './behaviours/helpers/create-dom.js';
import { createDependencies } from './helpers/settings-lifecycle-harness.js';

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// What loadConfig reads and in which order is tested in tests/workspace-load.test.js, the model and council normalization of loaded
// settings in tests/runtime-config-normalization.test.js, and the restore of the user before the settings at start-up in
// tests/runtime-startup-lifecycle.test.js.

test('serialized config persistence writes the latest config for the latest user', async () => {
  const calls = [];
  let currentUser = null;
  let config = { nested: { enabled: false } };
  const persistence = createRuntimeConfigPersistence({
    getCurrentUser: () => currentUser,
    getConfig: () => config,
    getConfigKey: () => `chatConfig_v_v8.6_${currentUser.username}`,
    setItem: async (key, value) => {
      calls.push({ key, value });
    }
  });

  await persistence.saveConfig();
  assert.deepEqual(calls, []);

  currentUser = { username: 'alice' };
  config = { theme: 'dark', nested: { enabled: true } };
  await persistence.saveConfig();
  assert.deepEqual(calls, [
    {
      key: 'chatConfig_v_v8.6_alice',
      value: JSON.stringify({ nested: { enabled: true } })
    }
  ]);

  currentUser = { username: 'bob' };
  config = { theme: 'light', items: [1, 2, 3] };
  await persistence.saveConfig();
  assert.deepEqual(calls.at(-1), {
    key: 'chatConfig_v_v8.6_bob',
    value: JSON.stringify({ items: [1, 2, 3] })
  });
});

test('serialized config persistence removes apiKeys from normal config writes', async () => {
  const calls = [];
  const persistence = createRuntimeConfigPersistence({
    getCurrentUser: () => ({ username: 'alice' }),
    getConfig: () => ({
      theme: 'dark',
      apiKeys: {
        gemini: 'gemini-secret',
        openrouter: 'openrouter-secret'
      }
    }),
    getConfigKey: () => 'chatConfig_v_v8.6_alice',
    setItem: async (key, value) => {
      calls.push({ key, value });
    }
  });

  await persistence.saveConfig();

  assert.deepEqual(calls, [
    {
      key: 'chatConfig_v_v8.6_alice',
      value: JSON.stringify({})
    }
  ]);
});

test('serialized config persistence marks cloud sync before and after the durable write', async () => {
  const order = [];
  let markerCalls = 0;
  const persistence = createRuntimeConfigPersistence({
    getCurrentUser: () => ({ username: 'alice' }),
    getConfig: () => ({ outputMode: 'typewriter' }),
    getConfigKey: () => 'chatConfig_v_v8.6_alice',
    setItem: async () => {
      order.push('write');
    },
    onSaved: async () => {
      order.push('mark');
      markerCalls += 1;
      if (markerCalls === 1) throw new Error('transient marker failure');
    }
  });

  await persistence.saveConfig();

  assert.deepEqual(order, ['mark', 'write', 'mark']);
});

test('serialized config persistence preserves rejection and stringify error boundaries', async () => {
  const setItemError = new Error('write failed');
  const rejectingPersistence = createRuntimeConfigPersistence({
    getCurrentUser: () => ({ username: 'alice' }),
    getConfig: () => ({ theme: 'dark' }),
    getConfigKey: () => 'chatConfig_v_v8.6_alice',
    setItem: async () => {
      throw setItemError;
    }
  });

  await assert.rejects(() => rejectingPersistence.saveConfig(), setItemError);

  const circularConfig = {};
  circularConfig.self = circularConfig;
  const circularPersistence = createRuntimeConfigPersistence({
    getCurrentUser: () => ({ username: 'alice' }),
    getConfig: () => circularConfig,
    getConfigKey: () => 'chatConfig_v_v8.6_alice',
    setItem: async () => {}
  });

  await assert.rejects(
    () => circularPersistence.saveConfig(),
    /circular structure|Converting circular/i
  );
});

test('serialized config persistence exposes only saveConfig', () => {
  const persistence = createRuntimeConfigPersistence({
    getCurrentUser: () => null,
    getConfig: () => ({}),
    getConfigKey: () => 'unused',
    setItem: async () => {}
  });

  assert.deepEqual(Object.keys(persistence), ['saveConfig']);
  assert.equal(typeof persistence.saveConfig, 'function');
});

// The keys are composed in the composition root (legacy-core.js), which cannot be loaded in a test: each is taken from there and run
// for one user. They must stay the keys the cloud sync reads and the removal of an account's data removes.
const composedKey = (name) => {
  const match = new RegExp(`const ${name} = \\(\\) => (\`[^\`]+\`);`).exec(readSource('src/app/runtime/shell/shell.js'));
  assert.ok(match, `${name} should be composed in legacy-core.js`);
  return new Function('getCurrentUser', `return ${match[1]};`)(() => ({ username: 'alice' }));
};

test('settings and workspace are saved under the user-scoped keys the rest of the app reads and removes', () => {
  assert.equal(composedKey('getConfigKey'), 'chatConfig_v_v8.6_alice');
  assert.equal(composedKey('getAppDataKey'), 'chatAppData_v8.6_alice');
  const removedWithTheAccount = getStoredUserWorkspaceKeys('alice');
  assert.ok(removedWithTheAccount.includes('chatConfig_v_v8.6_alice'));
  assert.ok(removedWithTheAccount.includes('chatAppData_v8.6_alice'));
});

test('loaded settings win over the current ones, except the API keys and the retired theme', () => {
  const currentConfig = {
    apiKeys: { gemini: 'current-key' },
    uiLanguage: 'zh-TW',
    autoNaming: true,
    enableAutoMemory: true,
    uiTheme: { mode: 'default', customColor: '#3b82f6' }
  };
  const normalized = normalizeLoadedLegacyConfig({
    currentConfig,
    savedConfig: {
      apiKeys: { gemini: 'saved-key' },
      theme: 'dark',
      uiLanguage: 'fr',
      autoNaming: false,
      uiTheme: { mode: 'custom' }
    }
  });

  assert.equal(normalized.uiLanguage, 'fr');
  assert.equal(normalized.autoNaming, false);
  assert.equal(normalized.enableAutoMemory, true, 'a setting the saved config lacks keeps its current value');
  assert.deepEqual(normalized.apiKeys, { gemini: 'current-key' });
  assert.notEqual(normalized.apiKeys, currentConfig.apiKeys);
  assert.equal('theme' in normalized, false);
  assert.deepEqual(normalized.uiTheme, { mode: 'custom', customColor: '#3b82f6' }, 'the colours are merged, the saved ones first');
});

test('saving the settings changes the config, then saves it, before the page follows and says so', async () => {
  const fakeNode = () => ({ value: '', dataset: {}, style: {}, classList: { add() {}, remove() {}, contains() { return false; } } });
  let languageWhenSaved = null;
  const { dependencies, calls, state } = createDependencies({
    document: {
      body: { classList: { contains() { return false; } } },
      documentElement: { style: { setProperty: () => {} } },
      createElement: fakeNode,
      getElementById: fakeNode,
      querySelector: () => null,
      querySelectorAll: () => []
    },
    saveConfig: async () => {
      languageWhenSaved = state.config.uiLanguage;
      calls.push('saveConfig');
    }
  });
  state.config.uiLanguage = 'zh-TW';
  dependencies.elements.uiLanguageSelect.value = 'en';
  dependencies.elements.aiLanguageSelect.value = 'en';
  const lifecycle = createSettingsAuthProviderLifecycle(dependencies);
  const steps = () => calls.map((call) => (Array.isArray(call) ? call[0] : call));

  await lifecycle.saveSettings();

  assert.equal(languageWhenSaved, 'en');
  assert.deepEqual(steps(), [
    'applyUiTheme', 'saveConfig', 'applyLanguage', 'renderModelSwitcher', 'renderStore',
    'toggleModal', 'updateApiKeyWarningBadge', 'notification'
  ]);
  assert.equal(calls[5][1], dependencies.elements.settingsModal);
  assert.equal(calls[5][2], false);

  calls.length = 0;
  await lifecycle.saveSettings({ close: false, notify: false });
  assert.deepEqual(steps(), ['applyUiTheme', 'saveConfig', 'applyLanguage', 'renderModelSwitcher', 'renderStore', 'updateApiKeyWarningBadge']);
});

test('a change in the settings dialog saves the settings quietly: at once, after typing, or after a colour pick', async () => {
  const { document, window, cleanup } = createDom(
    '<div id="settings-modal"><input id="name"><span class="color-swatch"></span></div><span class="user-avatar"></span>'
  );
  try {
    // Every element the start of the app asks for exists; everything else it takes is a no-op here.
    const findById = document.getElementById.bind(document);
    const elementFor = (id) => {
      const element = findById(id) || document.createElement(id.endsWith('Input') ? 'input' : 'div');
      if (!element.isConnected) {
        element.id = id;
        document.body.append(Object.assign(document.createElement('div'), { id: `${id}-parent` }));
        findById(`${id}-parent`).append(element);
      }
      return element;
    };
    document.getElementById = elementFor;
    const saves = [];
    const base = {
      window, document, i18n: { en: {} },
      elements: new Proxy({ settingsModal: findById('settings-modal') }, { get: (known, name) => known[name] || elementFor(String(name)) }),
      getConfig: () => ({ uiLanguage: 'en' }),
      getConversations: () => [], getFolders: () => [], getAstras: () => [], getPersonalMemories: () => [],
      getCurrentUser: () => ({ username: 'alice' }),
      getCouncilSelectedModels: () => ({ participants: [] }), getCouncilTexts: () => ({}),
      saveSettings: (options) => saves.push(options),
      scheduleTimeout: (handler, delay) => { saves.push(['after', delay]); handler(); return 1; },
      clearScheduledTimeout: () => {}, scheduleAnimationFrame: (handler) => handler(),
      logger: { warn() {}, error() {}, log() {} }
    };
    const { initChatApp } = createAppBootstrapLifecycle(new Proxy(base, { get: (deps, name) => (name in deps ? deps[name] : async () => {}) }));
    await initChatApp();
    saves.length = 0;

    findById('name').dispatchEvent(new window.Event('change', { bubbles: true }));
    findById('name').dispatchEvent(new window.Event('input', { bubbles: true }));
    document.querySelector('.color-swatch').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    const quiet = { close: false, notify: false };
    assert.deepEqual(saves, [quiet, ['after', 350], quiet, ['after', 0], quiet]);
  } finally {
    cleanup();
  }
});

// Boundary: saving the settings writes through the injected setItem only, and the store holds the pointer only. (That the kernel,
// runtime-app.js, neither loads nor saves nor binds the page is guarded in tests/retired-code.test.js.)
test('config persistence and the config store keep to their own jobs', () => {
  assert.doesNotMatch(
    readSource('src/app/runtime/kernel/config-persistence.js'),
    /loadConfig|\b(?:getItem|removeItem|openDB|indexedDB|localStorage|sessionStorage)\b/
  );
  assert.doesNotMatch(
    readSource('src/app/runtime/kernel/config-store.js'),
    /\b(?:indexedDB|localStorage|sessionStorage|getItem|setItem|removeItem)\b|JSON\.(?:parse|stringify)/
  );
  // The settings and the workspace live in IndexedDB, through the adapter, not in web storage.
  assert.doesNotMatch(readSource('src/app/runtime/shell/shell.js'), /\b(?:localStorage|sessionStorage)\b/);
});
