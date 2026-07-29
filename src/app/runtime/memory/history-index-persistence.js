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
  // Account identity can change while the application is bootstrapping.  Pin
  // the namespace on first use so a load from one key can never be followed by
  // an accidental empty save into another key.
  let activeStorageKey = null;
  const getActiveStorageKey = () => activeStorageKey ||= resolveStorageKey();
  const recordsFrom = value => Array.isArray(value?.records) ? value.records : [];

  return {
    async load() {
      const primaryKey = getActiveStorageKey();
      let loadedKey = primaryKey;
      let saved = await storage.getItem(primaryKey);
      // An empty primary record can be left behind by an interrupted legacy
      // bootstrap.  Prefer a non-empty owner fallback in that case so an
      // intact local index is recovered instead of being treated as missing.
      if (recordsFrom(saved).length === 0) {
        for (const fallbackKey of resolveFallbackKeys()) {
          if (fallbackKey === primaryKey) continue;
          const fallback = await storage.getItem(fallbackKey);
          if (recordsFrom(fallback).length > 0) {
            saved = fallback;
            loadedKey = fallbackKey;
            break;
          }
        }
      }
      const records = recordsFrom(saved);
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
    async save({ allowEmpty = false } = {}) {
      const key = getActiveStorageKey();
      const records = index.getAll();
      // A failed background rebuild must not turn a healthy persisted index
      // into an empty one. Explicit destructive flows opt in via allowEmpty.
      if (!allowEmpty && records.length === 0 && recordsFrom(await storage.getItem(key)).length > 0) {
        return { saved: false, reason: 'preserved-existing-index' };
      }
      await storage.setItem(key, {
        schemaVersion: HISTORY_INDEX_PERSISTENCE_VERSION,
        records
      });
      return { saved: true, count: records.length };
    },
    async clear() {
      index.clear();
      await storage.removeItem(getActiveStorageKey());
    }
  };
}
