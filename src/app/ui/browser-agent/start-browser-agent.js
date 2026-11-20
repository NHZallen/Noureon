// Starts the settings tab of the browser agent (ui/browser-agent/browser-agent-settings.js), on every device. Loaded after the page, like the rail and the keyboard shortcuts; the tab is drawn again when the settings open.

import { mountBrowserAgentSection } from './browser-agent-settings.js';
import * as client from '../../runtime/browser-agent/browser-agent-client.js';
import { clearPendingInvite, readPendingInvite } from '../../runtime/browser-agent/browser-invite-link.js';
import { USER_READY_EVENT, hasCloudAccount } from '../../runtime/features/user-ready.js';

/** deps: document, configAccess (the settings), saveConfig(), getLanguage(), i18n (the tables of the texts). Returns { section }. */
export function startBrowserAgent({ document, configAccess, saveConfig = async () => {}, getLanguage, i18n }) {
  const win = document.defaultView || globalThis;
  const language = () => { try { return getLanguage() || 'zh-TW'; } catch { return 'zh-TW'; } };
  const text = (key) => String((i18n[language()] || i18n['zh-TW'] || {})[key] ?? key);
  let section = null;
  const mount = () => { section = mountBrowserAgentSection({ document, text, client, configAccess, saveConfig, locale: language() }); };
  import('../../../styles/browser-agent-settings.css').catch((error) => { console.warn('The styles of the browser agent settings did not load.', error); }).then(mount);
  const settings = document.getElementById('settings-modal');
  if (settings && typeof win.MutationObserver === 'function') {
    let wasOpen = settings.classList.contains('visible');
    new win.MutationObserver(() => {
      const open = settings.classList.contains('visible');
      if (open && !wasOpen) section?.refresh?.();
      wasOpen = open;
    }).observe(settings, { attributes: true, attributeFilter: ['class'] });
  }
  win.addEventListener('astra:language-changed', () => section?.refresh?.());

  // A person who came by the link of an invite code (runtime/browser-agent/browser-invite-link.js): once signed in, the settings open on this tab with the code in the box. Someone who can
  // already use the browser agent gets nothing opened (the tab tells them the code was not used). Pressing "Redeem" is always the person's.
  let opening = false;
  let shown = false; // once for each start of the page, however often the page tells who is signed in
  const openForInvite = async () => {
    if (opening || shown) return;
    let waiting = '';
    try { waiting = readPendingInvite(win.localStorage); } catch { /* nothing waits */ }
    if (!waiting || !hasCloudAccount()) return;
    opening = true;
    try {
      const access = await client.getAccess();
      if (!access.ok) return;
      if (access.allowed) { try { clearPendingInvite(win.localStorage); } catch { /* nothing */ } return; }
      for (let tries = 0; tries < 20 && !section; tries += 1) await new Promise((resolve) => win.setTimeout(resolve, 150));
      if (!section) return;
      document.getElementById('settings-btn')?.click();
      await new Promise((resolve) => win.setTimeout(resolve, 150));
      document.getElementById('browser-agent-section-nav')?.click();
      shown = true;
      await section.refresh?.();
    } finally { opening = false; }
  };
  document.addEventListener(USER_READY_EVENT, () => { void openForInvite(); });
  void openForInvite();
  return { get section() { return section; } };
}
