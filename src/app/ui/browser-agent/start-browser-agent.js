// Starts the settings tab of the browser agent (ui/browser-agent/browser-agent-settings.js), on every device. Loaded after the page, like the rail and the keyboard shortcuts; the tab is drawn again when the settings open.

import { mountBrowserAgentSection } from './browser-agent-settings.js';
import * as client from '../../runtime/browser-agent/browser-agent-client.js';

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
  return { get section() { return section; } };
}
