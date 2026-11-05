// What the person chose for the keyboard shortcuts (docs/superpowers/specs/2026-11-05-keyboard-shortcuts-design.md): which are on, and the combination of each. It is the setting `keyboardShortcuts`
// (shortcut-config.js), read from the settings every time (so what comes from another device through the cloud is the choice at once) and written back with the settings, so the choice follows
// the account to every device. Only what differs from the registry is kept.

import { SHORTCUTS, shortcutById } from './shortcut-registry.js';
import { isValidShape } from './shortcut-combo.js';
import { normalizeKeyboardShortcuts } from './shortcut-config.js';

/**
 * deps: getConfig() (the settings), update(patch) (puts `patch` into the settings), save() (keeps the settings; may be async).
 * Returns { bindings(), binding(id), set(id, patch), reset(id), resetAll(), conflict(id, combo), refresh(), subscribe(fn), isRecording(), setRecording(on) }.
 * A binding is { id, combo, enabled, changed } where combo is '' when the person took the key away ("none").
 */
export function createShortcutStore({ getConfig = () => ({}), update = () => {}, save = async () => {} } = {}) {
  let recording = false;
  const listeners = new Set();
  let seen = '';

  const read = () => normalizeKeyboardShortcuts(getConfig()?.keyboardShortcuts);
  const tell = () => { seen = JSON.stringify(read()); for (const listener of [...listeners]) { try { listener(); } catch { /* one that fails does not stop the others */ } } };
  const write = (items) => {
    update({ keyboardShortcuts: items });
    tell();
    Promise.resolve().then(() => save()).catch(() => { /* the settings are kept on the next save */ });
  };

  const binding = (id) => {
    const shortcut = shortcutById(id);
    if (!shortcut) return null;
    const item = read()[id] || {};
    const combo = item.combo !== undefined ? item.combo : shortcut.combo;
    const enabled = item.enabled !== false;
    return { id, combo, enabled, changed: combo !== shortcut.combo || !enabled };
  };

  const store = {
    bindings: () => SHORTCUTS.map((shortcut) => binding(shortcut.id)),
    binding,
    /** patch: { combo? ('' = none), enabled? }. */
    set(id, patch = {}) {
      const shortcut = shortcutById(id);
      if (!shortcut) return false;
      const items = read();
      const next = { ...(items[id] || {}) };
      if (patch.combo !== undefined) {
        if (patch.combo !== '' && !isValidShape(patch.combo)) return false;
        if (patch.combo === shortcut.combo) delete next.combo; else next.combo = patch.combo;
      }
      if (patch.enabled !== undefined) {
        if (patch.enabled === true) delete next.enabled; else next.enabled = false;
      }
      const all = { ...items };
      if (Object.keys(next).length) all[id] = next; else delete all[id];
      write(all);
      return true;
    },
    reset(id) {
      const items = read();
      if (!items[id]) return;
      const all = { ...items };
      delete all[id];
      write(all);
    },
    resetAll() {
      if (!Object.keys(read()).length) return;
      write({});
    },
    /** The other shortcut that has this combination (and is on), or null. */
    conflict(id, combo) {
      if (!combo) return null;
      for (const other of SHORTCUTS) {
        if (other.id === id) continue;
        const bound = binding(other.id);
        if (bound.enabled && bound.combo === combo) return other;
      }
      return null;
    },
    /** The settings may have changed under the store (they came from another device): tells the listeners when the choice is not what they last saw. */
    refresh() {
      if (JSON.stringify(read()) !== seen) tell();
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    isRecording: () => recording,
    setRecording(on) { recording = Boolean(on); }
  };
  seen = JSON.stringify(read());
  return store;
}
