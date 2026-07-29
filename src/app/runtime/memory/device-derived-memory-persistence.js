const asArray = value => Array.isArray(value) ? value : [];

export const DEVICE_DERIVED_MEMORY_VERSION = 2;
const DERIVED_MEMORY_STATE_READY = 'ready';
const DERIVED_MEMORY_STATE_EXPLICITLY_EMPTY = 'explicitly-empty';

export function createDeviceDerivedMemoryPersistence({ storage, storageKey, fallbackStorageKeys = [], getMemoryState, replaceMemoryState } = {}) {
  if (!storage?.getItem || !storage?.setItem) throw new TypeError('Device memory persistence requires storage.');
  if (typeof getMemoryState !== 'function' || typeof replaceMemoryState !== 'function') throw new TypeError('Device memory persistence requires memory state access.');

  const resolveStorageKey = () => typeof storageKey === 'function' ? storageKey() : storageKey;
  const resolveFallbackKeys = () => {
    const keys = typeof fallbackStorageKeys === 'function' ? fallbackStorageKeys() : fallbackStorageKeys;
    return Array.isArray(keys) ? keys.filter(Boolean) : [];
  };
  // Keep loading and later saving within one owner namespace. Without this,
  // an auth hand-off can load one user's derived memory and overwrite another
  // namespace with an empty projection.
  let activeStorageKey = null;
  const getActiveStorageKey = () => activeStorageKey ||= resolveStorageKey();
  const isSupportedSnapshot = value => value?.version === 1
    || value?.version === DEVICE_DERIVED_MEMORY_VERSION;
  const hasDerivedMemory = value => isSupportedSnapshot(value)
    && (
      asArray(value.recentConversationStates).length > 0
      || asArray(value.conversationCapsules).length > 0
      || asArray(value.mediaMemories).length > 0
    );
  const isExplicitlyEmpty = value => value?.version === DEVICE_DERIVED_MEMORY_VERSION
    && value?.state === DERIVED_MEMORY_STATE_EXPLICITLY_EMPTY;

  return {
    async load() {
      const primaryKey = getActiveStorageKey();
      let loadedKey = primaryKey;
      let saved = await storage.getItem(primaryKey);
      // Recover an intact pre-auth/legacy copy when a transient empty primary
      // was written before the owner namespace settled.
      if (!hasDerivedMemory(saved) && !isExplicitlyEmpty(saved)) {
        for (const fallbackKey of resolveFallbackKeys()) {
          if (fallbackKey === primaryKey) continue;
          const fallback = await storage.getItem(fallbackKey);
          if (hasDerivedMemory(fallback)) {
            saved = fallback;
            loadedKey = fallbackKey;
            break;
          }
        }
      }
      if (!isSupportedSnapshot(saved)) return false;
      const current = getMemoryState() || {};
      replaceMemoryState({
        ...current,
        recentConversationStates: asArray(saved.recentConversationStates),
        conversationCapsules: asArray(saved.conversationCapsules),
        mediaMemories: asArray(saved.mediaMemories)
      });
      if (loadedKey !== primaryKey) {
        const migrated = {
          ...saved,
          version: DEVICE_DERIVED_MEMORY_VERSION,
          state: DERIVED_MEMORY_STATE_READY
        };
        await storage.setItem(primaryKey, migrated);
        const verified = await storage.getItem(primaryKey);
        if (!hasDerivedMemory(verified)) {
          throw new Error('Derived memory migration could not be verified.');
        }
        await storage.removeItem?.(loadedKey);
      }
      return true;
    },
    async save({ allowEmpty = false, emptyReason = null } = {}) {
      const memoryState = getMemoryState() || {};
      const snapshot = {
        version: DEVICE_DERIVED_MEMORY_VERSION,
        state: DERIVED_MEMORY_STATE_READY,
        recentConversationStates: asArray(memoryState.recentConversationStates),
        conversationCapsules: asArray(memoryState.conversationCapsules),
        mediaMemories: asArray(memoryState.mediaMemories)
      };
      if (!hasDerivedMemory(snapshot)) {
        if (!allowEmpty) return { saved: false, reason: 'empty-memory-state' };
        snapshot.state = DERIVED_MEMORY_STATE_EXPLICITLY_EMPTY;
        snapshot.emptyReason = emptyReason || 'explicit-deletion';
      }
      await storage.setItem(getActiveStorageKey(), snapshot);
      return { saved: true };
    }
  };
}

export function createDeviceDerivedMemoryRuntime(options = {}) {
  const persistence = createDeviceDerivedMemoryPersistence(options);
  let ready = null;
  return {
    ensureReady() {
      if (!ready) ready = persistence.load().catch(error => options.logger?.warn?.('Device memory state could not load.', error));
      return ready;
    },
    persist: persistenceOptions => Promise.all([
      options.saveAppData(),
      persistence.save(persistenceOptions)
    ])
  };
}
