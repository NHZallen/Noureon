// The "Browser agent" tab of the settings (docs/superpowers/specs/2026-11-16-browser-agent-design.md, §9 and §16): the invite code (when the person has none yet), the accounts kept in the password
// vault with a ⋯ menu each, the login state of the browser (stay logged in, delete it), and the person's own invite codes. The people in charge have their own page (noureon.com/admin/browser), not this tab.
// A site shows its own icon (its /favicon.ico, asked of the site itself and of nobody else) and a globe when it has none. Words are put in with textContent; nothing here ever holds a password.

import { onSettingsSectionBack } from '../../runtime/settings/settings-section-back.js';
import { clearPendingInvite, inviteUrl, readPendingInvite } from '../../runtime/browser-agent/browser-invite-link.js';

const SECTION_ID = 'browser-agent-section';
const NAV_ID = 'browser-agent-section-nav';
const SVG_NS = 'http://www.w3.org/2000/svg';
const CONFIRM_MS = 4000;
const MESSAGE_MS = 4500;
const COPIED_MS = 1600;

const fill = (template, values) => String(template).replace(/\{(\w+)\}/g, (_, name) => values[name] ?? '');

const icon = (document, paths, size = 18) => {
  const svg = document.createElementNS(SVG_NS, 'svg');
  for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', width: String(size), height: String(size), fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(key, value);
  svg.innerHTML = paths;
  return svg;
};
// The marks in front of the rows (the same line style as the rest of the settings).
const KEEP = '<path d="M21 12a9 9 0 1 1-3-6.7"></path><path d="M21 4v5h-5"></path>';
const TRASH = '<path d="M4 7h16"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"></path><path d="M9 7V4h6v3"></path>';
const ACCOUNTS = '<circle cx="9" cy="8" r="3.2"></circle><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"></path><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6"></path><path d="M18 14.4c1.8.8 3 2.6 3 5.6"></path>';
const TICKET = '<path d="M3 9a2 2 0 0 0 0 6v2a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-2a2 2 0 0 1 0-6V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1z"></path><path d="M14 6v12" stroke-dasharray="2 3"></path>';
const CHEVRON_RIGHT = '<path d="M9 6l6 6-6 6"></path>';
const CHEVRON_LEFT = '<path d="M15 6l-6 6 6 6"></path>';
export const GLOBE = '<circle cx="12" cy="12" r="9"></circle><path d="M3 12h18"></path><path d="M12 3a14 14 0 0 1 0 18"></path><path d="M12 3a14 14 0 0 0 0 18"></path>';

const hostOf = (origin) => { try { return new URL(origin).hostname; } catch { return ''; } };
export const formatSize = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/**
 * deps: document, text(key), client (runtime/browser-agent/browser-agent-client.js), configAccess + saveConfig (the "stay logged in" choice is a setting that goes to the cloud), locale.
 * Adds the tab once (after "Tool models") and draws it. Returns { refresh() } or null when the page has no list of settings parts.
 */
export function mountBrowserAgentSection({ document, text, client, configAccess = null, saveConfig = async () => {}, locale = 'en' }) {
  const nav = document.getElementById('settings-nav');
  const anchorNav = nav?.querySelector('[data-section="tool-models"]') || nav?.lastElementChild;
  const anchorSection = document.getElementById('tool-models-section') || document.querySelector('.settings-section:last-of-type');
  if (!nav || !anchorNav || !anchorSection) return null;
  if (!document.getElementById(NAV_ID)) {
    const item = document.createElement('li');
    item.className = 'settings-nav-item p-3 rounded-md ba-nav';
    item.id = NAV_ID;
    item.dataset.section = 'browser-agent';
    item.dataset.langKey = 'baNav';
    item.textContent = text('baNav');
    anchorNav.after(item);
  }
  let section = document.getElementById(SECTION_ID);
  if (!section) {
    section = document.createElement('div');
    section.className = 'settings-section';
    section.id = SECTION_ID;
    anchorSection.after(section);
  }
  const win = document.defaultView || globalThis;
  let confirming = null;
  let notice = '';
  let noticeTimer = null;
  let drawing = 0;
  // Which page of the tab is open: the first one, or the list of the connected site accounts (a page of its own, so the first page stays short).
  let view = 'main';
  const goTo = (next) => { view = next; void draw(); };
  onSettingsSectionBack(SECTION_ID, () => { if (view === 'main') return false; goTo('main'); return true; });

  const el = (tag, className, content) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  };
  const say = (message) => { notice = message; win.clearTimeout?.(noticeTimer); noticeTimer = win.setTimeout?.(() => { notice = ''; void draw(); }, MESSAGE_MS); void draw(); };

  // A button that asks twice: the first press changes its words, the second (within a few seconds) does it.
  const twice = (button, label, confirmLabel, id, run) => {
    button.textContent = confirming === id ? confirmLabel : label;
    button.dataset.reserve = confirming === id ? label : confirmLabel; // the button keeps the width of the longer words, so it does not move when the words change
    button.classList.toggle('is-confirming', confirming === id);
    button.addEventListener('click', async () => {
      if (confirming !== id) {
        confirming = id;
        win.setTimeout?.(() => { if (confirming === id) { confirming = null; void draw(); } }, CONFIRM_MS);
        void draw();
        return;
      }
      confirming = null;
      await run();
    });
    return button;
  };

  // The icon of a site: its own, and a globe when the site has none (or cannot be reached). The page is drawn again at every change, so a mark is made once per login and moved into
  // the new row: a new picture each time was loaded again and flashed (a blank, then the globe) at every draw (Allen, 2026-11-20).
  const marks = new Map();
  const siteMark = (key, origin) => {
    if (marks.has(key)) return marks.get(key);
    const mark = el('span', 'ba-mark');
    marks.set(key, mark);
    const host = hostOf(origin);
    const globe = () => mark.replaceChildren(icon(document, GLOBE));
    if (!host) { globe(); return mark; }
    const image = document.createElement('img');
    image.alt = '';
    image.width = 20;
    image.height = 20;
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    // The site's own icon, from the two places sites keep it; a globe when neither has one. Both are asked of the site itself and of nobody else.
    const places = [`https://${host}/favicon.ico`, `https://${host}/apple-touch-icon.png`];
    let next = 0;
    image.addEventListener('error', () => { next += 1; if (next < places.length) image.src = places[next]; else globe(); });
    image.src = places[0];
    mark.append(image);
    return mark;
  };

  const mark = (paths) => { const node = el('span', 'ba-mark'); node.append(icon(document, paths)); return node; };
  const when = (value) => { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? date.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }) : text('baNever'); };
  const secTitle = (key) => { const title = el('div', 'ba-sec-title', text(key)); title.setAttribute('role', 'heading'); title.setAttribute('aria-level', '3'); return title; };
  const row = (...children) => { const node = el('div', 'ba-row'); node.append(...children); return node; };
  const body = (title, desc) => { const wrap = el('div', 'ba-text'); wrap.append(el('span', 'ba-title pz-label', title)); if (desc) wrap.append(el('span', 'ba-desc', desc)); return wrap; };
  const pill = (label, className = '') => el('span', `ba-tag ${className}`.trim(), label);
  const moreMenu = (items, id) => {
    const wrap = el('div', 'ba-more-wrap');
    const more = el('button', 'ba-more');
    more.type = 'button';
    more.setAttribute('aria-label', text('baMore'));
    more.setAttribute('aria-haspopup', 'menu');
    more.append(icon(document, '<circle cx="5" cy="12" r="1"></circle><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle>'));
    const menu = el('div', 'ba-menu');
    menu.setAttribute('role', 'menu');
    menu.hidden = true;
    for (const item of items) {
      const entry = el('button', `ba-menu-item${item.danger ? ' is-danger' : ''}`);
      entry.type = 'button';
      entry.setAttribute('role', 'menuitem');
      if (item.confirmKey) twice(entry, item.label, text(item.confirmKey), `${id}:${item.id}`, item.run);
      else { entry.textContent = item.label; entry.addEventListener('click', () => { menu.hidden = true; void item.run(); }); }
      menu.append(entry);
    }
    const close = (event) => { if (!wrap.contains(event.target)) { menu.hidden = true; document.removeEventListener('pointerdown', close, true); } };
    more.addEventListener('click', () => {
      menu.hidden = !menu.hidden;
      if (!menu.hidden) document.addEventListener('pointerdown', close, true);
    });
    wrap.append(more, menu);
    return wrap;
  };

  const copy = async (value, button) => {
    const label = button.textContent;
    button.dataset.reserve = text('baCopied');
    try {
      await win.navigator.clipboard.writeText(value);
      button.textContent = text('baCopied');
      win.setTimeout?.(() => { button.textContent = label; }, COPIED_MS);
    } catch { /* the code stays on the screen to be copied by hand */ }
  };
  // The code that came with a link (runtime/browser-agent/browser-invite-link.js): it waits in the box until the person presses the button.
  const pendingCode = () => { try { return readPendingInvite(win.localStorage); } catch { return ''; } };
  const forgetPending = () => { try { clearPendingInvite(win.localStorage); } catch { /* nothing */ } };

  function inviteBlock(redo) {
    const block = el('section', 'ba-sec');
    block.append(secTitle('baSecInvite'));
    const card = el('div', 'ba-card');
    card.append(row(mark(TICKET), body(text('baNeedInvite'), text('baNeedInviteDesc'))));
    const input = el('input', 'ba-code');
    input.type = 'text';
    input.placeholder = text('baCodePlaceholder');
    input.autocomplete = 'off';
    input.autocapitalize = 'characters';
    input.spellcheck = false;
    input.maxLength = 24;
    input.setAttribute('aria-label', text('baCodeAria'));
    const fromLink = pendingCode();
    if (fromLink) input.value = fromLink;
    const go = el('button', 'ba-btn is-primary', text('baRedeem'));
    go.type = 'button';
    const submit = async () => {
      if (!input.value.trim()) return;
      go.disabled = true;
      const result = await client.redeemCode(input.value);
      if (result.ok) { forgetPending(); redo(); return; }
      go.disabled = false;
      say(result.message || text('baError'));
    };
    go.addEventListener('click', submit);
    input.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); void submit(); } });
    card.append(row(input, go));
    block.append(card, el('p', 'ba-note', text(fromLink ? 'baRedeemFromLink' : 'baRedeemNote')));
    return block;
  }

  // The first page only says how many accounts there are and opens the list.
  function accountsEntry(count) {
    const block = el('section', 'ba-sec');
    const card = el('div', 'ba-card');
    const open = el('button', 'ba-row ba-row-link');
    open.type = 'button';
    open.setAttribute('aria-label', text('baSecAccounts'));
    open.addEventListener('click', () => goTo('accounts'));
    const chevron = el('span', 'ba-chevron');
    chevron.append(icon(document, CHEVRON_RIGHT, 16));
    open.append(mark(ACCOUNTS), body(text('baSecAccounts'), count ? fill(text('baAccountsCount'), { n: String(count) }) : text('baNoLogins')), chevron);
    card.append(open);
    block.append(card);
    return block;
  }

  // The list is a page of its own, with a way back at the top.
  function accountsPage(logins, reload) {
    const page = el('div', 'ba-page');
    const back = el('button', 'ba-back');
    back.type = 'button';
    back.append(icon(document, CHEVRON_LEFT, 18), el('span', 'ba-back-label', text('baSecAccounts')));
    back.addEventListener('click', () => goTo('main'));
    page.append(back);
    const card = el('div', 'ba-card');
    if (!logins.length) card.append(row(el('span', 'ba-desc', text('baNoLogins'))));
    for (const login of logins) {
      const origin = login.origins?.[0] || '';
      const hosts = (login.origins || []).map(hostOf).filter(Boolean).join(', ');
      const menu = moreMenu([
        { id: 'logout', label: text('baLogoutSite'), run: async () => { const r = await client.logoutSite(origin); say(r.ok ? fill(text('baSiteLoggedOut'), { site: hostOf(origin) }) : r.message || text('baError')); } },
        { id: 'delete', label: text('baDeletePassword'), danger: true, run: async () => { const r = await client.deleteLogin(login.id); if (r.ok) { marks.delete(login.id); reload(); } else say(r.message || text('baError')); } }
      ], login.id);
      card.append(row(siteMark(login.id, origin), body(login.name, hosts), pill(text('baVaultTag')), menu));
    }
    page.append(card, el('p', 'ba-note', text('baAccountsNote')));
    return page;
  }

  function stateBlock(profile, reload) {
    const block = el('section', 'ba-sec');
    block.append(secTitle('baSecState'));
    const card = el('div', 'ba-card');
    const keep = configAccess?.getConfig?.().browserKeepLogin !== false;
    const toggle = el('button', 'ba-switch');
    toggle.type = 'button';
    toggle.setAttribute('role', 'switch');
    toggle.setAttribute('aria-checked', String(keep));
    toggle.setAttribute('aria-label', text('baKeepLogin'));
    toggle.addEventListener('click', async () => {
      const next = toggle.getAttribute('aria-checked') !== 'true';
      toggle.setAttribute('aria-checked', String(next));
      configAccess?.mutateConfig?.({ browserKeepLogin: next });
      try { await saveConfig(); } catch { /* the choice stays on this device until the next save */ }
    });
    card.append(row(mark(KEEP), body(text('baKeepLogin'), text('baKeepLoginDesc')), toggle));
    const info = profile.exists ? fill(text('baStateInfo'), { size: formatSize(profile.sizeBytes), when: when(profile.lastUsedAt) }) : text('baStateNone');
    const wipe = el('button', 'ba-btn is-danger');
    wipe.type = 'button';
    wipe.disabled = !profile.exists;
    twice(wipe, text('baDeleteAll'), text('baConfirmAll'), 'profile', async () => { const r = await client.deleteProfile(); if (r.ok) reload(); else say(r.message || text('baError')); });
    card.append(row(mark(TRASH), body(text('baStateRow'), info), wipe));
    block.append(card);
    return block;
  }

  function codesBlock(codes) {
    const block = el('section', 'ba-sec');
    block.append(secTitle('baSecCodes'));
    const card = el('div', 'ba-card');
    for (const entry of codes) {
      const used = entry.used === true;
      const code = el('span', 'ba-code-text', entry.code);
      const spacer = el('span', 'ba-grow');
      const copyButton = el('button', 'ba-btn', text('baCopy'));
      copyButton.dataset.reserve = text('baCopied');
      copyButton.type = 'button';
      copyButton.hidden = used;
      copyButton.addEventListener('click', () => { void copy(entry.code, copyButton); });
      const linkButton = el('button', 'ba-btn', text('baCopyLink'));
      linkButton.dataset.reserve = text('baCopied');
      linkButton.type = 'button';
      linkButton.hidden = used;
      linkButton.addEventListener('click', () => { void copy(inviteUrl(win.location?.origin || 'https://noureon.com', entry.code), linkButton); });
      card.append(row(mark(TICKET), code, spacer, pill(text(used ? 'baCodeUsed' : 'baCodeUnused'), used ? 'is-on' : ''), copyButton, linkButton));
    }
    block.append(card, el('p', 'ba-note', text('baCodesNote')));
    return block;
  }

  async function draw() {
    if (typeof section.replaceChildren !== 'function') return;
    const turn = ++drawing;
    const root = el('div', 'ba');
    if (view === 'main') root.append(el('p', 'ba-hint', text('baHint')));
    if (notice) { const line = el('p', 'ba-notice', notice); line.setAttribute('role', 'status'); root.append(line); }
    section.dataset.sectionTitle = text('baTitle');
    const navItem = document.getElementById(NAV_ID);
    if (navItem) navItem.textContent = text('baNav');
    const reload = () => { void draw(); };
    const access = await client.getAccess();
    if (turn !== drawing) return;
    if (!access.ok) root.append(el('p', 'ba-note', text('baError')));
    else if (!access.allowed) root.append(inviteBlock(reload));
    else {
      // A code from a link that arrives at a person who can already use the browser agent is not used up.
      if (pendingCode()) { forgetPending(); root.prepend(el('p', 'ba-notice', text('baRedeemAlready'))); }
      const [logins, profile] = await Promise.all([client.listLogins(), client.getProfile()]);
      if (turn !== drawing) return;
      const list = logins.ok ? logins.logins : [];
      if (view === 'accounts') root.append(accountsPage(list, reload));
      else {
        root.append(accountsEntry(list.length), stateBlock(profile.ok ? profile : { exists: false }, reload));
        if (access.codes.length) root.append(codesBlock(access.codes));
      }
    }
    section.replaceChildren(root);
  }

  void draw();
  return { refresh: () => draw(), draw };
}
