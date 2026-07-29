export const HISTORY_INDEX_STORAGE_KEY = 'noureon:history-index:v1';
export const HISTORY_INDEX_PERSISTENCE_VERSION = 2;
export const HISTORY_INDEX_RECOVERY_SUFFIX = ':recovery';
export const HISTORY_INDEX_SNAPSHOT_STATE_READY = 'ready';
export const HISTORY_INDEX_SNAPSHOT_STATE_EMPTY = 'empty';
export const HISTORY_INDEX_SNAPSHOT_STATE_EXPLICITLY_EMPTY = 'explicitly-empty';

const asNonNegativeInteger = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
const recordsFrom = value => Array.isArray(value?.records) ? value.records : [];
const revisionFrom = value => asNonNegativeInteger(value?.revision);
const savedAtFrom = value => {
  const savedAt = Number(value?.savedAt);
  return Number.isFinite(savedAt) && savedAt >= 0 ? savedAt : 0;
};
const stateFrom = value => {
  if (value?.schemaVersion >= 2 && value?.state === HISTORY_INDEX_SNAPSHOT_STATE_EXPLICITLY_EMPTY) {
    return HISTORY_INDEX_SNAPSHOT_STATE_EXPLICITLY_EMPTY;
  }
  return recordsFrom(value).length > 0
    ? HISTORY_INDEX_SNAPSHOT_STATE_READY
    : HISTORY_INDEX_SNAPSHOT_STATE_EMPTY;
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
    && recordsFrom(left).length === recordsFrom(right).length
    && stateFrom(left) === stateFrom(right);
}

function selectCurrentNamespaceCandidate(candidates) {
  const selected = candidates.reduce((best, candidate) => (
    isNewerCandidate(candidate, best) ? candidate : best
  ), null);
  if (!selected || stateFrom(selected.value) !== HISTORY_INDEX_SNAPSHOT_STATE_EMPTY) {
    return selected;
  }
  // Schema v1 had no way to distinguish an intentional empty snapshot from
  // an interrupted or premature startup save. Never let such an ambiguous
  // empty snapshot hide a complete mirror in the same namespace.
  return candidates
    .filter(candidate => recordsFrom(candidate.value).length > 0)
    .reduce((best, candidate) => (
      isNewerCandidate(candidate, best) ? candidate : best
    ), null) || selected;
}

function selectMigrationFallback(candidates) {
  // Revisions are namespace-local and therefore cannot be compared with the
  // current owner's revision. Fallback order is explicit configuration order;
  // savedAt/count only resolve competing copies within that migration set.
  return candidates
    .filter(candidate => recordsFrom(candidate.value).length > 0)
    .reduce((best, candidate) => {
      if (!best) return candidate;
      if (candidate.priority !== best.priority) {
        return candidate.priority > best.priority ? candidate : best;
      }
      if (savedAtFrom(candidate.value) !== savedAtFrom(best.value)) {
        return savedAtFrom(candidate.value) > savedAtFrom(best.value) ? candidate : best;
      }
      return recordsFrom(candidate.value).length > recordsFrom(best.value).length
        ? candidate
        : best;
    }, null);
}

function snapshotSummary(value) {
  return {
    state: stateFrom(value),
    revision: revisionFrom(value),
    count: recordsFrom(value).length
  };
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
  let lastLoad = {
    source: 'not-loaded',
    count: 0,
    recovered: false,
    migrated: false,
    preservedFallback: false,
    loadErrorCode: null,
    primary: snapshotSummary(null),
    recovery: snapshotSummary(null),
    fallback: snapshotSummary(null)
  };

  const enqueueSave = operation => {
    const queued = saveQueue.then(operation, operation);
    // Keep the queue usable after an IndexedDB failure while returning the
    // original rejection to the caller that initiated the write.
    saveQueue = queued.catch(() => {});
    return queued;
  };
  const snapshotFromRecords = (records, {
    revision,
    savedAt = Date.now(),
    state = records.length > 0
      ? HISTORY_INDEX_SNAPSHOT_STATE_READY
      : HISTORY_INDEX_SNAPSHOT_STATE_EMPTY,
    emptyReason = null
  } = {}) => ({
    schemaVersion: HISTORY_INDEX_PERSISTENCE_VERSION,
    revision: asNonNegativeInteger(revision),
    savedAt,
    state,
    ...(state === HISTORY_INDEX_SNAPSHOT_STATE_EXPLICITLY_EMPTY
      ? { emptyReason: emptyReason || 'explicit-deletion' }
      : {}),
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
  const writeAndVerifyMirrors = async (snapshot, { primaryKey, recoveryKey } = {}) => {
    await writeMirrors(snapshot, { primaryKey, recoveryKey });
    const [primary, recovery] = await Promise.all([
      storage.getItem(primaryKey),
      storage.getItem(recoveryKey)
    ]);
    if (!sameSnapshot(primary, snapshot) || !sameSnapshot(recovery, snapshot)) {
      throw new Error('History index migration could not be verified.');
    }
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
      const currentCandidates = [
        { key: primaryKey, value: primary, source: 'primary', priority: 3 },
        { key: recoveryKey, value: recovery, source: 'recovery', priority: 2 }
      ];
      const fallbackCandidates = fallbackValues.map((value, index) => ({
          key: fallbackKeys[index],
          value,
          source: 'legacy-fallback',
          priority: fallbackKeys.length - index
        }));
      const currentSelected = selectCurrentNamespaceCandidate(currentCandidates);
      const fallbackSelected = stateFrom(currentSelected?.value) === HISTORY_INDEX_SNAPSHOT_STATE_EXPLICITLY_EMPTY
        ? null
        : selectMigrationFallback(fallbackCandidates);
      const selected = recordsFrom(currentSelected?.value).length > 0
        ? currentSelected
        : fallbackSelected || currentSelected;
      const records = recordsFrom(selected?.value);
      index.clear();
      for (const record of records) index.put(record);

      const selectedSnapshot = selected?.value;
      if (records.length > 0 && selectedSnapshot) {
        const isMigration = selected?.source === 'legacy-fallback';
        const currentRevision = Math.max(revisionFrom(primary), revisionFrom(recovery));
        const normalizedSnapshot = snapshotFromRecords(records, {
          revision: isMigration
            ? currentRevision + 1
            : revisionFrom(selectedSnapshot) || 1,
          savedAt: isMigration
            ? Date.now()
            : savedAtFrom(selectedSnapshot) || Date.now()
        });
        if (isMigration) {
          // The fallback is the only known-good source until both current
          // mirrors have been written and read back successfully.
          try {
            await writeAndVerifyMirrors(normalizedSnapshot, { primaryKey, recoveryKey });
            await storage.removeItem(selected.key);
          } catch (error) {
            lastLoad = {
              source: selected.source,
              count: records.length,
              recovered: true,
              migrated: false,
              preservedFallback: true,
              loadErrorCode: 'migration-write-failed',
              primary: snapshotSummary(primary),
              recovery: snapshotSummary(recovery),
              fallback: snapshotSummary(fallbackSelected?.value)
            };
            throw error;
          }
        } else {
          await restoreMirrors(normalizedSnapshot, { primaryKey, recoveryKey });
        }
      }
      lastLoad = {
        source: selected?.source || 'none',
        count: records.length,
        recovered: selected?.source === 'recovery'
          || selected?.source === 'legacy-fallback',
        migrated: selected?.source === 'legacy-fallback',
        preservedFallback: false,
        loadErrorCode: null,
        primary: snapshotSummary(primary),
        recovery: snapshotSummary(recovery),
        fallback: snapshotSummary(fallbackSelected?.value)
      };
      return records.length;
    },
    async save({ allowEmpty = false, emptyReason = null } = {}) {
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
        const snapshot = snapshotFromRecords(records, {
          revision,
          state: records.length === 0 && allowEmpty
            ? HISTORY_INDEX_SNAPSHOT_STATE_EXPLICITLY_EMPTY
            : undefined,
          emptyReason
        });
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
