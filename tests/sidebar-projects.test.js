import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { Window } from 'happy-dom';
import { createProjectActions } from '../src/app/runtime/projects/project-actions.js';
import { createSidebarProjects } from '../src/app/ui/projects/sidebar-projects.js';
import i18nParts from '../src/data/i18n/parts/projects.js';

// The projects in the left menu on a computer: one row for each project (pinned first), folding out to its newest chats, a menu with pin, settings and delete, and nothing on a phone.

const texts = i18nParts.en;
const text = (key, values = {}) => String(texts[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => values[name] ?? '');
const tick = () => new Promise((resolve) => setTimeout(resolve, 80));

const setup = ({ wide = true } = {}) => {
  const window = new Window({ url: 'https://noureon.test/' });
  window.matchMedia = (query) => ({ matches: wide, media: query, addEventListener() {}, removeEventListener() {} });
  const { document } = window;
  document.body.innerHTML = '<aside id="sidebar"><div class="sidebar-section" data-section="history" data-open="true"><header class="sidebar-section-header"></header><div id="history-list"></div></div></aside>';
  const state = {
    folders: [
      { id: 'a', name: 'Alpha <b>x</b>', icon: 'book', color: 'blue', conversationIds: [] },
      { id: 'b', name: 'Beta', icon: 'globe', color: 'green', conversationIds: [], pinned: true }
    ],
    conversations: Array.from({ length: 7 }, (_, n) => ({ id: `c${n}`, title: `Chat ${n}`, folderId: 'b', lastUpdatedAt: `2026-10-${10 + n}T00:00:00.000Z`, messages: [] })),
    opened: [], settings: [], deletes: [], chats: []
  };
  const actions = createProjectActions({
    dataStore: { getFolders: () => state.folders, replaceFolders: (next) => { state.folders = next; return next; }, getConversations: () => state.conversations },
    saveAppData: async () => {}, deleteFolderFromCloud: async () => {}, startNewChat: async () => ({}), getCurrentConversationId: () => null, sendText() {}, randomUUID: () => 'x'
  });
  const store = new Map();
  const sidebar = createSidebarProjects({
    document, text, actions,
    openProject: (id) => state.opened.push(id), openSettings: (id) => state.settings.push(id), askDelete: (id) => state.deletes.push(id), openChat: (id) => state.chats.push(id),
    getCurrentConversationId: () => 'c6',
    storage: { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) }
  });
  return { window, document, state, actions, sidebar, store, $: (selector) => document.querySelector(selector), $$: (selector) => [...document.querySelectorAll(selector)] };
};

test('the section is above the history with the pinned project first; a name is text, and the newest chats are under the project', () => {
  const t = setup();
  t.sidebar.render();
  assert.equal(t.$('.sidebar-section[data-section="projects"]').nextElementSibling.dataset.section, 'history');
  assert.deepEqual(t.$$('.folder-item').map((item) => item.dataset.id), ['b', 'a'], 'pinned first');
  assert.equal(t.$$('.folder-summary')[1].textContent.includes('Alpha <b>x</b>'), true, 'the name is plain text');
  assert.equal(t.$('.folder-item b'), null);
  const chats = t.$$('.folder-item[data-id="b"] .folder-content-container [data-chat-id]').map((row) => row.dataset.chatId);
  assert.deepEqual(chats, ['c6', 'c5', 'c4', 'c3', 'c2'], 'the five newest');
  assert.ok(t.$('.folder-item[data-id="b"] [data-chat-id="c6"]').className.includes('active'), 'the chat that is open is marked');
  assert.match(t.$('.folder-item[data-id="b"] .folder-content-container').textContent, /2 more chats/);
});

test('the arrow folds a project out and the fold is remembered; the name opens the project and a chat opens the chat', () => {
  const t = setup();
  t.sidebar.render();
  const item = () => t.$('.folder-item[data-id="b"]');
  assert.equal(item().dataset.open, 'false');
  item().querySelector('.folder-summary button').click();
  assert.equal(item().dataset.open, 'true');
  assert.deepEqual(JSON.parse(t.store.get('noureon.sidebarProjects.open.v1')), ['b']);
  t.sidebar.render();
  assert.equal(item().dataset.open, 'true', 'drawn again it stays open');
  item().querySelector('.font-medium').click();
  item().querySelector('[data-chat-id="c5"]').click();
  assert.deepEqual([t.state.opened, t.state.chats], [['b'], ['c5']]);
});

test('the menu of a project: pin, settings and delete', async () => {
  const t = setup();
  t.sidebar.render();
  t.$('.folder-item[data-id="a"] .folder-options-btn').click();
  await tick();
  assert.deepEqual(t.$$('.pj-menu-item').map((entry) => entry.textContent.trim()), ['Pin', 'Project settings', 'Delete project']);
  t.$$('.pj-menu-item')[1].click();
  await tick();
  assert.deepEqual(t.state.settings, ['a']);
  t.$('.folder-item[data-id="a"] .folder-options-btn').click();
  await tick();
  t.$$('.pj-menu-item')[0].click();
  await tick();
  assert.equal(t.state.folders.find((folder) => folder.id === 'a').pinned, true);
  t.$('.folder-item[data-id="a"] .folder-options-btn').click();
  await tick();
  t.$$('.pj-menu-item')[2].click();
  await tick();
  assert.deepEqual(t.state.deletes, ['a']);
});

test('on a phone the section is hidden; on a computer with no project it stays, with the + to make the first one', () => {
  const phone = setup({ wide: false });
  phone.sidebar.render();
  assert.equal(phone.$('.sidebar-section[data-section="projects"]').hidden, true);
  const none = setup();
  none.state.folders = [];
  none.sidebar.render();
  assert.equal(none.$('.sidebar-section[data-section="projects"]').hidden, false);
  assert.equal(none.$$('.folder-item').length, 0);
  assert.equal(none.$('[data-projects-all]'), null, 'no row for all the projects when there is none');
  assert.ok(none.$('#sidebar-projects-new-btn'));
});

test('the header folds the section once even when the page binds its own fold to it, the + makes a project without folding, and the last row opens the page of all the projects', () => {
  const calls = [];
  const t = setup();
  // The page binds a listener to every header that is there when it starts (app-bootstrap-lifecycle.js): here one is added after the header is made.
  const sidebar = createSidebarProjects({
    document: t.document, text, actions: t.actions, openProject() {}, openSettings() {}, askDelete() {}, openChat() {},
    createProject: () => calls.push('create'), openList: () => calls.push('list'), getCurrentConversationId: () => null
  });
  sidebar.render();
  const section = t.$('.sidebar-section[data-section="projects"]');
  const header = section.querySelector('.sidebar-section-header');
  header.addEventListener('click', (event) => { if (event.target.closest('button')) return; section.dataset.open = String(section.dataset.open !== 'true'); });
  assert.equal(section.dataset.open, 'true');
  header.querySelector('.title-group').click();
  assert.equal(section.dataset.open, 'false', 'folded');
  header.querySelector('.title-group').click();
  assert.equal(section.dataset.open, 'true', 'and open again');
  header.querySelector('#sidebar-projects-new-btn').click();
  assert.equal(section.dataset.open, 'true');
  section.querySelector('[data-projects-all]').click();
  assert.deepEqual(calls, ['create', 'list']);
});

test('the ⋯ that opened the menu of a project closes it when it is pressed again (the press on it is not "outside")', async () => {
  const t = setup();
  t.sidebar.render();
  const more = () => t.$('.folder-item[data-id="a"] .folder-options-btn');
  more().click();
  await tick();
  assert.equal(t.$$('.pj-menu').length, 1);
  // What a mouse does at the second press: pointerdown, then click.
  more().dispatchEvent(new t.window.PointerEvent('pointerdown', { bubbles: true }));
  more().click();
  await tick();
  assert.equal(t.$$('.pj-menu').length, 0, 'closed, not opened again');
  more().click();
  await tick();
  assert.equal(t.$$('.pj-menu').length, 1, 'a press after that opens it');
  t.$('.folder-item[data-id="b"]').dispatchEvent(new t.window.PointerEvent('pointerdown', { bubbles: true }));
  await tick();
  assert.equal(t.$$('.pj-menu').length, 0, 'a press elsewhere closes it');
});

test('the section that the page has from its first paint is taken as it is: its list is filled, its + makes a project, and no second section is made', () => {
  const calls = [];
  const t = setup();
  t.document.body.innerHTML = '<aside id="sidebar"><div class="sidebar-section" data-section="projects" data-open="true"><header class="sidebar-section-header"><div class="title-group"><span>Projects</span></div><div class="actions-group"><button id="sidebar-projects-new-btn" type="button">+</button></div></header><div class="sidebar-section-content"><div id="sidebar-projects-list"><div class="pj-side-skeleton"></div></div></div></div><div class="sidebar-section" data-section="history" data-open="true"><header class="sidebar-section-header"></header><div id="history-list"></div></div></aside>';
  const sidebar = createSidebarProjects({
    document: t.document, text, actions: t.actions, openProject() {}, openSettings() {}, askDelete() {}, openChat() {},
    createProject: () => calls.push('create'), getCurrentConversationId: () => null
  });
  sidebar.render();
  assert.equal(t.$$('.sidebar-section[data-section="projects"]').length, 1, 'the one that was there');
  assert.equal(t.$('.pj-side-skeleton'), null, 'the bars that stood in the place of the rows are gone');
  assert.deepEqual(t.$$('.folder-item').map((item) => item.dataset.id), ['b', 'a']);
  const section = t.$('.sidebar-section[data-section="projects"]');
  t.$('#sidebar-projects-new-btn').click();
  assert.deepEqual(calls, ['create']);
  assert.equal(section.dataset.open, 'true', 'the + does not fold it');
  sidebar.render();
  t.$('#sidebar-projects-new-btn').click();
  assert.deepEqual(calls, ['create', 'create'], 'drawn again, one click is one call');
});

test('the templates have the entry and the section from the first paint, with texts the page translates', () => {
  const shell = readFileSync(new URL('../src/templates/fragments/00-shell.fragment.js', import.meta.url), 'utf8');
  const side = readFileSync(new URL('../src/templates/fragments/01-shell.fragment.js', import.meta.url), 'utf8');
  assert.match(shell, /id=\\"open-projects-btn\\"[^>]*>.*data-lang-key=\\"pjEntry\\"/);
  assert.match(side, /data-section=\\"projects\\"/);
  assert.match(side, /id=\\"sidebar-projects-list\\"/);
  assert.match(side, /id=\\"sidebar-projects-new-btn\\"[^>]*data-lang-key-title=\\"pjNew\\"/);
  assert.ok(side.indexOf('data-section=\\"projects\\"') < side.indexOf('data-section=\\"history\\"'), 'the section is above the history');
});
