import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createLegacyRuntimeAppDataPersistence } from '../src/app/runtime/kernel/app-data-persistence.js';
import { createLegacyRuntimeAppDataStore } from '../src/app/runtime/kernel/app-data-store.js';
import { withWorkspaceStorageExclusive } from '../src/app/sync/workspace-storage-coordinator.js';

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('serialized app data persistence writes the latest store snapshot for the latest user', async () => {
  const calls = [];
  let currentUser = null;
  const appDataStore = createLegacyRuntimeAppDataStore({
    initialConversations: [{ id: 'initial-conv' }]
  });
  const persistence = createLegacyRuntimeAppDataPersistence({
    getCurrentUser: () => currentUser,
    getAppData: () => appDataStore.getSnapshot(),
    getAppDataKey: () => `chatAppData_v8.6_${currentUser.username}`,
    setItem: async (key, value) => calls.push([key, value])
  });

  await persistence.saveAppData();
  assert.deepEqual(calls, []);

  currentUser = { username: 'alice' };
  await persistence.saveAppData();
  assert.deepEqual(calls, [[
    'chatAppData_v8.6_alice',
    JSON.stringify({
      conversations: [{ id: 'initial-conv' }],
      folders: [],
      astras: [],
      personalMemories: []
    })
  ]]);

  currentUser = { username: 'bob' };
  const nextConversations = [{ id: 'next-conv' }];
  const nextFolders = [{ id: 'folder-1' }];
  const nextAstras = [{ id: 'astra-1' }];
  const nextPersonalMemories = [{ id: 'memory-1' }];
  appDataStore.replaceAll({
    conversations: nextConversations,
    folders: nextFolders,
    astras: nextAstras,
    personalMemories: nextPersonalMemories
  });
  nextConversations.push({ id: 'pushed-conv' });
  nextFolders.push({ id: 'pushed-folder' });
  nextAstras.push({ id: 'pushed-astra' });
  nextPersonalMemories.push({ id: 'pushed-memory' });
  await persistence.saveAppData();

  const expectedSnapshot = {
    conversations: [{ id: 'next-conv' }, { id: 'pushed-conv' }],
    folders: [{ id: 'folder-1' }],
    astras: [{ id: 'astra-1' }, { id: 'pushed-astra' }],
    personalMemories: [{ id: 'memory-1' }, { id: 'pushed-memory' }]
  };
  expectedSnapshot.folders.push({ id: 'pushed-folder' });

  assert.deepEqual(calls[1], [
    'chatAppData_v8.6_bob',
    JSON.stringify(expectedSnapshot)
  ]);
  assert.deepEqual(Object.keys(JSON.parse(calls[1][1])), [
    'conversations',
    'folders',
    'astras',
    'personalMemories'
  ]);
  assert.equal('activeConversationId' in JSON.parse(calls[1][1]), false);
});

test('production saveAppData wiring reads the store snapshot at save time', () => {
  const source = readSource('src/app/runtime/legacy-core/legacy-core.js');

  assert.match(source, /getAppData:\s*\(\)\s*=>\s*runtimeAppDataStore\.getSnapshot\(\)/);
  assert.doesNotMatch(
    source,
    /getAppData:\s*\(\)\s*=>\s*\(\{\s*conversations,\s*folders,\s*astras,\s*personalMemories\s*\}\)/
  );
});

test('queued persistence reads its snapshot only after entering the storage critical section', async () => {
  let release;
  let markEntered;
  const entered = new Promise(resolve => { markEntered = resolve; });
  const blocker = withWorkspaceStorageExclusive(() => {
    markEntered();
    return new Promise(resolve => { release = resolve; });
  });
  await entered;
  let snapshot = { conversations: [{ id: 'old' }] };
  const writes = [];
  const persistence = createLegacyRuntimeAppDataPersistence({
    getCurrentUser: () => ({ username: 'alice' }),
    getAppData: () => snapshot,
    getAppDataKey: () => 'chatAppData_v8.6_alice',
    setItem: async (key, value) => writes.push([key, JSON.parse(value)])
  });

  const saving = persistence.saveAppData();
  snapshot = { conversations: [{ id: 'new' }] };
  release();
  await blocker;
  await saving;

  assert.equal(writes[0][1].conversations[0].id, 'new');
});

test('missing user does not read key, app data, or storage adapter', async () => {
  const persistence = createLegacyRuntimeAppDataPersistence({
    getCurrentUser: () => null,
    getAppData: () => assert.fail('missing user should not read app data'),
    getAppDataKey: () => assert.fail('missing user should not read app data key'),
    setItem: async () => assert.fail('missing user should not write storage')
  });

  await persistence.saveAppData();
});

test('successful local persistence hands the exact saved snapshot to shadow sync', async () => {
  const snapshot = { conversations: [{ id: 'conversation-1' }], folders: [], astras: [], personalMemories: [] };
  const calls = [];
  const persistence = createLegacyRuntimeAppDataPersistence({
    getCurrentUser: () => ({ username: 'alice' }),
    getAppData: () => snapshot,
    getAppDataKey: () => 'chatAppData_v8.6_alice',
    setItem: async () => calls.push('saved'),
    onSaved: value => calls.push(value)
  });

  await persistence.saveAppData();

  assert.deepEqual(calls, ['saved', snapshot]);
});

test('serialized app data persistence preserves rejection and stringify error boundaries', async () => {
  const setItemError = new Error('storage failed');
  const rejectingPersistence = createLegacyRuntimeAppDataPersistence({
    getCurrentUser: () => ({ username: 'alice' }),
    getAppData: () => ({
      conversations: [],
      folders: [],
      astras: [],
      personalMemories: []
    }),
    getAppDataKey: () => 'chatAppData_v8.6_alice',
    setItem: async () => { throw setItemError; }
  });

  await assert.rejects(() => rejectingPersistence.saveAppData(), setItemError);

  const circular = {};
  circular.self = circular;
  const circularPersistence = createLegacyRuntimeAppDataPersistence({
    getCurrentUser: () => ({ username: 'alice' }),
    getAppData: () => ({
      conversations: [circular],
      folders: [],
      astras: [],
      personalMemories: []
    }),
    getAppDataKey: () => 'chatAppData_v8.6_alice',
    setItem: async () => assert.fail('circular app data should fail before storage write')
  });

  await assert.rejects(
    () => circularPersistence.saveAppData(),
    /circular structure|Converting circular/i
  );
});

test('serialized app data persistence exposes only saveAppData and avoids storage reader ownership', () => {
  const persistence = createLegacyRuntimeAppDataPersistence({
    getCurrentUser: () => null,
    getAppData: () => ({}),
    getAppDataKey: () => '',
    setItem: async () => {}
  });
  const source = readSource('src/app/runtime/kernel/app-data-persistence.js');

  assert.deepEqual(Object.keys(persistence), ['saveAppData']);
  assert.equal(typeof persistence.saveAppData, 'function');
  assert.match(source, /export\s+function\s+createLegacyRuntimeAppDataPersistence/);
  assert.doesNotMatch(source, /loadAppData|getItem|removeItem|openDB|indexedDB|localStorage|sessionStorage/);
  assert.doesNotMatch(source, /try\s*\{|catch\s*\(/);
  assert.doesNotMatch(source, /showNotification|renderAll|toggleModal|initChatApp|initializeApp/);
});
