import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test, { afterEach } from 'node:test';

import { Window } from 'happy-dom';
import { createLocalKeySeal } from '../../src/app/runtime/security/local-key-seal.js';
import { createRuntimeStorageAdapter } from '../../src/app/runtime/kernel/storage-adapter.js';
import { createLocalKeyProtection } from '../../src/app/runtime/security/local-key-protection.js';
import { createSensitiveConfigPersistence } from '../../src/app/runtime/security/sensitive-config-store.js';
import { PROTECTION_PREFIX, readProtection } from '../../src/app/runtime/security/local-key-rules.js';
import {
  createAndUnlockSyncVault, getRememberedSyncVaultStorageKey, getUnlockedSyncVaultKey, isSyncVaultUnlocked, lockSyncVault, restoreRememberedSyncVault, setSyncVaultRememberPolicy
} from '../../src/app/sync/sync-vault.js';

// A small IndexedDB (databases of object stores), enough for the storage adapter and the seal.
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
                const asRequest = (run) => { const r = {}; queueMicrotask(() => { try { r.result = run(); r.onsuccess?.({ target: r }); } catch (error) { r.error = error; r.onerror?.({ target: r }); } }); return r; };
                const finish = () => queueMicrotask(() => transaction.oncomplete?.());
                return {
                  get: (key) => asRequest(() => store.rows.get(key)),
                  add: (entry) => asRequest(() => { if (store.rows.has(entry[store.keyPath])) throw new Error('ConstraintError'); store.rows.set(entry[store.keyPath], entry); }),
                  put: (entry) => { store.rows.set(entry[store.keyPath], entry); finish(); },
                  delete: (key) => { store.rows.delete(key); finish(); }
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

const USER = 'supabase:user-1';
const KEY = `chatSensitiveConfig_v1_${USER}`;
const KEYS = JSON.stringify({ apiKeys: { gemini: 'AIzaSy-secret-gemini', openrouter: 'sk-or-secret' } });

afterEach(() => { setSyncVaultRememberPolicy(null); lockSyncVault(USER); });

const fixture = async () => {
  const area = new Map();
  const localStorage = { getItem: (name) => area.get(name) ?? null, setItem: (name, value) => area.set(name, String(value)), removeItem: (name) => area.delete(name) };
  // The unlock is remembered the way the choice of this fake browser says (the page reads the real localStorage).
  setSyncVaultRememberPolicy((username) => { const protection = readProtection(username, localStorage); return !protection ? true : protection.days > 0 ? { days: protection.days } : false; });
  const idb = fakeIndexedDB();
  // The seal reads the protection and the vault key from the same places the page does.
  const seal = createLocalKeySeal({ indexedDBFactory: idb, getProtection: (username) => readProtection(username, localStorage), getVaultKey: (username) => getUnlockedSyncVaultKey(username) });
  const storage = createRuntimeStorageAdapter({ indexedDBFactory: idb, seal });
  const window = new Window();
  const events = [];
  for (const name of ['noureon:local-keys-locked', 'noureon:local-keys-changed', 'astra:sync-vault-unlocked']) window.addEventListener(name, (event) => events.push([name, event.detail?.username]));
  const protection = createLocalKeyProtection({ storage, getUsername: () => USER, area: localStorage, target: window });
  await createAndUnlockSyncVault({ storage, username: USER, password: 'a long sync password', cryptoProvider: webcrypto });
  await storage.setItem(KEY, KEYS);
  const rawOf = (name = KEY) => idb.databases.get('ChatAppDB').stores.get('keyValue').rows.get(name)?.value;
  return { storage, protection, window, events, rawOf, area, localStorage, idb };
};

test('turning the protection on seals the keys with the key of the vault, and they open only while the vault is unlocked', async () => {
  const { storage, protection, rawOf, events } = await fixture();
  assert.match(rawOf(), /^nd1\./, 'before: the key of the device');
  await protection.enable({ days: 7 });
  assert.match(rawOf(), /^nv1\./, 'after: the key of the vault');
  assert.doesNotMatch(rawOf(), /AIza|secret/);
  assert.equal(await storage.getItem(KEY), KEYS);
  assert.equal(protection.isLocked(), false);

  await protection.lockNow();
  assert.equal(isSyncVaultUnlocked(USER), false);
  assert.equal(protection.isLocked(), true);
  await assert.rejects(storage.getItem(KEY), (error) => error.code === 'local-keys-locked', 'locked is told, not taken for "no keys"');
  await assert.rejects(storage.setItem(KEY, JSON.stringify({ apiKeys: {} })), (error) => error.code === 'local-keys-locked', 'nothing is written over them');
  assert.match(rawOf(), /^nv1\./, 'what is kept is untouched');
  assert.ok(events.some(([name]) => name === 'noureon:local-keys-locked'));

  await protection.unlockWithPassword('a long sync password');
  assert.equal(await storage.getItem(KEY), KEYS);
  assert.ok(events.some(([name]) => name === 'astra:sync-vault-unlocked'));
});

test('turning it off seals the keys with the key of the device again, and needs the vault unlocked', async () => {
  const { storage, protection, rawOf } = await fixture();
  await protection.enable({ days: 3 });
  await protection.lockNow();
  await assert.rejects(protection.disable(), (error) => error.code === 'local-keys-locked');
  assert.equal(protection.isProtected(), true, 'still on, nothing was lost');
  await protection.unlockWithPassword('a long sync password');
  await protection.disable();
  assert.equal(protection.isProtected(), false);
  assert.match(rawOf(), /^nd1\./);
  assert.equal(await storage.getItem(KEY), KEYS);
  await assert.rejects(protection.enable({ days: 3 }).then(async () => { lockSyncVault(USER); await protection.enable(); }), (error) => error.code === 'local-keys-locked', 'on again needs the vault unlocked');
});

test('with protection on, the unlock is remembered for the days chosen, and not at all when it is asked at every visit', async () => {
  const { storage, protection, area } = await fixture();
  await protection.enable({ days: 3 });
  // The unlock of the fixture was remembered before; the protection gave it an end 3 days away.
  const kept = JSON.parse(await storage.getItem(getRememberedSyncVaultStorageKey(USER)));
  assert.ok(kept.exp > Date.now() + 2.9 * 86400000 && kept.exp < Date.now() + 3.1 * 86400000);
  lockSyncVault(USER);
  assert.equal(await restoreRememberedSyncVault({ storage, username: USER, cryptoProvider: webcrypto }), true, 'a new visit within the days opens it without asking');
  assert.equal(isSyncVaultUnlocked(USER), true);

  await protection.setDays(0);
  assert.equal(await storage.getItem(getRememberedSyncVaultStorageKey(USER)), null, 'every visit: nothing is remembered');
  lockSyncVault(USER);
  assert.equal(await restoreRememberedSyncVault({ storage, username: USER, cryptoProvider: webcrypto }), false);
  assert.equal(JSON.parse(area.get(`${PROTECTION_PREFIX}${USER}`)).days, 0);

  await protection.unlockWithPassword('a long sync password');
  assert.equal(await storage.getItem(getRememberedSyncVaultStorageKey(USER)), null, 'unlocking does not remember it either');
});

test('the days are over: the remembered unlock is dropped, and an open vault locks itself when asked', async () => {
  let clock = Date.now();
  const f = await fixture();
  const protection = createLocalKeyProtection({ storage: f.storage, getUsername: () => USER, area: f.localStorage, target: f.window, now: () => clock });
  await protection.enable({ days: 1 });
  assert.equal(await protection.checkExpiry(), false, 'within the day');
  clock += 2 * 86400000;
  assert.equal(await protection.checkExpiry(), true);
  assert.equal(isSyncVaultUnlocked(USER), false);
  assert.equal(await f.storage.getItem(getRememberedSyncVaultStorageKey(USER)), null);
  assert.equal(await restoreRememberedSyncVault({ storage: f.storage, username: USER, cryptoProvider: webcrypto }), false);
});

test('locked keys are not read as "no keys": loading shows none and writes nothing, saving writes nothing, and the unlock reads them again', async () => {
  const { storage, protection, rawOf, window } = await fixture();
  await protection.enable({ days: 7 });
  let memory = {};
  const persistence = createSensitiveConfigPersistence({
    getCurrentUser: () => ({ username: USER }), getItem: (key) => storage.getItem(key), setItem: (key, value) => storage.setItem(key, value), removeItem: (key) => storage.removeItem(key),
    getApiKeys: () => memory, replaceApiKeys: (keys) => { memory = { ...keys }; }, eventTarget: window
  });
  assert.deepEqual(await persistence.loadSensitiveConfig(), memory = JSON.parse(KEYS).apiKeys);

  await protection.lockNow();
  assert.deepEqual(memory, {}, 'the page lets go of the keys when it locks');
  const before = rawOf();
  assert.equal(await persistence.loadSensitiveConfig(), null);
  await persistence.saveSensitiveConfig();
  assert.equal(rawOf(), before, 'nothing was written over the sealed keys');

  const loaded = new Promise((resolve) => window.addEventListener('astra:cloud-sensitive-config', (event) => resolve(event.detail.apiKeys), { once: true }));
  await protection.unlockWithPassword('a long sync password');
  assert.deepEqual(await loaded, JSON.parse(KEYS).apiKeys);
  assert.deepEqual(memory, JSON.parse(KEYS).apiKeys);
});

test('a failed re-seal undoes the choice and leaves the keys as they were', async () => {
  const f = await fixture();
  const flaky = { ...f.storage, setItem: async (key, value) => { if (key === KEY) throw new Error('disk full'); return f.storage.setItem(key, value); } };
  const protection = createLocalKeyProtection({ storage: flaky, getUsername: () => USER, area: f.localStorage, target: f.window });
  await assert.rejects(protection.enable({ days: 7 }), /disk full/);
  assert.equal(protection.isProtected(), false);
  assert.equal(await f.storage.getItem(KEY), KEYS);
  assert.match(f.rawOf(), /^nd1\./);
});

test('clearing the sync password with the protection on seals the keys with the key of the device first, so nothing is lost; starting over (locked) drops them', async () => {
  const { releaseKeysBeforeVaultRemoval } = await import('../../src/app/runtime/security/local-key-protection.js');
  const f = await fixture();
  await f.protection.enable({ days: 7 });
  await releaseKeysBeforeVaultRemoval({ storage: f.storage, username: USER, area: f.localStorage, target: f.window });
  assert.equal(f.protection.isProtected(), false);
  assert.match(f.rawOf(), /^nd1\./);
  assert.equal(await f.storage.getItem(KEY), KEYS, 'the keys are still there, sealed with the key of the device');

  const g = await fixture();
  await g.protection.enable({ days: 7 });
  await g.protection.lockNow();
  await releaseKeysBeforeVaultRemoval({ storage: g.storage, username: USER, area: g.localStorage, target: g.window });
  assert.equal(g.protection.isProtected(), false);
  assert.equal(g.rawOf(), undefined, 'the sealed keys cannot be read without the vault, so they are dropped');

  const none = await fixture();
  await releaseKeysBeforeVaultRemoval({ storage: none.storage, username: USER, area: none.localStorage, target: none.window });
  assert.match(none.rawOf(), /^nd1\./, 'no protection: nothing is touched');
});

// Where a key or the sync password could end up by mistake: the storage of the page, the choice kept in localStorage, the events, the remembered unlock.
test('no key and no sync password is written in the clear anywhere: not with the protection off, not on, not locked, not unlocked', async () => {
  const SECRETS = ['AIzaSy-secret-gemini', 'sk-or-secret', 'a long sync password'];
  const f = await fixture();
  const everything = () => {
    const rows = [];
    for (const database of f.idb.databases.values()) for (const store of database.stores.values()) for (const row of store.rows.values()) rows.push(row);
    const keyDatabase = f.idb.databases.get('NoureonDeviceKey');
    // (The key of the device is an object that the browser keeps; its bytes are not in the rows at all.)
    return JSON.stringify([rows.map((row) => (row.key instanceof Object && 'type' in row.key ? { ...row, key: '[CryptoKey]' } : row)), [...f.area.entries()], keyDatabase ? 'has-device-key' : '', f.events]);
  };
  const assertClean = (when) => { for (const secret of SECRETS) assert.equal(everything().includes(secret), false, `${when}: ${secret}`); };

  assertClean('protection off');
  await f.protection.enable({ days: 7 });
  assertClean('protection on, unlocked');
  const remembered = JSON.parse(await f.storage.getItem(getRememberedSyncVaultStorageKey(USER)));
  assert.ok(remembered.k, 'what is remembered is the data key of the vault, not the password');
  assert.equal(JSON.stringify(f.idb.databases.get('ChatAppDB').stores.get('keyValue').rows.get(getRememberedSyncVaultStorageKey(USER))).includes(remembered.k), false, 'and it is sealed on disk');
  await f.protection.lockNow();
  assertClean('locked');
  await f.protection.unlockWithPassword('a long sync password');
  assertClean('unlocked again');
  await f.protection.disable();
  assertClean('protection off again');
});
