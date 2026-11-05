// The one place that listens to the keys for the keyboard shortcuts (docs/superpowers/specs/2026-11-05-keyboard-shortcuts-design.md): a key goes to the shortcut that has its combination, when that
// shortcut is on and its action is registered. It leaves the keys alone while a combination is being chosen in the settings, while an input method is composing, when a key is held down, and
// (for the shortcuts that do not work over a dialog) while a dialog is open.

import { SHORTCUTS } from './shortcut-registry.js';
import { comboFromEvent } from './shortcut-combo.js';
import { hasShortcutAction, runShortcutAction } from './shortcut-actions.js';

// A dialog is over the page (a window that asks something, a menu). The settings and the Extensions are pages of their own, not dialogs: a shortcut that acts on the chat takes the person back to it.
const dialogIsOpen = (document) => Boolean(document.querySelector?.('.modal.visible:not(#settings-modal), .pj-backdrop, .rail-menu, .picker-dialog'));

/** deps: document, store (shortcut-store.js), platform. Returns { stop() }. */
export function startShortcutDispatcher({ document, store, platform = '' }) {
  const onKeyDown = (event) => {
    if (event.defaultPrevented || event.isComposing || event.repeat || store.isRecording()) return;
    const { combo } = comboFromEvent(event, platform);
    if (!combo) return;
    for (const shortcut of SHORTCUTS) {
      const binding = store.binding(shortcut.id);
      if (!binding.enabled || binding.combo !== combo || !hasShortcutAction(shortcut.id)) continue;
      // The shortcuts that go to another place work over a dialog; the ones that act on the chat wait for it to close.
      if (!shortcut.modal && dialogIsOpen(document)) return;
      if (runShortcutAction(shortcut.id, { event })) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
  };
  // Before the page's own handlers: a key that has a shortcut is the shortcut's (the composer would type it).
  document.addEventListener('keydown', onKeyDown, true);
  return { stop: () => document.removeEventListener('keydown', onKeyDown, true) };
}
