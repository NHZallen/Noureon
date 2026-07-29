export const HISTORY_INDEX_STORAGE_KEY = 'noureon:history-index:v1';
export const HISTORY_INDEX_PERSISTENCE_VERSION = 1;
export const HISTORY_INDEX_RECOVERY_SUFFIX = ':recovery';

const asNonNegativeInteger = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
const recordsFrom = value => Array.isArray(value?.records) ? value.records : [];
const revisionFrom = value => asNonNegativeInteger(value?.revision);
const savedAtFrom = value => {
  const savedAt = Number(value?.savedAt);
  return Number.isFinite(savedAt) && savedAt >= 0 ? savedAt : 0;
};

function isNewerCandidate(left, right) {
  if (!right) return true;
  if (revisionFrom(left.value) !== revisionFrom(right.value)) {
    return revisionFrom(left.value) > revisionFrom(right.value);
  }
  if (savedAtFrom(left.value) !== savedAtFrom(right.value)) {
    return savedAtFrom(left.value) > savedAtFrom(right.value);
  }
  if (recordsFrom(left.value).length !== recordsFrom(right.value).length) {
    return recordsFrom(left.value).length > recordsFrom(right.value).length;
  }
  return left.priority > right.priority;
}

function sameSnapshot(left, right) {
  return revisionFrom(left) === revisionFrom(right)
    && savedAtFrom(left) === savedAtFrom(right)
    && recordsFrom(left).length === recordsFrom(right).length;
}

export function createHistoryIndexPersistence({
  index,
  storage,
  storageKey = HISTORY_INDEX_STORAGE_KEY,
  recoveryStorageKey = null,
  fallbackStorageKeys = []
} = {}) {
  if (!index?.put || !index?.getAll || !index?.clear) {
    throw new TypeError('History index persistence requires a history index store.');
  }
  if (!storage?.getItem || !storage?.setItem || !storage?.removeItem) {
    throw new TypeError('History index persistence requires a local storage adapter.');
  }

  const resolveStorageKey = () => typeof storageKey === 'function' ? storageKey() : storageKey;
  const resolveRecoveryStorageKey = () => {
    const configuredKey = typeof recoveryStorageKey === 'function'
      ? recoveryStorageKey()
      : recoveryStorageKey;
    return configuredKey || `${getActiveStorageKey()}${HISTORY_INDEX_RECOVERY_SUFFIX}`;
  };
  const resolveFallbackKeys = () => {
    const keys = typeof fallbackStorageKeys === 'function' ? fallbackStorageKeys() : fallbackStorageKeys;
    return Array.isArray(keys) ? keys.filter(Boolean) : [];
  };
  // Account identity can change while the application is bootstrapping. Pin
  // the namespace on first use so a load from one key can never be followed by
  // an accidental empty save into another key.
  let activeStorageKey = null;
  let activeRecoveryStorageKey = null;
  const getActiveStorageKey = () => activeStorageKey ||= resolveStorageKey();
  const getActiveRecoveryStorageKey = () => activeRecoveryStorageKey ||= resolveRecoveryStorageKey();
  let saveQueue = Promise.resolve();
  let lastLoad = { source: 'not-loaded', count: 0, recovered: false };

  const enqueueSave = operation => {
    const queued = saveQueue.then(operation, operation);
    // Keep the queue usable after an IndexedDB failure while returning the
    // original rejection to the caller that initiated the write.
    saveQueue = queued.catch(() => {});
    return queued;
  };
  const snapshotFromRecords = (records, { revision, savedAt = Date.now() } = {}) => ({
    schemaVersion: HISTORY_INDEX_PERSISTENCE_VERSION,
    revision: asNonNegativeInteger(revision),
    savedAt,
    records
  });
  const writeMirrors = async (snapshot, { primaryKey, recoveryKey } = {}) => {
    const entries = [
      { key: recoveryKey, value: snapshot },
      { key: primaryKey, value: snapshot }
    ];
    if (typeof storage.setItemsAtomic === 'function') {
      await storage.setItemsAtomic(entries);
      return;
    }
    // Write the recovery copy first. A refresh between the two writes still
    // selects the newest complete snapshot instead of treating the index as
    // absent. Production IndexedDB uses the atomic branch above.
    await storage.setItem(recoveryKey, snapshot);
    await storage.setItem(primaryKey, snapshot);
  };
  const restoreMirrors = async (snapshot, { primaryKey, recoveryKey } = {}) => {
    const primary = await storage.getItem(primaryKey);
    const recovery = await storage.getItem(recoveryKey);
    if (sameSnapshot(primary, snapshot) && sameSnapshot(recovery, snapshot)) return;
    await writeMirrors(snapshot, { primaryKey, recoveryKey });
  };

  return {
    async load() {
      const primaryKey = getActiveStorageKey();
      const recoveryKey = getActiveRecoveryStorageKey();
      const fallbackKeys = resolveFallbackKeys()
        .filter(key => key !== primaryKey && key !== recoveryKey);
      const [primary, recovery, ...fallbackValues] = await Promise.all([
        storage.getItem(primaryKey),
        storage.getItem(recoveryKey),
        ...fallbackKeys.map(key => storage.getItem(key))
      ]);
      const candidates = [
        { key: primaryKey, value: primary, source: 'primary', priority: 3 },
        { key: recoveryKey, value: recovery, source: 'recovery', priority: 2 },
        ...fallbackValues.map((value, index) => ({
          key: fallbackKeys[index],
          value,
          source: 'legacy-fallback',
          priority: 1
        }))
      ];
      const selected = candidates.reduce((best, candidate) => (
        isNewerCandidate(candidate, best) ? candidate : best
      ), null);
      const records = recordsFrom(selected?.value);
      for (const record of records) index.put(record);

      const selectedSnapshot = selected?.value;
      if (records.length > 0 && selectedSnapshot) {
        // Existing v1 records did not have a revision or a recovery copy.
        // Seed both only after we have a complete non-empty snapshot, never
        // from an empty startup state.
        const normalizedSnapshot = snapshotFromRecords(records, {
          revision: revisionFrom(selectedSnapshot) || 1,
          savedAt: savedAtFrom(selectedSnapshot) || Date.now()
        });
        await restoreMirrors(normalizedSnapshot, { primaryKey, recoveryKey });
        if (selected?.source === 'legacy-fallback') await storage.removeItem(selected.key);
      }
      lastLoad = {
        source: selected?.source || 'none',
        count: records.length,
        recovered: selected?.source === 'recovery'
          || selected?.source === 'legacy-fallback'
      };
      return records.length;
    },
    async save({ allowEmpty = false } = {}) {
      return enqueueSave(async () => {
        const primaryKey = getActiveStorageKey();
        const recoveryKey = getActiveRecoveryStorageKey();
        const records = index.getAll();
        const [primary, recovery] = await Promise.all([
          storage.getItem(primaryKey),
          storage.getItem(recoveryKey)
        ]);
        const persistedCount = Math.max(recordsFrom(primary).length, recordsFrom(recovery).length);
        // A failed background rebuild must not turn a healthy persisted index
        // into an empty one. Explicit destructive flows opt in via allowEmpty.
        if (!allowEmpty && records.length === 0 && persistedCount > 0) {
          return { saved: false, reason: 'preserved-existing-index' };
        }
        const revision = Math.max(revisionFrom(primary), revisionFrom(recovery)) + 1;
        const snapshot = snapshotFromRecords(records, { revision });
        await writeMirrors(snapshot, { primaryKey, recoveryKey });
        return { saved: true, count: records.length, revision };
      });
    },
    async clear() {
      index.clear();
      return enqueueSave(async () => {
        await Promise.all([
          storage.removeItem(getActiveStorageKey()),
          storage.removeItem(getActiveRecoveryStorageKey())
        ]);
      });
    },
    getDiagnostics() {
      return { ...lastLoad };
    }
  };
}
