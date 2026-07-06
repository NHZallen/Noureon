import { withWorkspaceStorageExclusive } from '../../sync/workspace-storage-coordinator.js';

export function createLegacyRuntimeAppDataPersistence({
  getCurrentUser,
  getAppData,
  getAppDataKey,
  setItem,
  onSaved = () => {}
} = {}) {
  async function saveAppData() {
    return withWorkspaceStorageExclusive(async () => {
      const currentUser = getCurrentUser();
      if (!currentUser) return;
      const snapshot = getAppData();
      await setItem(getAppDataKey(), JSON.stringify(snapshot));
      onSaved(snapshot);
    });
  }

  return {
    saveAppData
  };
}
