// Just enough of IndexedDB for the store of vectors: open with an upgrade, object stores with an optional key path, put / get / getAll / delete / clear, and transactions that complete
// after their requests. The data lives in the object this returns, so a test can open the "same database" twice.

export function createFakeIndexedDb() {
  const databases = new Map();
  const later = (work) => setTimeout(work, 0);
  const request = (work) => {
    const req = {};
    queueMicrotask(() => {
      try {
        req.result = work();
        req.onsuccess?.();
      } catch (error) {
        req.error = error;
        req.onerror?.();
      }
    });
    return req;
  };
  const storeApi = (store) => ({
    put: (value, key) => request(() => { store.data.set(store.keyPath ? value[store.keyPath] : key, structuredClone(value)); }),
    get: (key) => request(() => (store.data.has(key) ? structuredClone(store.data.get(key)) : undefined)),
    getAll: () => request(() => [...store.data.values()].map((value) => structuredClone(value))),
    delete: (key) => request(() => { store.data.delete(key); }),
    clear: () => request(() => { store.data.clear(); })
  });
  return {
    databases,
    open(name) {
      const req = {};
      later(() => {
        let created = false;
        if (!databases.has(name)) {
          databases.set(name, new Map());
          created = true;
        }
        const stores = databases.get(name);
        const db = {
          createObjectStore: (storeName, options = {}) => { stores.set(storeName, { keyPath: options.keyPath || null, data: new Map() }); },
          transaction: (names) => {
            const list = Array.isArray(names) ? names : [names];
            const transaction = { objectStore: (storeName) => storeApi(stores.get(storeName)) };
            later(() => { for (const storeName of list) if (!stores.has(storeName)) { transaction.error = new Error(`no store ${storeName}`); transaction.onerror?.(); return; } transaction.oncomplete?.(); });
            return transaction;
          }
        };
        req.result = db;
        if (created) req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req;
    }
  };
}
