import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createLegacyRuntimeAppDataPersistence } from '../src/app/runtime/kernel/app-data-persistence.js';

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('serialized app data persistence writes the latest app data for the latest user', async () => {
  const calls = [];
  let currentUser = null;
  let appData = {
    conversations: [{ id: 'initial-conv' }],
    folders: [],
    astras: [],
    personalMemories: []
  };
  const persistence = createLegacyRuntimeAppDataPersistence({
    getCurrentUser: () => currentUser,
    getAppData: () => appData,
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
  appData = {
    conversations: [{ id: 'next-conv' }],
    folders: [{ id: 'folder-1' }],
    astras: [{ id: 'astra-1' }],
    personalMemories: [{ id: 'memory-1' }]
  };
  await persistence.saveAppData();

  assert.deepEqual(calls[1], [
    'chatAppData_v8.6_bob',
    JSON.stringify(appData)
  ]);
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
