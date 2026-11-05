// The keyboard shortcuts as the settings keep them (docs/superpowers/specs/2026-11-05-keyboard-shortcuts-design.md): one setting, `keyboardShortcuts`, a map from the id of a shortcut to what differs from
// the registry: { combo: 'Mod+K' | '' (the key was taken away), enabled: false }. It is a setting like the others, so it is kept with the account, goes to the cloud with the other settings
// (merged setting by setting, data/settings-merge.js) and is in the backup of the settings. Pure.

import { SHORTCUTS } from './shortcut-registry.js';
import { isValidShape } from './shortcut-combo.js';

/** What a saved value is after it is checked: only known shortcuts, only combinations of the right form, only what differs from the registry. */
export function normalizeKeyboardShortcuts(value) {
  const clean = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return clean;
  for (const shortcut of SHORTCUTS) {
    const item = value[shortcut.id];
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const entry = {};
    if (item.combo === '' || item.combo === null) entry.combo = '';
    else if (typeof item.combo === 'string' && isValidShape(item.combo) && item.combo !== shortcut.combo) entry.combo = item.combo;
    if (item.enabled === false) entry.enabled = false;
    if (Object.keys(entry).length) clean[shortcut.id] = entry;
  }
  return clean;
}
