import assert from 'node:assert/strict';
import test from 'node:test';

import { MAX_MIGRATION_ATTEMPTS, WS2_FLAG_KEY, isWorkspaceV2Enabled, selectWorkspaceStorage } from '../src/app/runtime/kernel/workspace-storage-selection.js';
import { loadSplitWorkspace } from '../src/app/runtime/kernel/workspace-loading.js';
import { getActiveWorkspaceStore, setActiveWorkspaceStore } from '../src/app/runtime/kernel/workspace-store-registry.js';
import { createWorkspaceStoreV2 } from '../src/app/runtime/kernel/workspace-store-v2.js';

const LEGACY_KEY = 'chatAppData_v8.6_alice';
const quiet = { warn() {}, error() {}, info() {} };

function createFakeStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  const hooks = { failApply: null };
  return {
    values,
    hooks,
    applies: [],
    async getItem(key) { return values.has(key) ? values.get(key) : null; },
    async readItems(keys) { return keys.map(key => (values.has(key) ? values.get(key) : null)); },
    async applyAtomic({ puts = [], removes = [] } = {}) {
      if (hooks.failApply?.({ puts, removes })) throw new Error('quota exceeded');
      this.applies.push({ puts: puts.map(entry => entry.key), removes });
      for (const { key, value } of puts) values.set(key, value);
      for (const key of removes) values.delete(key);
    },
    async getKeys() { return [...values.keys()]; },
    async removeItemsByPrefix(prefix) { for (const key of [...values.keys()]) if (key.startsWith(prefix)) values.delete(key); }
  };
}

const conversation = (id, extra = {}) => ({ id, title: id, createdAt: '2026-10-01T00:00:00.000Z', lastUpdatedAt: '2026-10-01T00:00:00.000Z', messages: [{ id: `${id}-1`, role: 'user', parts: [{ text: 'hi' }] }], ...extra });
const legacyWorkspace = (...ids) => ({ conversations: ids.map(id => conversation(id)), folders: [{ id: 'f1' }], astras: [], personalMemories: [], memoryState: { version: 2 } });
const select = (storage, enabled, overrides = {}) => selectWorkspaceStorage({ storage, username: 'alice', legacyKey: LEGACY_KEY, enabled, logger: quiet, ...overrides });

function createFlagEnvironment(search = '', stored = null) {
  const values = new Map(stored === null ? [] : [[WS2_FLAG_KEY, stored]]);
  return {
    values,
    location: { search },
    localStorage: { getItem: key => (values.has(key) ? values.get(key) : null), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
  };
}

test('?ws2=1 turns the split storage on and the browser remembers it; ?ws2=0 turns it off; nothing in the address leaves it as it was', () => {
  const environment = createFlagEnvironment('?ws2=1');
  assert.equal(isWorkspaceV2Enabled(environment), true);
  assert.equal(environment.values.get(WS2_FLAG_KEY), '1');

  environment.location.search = '';
  assert.equal(isWorkspaceV2Enabled(environment), true, 'remembered');
  environment.location.search = '?other=1&ws2=0';
  assert.equal(isWorkspaceV2Enabled(environment), false);
  environment.location.search = '';
  assert.equal(isWorkspaceV2Enabled(environment), false, 'forgotten');
  assert.equal(isWorkspaceV2Enabled(createFlagEnvironment('', null)), false, 'off by default');
});

test('an unavailable address or storage means the split storage is off, never an error', () => {
  assert.equal(isWorkspaceV2Enabled({ location: undefined, localStorage: undefined }), false);
  const blocked = { location: { search: '?ws2=1' }, localStorage: { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } } };
  assert.equal(isWorkspaceV2Enabled(blocked), false);
});

test('with the switch off and no split store, the old item is used and nothing is written', async () => {
  const storage = createFakeStorage({ [LEGACY_KEY]: JSON.stringify(legacyWorkspace('c1')) });
  assert.deepEqual(await select(storage, false), { mode: 'legacy', reason: 'not-enabled' });
  assert.equal(storage.applies.length, 0);
});

test('with the switch on, the old item is migrated and the migrated workspace is returned, the old item untouched', async () => {
  const legacy = JSON.stringify(legacyWorkspace('c1', 'c2'));
  const storage = createFakeStorage({ [LEGACY_KEY]: legacy });
  const result = await select(storage, true);
  assert.equal(result.mode, 'v2');
  assert.equal(result.migration.state, 'migrated');
  assert.deepEqual(result.loaded.workspace, JSON.parse(legacy));
  assert.equal(storage.values.get(LEGACY_KEY), legacy);
});

test('a user who already has a split store keeps using it with the switch off, because the old item is frozen', async () => {
  const storage = createFakeStorage({ [LEGACY_KEY]: JSON.stringify(legacyWorkspace('c1')) });
  await select(storage, true);
  const store = createWorkspaceStoreV2({ storage, username: 'alice', logger: quiet });
  await store.save({ ...legacyWorkspace('c1', 'c2') });
  const result = await select(storage, false);
  assert.equal(result.mode, 'v2');
  assert.deepEqual(result.loaded.workspace.conversations.map(item => item.id), ['c1', 'c2']);
});

test('a new account with the switch on starts in the split store without writing anything yet', async () => {
  const storage = createFakeStorage();
  const result = await select(storage, true);
  assert.equal(result.mode, 'v2');
  assert.deepEqual(result.loaded, { state: 'absent' });
  assert.equal(storage.applies.length, 0);
});

test('the disabled marker sends the user back to the old item', async () => {
  const storage = createFakeStorage({ [LEGACY_KEY]: JSON.stringify(legacyWorkspace('c1')) });
  await select(storage, true);
  await createWorkspaceStoreV2({ storage, username: 'alice', logger: quiet }).setDisabled(true);
  assert.deepEqual(await select(storage, true), { mode: 'legacy', reason: 'disabled' });
});

test('a split store whose index cannot be read is left alone and the old item is used', async () => {
  const storage = createFakeStorage({ [LEGACY_KEY]: JSON.stringify(legacyWorkspace('c1')), 'chatWS2:alice:meta': '{broken' });
  const result = await select(storage, true);
  assert.deepEqual(result, { mode: 'legacy', reason: 'unusable-corrupt' });
  assert.equal(storage.values.get('chatWS2:alice:meta'), '{broken');
});

test('a failed migration keeps the old item in use, is retried at later starts, and is given up after the allowed attempts', async () => {
  const storage = createFakeStorage({ [LEGACY_KEY]: JSON.stringify(legacyWorkspace('c1')) });
  storage.hooks.failApply = ({ puts }) => puts.some(entry => entry.key.endsWith(':meta'));
  for (let attempt = 1; attempt <= MAX_MIGRATION_ATTEMPTS; attempt += 1) {
    const result = await select(storage, true);
    assert.equal(result.mode, 'legacy');
    assert.equal(result.reason, 'migration-failed');
    assert.equal(result.migration.attempts, attempt);
  }
  storage.hooks.failApply = null;
  assert.deepEqual(await select(storage, true), { mode: 'legacy', reason: 'migration-gave-up' }, 'no fourth attempt, even though it would now succeed');
  assert.equal([...storage.values.keys()].some(key => key.endsWith(':meta')), false);
});

test('a split store with an unreadable record still loads, reports it, and the damaged record stays', async () => {
  const storage = createFakeStorage({ [LEGACY_KEY]: JSON.stringify(legacyWorkspace('c1', 'c2')) });
  await select(storage, true);
  storage.values.set('chatWS2:alice:conv:c2', '{broken');
  const result = await select(storage, false);
  assert.equal(result.mode, 'v2');
  assert.equal(result.loaded.state, 'degraded');
  assert.deepEqual(result.loaded.problems.map(problem => problem.id), ['c2']);
  assert.equal(storage.values.get('chatWS2:alice:conv:c2'), '{broken');
});

test('what an older tab wrote to the old item after the migration is merged in when the workspace is loaded', async () => {
  const storage = createFakeStorage({ [LEGACY_KEY]: JSON.stringify(legacyWorkspace('c1')) });
  await select(storage, true);
  const stale = JSON.parse(storage.values.get(LEGACY_KEY));
  stale.conversations.unshift(conversation('c9'));
  storage.values.set(LEGACY_KEY, JSON.stringify(stale));
  const result = await select(storage, false);
  assert.deepEqual(result.loaded.workspace.conversations.map(item => item.id), ['c9', 'c1']);
});

test('anything unexpected while opening leaves the old item in use', async () => {
  const storage = createFakeStorage();
  const result = await select(storage, true, { createStore: () => { throw new Error('boom'); } });
  assert.deepEqual(result, { mode: 'legacy', reason: 'error' });
  const failing = await select(storage, true, { createStore: () => ({ isDisabled: async () => { throw new Error('read failed'); } }) });
  assert.deepEqual(failing, { mode: 'legacy', reason: 'error' });
});

test('the registry gives the store only to the user it was set for', () => {
  const store = { name: 'store' };
  setActiveWorkspaceStore('alice', store);
  assert.equal(getActiveWorkspaceStore('alice'), store);
  assert.equal(getActiveWorkspaceStore('bob'), null);
  setActiveWorkspaceStore('alice', null);
  assert.equal(getActiveWorkspaceStore('alice'), null);
});

test('loadSplitWorkspace returns the normalized workspace of a split store, registers the store, and returns null for the old item', async () => {
  const savedLocalStorage = globalThis.localStorage;
  const savedLocation = globalThis.location;
  const environment = createFlagEnvironment('', '1');
  globalThis.localStorage = environment.localStorage;
  globalThis.location = environment.location;
  try {
    const legacy = JSON.stringify(legacyWorkspace('c1', 'c2'));
    const storage = createFakeStorage({ [LEGACY_KEY]: legacy });
    const context = {
      getDefaultFolder: () => ({ color: 'gray' }),
      getDefaultGenConfig: () => ({ temperature: 0.7 }),
      runtimeConfigAccess: { getConfig: () => ({ lastCouncilConfig: null }) },
      normalizeCouncilConfig: value => value,
      normalizeConversationModel: value => value
    };
    const split = await loadSplitWorkspace({ storage, user: { username: 'alice' }, context, logger: quiet });
    assert.deepEqual(split.data.conversations.map(item => item.id), ['c1', 'c2']);
    assert.ok(getActiveWorkspaceStore('alice'));
    assert.equal(globalThis.__noureonWorkspaceStorage.mode, 'v2');

    environment.values.delete(WS2_FLAG_KEY);
    const plain = createFakeStorage({ [LEGACY_KEY]: legacy });
    assert.equal(await loadSplitWorkspace({ storage: plain, user: { username: 'alice' }, context, logger: quiet }), null);
    assert.equal(getActiveWorkspaceStore('alice'), null, 'a user on the old item has no registered store');
    assert.deepEqual(globalThis.__noureonWorkspaceStorage, { mode: 'legacy', reason: 'not-enabled', problems: [] });

    environment.values.set(WS2_FLAG_KEY, '1');
    const fresh = await loadSplitWorkspace({ storage: createFakeStorage(), user: { username: 'alice' }, context, logger: quiet });
    assert.deepEqual(fresh.data, { conversations: [], folders: [], astras: [], personalMemories: [] });
  } finally {
    globalThis.localStorage = savedLocalStorage;
    globalThis.location = savedLocation;
    setActiveWorkspaceStore('alice', null);
    delete globalThis.__noureonWorkspaceStorage;
  }
});
