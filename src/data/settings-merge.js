// The other settings (everything but the CLI lists, which have their own merge in cli-settings-merge.js) travel to the cloud as one piece, and the
// newer piece used to replace the older whole: a device that had not yet heard of a change (the network mode set on another device) wiped it out
// by saving anything. They are merged key by key instead:
//   - when a setting changes on a device (saveConfig sees its stored value differ), the setting leaves a time stamp (settingsStamps);
//   - when settings meet the cloud's, a setting whose cloud stamp is later than this device's is taken from the cloud; otherwise this device keeps
//     its own (so settings with no stamp on either side, made before stamps, behave as they always did: the device that sends wins).
// Not merged here: the CLI lists (their own merge), the API keys (the vault), and the memory (it has its own merge). Pure functions.

import { CLI_MERGED_FIELDS, normalizeStamps } from './cli-settings-merge.js';

export const SETTINGS_STAMPS_FIELD = 'settingsStamps';
/** Settings that are not merged key by key. */
export const NOT_MERGED_SETTINGS = Object.freeze(new Set([...CLI_MERGED_FIELDS, SETTINGS_STAMPS_FIELD, 'apiKeys', 'memorySync']));

const settingKey = (key) => {
  const name = String(key || '');
  return /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(name) && !NOT_MERGED_SETTINGS.has(name) ? name : '';
};
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const stampOf = (stamps, key) => Number(stamps?.[key]) || 0;

/** The stamps of settings as the config keeps them: { setting: milliseconds }, only real settings, at most as many as the lists keep. */
export const normalizeSettingsStamps = (value) => normalizeStamps(value, settingKey);

/**
 * The stamps after a save: the ones the config had, and `now` for each setting whose value differs from what was stored before.
 * `previous` is the stored config (null when there is none: nothing is stamped). `current` is what is being stored now.
 */
export function stampChangedSettings(previous, current, now = Date.now()) {
  const stamps = normalizeSettingsStamps(current?.[SETTINGS_STAMPS_FIELD]);
  if (!previous || typeof previous !== 'object' || !current || typeof current !== 'object') return stamps;
  for (const key of new Set([...Object.keys(previous), ...Object.keys(current)])) {
    if (settingKey(key) && !same(previous[key], current[key])) stamps[key] = now;
  }
  return normalizeSettingsStamps(stamps);
}

/**
 * What the settings are when this device's (`local`) meet the cloud's (`remote`): { fields, stamps }. `fields` holds only the settings that
 * come from the cloud (a later stamp there, and a different value); `stamps` is the later stamp of each setting.
 */
export function mergeSettings(local, remote) {
  const l = local && typeof local === 'object' ? local : {};
  const r = remote && typeof remote === 'object' ? remote : {};
  const localStamps = normalizeSettingsStamps(l[SETTINGS_STAMPS_FIELD]);
  const remoteStamps = normalizeSettingsStamps(r[SETTINGS_STAMPS_FIELD]);
  const fields = {};
  for (const key of Object.keys(r)) {
    if (!settingKey(key) || !Object.prototype.hasOwnProperty.call(r, key)) continue;
    if (stampOf(remoteStamps, key) > stampOf(localStamps, key) && !same(r[key], l[key])) fields[key] = r[key];
  }
  const stamps = { ...localStamps };
  for (const [key, at] of Object.entries(remoteStamps)) stamps[key] = Math.max(stampOf(stamps, key), at);
  return { fields, stamps: normalizeSettingsStamps(stamps) };
}

/** Whether the merge gave this side something: a setting from the cloud, or a later stamp. */
export function settingsMergeChanged(local, merged) {
  return Object.keys(merged.fields).length > 0 || !same(normalizeSettingsStamps(local?.[SETTINGS_STAMPS_FIELD]), merged.stamps);
}
