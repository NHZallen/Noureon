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

  return {
    openDB,
    getItem,
    setItem,
    removeItem,
    clear
  };
}
