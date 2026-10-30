// Where the vectors of the past conversations are kept (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §4.9): in this browser only (IndexedDB), one record for each piece of a
// conversation: its id, a hash of its text (a vector is used only while the text is the same), and its unit vector. Each device builds its own; nothing is synced. The index carries the
// version of the model that made it: another model means another index, so the old one is thrown away. `createMemoryBackend` is the same thing in memory (for tests and for a browser with
// no IndexedDB); `createIdbBackend` is the real one. No `window`: the page gives the `indexedDB` it has.

const DB_VERSION = 1;
const VECTORS = 'vectors';
const META = 'meta';

export function createMemoryBackend() {
  const records = new Map();
  const meta = new Map();
  return {
    async readAll() { return [...records.values()]; },
    async put(batch) { for (const record of batch) records.set(record.id, record); },
    async remove(ids) { for (const id of ids) records.delete(id); },
    async clear() { records.clear(); meta.clear(); },
    async getMeta(key) { return meta.get(key) ?? null; },
    async setMeta(key, value) { meta.set(key, value); }
  };
}

const wrap = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
});
const done = (transaction) => new Promise((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'));
  transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
});

/** The vectors in IndexedDB under `name` (one database for each person on this device). */
export function createIdbBackend({ indexedDB, name }) {
  let opening = null;
  const open = () => {
    if (!opening) {
      opening = new Promise((resolve, reject) => {
        const request = indexedDB.open(name, DB_VERSION);
        request.onupgradeneeded = () => {
          request.result.createObjectStore(VECTORS, { keyPath: 'id' });
          request.result.createObjectStore(META);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('IndexedDB could not be opened'));
      });
      opening.catch(() => { opening = null; });
    }
    return opening;
  };
  const run = async (stores, mode, work) => {
    const db = await open();
    const transaction = db.transaction(stores, mode);
    const result = work(transaction);
    await done(transaction);
    return result;
  };
  return {
    async readAll() {
      const db = await open();
      return wrap(db.transaction(VECTORS, 'readonly').objectStore(VECTORS).getAll());
    },
    put: (batch) => run(VECTORS, 'readwrite', (transaction) => { for (const record of batch) transaction.objectStore(VECTORS).put(record); }),
    remove: (ids) => run(VECTORS, 'readwrite', (transaction) => { for (const id of ids) transaction.objectStore(VECTORS).delete(id); }),
    clear: () => run([VECTORS, META], 'readwrite', (transaction) => { transaction.objectStore(VECTORS).clear(); transaction.objectStore(META).clear(); }),
    async getMeta(key) {
      const db = await open();
      const value = await wrap(db.transaction(META, 'readonly').objectStore(META).get(key));
      return value === undefined ? null : value;
    },
    setMeta: (key, value) => run(META, 'readwrite', (transaction) => { transaction.objectStore(META).put(value, key); })
  };
}

/**
 * The vectors as the page uses them: all held in memory once loaded (a few thousand pieces of 768 numbers), written through to the backend. `load(version)` reads them and throws
 * away what another model made; `has(id, hash)` says whether the piece has its vector; `entries()` gives [{ id, vector }] for the search.
 */
export function createVectorStore({ backend }) {
  const held = new Map();
  let version = '';
  let loaded = false;
  return {
    async load(wanted) {
      const stored = await backend.getMeta('version');
      if (stored !== wanted) {
        await backend.clear();
        held.clear();
        await backend.setMeta('version', wanted);
      } else {
        held.clear();
        for (const record of await backend.readAll()) held.set(record.id, { id: record.id, hash: record.hash, vector: record.vector instanceof Float32Array ? record.vector : Float32Array.from(record.vector || []) });
      }
      version = wanted;
      loaded = true;
      return held.size;
    },
    isLoaded: () => loaded,
    version: () => version,
    get size() { return held.size; },
    has: (id, hash) => held.get(id)?.hash === hash,
    entries: () => [...held.values()],
    async putMany(records) {
      if (!records.length) return 0;
      await backend.put(records);
      for (const record of records) held.set(record.id, record);
      return records.length;
    },
    /** Keeps only the vectors of `ids` (pieces that are gone — a deleted conversation, a message that changed — lose theirs). */
    async prune(ids) {
      const keep = new Set(ids);
      const gone = [...held.keys()].filter((id) => !keep.has(id));
      if (!gone.length) return 0;
      await backend.remove(gone);
      gone.forEach((id) => held.delete(id));
      return gone.length;
    },
    async clear() {
      await backend.clear();
      held.clear();
      if (version) await backend.setMeta('version', version);
    }
  };
}
