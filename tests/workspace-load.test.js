import assert from 'node:assert/strict';
import test from 'node:test';

import { createWorkspaceLoad } from '../src/app/runtime/legacy-core/workspace-load.js';

const EMPTY = { conversations: [], folders: [], astras: [], personalMemories: [] };

function harness({ user = { username: 'alice' }, items = {}, split = null, config = { uiLanguage: 'en' } } = {}) {
  const log = [];
  let current = config;
  let data = null;
  const deps = {
    getCurrentUser: () => user,
    storage: {
      getItem: async (key) => { log.push(['get', key]); return items[key] ?? null; },
      removeItem: async (key) => log.push(['remove', key])
    },
    configAccess: {
      getConfig: () => current,
      replaceConfig: (next) => { log.push('replaceConfig'); current = next; },
      mutateConfig: (next) => { log.push('mutateConfig'); current = next; }
    },
    appDataStore: { replaceAll: (next) => { data = next; }, getFolders: () => data?.folders || [] },
    sensitiveConfigPersistence: { loadSensitiveConfig: async () => log.push('loadSensitive') },
    getConfigKey: () => 'config-key',
    getAppDataKey: () => 'data-key',
    mergeSensitiveApiKeys: (keys) => log.push(['mergeKeys', keys]),
    saveSensitiveConfig: async () => log.push('saveSensitive'),
    saveConfig: async () => log.push('saveConfig'),
    normalizeCouncilConfig: (council) => council || { enabled: false },
    normalizeConversationModel: () => null,
    getCouncilTranslatorCandidates: () => [],
    getSingleTranslatorCandidates: () => [],
    getFolderUiStatePersistence: async () => ({ restore: async (folders) => log.push(['restoreFolders', folders.length]) }),
    showNotification: (...args) => log.push(['notify', ...args]),
    loadSplit: async (options) => { log.push(['split', options.user.username, Object.keys(options.context).sort()]); return split; }
  };
  return { log, deps, config: () => current, data: () => data, load: createWorkspaceLoad(deps) };
}

test('nothing is read before someone is signed in', async () => {
  const h = harness({ user: null });
  await h.load.loadConfig();
  await h.load.loadAppData();
  assert.deepEqual(h.log, []);
});

test('saved settings: keys go to the key store, the rest is normalized and replaces the settings', async () => {
  const saved = { uiLanguage: 'fr', apiKeys: { gemini: 'secret' }, defaultModel: 'x' };
  const h = harness({ items: { 'config-key': JSON.stringify(saved) } });
  await h.load.loadConfig();
  assert.deepEqual(h.log.slice(0, 4), ['loadSensitive', ['get', 'config-key'], ['mergeKeys', { gemini: 'secret' }], 'saveSensitive']);
  assert.ok(h.log.includes('replaceConfig'));
  assert.ok(!h.log.includes('mutateConfig'));
  assert.equal(h.config().uiLanguage, 'fr');
  assert.equal(JSON.stringify(h.config()).includes('secret'), false, 'no key is left in the settings');
});

test('no saved settings: the current ones are normalized in place; unreadable ones are an error', async () => {
  const h = harness();
  await h.load.loadConfig();
  assert.ok(h.log.includes('mutateConfig'));
  assert.ok(!h.log.includes('replaceConfig'));

  const broken = harness({ items: { 'config-key': '{nope' } });
  await assert.rejects(broken.load.loadConfig(), SyntaxError);
});

test('the split workspace is read first, with what it needs to normalize', async () => {
  const h = harness({ split: { data: { ...EMPTY, folders: [{ id: 'f' }] } } });
  await h.load.loadAppData();
  assert.deepEqual(h.log[0], ['split', 'alice', ['getDefaultFolder', 'getDefaultGenConfig', 'normalizeConversationModel', 'normalizeCouncilConfig', 'runtimeConfigAccess']]);
  assert.deepEqual(h.log.slice(1), [['restoreFolders', 1]], 'the old single item is not read');
});

test('the old single item is the fallback; an unreadable one is reset and said', async () => {
  const conversation = { id: 'c', title: 'T', messages: [] };
  const h = harness({ items: { 'data-key': JSON.stringify({ conversations: [conversation], folders: [] }) } });
  await h.load.loadAppData();
  assert.equal(h.data().conversations[0].id, 'c');
  assert.deepEqual(h.log.at(-1), ['restoreFolders', 0]);

  const broken = harness({ items: { 'data-key': '{nope' } });
  const error = console.error;
  console.error = () => {};
  try {
    await broken.load.loadAppData();
  } finally {
    console.error = error;
  }
  assert.deepEqual(broken.data(), EMPTY);
  assert.ok(broken.log.some((entry) => entry[0] === 'notify' && entry[2] === 'error'));
  assert.ok(broken.log.some((entry) => entry[0] === 'remove' && entry[1] === 'data-key'));

  const none = harness();
  await none.load.loadAppData();
  assert.deepEqual(none.data(), EMPTY);
});
