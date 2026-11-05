// The rail of icons on the left of a computer and the way it keeps the panel beside it (docs/superpowers/specs/2026-11-05-desktop-rail-sidebar-design.md). The panel is the left menu (#sidebar) as it is;
// the rail is the element `#desktop-rail` of the page, filled here. What this does:
//   - says what the layout is (rail-mode.js) on <html> (`data-rail-layout`), keeps it right when the window changes size or the choice changes;
//   - opens the panel when the layout docks it (pinned) and shuts it when it does not, with the same `toggleSidebar` the menu always used;
//   - on hover, opens the panel over the page while the pointer is on the rail or on the panel (`data-rail-peek`), after the pointer left it shuts it a moment later;
//   - makes the button of the top bar and the key Ctrl/Cmd+Shift+S dock or free the panel (the choice is kept on this device), and in the drawer layout open and close it.
// Names are put in with textContent; the markup that is not text is made here, not taken from a person.

import { openRailMenu } from './rail-menu.js';
import { layoutFor, otherMode, readPanelMode, writePanelMode, PEEK_LEAVE_MS, RAIL_MIN_WIDTH, DOCKED_MIN_WIDTH } from './rail-mode.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const ICONS = Object.freeze({
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>',
  extensions: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.8"></rect><rect x="13.5" y="3.5" width="7" height="7" rx="1.8"></rect><rect x="3.5" y="13.5" width="7" height="7" rx="1.8"></rect><rect x="13.5" y="13.5" width="7" height="7" rx="1.8"></rect>'
});

function icon(document, name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ICONS[name] || '';
  return svg;
}

/** The label of a shortcut with the key: Ctrl+, or ⌘, . */
export const shortcutHint = (platform = '', key = '') => (/mac|iphone|ipad/i.test(platform) ? `⌘${key}` : `Ctrl+${key}`);

/** The label of the shortcut that docks or frees the panel. */
export const shortcutLabel = (platform = '') => (/mac|iphone|ipad/i.test(platform) ? '⌘⇧S' : 'Ctrl+Shift+S');

/**
 * deps: document, storage (localStorage or null), toggleSidebar(show?) (the one of the menu), text(key) (the words of the rail and of the page), platform (navigator.platform), setTimeout / clearTimeout.
 * Returns { layout(), mode(), setMode(mode), togglePanel(), peek(on), items, stop() } or null when the page has no `#desktop-rail`.
 */
export function createRail({ document, storage = null, toggleSidebar, text, platform = '', setTimeout: later, clearTimeout: cancel }) {
  const win = document.defaultView || globalThis;
  const rail = document.getElementById('desktop-rail');
  const sidebar = document.getElementById('sidebar');
  if (!rail || !sidebar) return null;
  const root = document.documentElement;
  const wait = later || win.setTimeout.bind(win);
  const unwait = cancel || win.clearTimeout.bind(win);
  const coarse = win.matchMedia?.('(pointer: coarse)') || null;
  let choice = readPanelMode(storage);
  let current = '';
  let timer = null;
  const stops = [];
  const listen = (target, type, handler, options) => { target.addEventListener(type, handler, options); stops.push(() => target.removeEventListener(type, handler, options)); };

  // ----- the icons of the rail: the places one goes to. Each has a panel (the one of the chats for now).
  const storePage = () => document.querySelector('body > .cs');
  const items = [
    { id: 'chat', icon: 'chat', label: () => text('railChats'), go: () => { document.querySelector('body > .cs .cs-back')?.click(); } },
    { id: 'extensions', icon: 'extensions', label: () => text('railExtensions'), go: () => { document.getElementById('open-cli-store-btn')?.click(); } }
  ];
  let activeId = 'chat';
  const settingsPage = () => document.getElementById('settings-modal');
  const settingsOpen = () => Boolean(settingsPage()?.classList.contains('visible'));
  // The place that is lit is the one whose page is on the screen; the settings are a page of their own (the account's menu), so while they are there no place is lit.
  const placeNow = () => (settingsOpen() ? '' : storePage() ? 'extensions' : 'chat');
  const syncActive = () => { const next = placeNow(); if (next !== activeId) { activeId = next; labels(); } };
  const top = document.createElement('div');
  top.className = 'rail-top';
  const bottom = document.createElement('div');
  bottom.className = 'rail-bottom';
  bottom.id = 'rail-bottom';
  const avatar = document.createElement('button');
  avatar.type = 'button';
  avatar.className = 'rail-btn rail-avatar';
  avatar.setAttribute('aria-haspopup', 'menu');
  avatar.setAttribute('aria-expanded', 'false');
  avatar.innerHTML = '<span class="user-avatar" aria-hidden="true"></span>';
  bottom.append(avatar);
  rail.replaceChildren(top, bottom);
  rail.setAttribute('aria-hidden', 'false');
  const buttons = new Map();
  const drawItems = () => {
    top.replaceChildren();
    for (const item of items) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'rail-btn';
      button.dataset.railItem = item.id;
      button.append(icon(document, item.icon));
      button.addEventListener('click', () => activate(item.id));
      buttons.set(item.id, button);
      top.append(button);
    }
    labels();
  };
  const labels = () => {
    rail.setAttribute('aria-label', text('railLabel'));
    for (const item of items) {
      const button = buttons.get(item.id);
      if (!button) continue;
      const label = item.label();
      button.title = label;
      button.setAttribute('aria-label', label);
      button.classList.toggle('is-active', item.id === activeId);
      if (item.id === activeId) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    }
    const account = text('railAccount');
    avatar.title = account;
    avatar.setAttribute('aria-label', account);
    const toggle = document.getElementById('menu-toggle-btn');
    if (toggle) {
      const label = `${text('railPanelToggle')} (${shortcutLabel(platform)})`;
      toggle.title = label;
      toggle.setAttribute('aria-label', label);
    }
  };

  const isOpen = () => sidebar.classList.contains('open');

  // ----- the layout
  const currentLayout = () => layoutFor(win.innerWidth, choice, { coarse: Boolean(coarse?.matches) });
  function apply() {
    const next = currentLayout();
    const changed = next !== current;
    current = next;
    if (next === 'none') {
      root.removeAttribute('data-rail-layout');
      root.removeAttribute('data-rail-peek');
    } else {
      root.setAttribute('data-rail-layout', next);
      if (next !== 'hover') root.removeAttribute('data-rail-peek');
    }
    if (!changed) return;
    // The parts that live in the rail or in the menu when there is none (the usage rings) place themselves again.
    try { document.dispatchEvent(new win.CustomEvent('noureon:rail-layout', { detail: { layout: next } })); } catch { /* nothing listens */ }
    // The panel follows the layout: docked it is open, in every other layout it is shut until it is asked for.
    if (next === 'pinned') { if (!isOpen()) toggleSidebar(true); } else if (isOpen()) toggleSidebar(false);
    const toggle = document.getElementById('menu-toggle-btn');
    toggle?.setAttribute('aria-expanded', String(next === 'pinned'));
  }

  // ----- the panel on hover
  function peek(on) {
    unwait(timer);
    timer = null;
    if (current !== 'hover') { root.removeAttribute('data-rail-peek'); return; }
    if (on) root.setAttribute('data-rail-peek', 'on'); else root.removeAttribute('data-rail-peek');
  }
  const enter = () => peek(true);
  const leave = () => {
    unwait(timer);
    timer = wait(() => { timer = null; peek(false); }, PEEK_LEAVE_MS);
  };
  for (const node of [rail, sidebar]) {
    listen(node, 'pointerenter', (event) => { if (event.pointerType !== 'touch') enter(); });
    listen(node, 'pointerleave', (event) => { if (event.pointerType !== 'touch') leave(); });
    listen(node, 'focusin', enter);
    listen(node, 'focusout', (event) => { if (!node.contains(event.relatedTarget) && !(node === rail ? sidebar : rail).contains(event.relatedTarget)) leave(); });
  }
  listen(document, 'keydown', (event) => { if (event.key === 'Escape' && root.getAttribute('data-rail-peek') === 'on') peek(false); });

  // ----- the choice and the places
  function setMode(mode) {
    if (mode !== 'pinned' && mode !== 'hover') return;
    choice = mode;
    writePanelMode(storage, mode);
    apply();
    labels();
  }
  function togglePanel() {
    if (current === 'drawer') { toggleSidebar(); return; }
    if (current === 'none') return;
    setMode(otherMode(choice));
    if (choice === 'hover') peek(false);
  }
  function activate(id) {
    const item = items.find((entry) => entry.id === id);
    if (!item) return;
    // The settings are a page over the app: going to a place lets them go (their own way out).
    if (settingsOpen()) document.getElementById('close-settings-btn')?.click();
    // The page of a place lies over the app (the Extensions); the chats are what is under it, so going to them lets the page go.
    if (id === 'chat' && storePage()) { item.go(); return; }
    if (id !== 'chat') {
      if (current === 'drawer' && isOpen()) toggleSidebar(false);
      peek(false);
      item.go();
      return;
    }
    activeId = id;
    labels();
    if (current === 'drawer') { if (!isOpen()) toggleSidebar(true); } else if (current === 'hover') peek(true);
  }

  // ----- the account: its picture is drawn by the avatar part (it paints every .user-avatar); its menu has settings, the dashboard and logout, which are the buttons the page already has.
  let menu = null;
  const press = (id) => () => { document.getElementById(id)?.click(); };
  function openMenu() {
    if (menu) { menu.close(); return; }
    const name = document.getElementById('username-display')?.textContent || '';
    menu = openRailMenu({
      document, anchor: avatar, title: name, onClose: () => { menu = null; },
      items: [
        { id: 'settings', label: text('settings'), hint: shortcutHint(platform, ','), icon: 'settings', action: press('settings-btn') },
        { id: 'dashboard', label: text('railDashboard'), icon: 'dashboard', action: press('user-profile-btn') },
        { id: 'logout', label: text('logout'), icon: 'logout', danger: true, action: press('logout-btn') }
      ]
    });
  }
  avatar.addEventListener('click', openMenu);
  listen(document, 'keydown', (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey || event.key !== ',' || event.repeat) return;
    if (current === 'none') return;
    event.preventDefault();
    press('settings-btn')();
  });
  // The button of the top bar: with a rail it docks or frees the panel (the menu's own handler would open and shut it, which is not what the rail does); in the drawer layout and on a phone it is what it was.
  listen(document, 'click', (event) => {
    if (current === 'none' || current === 'drawer') return;
    const button = event.target?.closest?.('#menu-toggle-btn');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    togglePanel();
  }, true);
  listen(document, 'keydown', (event) => {
    if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || event.altKey || String(event.key).toLowerCase() !== 's' || event.repeat) return;
    if (current === 'none') return;
    event.preventDefault();
    togglePanel();
  });

  // ----- start
  drawItems();
  apply();
  for (const query of [`(min-width: ${RAIL_MIN_WIDTH}px)`, `(min-width: ${DOCKED_MIN_WIDTH}px)`]) {
    const media = win.matchMedia?.(query);
    if (media?.addEventListener) { media.addEventListener('change', apply); stops.push(() => media.removeEventListener('change', apply)); }
  }
  coarse?.addEventListener?.('change', apply);
  listen(win, 'resize', apply);
  // The Extensions page is a layer in the body: while it is there its place is the lit one.
  if (typeof win.MutationObserver === 'function') {
    const watch = new win.MutationObserver(syncActive);
    watch.observe(document.body, { childList: true });
    if (settingsPage()) watch.observe(settingsPage(), { attributes: true, attributeFilter: ['class'] });
    stops.push(() => watch.disconnect());
  }
  syncActive();

  return {
    items,
    layout: () => current,
    mode: () => choice,
    setMode,
    togglePanel,
    peek,
    refresh: () => { apply(); labels(); },
    stop() { menu?.close({ refocus: false }); unwait(timer); stops.splice(0).forEach((stop) => stop()); root.removeAttribute('data-rail-layout'); root.removeAttribute('data-rail-peek'); }
  };
}
