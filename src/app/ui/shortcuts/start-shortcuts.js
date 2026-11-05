// Starts the keyboard shortcuts (docs/superpowers/specs/2026-11-05-keyboard-shortcuts-design.md): the store (the choice, kept in the settings, so it follows the account), the one key listener, what the
// shortcuts that act on the page do, and the tab of the settings that lists them (only on a computer: a keyboard and a pointer). Loaded after the page, like the rail.

import { createShortcutStore } from './shortcut-store.js';
import { startShortcutDispatcher } from './shortcut-dispatcher.js';
import { registerPageActions } from './shortcut-page-actions.js';
import { setActiveShortcutStore } from './shortcut-hints.js';
import { mountShortcutsSection } from './shortcut-settings.js';
import { USER_READY_EVENT } from '../../runtime/features/user-ready.js';

// The settings come from the cloud (another device changed a key) in these ways: the page is told, and the store looks again.
const SETTINGS_ARRIVED = ['astra:cloud-config', 'astra:cloud-app-data', 'astra:cloud-workspace-committed', 'astra:cloud-cli-merge'];

/** deps: document, configAccess (the settings: getConfig, mutateConfig), saveConfig(), getLanguage(), i18n (the tables of the texts). Returns { store, section }. */
export function startShortcuts({ document, configAccess, saveConfig = async () => {}, getLanguage, i18n }) {
  const win = document.defaultView || globalThis;
  const platform = win.navigator?.platform || '';
  // The language is not always known this early (the settings are read at their own time): the words are taken again when the account is known.
  const language = () => { try { return getLanguage() || 'zh-TW'; } catch { return 'zh-TW'; } };
  const text = (key) => String((i18n[language()] || i18n['zh-TW'] || {})[key] ?? key);
  const store = createShortcutStore({
    getConfig: () => configAccess?.getConfig?.() || {},
    update: (patch) => configAccess?.mutateConfig?.(patch),
    save: saveConfig
  });
  setActiveShortcutStore(store);
  registerPageActions({ document });
  startShortcutDispatcher({ document, store, platform });

  // The tab: only where there is a keyboard and a pointer (the style hides it again when the window becomes a phone's).
  const desktop = win.matchMedia?.('(min-width: 768px) and (pointer: fine)')?.matches !== false;
  let section = null;
  const refresh = () => { store.refresh(); section?.draw?.(); };
  if (desktop) {
    import('../../../styles/shortcuts.css').catch((error) => { console.warn('The styles of the shortcuts did not load.', error); }).then(() => {
      section = mountShortcutsSection({ document, store, platform, text });
    });
  }
  for (const name of SETTINGS_ARRIVED) win.addEventListener(name, refresh);
  document.addEventListener(USER_READY_EVENT, refresh);
  win.addEventListener('astra:language-changed', refresh);
  // The settings open: what the tab shows is what the settings hold now.
  const settings = document.getElementById('settings-modal');
  if (settings && typeof win.MutationObserver === 'function') {
    let wasOpen = settings.classList.contains('visible');
    new win.MutationObserver(() => {
      const open = settings.classList.contains('visible');
      if (open && !wasOpen) refresh();
      wasOpen = open;
    }).observe(settings, { attributes: true, attributeFilter: ['class'] });
  }
  return { store, get section() { return section; } };
}
