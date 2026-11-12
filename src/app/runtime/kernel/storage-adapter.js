import { LocalKeyError, sealRuleOf } from '../security/local-key-rules.js';

// The seal does the cryptography and is loaded the first time one of the sealed keys is read or written (most pages of the app never need it before the keys are read).
const lazySeal = (make) => {
  let loaded = null;
  const load = () => (loaded ||= import('../security/local-key-seal.js').then(make));
  return {
    available: async () => (await load()).available(),
    seal: async (key, text) => (await load()).seal(key, text),
    open: async (key, stored) => (await load()).open(key, stored)
  };
};

export function createRuntimeStorageAdapter({
  indexedDBFactory = indexedDB,
  dbName = 'ChatAppDB',
  storeName = 'keyValue',
  version = 1,
  // The values of some keys (the API keys, the remembered unlock of the sync vault) are sealed at rest: see security/local-key-seal.js. The page's own browser
  // storage shares one seal; a storage that is given another factory (tests) has its own.
  seal = lazySeal((module) => (indexedDBFactory === globalThis.indexedDB ? module.getSharedLocalKeySeal() : module.createLocalKeySeal({ indexedDBFactory })))
} = {}) {
  let db;

  async function openDB() {
    if (db) return db;
    return new Promise((resolve, reject) => {
      const request = indexedDBFactory.open(dbName, version);
      request.onupgradeneeded = (event) => {
        const idb = event.target.result;
        idb.createObjectStore(storeName, { keyPath: 'key' });
      };
      request.onsuccess = (event) => {
        db = event.target.result;
        resolve(db);
      };
      request.onerror = (event) => reject(event.target.error);
    });
  }

  async function getRaw(key) {
    const idb = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = idb.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result ? request.result.value : null);
      request.onerror = reject;
    });
  }

  // What is read back from a key whose value is sealed. A text kept in plain (before the seal existed) is given as it is and sealed in the background.
  async function unsealed(key, stored) {
    if (!sealRuleOf(key) || typeof stored !== 'string') return stored;
    const opened = await seal.open(key, stored);
    // Locked (the protection with a passkey, and the vault is not unlocked) is not the same as missing: it is told, so nobody takes it for "no keys" and writes nothing over it.
    if (opened.locked) throw new LocalKeyError('local-keys-locked', 'The keys on this device are locked.');
    if (!opened.sealed && opened.value && await seal.available()) {
      void setItem(key, opened.value).catch(() => {});
    }
    return opened.value;
  }

  async function getItem(key) {
    return unsealed(key, await getRaw(key));
  }

  async function readItems(keys) {
    if (!Array.isArray(keys) || keys.some(key => typeof key !== 'string')) {
      throw new TypeError('Atomic storage read keys must be an array of strings.');
    }
    if (keys.length === 0) return [];
    const idb = await openDB();
    const transaction = idb.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const stored = await Promise.all(keys.map(key => new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result ? request.result.value : null);
      request.onerror = event => reject(request.error || event?.target?.error || event);
    })));
    return keys.some(sealRuleOf) ? Promise.all(stored.map((value, index) => unsealed(keys[index], value))) : stored;
  }

  async function setItem(key, value) {
    if (sealRuleOf(key)) value = await seal.seal(key, value);
    const idb = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = idb.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      store.put({ key, value });
      transaction.oncomplete = resolve;
      transaction.onerror = reject;
    });
  }

  // Writes and deletions in ONE readwrite transaction: either all of them happen or none does. The split workspace
  // (workspace-store-v2.js) relies on it so that its index never describes records that were not written.
  async function applyAtomic({ puts = [], removes = [] } = {}) {
    if (!Array.isArray(puts)) {
      throw new TypeError('Atomic storage entries must be an array.');
    }
    if (!Array.isArray(removes) || removes.some(key => typeof key !== 'string')) {
      throw new TypeError('Atomic storage removals must be an array of strings.');
    }
    for (const entry of puts) {
      if (!entry || typeof entry !== 'object' || !Object.prototype.hasOwnProperty.call(entry, 'key')) {
        throw new TypeError('Each atomic storage entry must include a key.');
      }
    }
    if (puts.length === 0 && removes.length === 0) return;
    // (The sealing is done before the transaction opens: a transaction does not wait for anything but its own requests.)
    if (puts.some((entry) => sealRuleOf(entry.key))) {
      puts = await Promise.all(puts.map(async (entry) => (sealRuleOf(entry.key) ? { ...entry, value: await seal.seal(entry.key, entry.value) } : entry)));
    }

    const idb = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = idb.transaction(storeName, 'readwrite');
      const rejectTransaction = (event) => reject(
        transaction.error || event?.target?.error || event
      );
      transaction.oncomplete = resolve;
      transaction.onerror = rejectTransaction;
      transaction.onabort = rejectTransaction;

      try {
        const store = transaction.objectStore(storeName);
        for (const { key, value } of puts) {
          store.put({ key, value });
        }
        for (const key of removes) {
          store.delete(key);
        }
      } catch (error) {
        reject(error);
        try {
          transaction.abort();
        } catch {
          // The transaction may already be inactive after a synchronous request failure.
        }
      }
    });
  }

  async function setItemsAtomic(entries) {
    if (!Array.isArray(entries)) {
      throw new TypeError('Atomic storage entries must be an array.');
    }
    return applyAtomic({ puts: entries });
  }

  async function removeItem(key) {
    const idb = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = idb.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      store.delete(key);
      transaction.oncomplete = resolve;
      transaction.onerror = reject;
    });
  }

  async function clear() {
    const idb = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = idb.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();
      request.onsuccess = resolve;
      request.onerror = reject;
    });
  }

  async function getKeys() {
    const idb = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = idb.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAllKeys();
      request.onsuccess = () => resolve(Array.from(request.result || []));
      request.onerror = reject;
    });
  }

  async function removeItemsByPrefix(prefix) {
    if (!prefix) return;
    const keys = await getKeys();
    for (const key of keys) {
      if (String(key).startsWith(prefix)) {
        await removeItem(key);
      }
    }
  }

  return {
    openDB,
    getItem,
    readItems,
    setItem,
    setItemsAtomic,
    applyAtomic,
    removeItem,
    clear,
    getKeys,
    removeItemsByPrefix
  };
}
