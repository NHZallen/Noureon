// Starts the rail of icons (rail.js) as soon as the page has it: the icons, the panel and the buttons of the page are there and work when the page appears, they do not wait for the account (the picture of the
// account is painted when it is known: the avatar part paints every .user-avatar, and is asked again once the rail is built). A person (or a test of the site) who does not want the rail sets localStorage "noureon.rail" to "off".

import { createRail } from './rail.js';
import { USER_READY_EVENT, announceUser, getAnnouncedUser } from '../../runtime/features/user-ready.js';

const browserStorage = (win) => {
  try { return win.localStorage || null; } catch { return null; }
};

/** deps: document, getLanguage(), i18n (the tables of the texts), toggleSidebar(show?). Returns the rail or null. */
export function startRail({ document, getLanguage, i18n, toggleSidebar }) {
  const win = document.defaultView || globalThis;
  if (browserStorage(win)?.getItem('noureon.rail') === 'off') return null;
  // The rail starts before the settings are read: the language is not known yet then (the page's settings may be absent), and the words are taken again when the account is known.
  const language = () => { try { return getLanguage() || 'zh-TW'; } catch { return 'zh-TW'; } };
  const text = (key) => String((i18n[language()] || i18n['zh-TW'] || {})[key] ?? key);
  const make = () => createRail({ document, storage: browserStorage(win), toggleSidebar, text, platform: win.navigator?.platform || '' });
  let rail = null;
  // The picture of the account is painted into every .user-avatar when the account is known; the rail is built now and may be later than that, so the account is told again (nothing is asked from the database again).
  const tellAccount = () => { const user = getAnnouncedUser(); if (user) announceUser(document, user); };
  let starting = null;
  // The styles come with the rail (a file of their own, not in the sheet the page loads at start): the rail and its layout appear together.
  const begin = () => {
    starting ||= import('../../../styles/rail.css').catch((error) => { console.warn('The styles of the rail did not load.', error); }).then(() => { if (!rail) { rail = make(); tellAccount(); } return rail; }).catch((error) => { console.warn('The rail did not start.', error); return null; });
    return starting;
  };
  begin();
  // The language of the page may be settled after the rail was built (the settings are read at their own time): the words are taken again when the account is known and when the language changes.
  document.addEventListener(USER_READY_EVENT, () => rail?.refresh());
  win.addEventListener('astra:language-changed', () => rail?.refresh());
  return { get rail() { return rail; }, begin };
}
