// The security page on a phone is a short list that opens pages, as the settings of the big vendors are (docs/superpowers/specs/2026-11-12-vault-recovery-design.md, §20): small headings
// (Sign-in, Extra protection, Sessions) with one row for each card, and a tap opens that card alone as a page of its own; the arrow at the top goes back to the list. The cards, their
// buttons and their ids are the same ones the controls already drive; this file only decides which of them is on the screen (the `data-page` of the section, styled in user-settings.css).
// On a computer the list is not shown and every card is on the page as before.

import { onSettingsSectionBack } from './settings-section-back.js';

const PAGES = [
  { id: 'login', card: 'security-login-card', title: ['loginPasswordRowTitle', '登入密碼'], desc: ['loginPasswordRowDesc', '用來登入你的帳號'], group: 'signin' },
  { id: 'sync', card: 'security-sync-card', title: ['cloudSyncTitle', '雲端同步'], desc: ['securitySyncRowDesc', '同步密碼與雲端同步'], group: 'signin' },
  { id: 'passkey', card: 'security-passkey-card', title: ['securityPasskeyTitle', '通行金鑰'], desc: ['securityPasskeyDesc', '用 Face ID 或指紋救回與解鎖'], group: 'protection' },
  { id: 'totp', card: 'security-totp-card', title: ['securityTotpTitle', '驗證器'], desc: ['securityTotpDesc', '用驗證器 app 的六位數保護重要的變更。'], group: 'protection' },
  { id: 'keyguard', card: 'security-keyguard-card', title: ['securityKeyguardTitle', '本機金鑰保護'], desc: ['securityKeyguardDesc', '用通行金鑰鎖住這台裝置上的 API 金鑰。'], group: 'protection' },
  { id: 'devices', card: 'security-devices-card', title: ['securityDevicesTitle', '登入的裝置'], desc: ['securityDevicesDesc', '查看哪些裝置已登入，或把它們登出。'], group: 'sessions' }
];
const GROUPS = [
  ['signin', 'securityGroupSignIn', '登入'],
  ['protection', 'securityGroupProtection', '額外保護'],
  ['sessions', 'securityGroupSessions', '工作階段']
];
const RIGHT = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"></polyline></svg>';

export function mountSecurityPages({ document, window, text, section }) {
  const host = section.querySelector('#security-pages');
  if (!host) return;
  const card = (page) => section.querySelector(`#${page.card}`);

  const setTitle = (value) => { const title = document.getElementById('settings-mobile-title'); if (title) title.textContent = value; };
  const rootTitle = () => text('securitySettings', '安全性與登入');

  function build() {
    host.textContent = '';
    for (const [group, key, fallback] of GROUPS) {
      const rows = PAGES.filter((page) => page.group === group);
      const wrap = document.createElement('div');
      wrap.className = 'sp-group';
      wrap.dataset.group = group;
      const heading = document.createElement('div');
      heading.className = 'sp-heading';
      heading.textContent = text(key, fallback);
      const list = document.createElement('div');
      list.className = 'us-card sp-list';
      for (const page of rows) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'us-row sp-row';
        row.dataset.page = page.id;
        const mark = document.createElement('span');
        mark.className = 'us-mark';
        mark.innerHTML = card(page)?.querySelector('.us-mark')?.innerHTML || '';
        const body = document.createElement('span');
        body.className = 'us-row-text';
        const title = document.createElement('span');
        title.className = 'us-row-title';
        title.textContent = text(...page.title);
        const desc = document.createElement('span');
        desc.className = 'us-row-desc';
        desc.textContent = text(...page.desc);
        body.append(title, desc);
        const chevron = document.createElement('span');
        chevron.className = 'sp-chevron';
        chevron.innerHTML = RIGHT;
        row.append(mark, body, chevron);
        list.append(row);
      }
      wrap.append(heading, list);
      host.append(wrap);
    }
    sync();
  }

  // A card with nothing on show (every part of it hidden: the login password of a local account) would open as a blank page, so it has no row.
  const hasContent = (target) => [...target.children].some((child) => !child.classList.contains('hidden'));

  // A row follows its card: the card of a passkey is hidden for an account that is not in the cloud, and its row goes too; a heading with no row goes with them.
  function sync() {
    for (const page of PAGES) {
      const row = host.querySelector(`[data-page="${page.id}"]`);
      const target = card(page);
      if (row) row.classList.toggle('hidden', !target || target.classList.contains('hidden') || !hasContent(target));
    }
    for (const wrap of host.querySelectorAll('.sp-group')) wrap.classList.toggle('hidden', !wrap.querySelector('.sp-row:not(.hidden)'));
    // A page that is open when its card goes away (a refresh that hides it, signing out of the cloud) would be blank: it goes back to the list.
    const openRow = section.dataset.page ? host.querySelector(`[data-page="${section.dataset.page}"]`) : null;
    if (openRow?.classList.contains('hidden')) back();
  }

  function open(id) {
    const page = PAGES.find((item) => item.id === id);
    if (!page) return;
    section.dataset.page = id;
    setTitle(text(...page.title));
    // The list of devices is loaded when its row is opened; on its own page it is simply open.
    const toggle = section.querySelector('#security-devices-toggle');
    if (id === 'devices' && toggle?.getAttribute('aria-expanded') !== 'true') toggle.click();
    const scroller = section.closest('.scroll-area') || section.parentElement;
    if (scroller) scroller.scrollTop = 0;
  }

  /** Goes back from a page to the list; false when it is on the list already (the arrow then leaves the section). */
  function back() {
    if (!section.dataset.page) return false;
    section.dataset.page = '';
    setTitle(rootTitle());
    return true;
  }

  section.dataset.page = '';
  build();
  host.addEventListener('click', (event) => {
    const row = event.target.closest?.('.sp-row');
    if (row) open(row.dataset.page);
  });
  const Observer = window?.MutationObserver;
  if (Observer) {
    const observer = new Observer(sync);
    for (const page of PAGES) { const target = card(page); if (target) observer.observe(target, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true }); }
    // Leaving the section (the list of settings, a closed window) puts it back on its list for the next time.
    new Observer(() => { if (!section.classList.contains('active') && section.dataset.page) section.dataset.page = ''; }).observe(section, { attributes: true, attributeFilter: ['class'] });
  }
  // The words are made when the list is drawn: it is drawn again when the language changes.
  window.addEventListener('astra:language-changed', () => { if (host.isConnected) build(); });
  onSettingsSectionBack('security-section', back);
}
