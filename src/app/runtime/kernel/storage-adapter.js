export function createLegacyRuntimeStorageAdapter({
  indexedDBFactory = indexedDB,
  dbName = 'ChatAppDB',
  storeName = 'keyValue',
  version = 1
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

  async function getItem(key) {
    const idb = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = idb.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result ? request.result.value : null);
      request.onerror = reject;
    });
  }

  async function readItems(keys) {
    if (!Array.isArray(keys) || keys.some(key => typeof key !== 'string')) {
      throw new TypeError('Atomic storage read keys must be an array of strings.');
    }
    if (keys.length === 0) return [];
    const idb = await openDB();
    const transaction = idb.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    return Promise.all(keys.map(key => new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result ? request.result.value : null);
      request.onerror = event => reject(request.error || event?.target?.error || event);
    })));
  }

  async function setItem(key, value) {
    const idb = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = idb.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      store.put({ key, value });
      transaction.oncomplete = resolve;
      transaction.onerror = reject;
    });
  }

  async function setItemsAtomic(entries) {
    if (!Array.isArray(entries)) {
      throw new TypeError('Atomic storage entries must be an array.');
    }
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object' || !Object.prototype.hasOwnProperty.call(entry, 'key')) {
        throw new TypeError('Each atomic storage entry must include a key.');
      }
    }
    if (entries.length === 0) return;

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
        for (const { key, value } of entries) {
          store.put({ key, value });
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
    removeItem,
    clear,
    getKeys,
    removeItemsByPrefix
  };
}
