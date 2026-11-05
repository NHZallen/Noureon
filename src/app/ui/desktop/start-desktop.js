// Starts what is only for a computer, after the page has started (docs/superpowers/specs/2026-11-05-desktop-rail-sidebar-design.md, 2026-11-05-keyboard-shortcuts-design.md): the rail of icons beside the left
// menu and the keyboard shortcuts with their tab of the settings. One line in the shell (runtime/shell/shell.js) starts both; each is loaded by itself and one that fails does not stop the other.

/** deps: document, configAccess (the settings), saveConfig(), i18n (the tables of the texts), toggleSidebar(show?). */
export function startDesktop({ document, configAccess, saveConfig, i18n, toggleSidebar }) {
  const getLanguage = () => configAccess.getConfig().uiLanguage;
  const warn = (what) => (error) => console.warn(`${what} did not start.`, error);
  import('../rail/start-rail.js').then(({ startRail }) => startRail({ document, getLanguage, i18n, toggleSidebar })).catch(warn('The rail'));
  import('../shortcuts/start-shortcuts.js').then(({ startShortcuts }) => startShortcuts({ document, configAccess, saveConfig, getLanguage, i18n })).catch(warn('The keyboard shortcuts'));
}
