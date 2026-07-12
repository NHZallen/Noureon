export const HISTORY_INDEX_STORAGE_KEY = 'noureon:history-index:v1';
export const HISTORY_INDEX_PERSISTENCE_VERSION = 1;

export function createHistoryIndexPersistence({
  index,
  storage,
  storageKey = HISTORY_INDEX_STORAGE_KEY,
  fallbackStorageKeys = []
} = {}) {
  if (!index?.put || !index?.getAll || !index?.clear) {
    throw new TypeError('History index persistence requires a history index store.');
  }
  if (!storage?.getItem || !storage?.setItem || !storage?.removeItem) {
    throw new TypeError('History index persistence requires a local storage adapter.');
  }

  const resolveStorageKey = () => typeof storageKey === 'function' ? storageKey() : storageKey;
  const resolveFallbackKeys = () => {
    const keys = typeof fallbackStorageKeys === 'function' ? fallbackStorageKeys() : fallbackStorageKeys;
    return Array.isArray(keys) ? keys.filter(Boolean) : [];
  };

  return {
    async load() {
      const primaryKey = resolveStorageKey();
      let loadedKey = primaryKey;
      let saved = await storage.getItem(primaryKey);
      if (!saved) {
        for (const fallbackKey of resolveFallbackKeys()) {
          if (fallbackKey === primaryKey) continue;
          saved = await storage.getItem(fallbackKey);
          if (saved) {
            loadedKey = fallbackKey;
            break;
          }
        }
      }
      const records = Array.isArray(saved?.records) ? saved.records : [];
      for (const record of records) index.put(record);
      if (loadedKey !== primaryKey && records.length > 0) {
        await storage.setItem(primaryKey, {
          schemaVersion: HISTORY_INDEX_PERSISTENCE_VERSION,
          records: index.getAll()
        });
        await storage.removeItem(loadedKey);
      }
      return records.length;
    },
    async save() {
      await storage.setItem(resolveStorageKey(), {
        schemaVersion: HISTORY_INDEX_PERSISTENCE_VERSION,
        records: index.getAll()
      });
    },
    async clear() {
      index.clear();
      await storage.removeItem(resolveStorageKey());
    }
  };
}
