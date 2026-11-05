// The key of a shortcut as it is written in the places that name it (the title of a button, the hint in a menu): the one the person chose, or the first one before the shortcuts have started.
// A part that writes one asks here and writes it again when `onShortcutsChanged` says the keys changed. Nothing is written for a shortcut that is off or has no key.

import { shortcutById } from './shortcut-registry.js';
import { formatCombo } from './shortcut-combo.js';

let active = null;
let unsubscribe = null;
const listeners = new Set();

/** The store of the page (shortcut-store.js), set when the shortcuts start. */
export function setActiveShortcutStore(store) {
  unsubscribe?.();
  active = store || null;
  unsubscribe = active ? active.subscribe(() => { for (const listener of [...listeners]) listener(); }) : null;
  for (const listener of [...listeners]) listener();
}

/** The key of `id` for the person ('' when there is none or it is off). */
export function shortcutLabelFor(id, platform = '') {
  const shortcut = shortcutById(id);
  if (!shortcut) return '';
  const binding = active ? active.binding(id) : { combo: shortcut.combo, enabled: true };
  if (!binding?.enabled || !binding.combo) return '';
  return formatCombo(binding.combo, platform);
}

export function onShortcutsChanged(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
