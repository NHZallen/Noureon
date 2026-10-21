import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createRuntimeConfigAccess } from '../src/app/legacy-runtime/runtime/runtime-config-access.js';
import { createLegacyRuntimeAppDataStore } from '../src/app/runtime/kernel/app-data-store.js';
import { createLegacyRuntimeConfigStore } from '../src/app/runtime/kernel/config-store.js';
import { createLiveConversationsBridge } from '../src/app/runtime/kernel/live-conversations-bridge.js';
import { createShellState } from '../src/app/runtime/legacy-core/shell-state.js';
import { createWorkspaceFeatures } from '../src/app/runtime/legacy-core/workspace-features.js';
import { createWorkspaceLoad } from '../src/app/runtime/legacy-core/workspace-load.js';

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

function createHarness(initialConfig) {
  let storeConfig = initialConfig;
  const access = createRuntimeConfigAccess({
    getConfig: () => storeConfig,
    replaceConfig: (nextConfig) => {
      storeConfig = nextConfig;
      return storeConfig;
    }
  });

  return {
    access,
    getStoreConfig: () => storeConfig
  };
}

test('live config getter returns the config store current pointer', () => {
  const initialConfig = { uiLanguage: 'zh-TW' };
  const harness = createHarness(initialConfig);

  assert.equal(harness.access.getConfig(), initialConfig);

  const replacement = { uiLanguage: 'en' };
  harness.access.replaceConfig(replacement);
  assert.equal(harness.access.getConfig(), replacement);
});

test('replaceConfig updates the store pointer without mirror synchronization', () => {
  const harness = createHarness({ theme: 'light' });
  const replacement = { theme: 'dark' };

  assert.equal(harness.access.replaceConfig(replacement), replacement);
  assert.equal(harness.getStoreConfig(), replacement);
});

test('mutateConfig operates on the latest pointer after replacement', () => {
  const staleConfig = { outputMode: 'typewriter' };
  const harness = createHarness(staleConfig);
  const replacement = { outputMode: 'typewriter' };

  harness.access.replaceConfig(replacement);
  const mutated = harness.access.mutateConfig((config) => {
    config.outputMode = 'realtime';
  });

  assert.equal(mutated, replacement);
  assert.equal(harness.getStoreConfig(), replacement);
  assert.equal(replacement.outputMode, 'realtime');
  assert.equal(staleConfig.outputMode, 'typewriter');
});

test('mutateConfig applies object patches without replacing the active pointer', () => {
  const currentConfig = { uiLanguage: 'zh-TW', theme: 'light' };
  const harness = createHarness(currentConfig);

  const mutated = harness.access.mutateConfig({ uiLanguage: 'fr' });

  assert.equal(mutated, currentConfig);
  assert.equal(harness.getStoreConfig(), currentConfig);
  assert.deepEqual(currentConfig, { uiLanguage: 'fr', theme: 'light' });
});

// The config store and its access as legacy-core.js makes them: every reader goes through the store's current pointer.
function createLiveConfig() {
  const store = createLegacyRuntimeConfigStore({ defaultModelId: 'gemini-3.5-flash' });
  const access = createRuntimeConfigAccess({
    getConfig: () => store.getConfig(),
    replaceConfig: (nextConfig) => store.replaceConfig(nextConfig)
  });
  return { store, access };
}

function createConfigLoad(access, savedConfig) {
  return createWorkspaceLoad({
    getCurrentUser: () => ({ username: 'alice' }),
    storage: { getItem: async () => (savedConfig ? JSON.stringify(savedConfig) : null), removeItem: async () => {} },
    configAccess: access,
    appDataStore: createLegacyRuntimeAppDataStore(),
    sensitiveConfigPersistence: { loadSensitiveConfig: async () => {} },
    getConfigKey: () => 'chatConfig_v_v8.6_alice',
    getAppDataKey: () => 'chatAppData_v8.6_alice',
    mergeSensitiveApiKeys: () => {},
    saveSensitiveConfig: async () => {},
    saveConfig: async () => {},
    getCouncilTranslatorCandidates: () => [],
    getSingleTranslatorCandidates: () => [],
    showNotification: () => {}
  });
}

// Boundary: the settings have one owner, the config store; the composition root keeps no copy of its own.
test('legacy core keeps no local config mirror', () => {
  const source = readSource('src/app/runtime/legacy-core/legacy-core.js');

  assert.doesNotMatch(source, /let\s+config\s*=|syncConfig\s*:|set config\(next\)|state:\s*shell\b/);
});

test('the shell state holds no settings', () => {
  const names = Object.values(createShellState()).flatMap((store) => Object.keys(store));

  assert.ok(names.length > 0);
  assert.deepEqual(names.filter((name) => /config/i.test(name)), []);
});

test('loading saved settings starts from the config that is current at load time and replaces it', async () => {
  const { store, access } = createLiveConfig();
  const load = createConfigLoad(access, { uiLanguage: 'fr' });
  const before = store.getConfig();
  // Replaced after the loader was made (as a sign-in does): the loader must not hold the old pointer.
  store.replaceConfig({ ...before, lastSeenVersion: 'latest-pointer' });

  await load.loadConfig();

  assert.notEqual(store.getConfig(), before);
  assert.equal(access.getConfig(), store.getConfig());
  assert.equal(store.getConfig().uiLanguage, 'fr');
  assert.equal(store.getConfig().lastSeenVersion, 'latest-pointer');
});

test('loading with no saved settings normalizes the current config in place', async () => {
  const { store, access } = createLiveConfig();
  const load = createConfigLoad(access, null);
  const replacement = { ...store.getConfig(), lastSeenVersion: 'latest-pointer', uiLanguage: 'ar' };
  store.replaceConfig(replacement);

  await load.loadConfig();

  assert.equal(store.getConfig(), replacement);
  assert.equal(replacement.lastSeenVersion, 'latest-pointer');
  assert.equal(replacement.uiLanguage, 'en', 'an unsupported language is normalized on the current pointer');
});

test('the workspace features change the settings that are current when they run', async () => {
  const { store, access } = createLiveConfig();
  const appDataStore = createLegacyRuntimeAppDataStore();
  const fakeNode = () => ({
    value: '', files: [], dataset: {}, style: {}, children: [],
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, appendChild(child) { return child; }, setAttribute() {}, removeAttribute() {},
    querySelector: () => null, querySelectorAll: () => []
  });
  const elements = new Proxy({}, { get: (nodes, name) => (nodes[name] ||= fakeNode()) });
  const saved = [];
  const quiet = { warn() {}, error() {}, log() {} };
  const base = {
    ...createShellState(),
    runtimeConfigAccess: access,
    runtimeAppDataStore: appDataStore,
    liveConversationsBridge: createLiveConversationsBridge({
      getConversations: () => appDataStore.getConversations(),
      replaceConversations: (next) => appDataStore.replaceConversations(next)
    }),
    window: {}, document: { body: fakeNode(), createElement: fakeNode, querySelectorAll: () => [] },
    elements, i18n: { en: {}, 'zh-TW': {} }, models: [], console: quiet, logger: quiet,
    crypto: { randomUUID: () => 'id' }, setTimeout: (callback) => callback(), requestAnimationFrame: (callback) => callback(),
    processInChunks: async (items, processItem) => { for (const item of items) await processItem(item); },
    getBackupUsername: (rawData) => rawData.backup_identity.username,
    createPasswordRecord: async (username) => ({ username }),
    getUserKey: (username) => `chatUser_${username}`,
    saveAppData: async () => saved.push(['appData', appDataStore.getConversations().map((item) => item.id)]),
    saveConfig: async () => saved.push(['config', store.getConfig().uiLanguage])
  };
  // Everything else the features take is a no-op here.
  const features = createWorkspaceFeatures(new Proxy(base, { get: (deps, name) => (name in deps ? deps[name] : async () => {}) }));
  // The settings are replaced after the features were made.
  store.replaceConfig({ ...store.getConfig(), uiLanguage: 'en' });
  elements.usernameInput.value = 'alice';
  elements.importFileInputAuth.files = [{
    name: 'backup.json',
    type: 'application/json',
    text: async () => JSON.stringify({
      backup_identity: { username: 'alice' },
      conversations: [{ id: 'c1', messages: [] }],
      settings: { uiLanguage: 'fr' }
    })
  }];

  await features.processAuthImport();

  assert.equal(store.getConfig().uiLanguage, 'fr');
  assert.deepEqual(saved, [['appData', ['c1']], ['config', 'fr']]);
});
