import { removeSensitiveConfig } from '../security/sensitive-config-redaction.js';

export function createLegacyRuntimeConfigPersistence({
  getCurrentUser,
  getConfig,
  getConfigKey,
  setItem
} = {}) {
  async function saveConfig() {
    const currentUser = getCurrentUser();
    if (currentUser) {
      await setItem(getConfigKey(), JSON.stringify(removeSensitiveConfig(getConfig())));
    }
  }

  return {
    saveConfig
  };
}
