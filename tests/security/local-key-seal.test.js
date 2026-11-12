import assert from 'node:assert/strict';
import test from 'node:test';

import { LocalKeyError, createLocalKeySeal, sealRuleOf } from '../../src/app/runtime/security/local-key-seal.js';
import { createRuntimeStorageAdapter } from '../../src/app/runtime/kernel/storage-adapter.js';

// A small IndexedDB: databases by name, each with object stores of rows by key path; enough for the storage adapter and the seal.
function fakeIndexedDB() {
  const databases = new Map();
  return {
    databases,
    open(name) {
      const request = {};
      queueMicrotask(() => {
        let database = databases.get(name);
        const fresh = !database;
        if (fresh) databases.set(name, database = { stores: new Map() });
        request.result = {
          createObjectStore(store, { keyPath }) { database.stores.set(store, { keyPath, rows: new Map() }); },
          transaction(storeName) {
            const store = database.stores.get(storeName);
            const transaction = {
              objectStore() {
                const asRequest = (run) => {
                  const idbRequest = {};
                  queueMicrotask(() => {
                    try { idbRequest.result = run(); idbRequest.onsuccess?.({ target: idbRequest }); } catch (error) { idbRequest.error = error; idbRequest.onerror?.({ target: idbRequest }); }
                  });
                  return idbRequest;
                };
                const finish = () => queueMicrotask(() => transaction.oncomplete?.());
                return {
                  get: (key) => asRequest(() => store.rows.get(key)),
                  getAllKeys: () => asRequest(() => [...store.rows.keys()]),
                  add: (entry) => asRequest(() => { if (store.rows.has(entry[store.keyPath])) throw new Error('ConstraintError'); store.rows.set(entry[store.keyPath], entry); }),
                  put: (entry) => { store.rows.set(entry[store.keyPath], entry); finish(); },
                  delete: (key) => { store.rows.delete(key); finish(); },
                  clear: () => asRequest(() => store.rows.clear())
                };
              }
            };
            return transaction;
          }
        };
        if (fresh) request.onupgradeneeded?.({ target: request });
        request.onsuccess?.({ target: request });
      });
      return request;
    }
  };
}

const KEY = 'chatSensitiveConfig_v1_supabase:user-1';
const PLAIN = JSON.stringify({ apiKeys: { gemini: 'AIzaSy-secret-gemini-key', openrouter: 'sk-or-secret' } });

test('only the keys that hold secrets are sealed', () => {
  assert.ok(sealRuleOf(KEY));
  assert.ok(sealRuleOf('chatSyncVaultRemembered_v1_supabase:user-1'));
  assert.equal(sealRuleOf('chatSyncVaultRemembered_v1_x').required, true, 'a remembered unlock is never kept as plain text');
  for (const other of ['chatAppData_v8.6_x', 'chatConfig_v_v8.6_x', 'chatSyncVault_v1_x', 'chat_lastUser']) assert.equal(sealRuleOf(other), null, other);
});

test('what is sealed is not readable from the storage, opens for the same key name only, and is a different text each time', async () => {
  const seal = createLocalKeySeal({ indexedDBFactory: fakeIndexedDB() });
  const first = await seal.seal(KEY, PLAIN);
  const second = await seal.seal(KEY, PLAIN);
  assert.match(first, /^nd1\./);
  assert.doesNotMatch(first, /AIzaSy|secret|gemini/);
  assert.notEqual(first, second);
  assert.deepEqual(await seal.open(KEY, first), { value: PLAIN, sealed: true });
  // Moved under another key name, the text does not open (the name is part of what is authenticated).
  const moved = await seal.open('chatSensitiveConfig_v1_supabase:user-2', first);
  assert.equal(moved.unreadable, true);
  assert.equal(moved.value, null);
});

test('a text kept before the seal existed is read as it is and said not to be sealed', async () => {
  const seal = createLocalKeySeal({ indexedDBFactory: fakeIndexedDB() });
  assert.deepEqual(await seal.open(KEY, PLAIN), { value: PLAIN, sealed: false });
  assert.deepEqual(await seal.open('chatAppData_v8.6_x', 'anything'), { value: 'anything', sealed: false });
  assert.deepEqual(await seal.open(KEY, null), { value: null, sealed: false });
});

test('where the browser cannot keep a key of its own the keys are kept as before, but a remembered unlock is not kept at all', async () => {
  const seal = createLocalKeySeal({ indexedDBFactory: null });
  assert.equal(await seal.available(), false);
  assert.equal(await seal.seal(KEY, PLAIN), PLAIN);
  await assert.rejects(seal.seal('chatSyncVaultRemembered_v1_x', 'AAAA'), (error) => error instanceof LocalKeyError && error.code === 'local-seal-unavailable');
  const failing = createLocalKeySeal({ indexedDBFactory: { open() { const request = {}; queueMicrotask(() => request.onerror?.()); request.error = new Error('private window'); return request; } } });
  assert.equal(await failing.available(), false);
  assert.equal(await failing.seal(KEY, PLAIN), PLAIN);
});

test('when the key of the device is gone, the sealed text is unreadable, the app is told, and it is read as missing', async () => {
  const idb = fakeIndexedDB();
  const told = [];
  const seal = createLocalKeySeal({ indexedDBFactory: idb, onUnreadable: (key) => told.push(key) });
  const sealed = await seal.seal(KEY, PLAIN);
  idb.databases.get('NoureonDeviceKey').stores.get('keys').rows.clear(); // the browser's data was cleared in part
  const afterwards = createLocalKeySeal({ indexedDBFactory: idb, onUnreadable: (key) => told.push(key) });
  assert.deepEqual(await afterwards.open(KEY, sealed), { value: null, sealed: true, unreadable: true });
  assert.deepEqual(told, [KEY]);
});

test('the storage adapter seals the keys on the way in and opens them on the way out, and leaves every other key alone', async () => {
  const idb = fakeIndexedDB();
  const adapter = createRuntimeStorageAdapter({ indexedDBFactory: idb });
  await adapter.setItem(KEY, PLAIN);
  await adapter.setItem('chatConfig_v_v8.6_x', 'plain-config');
  const rows = idb.databases.get('ChatAppDB').stores.get('keyValue').rows;
  assert.match(rows.get(KEY).value, /^nd1\./, 'what is on disk is sealed');
  assert.equal(rows.get('chatConfig_v_v8.6_x').value, 'plain-config');
  assert.equal(await adapter.getItem(KEY), PLAIN);
  assert.deepEqual(await adapter.readItems([KEY, 'chatConfig_v_v8.6_x', 'missing']), [PLAIN, 'plain-config', null]);

  await adapter.setItemsAtomic([{ key: KEY, value: JSON.stringify({ apiKeys: { gemini: 'changed' } }) }, { key: 'other', value: 'x' }]);
  assert.match(rows.get(KEY).value, /^nd1\./);
  assert.equal(JSON.parse(await adapter.getItem(KEY)).apiKeys.gemini, 'changed');
});

test('a plain text kept by an older version is read, and sealed in the background', async () => {
  const idb = fakeIndexedDB();
  const adapter = createRuntimeStorageAdapter({ indexedDBFactory: idb });
  await adapter.openDB();
  const rows = idb.databases.get('ChatAppDB').stores.get('keyValue').rows;
  rows.set(KEY, { key: KEY, value: PLAIN });
  assert.equal(await adapter.getItem(KEY), PLAIN);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.match(rows.get(KEY).value, /^nd1\./, 'it is sealed now');
  assert.equal(await adapter.getItem(KEY), PLAIN);
});

test('with no key of the device the adapter keeps the keys as before, and refuses to keep a remembered unlock', async () => {
  const adapter = createRuntimeStorageAdapter({ indexedDBFactory: fakeIndexedDB(), seal: createLocalKeySeal({ indexedDBFactory: null }) });
  await adapter.setItem(KEY, PLAIN);
  assert.equal(await adapter.getItem(KEY), PLAIN);
  await assert.rejects(adapter.setItem('chatSyncVaultRemembered_v1_x', 'AAAA'), /key of its own/);
  assert.equal(await adapter.getItem('chatSyncVaultRemembered_v1_x'), null);
});

test('two adapters of one browser use the same key of the device, so what one seals the other opens', async () => {
  const idb = fakeIndexedDB();
  const one = createRuntimeStorageAdapter({ indexedDBFactory: idb });
  const two = createRuntimeStorageAdapter({ indexedDBFactory: idb });
  await one.setItem(KEY, PLAIN);
  assert.equal(await two.getItem(KEY), PLAIN);
});
