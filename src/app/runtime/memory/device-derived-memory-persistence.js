const asArray = value => Array.isArray(value) ? value : [];

export const DEVICE_DERIVED_MEMORY_VERSION = 1;

export function createDeviceDerivedMemoryPersistence({ storage, storageKey, getMemoryState, replaceMemoryState } = {}) {
  if (!storage?.getItem || !storage?.setItem) throw new TypeError('Device memory persistence requires storage.');
  if (typeof getMemoryState !== 'function' || typeof replaceMemoryState !== 'function') throw new TypeError('Device memory persistence requires memory state access.');

  return {
    async load() {
      const saved = await storage.getItem(storageKey);
      if (saved?.version !== DEVICE_DERIVED_MEMORY_VERSION) return false;
      const current = getMemoryState() || {};
      replaceMemoryState({
        ...current,
        recentConversationStates: asArray(saved.recentConversationStates),
        conversationCapsules: asArray(saved.conversationCapsules),
        mediaMemories: asArray(saved.mediaMemories)
      });
      return true;
    },
    async save() {
      const memoryState = getMemoryState() || {};
      await storage.setItem(storageKey, {
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
