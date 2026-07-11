export const HISTORY_INDEX_STORAGE_KEY = 'noureon:history-index:v1';
export const HISTORY_INDEX_PERSISTENCE_VERSION = 1;

export function createHistoryIndexPersistence({
  index,
  storage,
  storageKey = HISTORY_INDEX_STORAGE_KEY
} = {}) {
  if (!index?.put || !index?.getAll || !index?.clear) {
    throw new TypeError('History index persistence requires a history index store.');
  }
  if (!storage?.getItem || !storage?.setItem || !storage?.removeItem) {
    throw new TypeError('History index persistence requires a local storage adapter.');
  }

  return {
    async load() {
      const saved = await storage.getItem(storageKey);
      const records = Array.isArray(saved?.records) ? saved.records : [];
      for (const record of records) index.put(record);
      return records.length;
    },
    async save() {
      await storage.setItem(storageKey, {
        schemaVersion: HISTORY_INDEX_PERSISTENCE_VERSION,
        records: index.getAll()
      });
    },
    async clear() {
      index.clear();
      await storage.removeItem(storageKey);
    }
  };
}
