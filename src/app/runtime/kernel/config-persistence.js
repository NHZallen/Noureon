import { removeSensitiveConfig } from '../security/sensitive-config-redaction.js';

export function createLegacyRuntimeConfigPersistence({
  getCurrentUser,
  getConfig,
  getConfigKey,
  setItem,
  onSaved = () => {}
} = {}) {
  async function markCloudSyncPending() {
    try {
      return await onSaved();
    } catch {
      return false;
    }
  }

  async function saveConfig() {
    const currentUser = getCurrentUser();
    if (currentUser) {
      const serializedConfig = JSON.stringify(removeSensitiveConfig(getConfig()));
      await markCloudSyncPending();
      await setItem(getConfigKey(), serializedConfig);
      await markCloudSyncPending();
    }
  }

  return {
    saveConfig
  };
}
