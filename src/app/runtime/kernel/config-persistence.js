import { removeSensitiveConfig } from '../security/sensitive-config-redaction.js';
import { SETTINGS_STAMPS_FIELD, stampChangedSettings } from '../../../data/settings-merge.js';

export function createLegacyRuntimeConfigPersistence({
  getCurrentUser,
  getConfig,
  getConfigKey,
  setItem,
  getItem = null,
  now = () => Date.now(),
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
      const config = getConfig();
      const stored = removeSensitiveConfig(config);
      // A setting that differs from what was stored before is stamped with this moment: what lets devices merge the settings key by key.
      try {
        const previous = typeof getItem === 'function' ? JSON.parse(await getItem(getConfigKey()) || 'null') : null;
        if (previous && typeof previous === 'object') {
          config[SETTINGS_STAMPS_FIELD] = stampChangedSettings(previous, stored, now());
          stored[SETTINGS_STAMPS_FIELD] = config[SETTINGS_STAMPS_FIELD];
        }
      } catch {
        // What was stored cannot be read: nothing is stamped this time.
      }
      const serializedConfig = JSON.stringify(stored);
      await markCloudSyncPending();
      await setItem(getConfigKey(), serializedConfig);
      await markCloudSyncPending();
    }
  }

  return {
    saveConfig
  };
}
