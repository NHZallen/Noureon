import assert from 'node:assert/strict';
import test from 'node:test';

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

test('on a phone the section is hidden, and with no project there is nothing to show', () => {
  const phone = setup({ wide: false });
  phone.sidebar.render();
  assert.equal(phone.$('.sidebar-section[data-section="projects"]').hidden, true);
  const none = setup();
  none.state.folders = [];
  none.sidebar.render();
  assert.equal(none.$('.sidebar-section[data-section="projects"]').hidden, true);
});
