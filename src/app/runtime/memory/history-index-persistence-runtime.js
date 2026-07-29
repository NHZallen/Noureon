import { createHistoryIndexPersistence } from './history-index-persistence.js';

export function createHistoryIndexPersistenceRuntime({
  index,
  storage,
  getOwner,
  onLoaded = () => {},
  logger = console
} = {}) {
  const persistence = storage?.getItem
    ? createHistoryIndexPersistence({
        index,
        storage,
        storageKey: () => `noureon:history-index:v1:${getOwner()}`,
        fallbackStorageKeys: () => getOwner() === 'anonymous'
          ? []
          : ['noureon:history-index:v1:anonymous']
      })
    : null;
  let loaded = false;
  let ready = null;
  const ensureReady = () => {
    if (!ready) {
      ready = (persistence
        ? persistence.load().catch(error => logger.warn('Memory index could not load.', error))
        : Promise.resolve())
        .finally(() => {
          loaded = true;
          onLoaded();
        });
    }
    return ready;
  };
  return {
    persistence,
    ensureReady,
    isLoaded: () => loaded
  };
}
