const asArray = value => Array.isArray(value) ? value : [];

export const DEVICE_DERIVED_MEMORY_VERSION = 1;

export function createDeviceDerivedMemoryPersistence({ storage, storageKey, fallbackStorageKeys = [], getMemoryState, replaceMemoryState } = {}) {
  if (!storage?.getItem || !storage?.setItem) throw new TypeError('Device memory persistence requires storage.');
  if (typeof getMemoryState !== 'function' || typeof replaceMemoryState !== 'function') throw new TypeError('Device memory persistence requires memory state access.');

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
      if (saved?.version !== DEVICE_DERIVED_MEMORY_VERSION) return false;
      const current = getMemoryState() || {};
      replaceMemoryState({
        ...current,
        recentConversationStates: asArray(saved.recentConversationStates),
        conversationCapsules: asArray(saved.conversationCapsules),
        mediaMemories: asArray(saved.mediaMemories)
      });
      if (loadedKey !== primaryKey) {
        await storage.setItem(primaryKey, saved);
        await storage.removeItem(loadedKey);
      }
      return true;
    },
    async save() {
      const memoryState = getMemoryState() || {};
      await storage.setItem(resolveStorageKey(), {
        version: DEVICE_DERIVED_MEMORY_VERSION,
        recentConversationStates: asArray(memoryState.recentConversationStates),
        conversationCapsules: asArray(memoryState.conversationCapsules),
        mediaMemories: asArray(memoryState.mediaMemories)
      });
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
    persist: () => Promise.all([options.saveAppData(), persistence.save()])
  };
}
