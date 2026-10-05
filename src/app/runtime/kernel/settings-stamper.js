// Before the settings are saved: a setting whose value differs from the one stored last gets the time of this save as its stamp (settingsStamps).
// The stamps travel with the settings, and the sync uses them to merge the settings with the cloud's key by key (src/data/settings-merge.js).
// What was stored is read through `readStoredConfig`, given by the page; this module owns no storage.

import { removeSensitiveConfig } from '../security/sensitive-config-redaction.js';
import { SETTINGS_STAMPS_FIELD, stampChangedSettings } from '../../../data/settings-merge.js';

export function createSettingsStamper({ getConfig, readStoredConfig, now = () => Date.now() } = {}) {
  /** Stamps the settings of the config the page holds; false when nothing was stamped (nothing stored yet, or it could not be read). */
  async function stamp() {
    try {
      const previous = await readStoredConfig();
      if (!previous || typeof previous !== 'object') return false;
      const config = getConfig();
      config[SETTINGS_STAMPS_FIELD] = stampChangedSettings(previous, removeSensitiveConfig(config), now());
      return true;
    } catch {
      return false;
    }
  }

  return { stamp };
}
