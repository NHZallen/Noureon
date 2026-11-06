import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';
import { startProjects } from '../src/app/runtime/projects/start-projects.js';
import { setSharedProjectHook } from '../src/app/runtime/projects/project-actions.js';
import i18nParts from '../src/data/i18n/parts/projects.js';

// Starting the projects for the page: the entry of the left menu (in the language of the page, below the Extensions, drawn again when the language changes), the page that is loaded when it is
// opened, and the address that opens it.

const i18n = { 'zh-TW': i18nParts['zh-TW'], en: i18nParts.en, fr: i18nParts.fr };
const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

const setup = ({ url = 'https://noureon.test/', language = 'en', withExtensions = true, staticEntry = false, load = null, phone = false, currentId = null, conversations = [] } = {}) => {
  const window = new Window({ url });
  const { document } = window;
  window.matchMedia = (query) => ({ matches: phone && /max-width: 767px/.test(query), media: query, addEventListener() {}, removeEventListener() {} });
  document.body.innerHTML = `<aside id="sidebar"><div class="overflow-y-auto">${staticEntry ? '<button id="open-projects-btn" class="sidebar-item"><span class="cli-sidebar-label">專案</span></button>' : ''}${withExtensions ? '<button id="open-cli-store-btn">Extensions</button>' : ''}<div id="rest"><button id="a-chat" data-chat-id="c9">history</button></div><div id="history-list"><div class="sidebar-item" data-id="h1"><span class="title">An old chat</span><button class="chat-options-btn">⋯</button></div></div></div><button id="settings-btn">Settings</button></aside><div id="sidebar-overlay"></div><button id="menu-toggle-btn"></button>`;
  const config = { language };
  const opened = [];
  const state = { folders: [{ id: 'f1', name: 'Trip', conversationIds: [] }], conversations };
  const started = startProjects({
    document,
    configAccess: { getUiLanguage: () => config.language },
    dataStore: { getFolders: () => state.folders, replaceFolders: (next) => { state.folders = next; }, getConversations: () => state.conversations },
    i18n,
    getDefaultFolder: () => ({ color: 'gray', icon: 'default', textColor: 'gray', isOpen: false }),
    saveAppData: async () => {}, renderSidebar: () => {}, deleteFolderFromCloud: async () => {}, deferConversationFolderSync: () => {},
    startNewChat: async () => {}, loadChat: () => {}, archiveChat: async () => {}, deleteChat: async () => {}, getCurrentConversationId: () => currentId,
    load: load || (async () => ({ openProjectsPage: (args) => { opened.push(args.route); return { go: (route) => opened.push(['go', route]) }; } }))
  });
  return { window, document, config, opened, state, started, $: (selector) => document.querySelector(selector) };
};

test('the entry is in the left menu below the Extensions, in the language of the page, and opens the list; on a phone the drawer goes away', async () => {
  const t = setup();
  const entry = t.$('#open-projects-btn');
  assert.ok(entry);
  assert.equal(entry.previousElementSibling.id, 'open-cli-store-btn');
  assert.equal(entry.querySelector('.cli-sidebar-label').textContent, 'Projects');
  let overlayClicks = 0;
  t.$('#sidebar-overlay').classList.add('visible');
  t.$('#menu-toggle-btn').addEventListener('click', () => { overlayClicks += 1; });
  entry.click();
  await tick();
  assert.deepEqual(t.opened, [{ list: true }]);
  assert.equal(overlayClicks, 1);
  await t.window.happyDOM.abort();
});

test('the entry is drawn again in the new language, and there is only one of it', async () => {
  const t = setup();
  t.config.language = 'fr';
  t.document.documentElement.lang = 'fr';
  await tick();
  assert.equal(t.$('#open-projects-btn .cli-sidebar-label').textContent, 'Projets');
  t.started.ensureEntry();
  assert.equal(t.document.querySelectorAll('#open-projects-btn').length, 1);
  await t.window.happyDOM.abort();
});

test('without the Extensions entry it is the first of the menu', async () => {
  const t = setup({ withExtensions: false });
  assert.equal(t.$('.overflow-y-auto').firstElementChild.id, 'open-projects-btn');
  await t.window.happyDOM.abort();
});

test('two taps while the page is loading load it once', async () => {
  let loads = 0;
  const window = new Window({ url: 'https://noureon.test/' });
  window.document.body.innerHTML = '<aside id="sidebar"><div class="overflow-y-auto"></div></aside>';
  const started = startProjects({
    document: window.document, configAccess: { getUiLanguage: () => 'en' }, dataStore: { getFolders: () => [], replaceFolders: () => {}, getConversations: () => [] }, i18n,
    load: async () => { loads += 1; await tick(); return { openProjectsPage: () => ({}) }; }
  });
  await Promise.all([started.open(), started.open()]);
  assert.equal(loads, 1);
  await window.happyDOM.abort();
});

test('an address of the projects opens the page once the account is known, at the project the address names', async () => {
  const t = setup({ url: 'https://noureon.test/projects/f1' });
  assert.deepEqual(t.opened, [], 'not before the account is known');
  t.document.dispatchEvent(new t.window.CustomEvent('noureon:user-ready'));
  await tick();
  assert.deepEqual(t.opened, [{ id: 'f1' }]);
  await t.window.happyDOM.abort();
});

test('a project that is not there yet when the address opens the page is shown once the workspace is in', async () => {
  const t = setup({ url: 'https://noureon.test/projects/late' });
  t.document.dispatchEvent(new t.window.CustomEvent('noureon:user-ready'));
  await tick();
  assert.deepEqual(t.opened, [{ id: 'late' }]);
  t.state.folders.push({ id: 'late', name: 'Late', conversationIds: [] });
  t.window.dispatchEvent(new t.window.Event('astra:cloud-workspace-committed'));
  assert.deepEqual(t.opened.at(-1), ['go', { id: 'late' }]);
  await t.window.happyDOM.abort();
});

test('an ordinary address opens nothing', async () => {
  const t = setup({ url: 'https://noureon.test/' });
  t.document.dispatchEvent(new t.window.CustomEvent('noureon:user-ready'));
  await tick();
  assert.deepEqual(t.opened, []);
  await t.window.happyDOM.abort();
});

test('an entry that is in the page from its first paint gets its label and its click, and is not made twice', async () => {
  const t = setup({ staticEntry: true });
  assert.equal(t.document.querySelectorAll('#open-projects-btn').length, 1);
  const entry = t.$('#open-projects-btn');
  assert.equal(entry.querySelector('.cli-sidebar-label').textContent, 'Projects', 'the label is in the language of the page');
  entry.click();
  await tick();
  assert.deepEqual(t.opened, [{ list: true }], 'one click opens the list once');
  t.started.ensureEntry();
  entry.click();
  await tick();
  assert.equal(t.opened.length, 2, 'drawn again, it still has one click, not two');
  await t.window.happyDOM.abort();
});

test('on a phone the back of the overview brings the menu over the page, which stays; choosing in the menu leaves the page, the settings and the entry of the projects do not', async () => {
  const closed = [];
  let args = null;
  const closeArgs = [];
  const page = { element: null, close: (given) => { closed.push('closed'); closeArgs.push(given); page.element.remove(); }, go() {} };
  const t = setup({ phone: true, staticEntry: true, load: async () => ({ openProjectsPage: (given) => { args = given; page.element = t.document.createElement('div'); t.document.body.appendChild(page.element); return page; } }) });
  let toggles = 0;
  t.$('#menu-toggle-btn').addEventListener('click', () => { toggles += 1; t.$('#sidebar-overlay').classList.add('visible'); });
  t.$('#open-projects-btn').click();
  await tick();
  assert.equal(args.backOut(), true, 'the back is taken: the page stays');
  assert.equal(toggles, 1, 'the menu is brought');
  assert.equal(args.backOut(), false, 'a menu that is open is not toggled shut; the back leaves the page');
  assert.equal(toggles, 1, 'a menu that is open is not toggled shut');
  t.$('#settings-btn').click();
  t.$('#open-projects-btn').click();
  assert.deepEqual(closed, [], 'the settings and the entry of the projects keep the page');
  t.$('#history-list .chat-options-btn').click();
  assert.deepEqual(closed, [], 'the ⋯ of a chat is not a choice of the chat');
  t.$('#history-list .title').click();
  assert.deepEqual(closed, ['closed'], 'a chat of the history chosen in the menu leaves the page');
  assert.deepEqual(closeArgs, [{ restore: false }], 'and the chat that was open before is not brought back over it');
  await t.window.happyDOM.abort();
});

test('on a computer the back of the overview also brings the menu (docked, the page moves over); with the menu already open the back leaves the page', async () => {
  let args = null;
  const t = setup({ phone: false, staticEntry: true, load: async () => ({ openProjectsPage: (given) => { args = given; return { go() {} }; } }) });
  let toggles = 0;
  t.$('#menu-toggle-btn').addEventListener('click', () => { toggles += 1; t.$('#sidebar').classList.add('open'); });
  t.$('#open-projects-btn').click();
  await tick();
  assert.equal(args.backOut(), true);
  assert.equal(toggles, 1);
  assert.equal(args.backOut(), false, 'the menu is open: the back is not taken, the page closes');
  assert.equal(toggles, 1);
  await t.window.happyDOM.abort();
});

test('with the rail of a computer the page neither brings the menu nor shuts it: the back leaves the page, and a choice does not press the button that docks or frees the menu', async () => {
  let args = null;
  const t = setup({ phone: false, staticEntry: true, load: async () => ({ openProjectsPage: (given) => { args = given; return { go() {} }; } }) });
  t.document.documentElement.setAttribute('data-rail-layout', 'hover');
  let toggles = 0;
  t.$('#menu-toggle-btn').addEventListener('click', () => { toggles += 1; });
  t.$('#open-projects-btn').click();
  await tick();
  assert.equal(args.backOut(), false, 'the menu is beside the page or on hover: the back is not taken, the page closes');
  args.openChat('c1');
  assert.equal(toggles, 0, 'nothing presses the button of the menu');
  t.document.documentElement.setAttribute('data-rail-layout', 'pinned');
  assert.equal(args.backOut(), false);
  args.openChat('c1');
  assert.equal(toggles, 0);
  await t.window.happyDOM.abort();
});

test('a chat made in a project that someone else shares has the head of the project, as a chat of a project of the person’s own has: the arrow back, the icon and name, "Chat" under it', async () => {
  setSharedProjectHook({ has: (id) => id === 'sp1', folderOf: (id) => (id === 'sp1' ? { id: 'sp1', name: 'City plan', icon: 'book', color: 'blue', shared: true, sources: [] } : null), chatsOf: () => [], countOf: () => 0 });
  const t = setup({ currentId: 'c1', conversations: [{ id: 'c1', title: 'Mine', sharedProject: { id: 'sp1', ownerId: 'o' }, messages: [] }] });
  t.document.body.insertAdjacentHTML('beforeend', '<div id="chat-workspace"><header><div></div></header></div>');
  t.document.dispatchEvent(new t.window.CustomEvent('noureon:chat-changed'));
  await tick(); await tick();
  assert.equal(t.$('#project-head-title .pj-head-name').textContent, 'City plan');
  assert.ok(t.$('#project-head-back'));
  assert.ok(t.$('#chat-workspace > header').classList.contains('pj-in-project'));
  setSharedProjectHook(null);
  await t.window.happyDOM.abort();
});
