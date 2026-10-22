// An IndexedDB in memory, with what the page's storage adapter (src/app/runtime/kernel/storage-adapter.js) asks of it: databases with object stores
// of { key, value } records, requests that answer on `onsuccess`, and transactions that finish on `oncomplete`.

const later = (run) => queueMicrotask(run);

const requestOf = (compute) => {
  const request = { result: undefined, error: null, onsuccess: null, onerror: null };
  later(() => {
    try {
      request.result = compute();
      request.onsuccess?.({ target: request });
    } catch (error) {
      request.error = error;
      request.onerror?.({ target: request });
    }
  });
  return request;
};

export function createFakeIndexedDB() {
  const databases = new Map();
  return {
    open(name, version = 1) {
      const request = { result: null, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
      later(() => {
        let stores = databases.get(name);
        const isNew = !stores;
        if (isNew) { stores = new Map(); databases.set(name, stores); }
        const db = {
          version,
          createObjectStore: (storeName) => { stores.set(storeName, new Map()); return {}; },
          transaction: (storeName) => {
            const store = stores.get(storeName);
            const transaction = { oncomplete: null, onerror: null, onabort: null, error: null, aborted: false, abort() { this.aborted = true; later(() => this.onabort?.({ target: this })); } };
            const finish = () => later(() => { if (!transaction.aborted) transaction.oncomplete?.({ target: transaction }); });
            transaction.objectStore = () => ({
              get: (key) => requestOf(() => store.get(key)),
              getAllKeys: () => requestOf(() => [...store.keys()]),
              put: (record) => { const request = requestOf(() => { store.set(record.key, record); return record.key; }); finish(); return request; },
              delete: (key) => { const request = requestOf(() => { store.delete(key); }); finish(); return request; },
              clear: () => { const request = requestOf(() => { store.clear(); }); finish(); return request; }
            });
            return transaction;
          },
          close() {}
        };
        request.result = db;
        if (isNew) request.onupgradeneeded?.({ target: request });
        request.onsuccess?.({ target: request });
      });
      return request;
    }
  };
}
