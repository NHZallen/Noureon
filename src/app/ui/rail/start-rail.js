// Starts the rail of icons (rail.js) once the page has it and says it is on (`html[data-rail="on"]`, set before the first paint by public/theme-init.js). The panel is opened or shut
// after the workspace has started (it shuts the menu on a computer when it starts), so the rail waits for the account to be known (`noureon:user-ready`) the first time.

import { createRail } from './rail.js';
import { USER_READY_EVENT, getAnnouncedUser } from '../../runtime/features/user-ready.js';

const browserStorage = (win) => {
  try { return win.localStorage || null; } catch { return null; }
};

/** deps: document, getLanguage(), i18n (the tables of the texts), toggleSidebar(show?). Returns the rail or null. */
export function startRail({ document, getLanguage, i18n, toggleSidebar }) {
  const win = document.defaultView || globalThis;
  if (document.documentElement.getAttribute('data-rail') !== 'on') return null;
  const text = (key) => String((i18n[getLanguage()] || i18n['zh-TW'] || {})[key] ?? key);
  const make = () => createRail({ document, storage: browserStorage(win), toggleSidebar, text, platform: win.navigator?.platform || '' });
  let rail = null;
  let starting = null;
  // The styles come with the rail (a file of their own, not in the sheet the page loads at start): the rail and its layout appear together.
  const begin = () => {
    starting ||= import('../../../styles/rail.css').catch((error) => { console.warn('The styles of the rail did not load.', error); }).then(() => { rail ||= make(); return rail; });
    return starting;
  };
  // The account may be known already (the event came before this part loaded).
  if (getAnnouncedUser()) begin();
  else document.addEventListener(USER_READY_EVENT, begin, { once: true });
  win.addEventListener('astra:language-changed', () => rail?.refresh());
  return { get rail() { return rail; }, begin };
}
