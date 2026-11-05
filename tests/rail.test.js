import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';
import { createRail, shortcutLabel } from '../src/app/ui/rail/rail.js';
import { PANEL_MODE_KEY } from '../src/app/ui/rail/rail-mode.js';
import railTexts from '../src/data/i18n/parts/rail.js';

// The rail of icons beside the left menu: the layout it says for the width, the panel docked or on hover, the button and the key that dock or free it, and the drawer of a narrow window.

const texts = { ...railTexts.en, settings: 'Settings', logout: 'Logout' };
const text = (key) => texts[key] ?? key;

function setup({ width = 1440, stored = null, coarse = false } = {}) {
  const window = new Window({ url: 'https://noureon.test/', width, height: 900 });
  window.innerWidth = width;
  window.matchMedia = (query) => ({ matches: query === '(pointer: coarse)' ? coarse : true, media: query, addEventListener() {}, removeEventListener() {} });
  const { document } = window;
  document.body.innerHTML = '<div id="app-container"><nav id="desktop-rail"></nav><aside id="sidebar" class="sidebar"><button id="inside">a chat</button><button id="open-cli-store-btn">Extensions</button><span id="username-display">Allen Niu</span><button id="settings-btn">settings</button><button id="user-profile-btn">profile</button><button id="logout-btn">logout</button></aside><button id="menu-toggle-btn">menu</button></div>';
  const data = new Map(stored ? [[PANEL_MODE_KEY, stored]] : []);
  const storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const calls = [];
  const sidebar = document.getElementById('sidebar');
  // The menu's own function: it opens and shuts the panel and takes part of the docked layout as the page does.
  const toggleSidebar = (show) => {
    const next = typeof show === 'boolean' ? show : !sidebar.classList.contains('open');
    if (show === false && document.documentElement.getAttribute('data-rail-layout') === 'pinned') return;
    calls.push(next);
    sidebar.classList.toggle('open', next);
  };
  const timers = [];
  const rail = createRail({ document, storage, toggleSidebar, text, platform: 'Win32', setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout: (id) => { if (id) timers[id - 1] = null; } });
  const root = document.documentElement;
  return { window, document, rail, root, sidebar, data, calls, timers, flush: () => { for (const fn of timers.splice(0)) fn?.(); }, layout: () => root.getAttribute('data-rail-layout'), peek: () => root.getAttribute('data-rail-peek') };
}

const clicks = (t, ids) => { const log = []; for (const id of ids) t.document.getElementById(id).addEventListener('click', () => log.push(id)); return log; };

test('without the rail in the page nothing starts', () => {
  const window = new Window({ url: 'https://noureon.test/' });
  window.document.body.innerHTML = '<aside id="sidebar"></aside>';
  assert.equal(createRail({ document: window.document, toggleSidebar() {}, text }), null);
});

test('docked by default: the layout is pinned and the panel is open; the rail has the chats and is named', () => {
  const t = setup();
  assert.equal(t.layout(), 'pinned');
  assert.equal(t.sidebar.classList.contains('open'), true);
  const button = t.document.querySelector('#desktop-rail .rail-btn[data-rail-item="chat"]');
  assert.equal(button.getAttribute('aria-label'), 'Chats');
  assert.equal(button.getAttribute('aria-current'), 'page');
  assert.equal(t.document.getElementById('desktop-rail').getAttribute('aria-label'), 'Main navigation');
  assert.match(t.document.getElementById('menu-toggle-btn').title, /Sidebar \(Ctrl\+Shift\+S\)/);
  assert.ok(t.document.getElementById('rail-bottom'), 'the place for the rings and the avatar');
});

test('docked, the panel is asked to stay open when something is chosen in it (the guard of the menu is tested with the menu)', () => {
  const t = setup();
  t.calls.length = 0;
  t.rail.refresh();
  assert.deepEqual(t.calls, [], 'nothing is toggled while the layout stays');
  assert.equal(t.sidebar.classList.contains('open'), true);
});

test('the button of the top bar frees the panel (hover) and docks it again; the choice is kept', () => {
  const t = setup();
  t.document.getElementById('menu-toggle-btn').click();
  assert.equal(t.rail.mode(), 'hover');
  assert.equal(t.layout(), 'hover');
  assert.equal(t.sidebar.classList.contains('open'), false, 'on hover the panel is not in the row');
  assert.equal(t.data.get(PANEL_MODE_KEY), 'hover');
  t.document.getElementById('menu-toggle-btn').click();
  assert.equal(t.layout(), 'pinned');
  assert.equal(t.sidebar.classList.contains('open'), true);
  assert.equal(t.data.get(PANEL_MODE_KEY), 'pinned');
});

test('the choice kept on the device is the layout when the page starts', () => {
  const t = setup({ stored: 'hover' });
  assert.equal(t.layout(), 'hover');
  assert.equal(t.sidebar.classList.contains('open'), false);
});

test('on hover the panel shows while the pointer is on the rail or the panel and goes a moment after it left; Escape shuts it at once', () => {
  const t = setup({ stored: 'hover' });
  const rail = t.document.getElementById('desktop-rail');
  rail.dispatchEvent(new t.window.Event('pointerenter'));
  assert.equal(t.peek(), 'on');
  rail.dispatchEvent(new t.window.Event('pointerleave'));
  assert.equal(t.peek(), 'on', 'not at once: a pointer that crosses a corner is not a leaving');
  t.sidebar.dispatchEvent(new t.window.Event('pointerenter'));
  t.flush();
  assert.equal(t.peek(), 'on', 'the pointer came to the panel in time');
  t.sidebar.dispatchEvent(new t.window.Event('pointerleave'));
  t.flush();
  assert.equal(t.peek(), null);
  rail.dispatchEvent(new t.window.Event('pointerenter'));
  t.document.dispatchEvent(new t.window.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.equal(t.peek(), null);
});

test('the keyboard reaches the panel on hover (focus in the rail) and a touch does not open it', () => {
  const t = setup({ stored: 'hover' });
  t.document.querySelector('.rail-btn').dispatchEvent(new t.window.FocusEvent('focusin', { bubbles: true }));
  assert.equal(t.peek(), 'on');
  t.rail.peek(false);
  const touch = new t.window.Event('pointerenter');
  Object.defineProperty(touch, 'pointerType', { value: 'touch' });
  t.document.getElementById('desktop-rail').dispatchEvent(touch);
  assert.equal(t.peek(), null);
});

test('pinned has no hover panel: the pointer on the rail changes nothing', () => {
  const t = setup();
  t.document.getElementById('desktop-rail').dispatchEvent(new t.window.Event('pointerenter'));
  assert.equal(t.peek(), null);
});

test('Ctrl+Shift+S (Cmd+Shift+S on a Mac) docks or frees the panel; other keys do nothing', () => {
  const t = setup();
  const press = (init) => { const event = new t.window.KeyboardEvent('keydown', { cancelable: true, ...init }); t.document.dispatchEvent(event); return event; };
  assert.equal(press({ key: 's', ctrlKey: true }).defaultPrevented, false, 'Ctrl+S alone is the browser\'s');
  assert.equal(t.rail.mode(), 'pinned');
  assert.equal(press({ key: 'S', ctrlKey: true, shiftKey: true }).defaultPrevented, true);
  assert.equal(t.rail.mode(), 'hover');
  press({ key: 's', metaKey: true, shiftKey: true });
  assert.equal(t.rail.mode(), 'pinned');
  press({ key: 's', ctrlKey: true, shiftKey: true, altKey: true });
  assert.equal(t.rail.mode(), 'pinned');
  assert.equal(shortcutLabel('MacIntel'), '⌘⇧S');
  assert.equal(shortcutLabel('Win32'), 'Ctrl+Shift+S');
});

test('a narrow window (768 to 1023 px) has the drawer: the panel is shut, a rail icon opens it, the button toggles it (the menu\'s own handler)', () => {
  const t = setup({ width: 900 });
  assert.equal(t.layout(), 'drawer');
  assert.equal(t.sidebar.classList.contains('open'), false);
  t.document.querySelector('.rail-btn').click();
  assert.equal(t.sidebar.classList.contains('open'), true);
  const event = new t.window.Event('click', { bubbles: true, cancelable: true });
  t.document.getElementById('menu-toggle-btn').dispatchEvent(event);
  assert.equal(event.defaultPrevented, false, 'the button is left to the menu in this layout');
});

test('a phone has no layout at all, and a touched screen keeps the panel docked', () => {
  assert.equal(setup({ width: 390 }).layout(), null);
  assert.equal(setup({ width: 390 }).rail.layout(), 'none');
  assert.equal(setup({ stored: 'hover', coarse: true }).layout(), 'pinned');
});

test('stopping puts the page back as it was', () => {
  const t = setup();
  t.rail.stop();
  assert.equal(t.layout(), null);
  const event = new t.window.Event('click', { bubbles: true, cancelable: true });
  t.document.getElementById('menu-toggle-btn').dispatchEvent(event);
  assert.equal(event.defaultPrevented, false);
});

test('the rail has the chats and the Extensions; the Extensions icon opens the page by the entry the menu has, and is lit while the page is there', async () => {
  const t = setup();
  const log = clicks(t, ['open-cli-store-btn']);
  assert.deepEqual([...t.document.querySelectorAll('#desktop-rail .rail-top .rail-btn')].map((button) => button.getAttribute('aria-label')), ['Chats', 'Extensions']);
  t.document.querySelector('[data-rail-item="extensions"]').click();
  assert.deepEqual(log, ['open-cli-store-btn']);
  // the page is a layer in the body, with a way back that the rail takes over
  const page = t.document.createElement('div');
  page.className = 'cs';
  page.innerHTML = '<button class="cs-back">back</button>';
  t.document.body.append(page);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(t.document.querySelector('[data-rail-item="extensions"]').getAttribute('aria-current'), 'page');
  assert.equal(t.document.querySelector('[data-rail-item="chat"]').getAttribute('aria-current'), null);
  let backs = 0;
  page.querySelector('.cs-back').addEventListener('click', () => { backs += 1; page.remove(); });
  t.document.querySelector('[data-rail-item="chat"]').click();
  assert.equal(backs, 1, 'the chats close the page by its own way back');
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(t.document.querySelector('[data-rail-item="chat"]').getAttribute('aria-current'), 'page');
});

test('the avatar opens a small menu with the name, settings, the dashboard and logout, which press the buttons the page has; Escape and a click outside close it', () => {
  const t = setup();
  const log = clicks(t, ['settings-btn', 'user-profile-btn', 'logout-btn']);
  const avatar = t.document.querySelector('.rail-avatar');
  assert.ok(avatar.querySelector('.user-avatar'), 'the place the picture is drawn in');
  assert.equal(avatar.getAttribute('aria-label'), 'Account');
  avatar.click();
  const menu = t.document.querySelector('.rail-menu');
  assert.equal(menu.querySelector('.rail-menu-title').textContent, 'Allen Niu');
  assert.deepEqual([...menu.querySelectorAll('.rail-menu-item')].map((row) => row.dataset.item), ['settings', 'dashboard', 'logout']);
  assert.equal(menu.querySelector('[data-item="settings"] .rail-menu-hint').textContent, 'Ctrl+,');
  assert.equal(avatar.getAttribute('aria-expanded'), 'true');
  menu.querySelector('[data-item="dashboard"]').click();
  assert.deepEqual(log, ['user-profile-btn']);
  assert.equal(t.document.querySelector('.rail-menu'), null, 'a choice closes it');
  avatar.click();
  t.document.dispatchEvent(new t.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(t.document.querySelector('.rail-menu'), null);
  avatar.click();
  t.document.body.dispatchEvent(new t.window.Event('pointerdown', { bubbles: true }));
  assert.equal(t.document.querySelector('.rail-menu'), null, 'a press outside closes it');
  avatar.click();
  t.document.querySelector('.rail-menu [data-item="logout"]').click();
  avatar.click();
  avatar.click();
  assert.equal(t.document.querySelector('.rail-menu'), null, 'the avatar again closes it');
  assert.deepEqual(log, ['user-profile-btn', 'logout-btn']);
});

test('Ctrl+, (Cmd+, on a Mac) opens the settings with the button the page has; not on a phone', () => {
  const t = setup();
  const log = clicks(t, ['settings-btn']);
  const press = (init) => { const event = new t.window.KeyboardEvent('keydown', { cancelable: true, ...init }); t.document.dispatchEvent(event); return event; };
  assert.equal(press({ key: ',', ctrlKey: true }).defaultPrevented, true);
  press({ key: ',', metaKey: true });
  press({ key: ',' });
  press({ key: ',', ctrlKey: true, shiftKey: true });
  assert.deepEqual(log, ['settings-btn', 'settings-btn']);
  const phone = setup({ width: 390 });
  const phoneLog = clicks(phone, ['settings-btn']);
  phone.document.dispatchEvent(new phone.window.KeyboardEvent('keydown', { key: ',', ctrlKey: true, cancelable: true }));
  assert.deepEqual(phoneLog, []);
});

test('a layout that changes tells the parts that live in the rail (the usage rings place themselves again)', () => {
  const t = setup();
  const seen = [];
  t.document.addEventListener('noureon:rail-layout', (event) => seen.push(event.detail.layout));
  t.document.getElementById('menu-toggle-btn').click();
  assert.deepEqual(seen, ['hover']);
});
