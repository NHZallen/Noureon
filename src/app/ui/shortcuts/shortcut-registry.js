// Every keyboard shortcut of the app, in one list (docs/superpowers/specs/2026-11-05-keyboard-shortcuts-design.md): its name in the texts, the group it is shown under in the settings, the combination it has until
// the person changes it. The parts that do the work register what a shortcut does with `registerShortcutAction` (shortcut-actions.js); this list only says what there is. A new shortcut is a line here
// (and its words in data/i18n/parts/shortcuts.js, in the five languages).

/** The groups of the settings page, in the order they are shown. `fixed` is the group of the keys that cannot be changed. */
export const SHORTCUT_GROUPS = Object.freeze([
  { id: 'composer', textKey: 'scGroupComposer' },
  { id: 'chat', textKey: 'scGroupChat' },
  { id: 'navigation', textKey: 'scGroupNavigation' },
  { id: 'fixed', textKey: 'scGroupFixed' }
]);

/**
 * The shortcuts the person can change or turn off. `combo` is the one it has at first (shortcut-combo.js form: Mod is Ctrl, or Command on a Mac).
 * `modal`: also works while a window (a dialog, the settings…) is over the page; the others wait for the window to close.
 */
export const SHORTCUTS = Object.freeze([
  { id: 'focusComposer', group: 'composer', textKey: 'scFocusComposer', combo: 'Shift+Escape', modal: false },
  { id: 'dictate', group: 'composer', textKey: 'scDictate', combo: 'Mod+Shift+D', modal: false },
  { id: 'attachFile', group: 'composer', textKey: 'scAttachFile', combo: 'Mod+Shift+U', modal: false },
  { id: 'newChat', group: 'chat', textKey: 'scNewChat', combo: 'Mod+Shift+O', modal: false },
  { id: 'searchChats', group: 'chat', textKey: 'scSearchChats', combo: 'Mod+K', modal: false },
  { id: 'goHome', group: 'navigation', textKey: 'scGoHome', combo: 'Mod+Shift+H', modal: true },
  { id: 'openExtensions', group: 'navigation', textKey: 'scOpenExtensions', combo: 'Mod+Shift+E', modal: true },
  { id: 'openSettings', group: 'navigation', textKey: 'scOpenSettings', combo: 'Mod+,', modal: true },
  { id: 'togglePanel', group: 'navigation', textKey: 'scTogglePanel', combo: 'Mod+Shift+S', modal: true },
  { id: 'showShortcuts', group: 'navigation', textKey: 'scShowShortcuts', combo: 'Mod+/', modal: true }
]);

/** The keys that keep their own use and are only listed (the person cannot change them). */
export const FIXED_SHORTCUTS = Object.freeze([
  { id: 'fixedSend', group: 'fixed', textKey: 'scFixedSend', combo: 'Enter' },
  { id: 'fixedNewline', group: 'fixed', textKey: 'scFixedNewline', combo: 'Shift+Enter' },
  { id: 'fixedEscape', group: 'fixed', textKey: 'scFixedEscape', combo: 'Escape' }
]);

export const shortcutById = (id) => SHORTCUTS.find((shortcut) => shortcut.id === id) || null;
