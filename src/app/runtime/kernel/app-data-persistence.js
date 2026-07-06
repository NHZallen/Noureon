import { withWorkspaceStorageExclusive } from '../../sync/workspace-storage-coordinator.js';

export function createLegacyRuntimeAppDataPersistence({
  getCurrentUser,
  getAppData,
  getAppDataKey,
  setItem,
  onSaved = () => {},
  logger = console
} = {}) {
  async function saveAppData() {
    return withWorkspaceStorageExclusive(async () => {
      const currentUser = getCurrentUser();
      if (!currentUser) return;
      const snapshot = getAppData();
      await setItem(getAppDataKey(), JSON.stringify(snapshot));
      await Promise.resolve(onSaved(snapshot)).then(undefined, error => {
        logger.warn('AstraChat cloud conversation sync could not observe a local save.', error);
      });
    });
  }

  return {
    saveAppData
  };
}
