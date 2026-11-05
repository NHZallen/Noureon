// The rail of icons on the left of a computer and the way it keeps the panel beside it (docs/superpowers/specs/2026-11-05-desktop-rail-sidebar-design.md). The panel is the left menu (#sidebar) as it is;
// the rail is the element `#desktop-rail` of the page, filled here. What this does:
//   - says what the layout is (rail-mode.js) on <html> (`data-rail-layout`), keeps it right when the window changes size or the choice changes;
//   - opens the panel when the layout docks it (pinned) and shuts it when it does not, with the same `toggleSidebar` the menu always used;
//   - on hover, opens the panel over the page while the pointer is on the rail or on the panel (`data-rail-peek`), after the pointer left it shuts it a moment later;
//   - makes the button of the top bar and the key Ctrl/Cmd+Shift+S dock or free the panel (the choice is kept on this device), and in the drawer layout open and close it.
// Names are put in with textContent; the markup that is not text is made here, not taken from a person.

import { layoutFor, otherMode, readPanelMode, writePanelMode, PEEK_LEAVE_MS, RAIL_MIN_WIDTH, DOCKED_MIN_WIDTH } from './rail-mode.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const ICONS = Object.freeze({
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>'
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

/** The label of the shortcut that docks or frees the panel. */
export const shortcutLabel = (platform = '') => (/mac|iphone|ipad/i.test(platform) ? '⌘⇧S' : 'Ctrl+Shift+S');

/**
 * deps: document, storage (localStorage or null), toggleSidebar(show?) (the one of the menu), text(key), platform (navigator.platform), setTimeout / clearTimeout.
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
  const items = [{ id: 'chat', icon: 'chat', label: () => text('railChats') }];
  let activeId = 'chat';
  const top = document.createElement('div');
  top.className = 'rail-top';
  const bottom = document.createElement('div');
  bottom.className = 'rail-bottom';
  bottom.id = 'rail-bottom';
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
    activeId = id;
    labels();
    if (current === 'drawer') { if (!isOpen()) toggleSidebar(true); } else if (current === 'hover') peek(true);
  }
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

  return {
    items,
    layout: () => current,
    mode: () => choice,
    setMode,
    togglePanel,
    peek,
    refresh: () => { apply(); labels(); },
    stop() { unwait(timer); stops.splice(0).forEach((stop) => stop()); root.removeAttribute('data-rail-layout'); root.removeAttribute('data-rail-peek'); }
  };
}
