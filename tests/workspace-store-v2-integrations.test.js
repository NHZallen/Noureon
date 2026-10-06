import assert from 'node:assert/strict';
import test from 'node:test';

import { PENDING_CLOUD_LINK_KEY, completePendingCloudAccountLink, markPendingCloudAccountLink } from '../src/app/auth/account-linking.js';
import { createLegacyRuntimeAppDataPersistence } from '../src/app/runtime/kernel/app-data-persistence.js';
import { removeStoredUserWorkspace } from '../src/app/runtime/kernel/user-data-retention.js';
import { createWorkspaceStoreV2 } from '../src/app/runtime/kernel/workspace-store-v2.js';
import { setActiveWorkspaceStore } from '../src/app/runtime/kernel/workspace-store-registry.js';
import { getCloudSyncJournalKey } from '../src/app/sync/cloud-sync-journal.js';
import { repairCloudWorkspaceGeneratedImageKeys } from '../src/app/sync/cloud-workspace-image-repair.js';
import { initializeMemorySummaryCloudSync } from '../src/app/sync/memory-summary-cloud-sync.js';

const quiet = { warn() {}, error() {}, info() {} };

function createFakeStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  const applies = [];
  return {
    values,
    applies,
    async getItem(key) { return values.has(key) ? values.get(key) : null; },
    async readItems(keys) { return keys.map(key => (values.has(key) ? values.get(key) : null)); },
    async setItem(key, value) { values.set(key, value); },
    async removeItem(key) { values.delete(key); },
    async setItemsAtomic(entries) { for (const { key, value } of entries) values.set(key, value); },
    async applyAtomic({ puts = [], removes = [] } = {}) {
      applies.push({ puts: puts.map(entry => entry.key), removes });
      for (const { key, value } of puts) values.set(key, value);
      for (const key of removes) values.delete(key);
    },
    async getKeys() { return [...values.keys()]; },
    async removeItemsByPrefix(prefix) { for (const key of [...values.keys()]) if (key.startsWith(prefix)) values.delete(key); }
  };
}

const image = (username, id, storageKey) => ({ generatedImage: { id, storageKey: storageKey || `generatedImage:${username}:${id}`, mediaType: 'image/png' } });
const conversation = (id, parts = [{ text: 'hi' }], extra = {}) => ({ id, title: id, createdAt: '2026-10-01T00:00:00.000Z', messages: [{ id: `${id}-1`, role: 'model', parts }], ...extra });

test('image key repair in the split store rewrites only the repaired conversations and marks the journal in the same transaction', async () => {
  const username = 'supabase:user-1';
  const storage = createFakeStorage({ [`generatedImage:old-owner:img-2`]: new Blob(['x']) });
  const store = createWorkspaceStoreV2({ storage, username, logger: quiet });
  await store.save({
    conversations: [conversation('c1'), conversation('c2', [image(username, 'img-2', 'generatedImage:old-owner:img-2')]), conversation('c3')],
    folders: [{ id: 'f1' }],
    astras: [],
    memoryState: { version: 2 }
  });
  const before = storage.applies.length;

  const result = await repairCloudWorkspaceGeneratedImageKeys({
    storage,
    username,
    appDataKey: 'unused',
    workspaceStore: store,
    withExclusive: callback => callback()
  });

  assert.equal(result.changed, true);
  assert.equal(storage.applies.length, before + 1, 'one transaction');
  assert.deepEqual(storage.applies.at(-1).puts.sort(), [getCloudSyncJournalKey(username), 'chatWS2:supabase%3Auser-1:conv:c2', 'chatWS2:supabase%3Auser-1:meta']);
  const repaired = JSON.parse(storage.values.get('chatWS2:supabase%3Auser-1:conv:c2'));
  assert.equal(repaired.messages[0].parts[0].generatedImage.storageKey, `generatedImage:${username}:img-2`);
  const journal = JSON.parse(storage.values.get(getCloudSyncJournalKey(username)));
  assert.equal(journal.dirty, true);
  assert.deepEqual(journal.dirtyEntities.conversations, ['c2']);
  assert.ok(storage.values.get(`generatedImage:${username}:img-2`), 'the image was copied to the key it is now referenced by');
});

test('image key repair in the split store writes nothing when nothing needs repair, and does nothing without a split workspace', async () => {
  const username = 'supabase:user-1';
  const storage = createFakeStorage();
  const store = createWorkspaceStoreV2({ storage, username, logger: quiet });
  assert.deepEqual(await repairCloudWorkspaceGeneratedImageKeys({ storage, username, appDataKey: 'unused', workspaceStore: store, withExclusive: cb => cb() }), { changed: false });

  await store.save({ conversations: [conversation('c1', [image(username, 'img-1')])], folders: [], astras: [] });
  const writes = storage.applies.length;
  assert.deepEqual(await repairCloudWorkspaceGeneratedImageKeys({ storage, username, appDataKey: 'unused', workspaceStore: store, withExclusive: cb => cb() }), { changed: false });
  assert.equal(storage.applies.length, writes);
});

test('the memory summary sync reads only the memory record of the split store, never the conversations or the old item', async () => {
  const storage = createFakeStorage();
  const store = createWorkspaceStoreV2({ storage, username: 'supabase:user-1', logger: quiet });
  await store.save({
    conversations: [conversation('c1'), conversation('c2')],
    folders: [],
    astras: [],
    memoryState: {
      memorySummary: { overview: 'Current setup.', updatedAt: '2026-07-29T00:00:00.000Z', sections: [{ id: 'deploy', title: 'Deployment', content: 'NUC', updatedAt: '2026-07-29T00:00:00.000Z' }] }
    }
  });
  const reads = [];
  const watched = { ...storage, getItem: async key => { reads.push(key); return storage.getItem(key); } };
  const writes = [];
  const supabase = {
    from() { return { select() { return this; }, async eq() { return { data: [], error: null }; } }; },
    async rpc(name, { p_rows: records }) { writes.push(records); return { data: records, error: null }; },
    channel() { return { on() { return this; }, subscribe() { return this; } }; },
    async removeChannel() {}
  };
  const listeners = new Map();
  const window = {
    navigator: { onLine: true },
    CustomEvent: class { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type) { listeners.delete(type); },
    dispatchEvent() {},
    setTimeout,
    clearTimeout
  };
  const sync = initializeMemorySummaryCloudSync({
    window,
    storage: watched,
    supabase,
    user: { id: 'user-1' },
    username: 'supabase:user-1',
    appDataKey: 'chatAppData_v8.6_supabase:user-1',
    getWorkspaceStore: () => store,
    logger: quiet
  });
  await sync.ready;
  await sync.flush();

  assert.ok(writes.length > 0, 'the local memory summary was uploaded');
  assert.equal(reads.includes('chatAppData_v8.6_supabase:user-1'), false, 'the old item was not read');
  assert.equal(reads.some(key => key.includes(':conv:')), false, 'no conversation was read');
});

test('account linking moves a split workspace to the cloud user, repairs its image keys, and removes the local user\'s records', async () => {
  const storage = createFakeStorage({ 'generatedImage:alice:img-1': new Blob(['image']) });
  const local = createWorkspaceStoreV2({ storage, username: 'alice', logger: quiet });
  await local.save({
    conversations: [conversation('c1', [image('alice', 'img-1')]), conversation('c2')],
    folders: [{ id: 'f1' }],
    astras: [],
    memoryState: { version: 2 }
  });
  await markPendingCloudAccountLink(storage, { username: 'alice' });

  const completed = await completePendingCloudAccountLink({
    storage,
    cloudUserRecord: { username: 'supabase:user-123', email: 'alice@example.com', authProvider: 'supabase' }
  });

  assert.equal(completed, true);
  const cloud = createWorkspaceStoreV2({ storage, username: 'supabase:user-123', logger: quiet });
  const loaded = await cloud.load();
  assert.equal(loaded.state, 'ready');
  assert.deepEqual(loaded.workspace.conversations.map(item => item.id), ['c1', 'c2']);
  assert.equal(loaded.workspace.conversations[0].messages[0].parts[0].generatedImage.storageKey, 'generatedImage:supabase:user-123:img-1');
  assert.deepEqual(loaded.workspace.folders, [{ id: 'f1' }]);
  assert.equal([...storage.values.keys()].some(key => key.startsWith('chatWS2:alice:')), false, 'the local user\'s records are gone');
  assert.equal(storage.values.has(PENDING_CLOUD_LINK_KEY), false);
});

test('account linking still works for a local user that never had a split workspace', async () => {
  const storage = createFakeStorage({ 'chatAppData_v8.6_alice': JSON.stringify({ conversations: [] }) });
  await markPendingCloudAccountLink(storage, { username: 'alice' });
  assert.equal(await completePendingCloudAccountLink({ storage, cloudUserRecord: { username: 'supabase:user-9', authProvider: 'supabase' } }), true);
  assert.equal(storage.values.has('chatAppData_v8.6_supabase:user-9'), true);
  assert.equal([...storage.values.keys()].some(key => key.startsWith('chatWS2:')), false);
});

test('removing a user\'s stored workspace removes the split records of that user only', async () => {
  const storage = createFakeStorage();
  await createWorkspaceStoreV2({ storage, username: 'a', logger: quiet }).save({ conversations: [conversation('c1')] });
  await createWorkspaceStoreV2({ storage, username: 'a_b', logger: quiet }).save({ conversations: [conversation('c2')] });
  await removeStoredUserWorkspace({ username: 'a', removeItem: key => storage.removeItem(key), storageAdapter: storage });
  assert.deepEqual([...storage.values.keys()].filter(key => key.startsWith('chatWS2:')).every(key => key.startsWith('chatWS2:a_b:')), true);
  assert.ok(storage.values.has('chatWS2:a_b:meta'));
});

test('persistence finds the split store of the signed-in user in the registry when it is not given one', async () => {
  const storage = createFakeStorage();
  const store = createWorkspaceStoreV2({ storage, username: 'alice', logger: quiet });
  setActiveWorkspaceStore('alice', store);
  try {
    const persistence = createLegacyRuntimeAppDataPersistence({
      getCurrentUser: () => ({ username: 'alice', authProvider: 'local' }),
      getAppData: () => ({ conversations: [conversation('c1')], folders: [], astras: [], personalMemories: [] }),
      getAppDataKey: () => 'chatAppData_v8.6_alice',
      setItem: async () => assert.fail('the old item must not be written for a split workspace'),
      logger: quiet
    });
    await persistence.saveAppData();
    assert.ok(storage.values.has('chatWS2:alice:conv:c1'));

    setActiveWorkspaceStore('alice', null);
    const written = [];
    const plain = createLegacyRuntimeAppDataPersistence({
      getCurrentUser: () => ({ username: 'alice', authProvider: 'local' }),
      getAppData: () => ({ conversations: [], folders: [], astras: [], personalMemories: [] }),
      getAppDataKey: () => 'chatAppData_v8.6_alice',
      setItem: async key => written.push(key),
      logger: quiet
    });
    await plain.saveAppData();
    assert.deepEqual(written, ['chatAppData_v8.6_alice']);
  } finally {
    setActiveWorkspaceStore('alice', null);
  }
});
