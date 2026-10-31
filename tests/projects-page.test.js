import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { Window } from 'happy-dom';
import { createProjectActions } from '../src/app/runtime/projects/project-actions.js';
import { closeProjectsPage, getProjectsPage, openProjectsPage } from '../src/app/ui/projects/projects-page.js';
import { projectPath, projectsRouteFromPath } from '../src/app/ui/projects/project-path.js';
import i18nParts from '../src/data/i18n/parts/projects.js';

// The pages of the projects, drawn in a page with the real actions over a plain workspace: the list, the tabs, the search, making a project, one project with its chats and its menus,
// the instructions, the choice when deleting, and the address.

const tick = () => new Promise((resolve) => setTimeout(resolve, 15));
const texts = i18nParts.en;
const text = (key, values = {}) => String(texts[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => values[name] ?? '');

// `wide`: a computer (the dialogs are in the middle, the icon is chosen in a box at the name); without it the page is a phone's.
const setup = ({ folders, conversations, url = 'https://noureon.test/', wide = false } = {}) => {
  const window = new Window({ url });
  window.matchMedia = (query) => ({ matches: wide, media: query, addEventListener() {}, removeEventListener() {} });
  const { document } = window;
  document.body.innerHTML = '<div id="app"></div>';
  const state = {
    folders: folders || [
      { id: 'f1', name: 'Translation', icon: 'book', color: 'blue', conversationIds: ['c1', 'c2'], instructions: 'Answer in English.' },
      { id: 'f2', name: 'Trip <b>plans</b>', icon: 'plane', color: 'green', conversationIds: [], instructions: '' }
    ],
    conversations: conversations || [
      { id: 'c1', title: 'Chinese to English', folderId: 'f1', lastUpdatedAt: '2026-10-20T00:00:00.000Z', messages: [{ role: 'user', parts: [{ text: 'translate' }] }, { role: 'model', parts: [{ text: '```noureon-run\n{"v":1,"status":"done","steps":[],"elapsedMs":61513,"sources":[{"n":1,"title":"A page","url":"https://example.com"}]}\n```\nHere is **the** translation [1]\n\n## Notes\n- one' }] }] },
      { id: 'c2', title: 'Glossary', folderId: 'f1', lastUpdatedAt: '2026-10-10T00:00:00.000Z', pinned: true, messages: [] }
    ],
    notified: [], opened: [], sent: [], archived: [], deleted: [], newChats: 0, cloud: [], closed: 0
  };
  let current = null;
  const actions = createProjectActions({
    dataStore: { getFolders: () => state.folders, replaceFolders: (next) => { state.folders = next; return next; }, getConversations: () => state.conversations },
    saveAppData: async () => {},
    deleteFolderFromCloud: async (id) => { state.cloud.push(id); },
    startNewChat: async () => { state.newChats += 1; const conversation = { id: `new-${state.newChats}`, title: 'New chat', messages: [], folderId: null }; state.conversations.unshift(conversation); current = conversation.id; },
    getCurrentConversationId: () => current,
    sendText: (value) => state.sent.push(value),
    randomUUID: (() => { let n = 0; return () => `made-${++n}`; })()
  });
  const open = (route = { list: true }, extra = {}) => openProjectsPage({
    document, text, actions, route,
    chats: { archive: async (id) => { state.archived.push(id); const found = state.conversations.find((entry) => entry.id === id); if (found) found.archived = true; }, remove: async (id) => { state.deleted.push(id); const found = state.conversations.find((entry) => entry.id === id); if (found) found.deletedAt = 'x'; } },
    openChat: (id) => state.opened.push(id),
    notify: (message, type) => state.notified.push([message, type]),
    onClose: () => { state.closed += 1; },
    ...extra
  });
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const byText = (selector, label) => $$(selector).find((node) => node.textContent.trim() === label);
  const type = (input, value) => { input.value = value; input.dispatchEvent(new window.Event('input', { bubbles: true })); };
  const finish = async () => { closeProjectsPage(); await window.happyDOM.abort(); };
  return { window, document, state, actions, open, $, $$, byText, type, tick, finish };
};

test('the address of a page is /projects or /projects/<id>, and nothing else is one', () => {
  assert.equal(projectPath('abc'), '/projects/abc');
  assert.deepEqual(projectsRouteFromPath('/projects'), { list: true });
  assert.deepEqual(projectsRouteFromPath('/projects/'), { list: true });
  assert.deepEqual(projectsRouteFromPath('/projects/a%20b'), { id: 'a b' });
  assert.equal(projectsRouteFromPath('/projects/a/b'), null);
  assert.equal(projectsRouteFromPath('/'), null);
  assert.equal(projectsRouteFromPath('/skill'), null);
  assert.equal(projectsRouteFromPath('/projects/%E0%A4%A'), null);
});

test('every language of the texts of the projects has the same keys', () => {
  const keys = Object.keys(i18nParts.en).sort();
  for (const [language, table] of Object.entries(i18nParts)) assert.deepEqual(Object.keys(table).sort(), keys, language);
});

test('the list shows the projects with the newest chat first and how many chats each has; the name is text', async () => {
  const t = setup();
  try {
    t.open();
    assert.equal(t.$('.pj-title').textContent, 'Projects');
    const rows = t.$$('.pj-row');
    assert.deepEqual(rows.map((row) => row.dataset.projectId), ['f1', 'f2']);
    assert.equal(rows[0].querySelector('.pj-row-title').textContent, 'Translation');
    assert.equal(rows[0].querySelector('.pj-row-meta').textContent, 'Chats: 2');
    assert.equal(rows[1].querySelector('.pj-row-title').textContent, 'Trip <b>plans</b>');
    assert.equal(rows[1].querySelectorAll('b').length, 0, 'a name is not markup');
    assert.equal(t.$('.pj-mark').style.getPropertyValue('--pj-color') !== '', true, 'the colour of the project');
    assert.equal(t.window.location.pathname, '/projects');
    assert.equal(t.document.documentElement.classList.contains('pj-open'), true);
  } finally { await t.finish(); }
});

test('the three tabs: all and created by you list the projects, shared with you is empty for now; the search filters', async () => {
  const t = setup();
  try {
    t.open();
    assert.deepEqual(t.$$('.pj-tab').map((tab) => tab.textContent), ['All', 'Created by you', 'Shared with you']);
    t.byText('.pj-tab', 'Shared with you').click();
    assert.equal(t.$('.pj-empty-title').textContent, 'No project is shared with you');
    assert.equal(t.$$('.pj-row').length, 0);
    t.byText('.pj-tab', 'Created by you').click();
    assert.equal(t.$$('.pj-row').length, 2);
    t.type(t.$('.pj-search-input'), 'trip');
    assert.deepEqual(t.$$('.pj-row').map((row) => row.dataset.projectId), ['f2']);
    t.type(t.$('.pj-search-input'), 'zzz');
    assert.equal(t.$('.pj-none').textContent, 'No project matches.');
  } finally { await t.finish(); }
});

test('with no project the list says so', async () => {
  const t = setup({ folders: [], conversations: [] });
  try {
    t.open();
    assert.equal(t.$('.pj-empty-title').textContent, 'No projects yet');
  } finally { await t.finish(); }
});

test('a project is made from the + with a name, or with a preset that brings a name, an icon and a colour', async () => {
  const t = setup({ folders: [], conversations: [] });
  try {
    t.open();
    t.$$('.pj-head .pj-round').at(-1).click();
    const create = t.byText('.pj-sheet .pj-button', 'Create project');
    assert.equal(create.disabled, true, 'a name is needed');
    assert.deepEqual(t.$$('.pj-chip').map((chip) => chip.textContent), ['Research', 'Planning', 'Code', 'Meetings']);
    t.byText('.pj-chip', 'Code').click();
    assert.equal(t.$('.pj-name-input').value, 'Code');
    assert.equal(create.disabled, false);
    create.click();
    await t.tick();
    assert.equal(t.state.folders.length, 1);
    assert.deepEqual([t.state.folders[0].name, t.state.folders[0].icon, t.state.folders[0].color], ['Code', 'code', 'orange']);
    assert.deepEqual(t.state.notified, [['Project created.', 'success']]);
    assert.equal(t.$('.pj-sheet'), null, 'the sheet is gone');
    assert.equal(t.$('.pj-title-text').textContent, 'Code', 'the page of the new project is open');
    assert.equal(t.window.location.pathname, '/projects/made-1');
  } finally { await t.finish(); }
});

test('the icon and the colour are chosen in a sheet of their own', async () => {
  const t = setup({ folders: [], conversations: [] });
  try {
    t.open();
    t.$$('.pj-head .pj-round').at(-1).click();
    t.type(t.$('.pj-name-input'), 'Music');
    t.$('.pj-name-icon').click();
    assert.equal(t.$$('.pj-backdrop').length, 2);
    assert.ok(t.$$('.pj-icon-option').length >= 28, 'the icons of the folders and the ones added');
    t.$$('.pj-dot').find((dot) => dot.dataset.color === 'purple').click();
    t.$$('.pj-icon-option').find((icon) => icon.dataset.icon === 'music').click();
    assert.equal(t.$$('.pj-dot').find((dot) => dot.dataset.color === 'purple').getAttribute('aria-checked'), 'true');
    t.byText('.pj-sheet .pj-pill', 'Done').click();
    assert.equal(t.$$('.pj-backdrop').length, 1, 'only the sheet of the project is left');
    t.byText('.pj-sheet .pj-button', 'Create project').click();
    await t.tick();
    assert.deepEqual([t.state.folders[0].name, t.state.folders[0].icon, t.state.folders[0].color], ['Music', 'music', 'purple']);
  } finally { await t.finish(); }
});

test('a project page lists its chats (the pinned first) with a preview, opens one, and writes to the project', async () => {
  const t = setup();
  try {
    t.open();
    t.$('.pj-row').click();
    assert.equal(t.$('.pj-title-text').textContent, 'Translation');
    assert.equal(t.window.location.pathname, '/projects/f1');
    assert.equal(t.$$('.pj-tab').length, 0, 'no tab of the sources while there is no part for it');
    const chats = t.$$('.pj-chat');
    assert.deepEqual(chats.map((row) => row.dataset.conversationId), ['c2', 'c1'], 'the pinned one first');
    assert.equal(chats[1].querySelector('.pj-chat-title').textContent, 'Chinese to English');
    assert.equal(chats[1].querySelector('.pj-chat-preview').textContent, 'Here is the translation Notes one', 'no record of the run, no marker of a source, no Markdown');
    assert.equal(t.$('.pj-composer-input').placeholder, 'Message Translation');
    chats[1].click();
    assert.deepEqual(t.state.opened, ['c1']);
    assert.equal(getProjectsPage(), null, 'the page is closed when a chat is opened');
    assert.equal(t.window.location.pathname, '/');
  } finally { await t.finish(); }
});

test('the tab of the sources is there when the part for it is', async () => {
  const t = setup();
  try {
    t.open({ id: 'f1' }, { sourcesEnabled: true });
    assert.deepEqual(t.$$('.pj-tab').map((tab) => tab.textContent), ['Chats', 'Sources']);
  } finally { await t.finish(); }
});

test('a message written in a project starts a chat there and closes the page', async () => {
  const t = setup();
  try {
    t.open({ id: 'f1' });
    const send = t.$('.pj-send');
    assert.equal(send.disabled, true);
    t.type(t.$('.pj-composer-input'), 'Translate this');
    assert.equal(send.disabled, false);
    t.$('.pj-composer').dispatchEvent(new t.window.Event('submit', { bubbles: true, cancelable: true }));
    await t.tick();
    assert.deepEqual(t.state.sent, ['Translate this']);
    assert.equal(t.state.conversations.find((entry) => entry.id === 'new-1').folderId, 'f1');
    assert.equal(getProjectsPage(), null);
    assert.equal(t.state.closed, 1);
  } finally { await t.finish(); }
});

test('the menu of a chat: pin, rename, take out of the project, archive and delete', async () => {
  const t = setup();
  try {
    t.open({ id: 'f1' });
    const menuOf = (id) => { t.$(`.pj-chat[data-conversation-id="${id}"] .pj-more`).click(); return t.$$('.pj-menu-item').map((item) => item.textContent); };
    assert.deepEqual(menuOf('c1'), ['Pin', 'Rename', 'Remove from project', 'Archive', 'Delete']);
    t.byText('.pj-menu-item', 'Pin').click();
    await t.tick();
    assert.equal(t.state.conversations.find((entry) => entry.id === 'c1').pinned, true);
    assert.deepEqual(menuOf('c1')[0], 'Unpin');
    t.window.dispatchEvent(new t.window.KeyboardEvent('keydown', { key: 'Escape' }));
    assert.equal(t.$('.pj-menu'), null, 'Escape closes the menu');

    menuOf('c2');
    t.byText('.pj-menu-item', 'Rename').click();
    t.type(t.$('.pj-text-input'), 'Glossary of terms');
    t.byText('.pj-sheet .pj-button', 'Save').click();
    await t.tick();
    assert.equal(t.state.conversations.find((entry) => entry.id === 'c2').title, 'Glossary of terms');
    assert.ok(t.$$('.pj-chat-title').some((node) => node.textContent === 'Glossary of terms'));

    menuOf('c2');
    t.byText('.pj-menu-item', 'Remove from project').click();
    await t.tick();
    assert.equal(t.state.conversations.find((entry) => entry.id === 'c2').folderId, null);
    assert.equal(t.$$('.pj-chat').length, 1);
    assert.deepEqual(t.state.notified.at(-1), ['Removed from the project.', 'success']);

    menuOf('c1');
    t.byText('.pj-menu-item', 'Archive').click();
    await t.tick();
    assert.deepEqual(t.state.archived, ['c1']);
    assert.equal(t.$$('.pj-chat').length, 0);
    assert.match(t.$('.pj-empty-title').textContent, /no chats yet/);
  } finally { await t.finish(); }
});

test('a held touch opens the menu of a chat, and the touch that ends it does not open the chat', async () => {
  const t = setup();
  try {
    t.open({ id: 'f1' });
    const row = t.$('.pj-chat[data-conversation-id="c1"]');
    row.dispatchEvent(new t.window.PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 560));
    assert.ok(t.$('.pj-menu'), 'the menu is open');
    row.dispatchEvent(new t.window.PointerEvent('pointerup', { pointerType: 'touch', bubbles: true }));
    row.click();
    assert.deepEqual(t.state.opened, [], 'the chat was not opened by the touch that held');
    // A short touch does not open the menu.
    t.window.dispatchEvent(new t.window.KeyboardEvent('keydown', { key: 'Escape' }));
    row.dispatchEvent(new t.window.PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true }));
    row.dispatchEvent(new t.window.PointerEvent('pointerup', { pointerType: 'touch', bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 560));
    assert.equal(t.$('.pj-menu'), null);
  } finally { await t.finish(); }
});

test('the menu of a project: edit its name and icon, write its instructions, delete it', async () => {
  const t = setup();
  try {
    t.open({ id: 'f1' });
    const more = () => t.$('.pj-head .pj-round:last-child');
    more().click();
    assert.deepEqual(t.$$('.pj-menu-item').map((item) => item.textContent), ['Pin', 'Edit project', 'Edit instructions', 'Delete project']);
    t.byText('.pj-menu-item', 'Edit project').click();
    assert.equal(t.$('.pj-name-input').value, 'Translation');
    t.type(t.$('.pj-name-input'), 'Translations');
    t.byText('.pj-sheet .pj-button', 'Save').click();
    await t.tick();
    assert.equal(t.state.folders[0].name, 'Translations');
    assert.equal(t.$('.pj-title-text').textContent, 'Translations', 'the page shows the new name');

    more().click();
    t.byText('.pj-menu-item', 'Edit instructions').click();
    assert.equal(t.$('.pj-textarea').value, 'Answer in English.');
    assert.equal(t.$('.pj-count').textContent, '18 / 8000');
    t.type(t.$('.pj-textarea'), 'Answer in French.');
    assert.equal(t.$('.pj-count').textContent, '17 / 8000');
    t.byText('.pj-sheet .pj-button', 'Save').click();
    await t.tick();
    assert.equal(t.state.folders[0].instructions, 'Answer in French.');
    assert.deepEqual(t.state.notified.at(-1), ['Saved.', 'success']);
  } finally { await t.finish(); }
});

test('a row of the list has a ⋯ menu: new chat in the project, pin, settings, delete; the row itself opens the project', async () => {
  const t = setup();
  try {
    t.open();
    const rowOf = (id) => t.$(`.pj-row[data-project-id="${id}"]`);
    const menuOf = (id) => { rowOf(id).querySelector('.pj-more').click(); return t.$$('.pj-menu-item').map((item) => item.textContent); };
    assert.deepEqual(menuOf('f2'), ['New project chat', 'Pin', 'Project settings', 'Delete project']);
    assert.equal(t.$('.pj-title-text'), null, 'the menu did not open the project');

    t.byText('.pj-menu-item', 'Pin').click();
    await t.tick();
    assert.equal(t.state.folders.find((folder) => folder.id === 'f2').pinned, true);
    assert.deepEqual(t.$$('.pj-row').map((row) => row.dataset.projectId), ['f2', 'f1'], 'a pinned project comes first');
    assert.ok(rowOf('f2').querySelector('.pj-row-pin'), 'and shows a pin');
    assert.equal(menuOf('f2')[1], 'Unpin');
    t.byText('.pj-menu-item', 'Unpin').click();
    await t.tick();
    assert.deepEqual(t.$$('.pj-row').map((row) => row.dataset.projectId), ['f1', 'f2']);

    menuOf('f1');
    t.byText('.pj-menu-item', 'Project settings').click();
    assert.equal(t.$('.pj-name-input').value, 'Translation');
    t.$('.pj-sheet-head .pj-round').click();

    menuOf('f2');
    t.byText('.pj-menu-item', 'New project chat').click();
    await t.tick();
    assert.equal(t.state.newChats, 1, 'a chat was started');
    assert.equal(t.state.conversations[0].folderId, 'f2', 'in the project');
    assert.equal(t.state.sent.length, 0, 'without sending anything');
    assert.equal(t.state.closed, 1, 'and the page is closed to show it');
  } finally { await t.finish(); }
});

test('deleting a project with chats asks what happens to them; keeping them takes them out, deleting them puts them in the trash', async () => {
  const keep = setup();
  try {
    keep.open({ id: 'f1' });
    keep.$('.pj-head .pj-round:last-child').click();
    keep.byText('.pj-menu-item', 'Delete project').click();
    assert.equal(keep.$('.pj-intro').textContent, '"Translation" has 2 chats. What should happen to them?');
    assert.deepEqual(keep.$$('.pj-sheet .pj-button').map((button) => button.textContent), ['Delete the project only, keep the chats', 'Delete the chats too', 'Cancel']);
    keep.byText('.pj-sheet .pj-button', 'Cancel').click();
    assert.equal(keep.state.folders.length, 2, 'cancel deletes nothing');
    keep.$('.pj-head .pj-round:last-child').click();
    keep.byText('.pj-menu-item', 'Delete project').click();
    keep.byText('.pj-sheet .pj-button', 'Delete the project only, keep the chats').click();
    await keep.tick();
    assert.deepEqual(keep.state.folders.map((folder) => folder.id), ['f2']);
    assert.deepEqual(keep.state.conversations.map((entry) => [entry.folderId, entry.deletedAt || null]), [[null, null], [null, null]]);
    assert.deepEqual(keep.state.notified.at(-1), ['Project deleted; the chats are kept.', 'success']);
    assert.equal(keep.$('.pj-title').textContent, 'Projects', 'back at the list');
    assert.deepEqual(keep.$$('.pj-row').map((row) => row.dataset.projectId), ['f2']);
  } finally { await keep.finish(); }

  const gone = setup();
  try {
    gone.open({ id: 'f1' });
    gone.$('.pj-head .pj-round:last-child').click();
    gone.byText('.pj-menu-item', 'Delete project').click();
    gone.byText('.pj-sheet .pj-button', 'Delete the chats too').click();
    await gone.tick();
    assert.ok(gone.state.conversations.every((entry) => entry.deletedAt && entry.folderId === null));
    assert.deepEqual(gone.state.notified.at(-1), ['Project deleted; the chats moved to the trash.', 'success']);
  } finally { await gone.finish(); }

  const empty = setup();
  try {
    empty.open({ id: 'f2' });
    empty.$('.pj-head .pj-round:last-child').click();
    empty.byText('.pj-menu-item', 'Delete project').click();
    assert.equal(empty.$('.pj-intro').textContent, 'Delete the project "Trip <b>plans</b>"?');
    assert.deepEqual(empty.$$('.pj-sheet .pj-button').map((button) => button.textContent), ['Delete project', 'Cancel']);
  } finally { await empty.finish(); }
});

test('a project that is not there opens the list; the address of a page opened by it is kept, and the back of the browser leaves the page', async () => {
  const t = setup({ url: 'https://noureon.test/projects/f2' });
  try {
    t.open({ id: 'f2' });
    assert.equal(t.$('.pj-title-text').textContent, 'Trip <b>plans</b>');
    assert.equal(t.window.location.pathname, '/projects/f2', 'no entry is added for an address the page was opened by');
    t.$('.pj-head .pj-round').click();
    assert.equal(t.$('.pj-title').textContent, 'Projects');
    assert.equal(t.window.location.pathname, '/projects');
  } finally { await t.finish(); }
  const missing = setup();
  try {
    missing.open({ id: 'nope' });
    assert.equal(missing.$('.pj-title').textContent, 'Projects');
  } finally { await missing.finish(); }
});

test('opened again the page only turns to the route; Escape leaves a project, then the page', async () => {
  const t = setup();
  try {
    const page = t.open();
    assert.equal(t.open({ id: 'f1' }), page);
    assert.equal(t.$$('.pj').length, 1);
    assert.equal(t.$('.pj-title-text').textContent, 'Translation');
    t.window.dispatchEvent(new t.window.KeyboardEvent('keydown', { key: 'Escape' }));
    assert.equal(t.$('.pj-title').textContent, 'Projects');
    t.window.dispatchEvent(new t.window.KeyboardEvent('keydown', { key: 'Escape' }));
    assert.equal(getProjectsPage(), null);
    assert.equal(t.$('.pj'), null);
    assert.equal(t.document.documentElement.classList.contains('pj-open'), false);
  } finally { await t.finish(); }
});

test('the sources tab: add a text, add files (read, refused with the reason), remove one; what does not fit in a reply is told', async () => {
  const t = setup();
  try {
    const reads = [];
    t.open({ id: 'f2' }, {
      sourcesEnabled: true,
      readFile: async (file) => { reads.push(file.name); return file.name.endsWith('.png') ? { ok: false, code: 'too_big' } : file.name.endsWith('.jpg') ? { ok: true, title: file.name, mime: 'image/jpeg', size: 2048, text: '', truncated: false, original: true, file: { name: file.name, mimeType: 'image/jpeg', size: 2048, hash: 'hash-1' } } : { ok: true, title: file.name, mime: 'text/plain', size: 2048, text: `text of ${file.name}`, truncated: false }; }
    });
    assert.deepEqual(t.$$('.pj-tab').map((tab) => tab.textContent), ['Chats', 'Sources']);
    t.byText('.pj-tab', 'Sources').click();
    assert.equal(t.$('.pj-composer'), null, 'no box to write in on this tab');
    assert.match(t.$('.pj-source-add .pj-row-meta').textContent, /0 of 20/);

    t.$('.pj-source-add').click();
    assert.equal(t.$('.pj-action-title').textContent, 'Add a source');
    assert.deepEqual(t.$$('.pj-action-item').map((item) => item.textContent), ['Take a photo', 'Add photos', 'Add a file', 'Add text']);
    t.byText('.pj-action-item', 'Add text').click();
    assert.equal(t.$('.pj-action-sheet'), null, 'a choice closes the list');
    assert.equal(t.byText('.pj-sheet .pj-button', 'Save').disabled, true, 'nothing to save yet');
    t.type(t.$('.pj-sheet .pj-text-input'), 'My notes');
    t.type(t.$('.pj-sheet .pj-textarea'), 'The facts.');
    t.byText('.pj-sheet .pj-button', 'Save').click();
    await t.tick();
    assert.deepEqual(t.state.folders.find((folder) => folder.id === 'f2').sources.map((source) => [source.title, source.kind, source.text]), [['My notes', 'text', 'The facts.']]);
    assert.deepEqual(t.state.notified.at(-1), ['Source added.', 'success']);
    assert.equal(t.$$('.pj-source').length, 1);

    const input = t.$('.pj-file-input');
    Object.defineProperty(input, 'files', { value: [{ name: 'report.txt' }, { name: 'photo.png' }], configurable: true });
    input.dispatchEvent(new t.window.Event('change'));
    await t.tick();
    assert.deepEqual(reads, ['report.txt', 'photo.png']);
    assert.deepEqual(t.$$('.pj-source .pj-row-title').map((node) => node.textContent), ['My notes', 'report.txt']);
    assert.match(t.$$('.pj-source .pj-row-meta')[1].textContent, /^TXT · 2 KB$/, 'the kind of a file is its extension');
    assert.match(t.state.notified.at(-1)[0], /"photo.png" is over 20 MB/);
    assert.equal(t.state.notified.at(-1)[1], 'error');

    const photos = t.$$('.pj-file-input').find((node) => node.accept === 'image/*' && !node.getAttribute('capture'));
    assert.ok(photos && t.$$('.pj-file-input').some((node) => node.getAttribute('capture') === 'environment'), 'a photo input and a camera input');
    Object.defineProperty(photos, 'files', { value: [{ name: 'receipt.jpg', type: 'image/jpeg' }], configurable: true });
    photos.dispatchEvent(new t.window.Event('change'));
    await t.tick();
    assert.deepEqual(t.state.folders.find((folder) => folder.id === 'f2').sources.map((source) => source.kind), ['text', 'file', 'image']);
    assert.match(t.$$('.pj-source .pj-row-meta')[2].textContent, /^Picture · 2 KB$/);
    assert.equal(t.state.folders.find((folder) => folder.id === 'f2').sources[2].file.hash, 'hash-1', 'the kept original is described in the source');

    t.$$('.pj-source .pj-more')[0].click();
    await t.tick();
    assert.deepEqual(t.$$('.pj-source .pj-row-title').map((node) => node.textContent), ['report.txt', 'receipt.jpg']);
    assert.deepEqual(t.state.notified.at(-1), ['Source removed.', 'success']);

    await t.actions.addSource('f2', { text: 'x'.repeat(70_000), title: 'Huge' });
    t.$('.pj-tab[aria-selected="false"]').click();
    t.byText('.pj-tab', 'Sources').click();
    assert.doesNotMatch(t.$('.pj-sources').textContent, /more than one reply can carry/, 'a text the model can look into with its tools is not left out');
  } finally { await t.finish(); }
});

test('the Google Drive choice: only when the page has the picker; it is warmed when the list opens, and the files that come back are added like files from the device', async () => {
  const t = setup();
  try {
    t.open({ id: 'f2' }, { sourcesEnabled: true });
    t.byText('.pj-tab', 'Sources').click();
    t.$('.pj-source-add').click();
    assert.equal(t.$$('.pj-action-item').length, 4, 'no Drive without the picker');
    await t.finish();

    const log = { warmed: 0, picks: 0 };
    const results = [
      { ok: true, files: [{ name: 'Plan.pdf', type: 'application/pdf', size: 3 }, { name: 'photo.png', type: 'image/png', size: 3 }], failed: [{ name: 'big.zip', code: 'too_big' }, { name: 'Survey', code: 'failed' }] },
      { ok: false, code: 'cancelled' },
      { ok: false, code: 'blocked' }
    ];
    const drive = { warm: () => { log.warmed += 1; }, pick: async () => results[log.picks++] };
    const d = setup();
    d.open({ id: 'f2' }, { sourcesEnabled: true, drive, readFile: async (file) => ({ ok: true, title: file.name, mime: file.type, size: 3, text: '', truncated: false, original: true, file: { name: file.name, mimeType: file.type, size: 3, hash: `hash-${file.name}` } }) });
    d.byText('.pj-tab', 'Sources').click();
    d.$('.pj-source-add').click();
    assert.equal(log.warmed, 1, 'the scripts are loaded as soon as the choices show');
    const last = d.$$('.pj-action-item').at(-1);
    assert.equal(last.textContent, 'Add from Google Drive');
    assert.ok(last.querySelector('svg path[fill]'), 'its icon has the colours of Drive');
    last.click();
    await d.tick();
    await d.tick();
    assert.deepEqual(d.state.folders.find((folder) => folder.id === 'f2').sources.map((source) => [source.title, source.kind, source.text, source.file.hash]), [['Plan.pdf', 'file', '', 'hash-Plan.pdf'], ['photo.png', 'image', '', 'hash-photo.png']]);
    const errors = d.state.notified.filter((entry) => entry[1] === 'error').map((entry) => entry[0]);
    assert.ok(errors.some((message) => /"big.zip" is over 20 MB/.test(message)));
    assert.ok(errors.some((message) => /"Survey" could not be read/.test(message)));
    assert.equal(d.$$('.pj-source').length, 2, 'the list shows them');

    const before = d.state.notified.length;
    d.$('.pj-source-add').click();
    d.$$('.pj-action-item').at(-1).click();
    await d.tick();
    assert.equal(d.state.notified.length, before, 'a cancel says nothing');
    d.$('.pj-source-add').click();
    d.$$('.pj-action-item').at(-1).click();
    await d.tick();
    assert.match(d.state.notified.at(-1)[0], /Google Drive picker could not be opened/);
    await d.finish();
  } finally { await t.finish(); }
});

test('the sheet that makes a project asks where its notes are kept (default or this project only) and says it cannot be changed later', async () => {
  const t = setup({ folders: [], conversations: [] });
  try {
    t.open();
    t.$$('.pj-head .pj-round').at(-1).click();
    const rows = t.$$('.pj-memory-row');
    assert.deepEqual(rows.map((row) => row.querySelector('.pj-memory-name').textContent), ['Default memory', 'Project only']);
    assert.deepEqual(rows.map((row) => row.getAttribute('aria-checked')), ['true', 'false'], 'the memory of the account is ticked at first');
    assert.match(t.$('.pj-memory-note').textContent, /Cannot be changed after the project is made/);
    rows[1].click();
    assert.deepEqual(t.$$('.pj-memory-row').map((row) => row.getAttribute('aria-checked')), ['false', 'true']);
    t.byText('.pj-chip', 'Code').click();
    t.byText('.pj-sheet .pj-button', 'Create project').click();
    await t.tick();
    assert.equal(t.state.folders[0].memoryScope, 'project');
  } finally { await t.finish(); }
});

test('on a computer the create dialog has the memory choice as a list at the foot, the source folder, and the icon box with a search at the name', async () => {
  const t = setup({ folders: [], conversations: [], wide: true });
  try {
    t.open({ list: true }, { sourcesEnabled: true });
    t.$$('.pj-head .pj-round').at(-1).click();
    assert.equal(t.$$('.pj-memory-row').length, 0, 'no rows of radio on a computer');
    assert.ok(t.$('.pj-sheet-foot .pj-dropdown-button'), 'the choice is a button at the left of the foot');
    assert.match(t.$('.pj-dropdown-button').textContent, /Default memory/);
    t.$('.pj-dropdown-button').click();
    assert.deepEqual(t.$$('.pj-dropdown-item .pj-memory-name').map((node) => node.textContent), ['Default memory', 'Project only']);
    t.$$('.pj-dropdown-item')[1].click();
    assert.match(t.$('.pj-dropdown-button').textContent, /Project only/);
    assert.equal(t.$('.pj-dropdown-list'), null, 'the list closes at a choice');
    assert.ok(t.$('.pj-folder'), 'the source folder block is there');
    t.type(t.$('.pj-name-input'), 'Music');
    t.$('.pj-name-icon').click();
    assert.equal(t.$$('.pj-backdrop').length, 1, 'the icon is chosen in a box, not in a sheet of its own');
    assert.ok(t.$('.pj-popover .pj-icon-search'));
    const visible = () => t.$$('.pj-icon-option').filter((icon) => !icon.hidden).map((icon) => icon.dataset.icon);
    assert.ok(visible().length >= 28);
    t.type(t.$('.pj-icon-search'), 'music');
    assert.deepEqual(visible(), ['music']);
    t.$$('.pj-icon-option').find((icon) => icon.dataset.icon === 'music').click();
    t.$$('.pj-dot').find((dot) => dot.dataset.color === 'purple').click();
    t.byText('.pj-sheet .pj-button', 'Create project').click();
    await t.tick();
    assert.deepEqual([t.state.folders[0].name, t.state.folders[0].icon, t.state.folders[0].color, t.state.folders[0].memoryScope], ['Music', 'music', 'purple', 'project']);
  } finally { await t.finish(); }
});

test('the files of a chosen folder are added to the new project after it is made; hidden files and folders of tools are left out', async () => {
  const t = setup({ folders: [], conversations: [], wide: true });
  const added = [];
  try {
    t.open({ list: true }, { sourcesEnabled: true, readFile: async (file) => { added.push(file.name); return { ok: true, title: file.name, mime: 'text/plain', size: 5, text: 'hello' }; } });
    t.$$('.pj-head .pj-round').at(-1).click();
    t.type(t.$('.pj-name-input'), 'From folder');
    const input = t.$('.pj-folder input[type="file"]');
    const file = (name, path, size = 5) => { const entry = new t.window.File(['x'.repeat(size)], name); Object.defineProperty(entry, 'webkitRelativePath', { value: path }); return entry; };
    Object.defineProperty(input, 'files', { value: [file('a.txt', 'Docs/a.txt'), file('b.md', 'Docs/sub/b.md'), file('.env', 'Docs/.env'), file('x.js', 'Docs/node_modules/x.js'), file('empty.txt', 'Docs/empty.txt', 0)], configurable: true });
    input.dispatchEvent(new t.window.Event('change', { bubbles: true }));
    assert.match(t.$('.pj-folder-result').textContent, /2 files from "Docs"/);
    assert.match(t.$('.pj-folder-result').textContent, /3 more were not added/);
    t.byText('.pj-sheet .pj-button', 'Create project').click();
    await t.tick(); await t.tick();
    assert.deepEqual(added.sort(), ['a.txt', 'b.md']);
    assert.equal(t.state.folders[0].sources.length, 2);
  } finally { await t.finish(); }
});

test('on a computer the settings of a project list its sources with an add button, and "Advanced" opens the instructions and shows where the notes are kept', async () => {
  const folders = [{ id: 'f1', name: 'Research', icon: 'globe', color: 'blue', conversationIds: [], instructions: 'Be brief.', memoryScope: 'project', sources: [{ id: 's1', kind: 'text', title: 'Brief', mime: '', size: 5, text: 'hello', addedAt: '' }] }];
  const t = setup({ folders, conversations: [], wide: true });
  try {
    t.open({ id: 'f1' }, { sourcesEnabled: true });
    t.$$('.pj-head .pj-round').at(-1).click();
    t.byText('.pj-menu-item', 'Edit project').click();
    assert.equal(t.$('.pj-section-title').textContent, 'Available sources');
    assert.deepEqual(t.$$('.pj-sources-list .pj-row-title').map((node) => node.textContent), ['Brief']);
    t.$('.pj-sources-list .pj-more').click();
    await t.tick();
    assert.equal(t.state.folders[0].sources.length, 0, 'a source is removed from the list in the dialog');
    assert.match(t.$('.pj-sources-list').textContent, /No sources yet/);
    t.byText('.pj-sheet-foot .pj-foot-left', 'Advanced').click();
    assert.equal(t.$$('.pj-backdrop').length, 2);
    assert.match(t.$$('.pj-sheet-title').at(-1).textContent, /Advanced settings/);
    assert.equal(t.$('.pj-textarea').value, 'Be brief.');
    assert.match(t.$('.pj-memory-shown-block').textContent, /only uses its own notes/);
    assert.equal(t.$('.pj-readonly').textContent, 'Project only');
  } finally { await t.finish(); }
});

test('asked from the + of the left menu on a computer only the sheet that makes a project is on the page (no list behind it); a cancel takes the page away, and a project made opens its page', async () => {
  const t = setup({ folders: [], conversations: [], wide: true });
  try {
    t.open({ create: true }, { sourcesEnabled: true });
    assert.equal(t.$('.pj').classList.contains('pj-dialog-only'), true);
    assert.equal(t.$('.pj-list, .pj-row, .pj-tabs'), null, 'no list of the projects was drawn');
    assert.equal(t.$$('.pj-backdrop').length, 1);
    assert.equal(t.window.location.pathname, '/', 'the address is still the chat');
    t.$('.pj-sheet-head .pj-round').click();
    await t.tick();
    assert.ok(!getProjectsPage(), 'the page went away with the sheet');
    assert.equal(t.$('.pj'), null);
    t.open({ create: true }, { sourcesEnabled: true });
    t.type(t.$('.pj-name-input'), 'Fresh');
    t.byText('.pj-sheet .pj-button', 'Create project').click();
    await t.tick(); await t.tick();
    assert.equal(t.state.folders.length, 1);
    assert.ok(getProjectsPage(), 'the page stays');
    assert.equal(t.$('.pj').classList.contains('pj-dialog-only'), false);
    assert.equal(t.$('.pj-title-text').textContent, 'Fresh', 'the page of the new project is open');
    assert.equal(t.window.location.pathname, `/projects/${t.state.folders[0].id}`);
  } finally { await t.finish(); }
});

test('on a computer the sheet that makes a project lists the files and texts to add; nothing is read or kept until the project is made, and a removed one is not added', async () => {
  const t = setup({ folders: [], conversations: [], wide: true });
  const read = [];
  try {
    t.open({ create: true }, { sourcesEnabled: true, readFile: async (file) => { read.push(file.name); return { ok: true, title: file.name, mime: 'text/plain', size: 5, text: 'hello' }; } });
    t.type(t.$('.pj-name-input'), 'With sources');
    assert.equal(t.$('.pj-sources-head .pj-section-title').textContent, 'Available sources');
    assert.match(t.$('.pj-sources-list').textContent, /No sources yet/);
    const input = t.$$('input[type="file"]').find((entry) => !entry.hasAttribute('webkitdirectory') && !entry.accept);
    Object.defineProperty(input, 'files', { value: [new t.window.File(['hello'], 'a.txt'), new t.window.File(['world'], 'b.txt')], configurable: true });
    t.byText('.pj-sources-head .pj-chip', 'Add').click();
    t.byText('.pj-action-item', 'Add a file').click();
    input.dispatchEvent(new t.window.Event('change', { bubbles: true }));
    await t.tick();
    assert.deepEqual(t.$$('.pj-sources-list .pj-row-title').map((node) => node.textContent), ['a.txt', 'b.txt']);
    assert.deepEqual(read, [], 'not read yet');
    assert.equal(t.state.folders.length, 0, 'no project yet');
    // A written text goes into the list too.
    t.byText('.pj-sources-head .pj-chip', 'Add').click();
    t.byText('.pj-action-item', 'Add text').click();
    const area = t.$('.pj-textarea');
    area.value = 'My notes';
    area.dispatchEvent(new t.window.Event('input', { bubbles: true }));
    t.byText('.pj-sheet-foot .pj-button', 'Save').click();
    await t.tick();
    assert.deepEqual(t.$$('.pj-sources-list .pj-row-title').map((node) => node.textContent), ['a.txt', 'b.txt', 'Untitled text']);
    assert.equal(t.state.folders.length, 0, 'the text is not kept either');
    // A bin takes one out of the list.
    t.$$('.pj-sources-list .pj-more')[1].click();
    assert.deepEqual(t.$$('.pj-sources-list .pj-row-title').map((node) => node.textContent), ['a.txt', 'Untitled text']);
    t.byText('.pj-sheet .pj-button', 'Create project').click();
    await t.tick(); await t.tick(); await t.tick();
    assert.deepEqual(read, ['a.txt']);
    assert.deepEqual(t.state.folders[0].sources.map((source) => source.title), ['a.txt', 'Untitled text']);
  } finally { await t.finish(); }
});

test('the styles keep the icon search working (a hidden icon is not drawn), colour every icon of the picker with the colour chosen, and keep the box of the icons inside the dialog', () => {
  const css = readFileSync(new URL('../src/styles/projects.css', import.meta.url), 'utf8');
  assert.match(css, /\.pj-icon-option\[hidden\]\s*\{\s*display:\s*none/, '`display: grid` would win over the hidden attribute');
  assert.match(css, /\.pj-icon-option\s*\{[^}]*color:\s*var\(--pj-color/, 'every icon takes the colour that was chosen');
  assert.match(css, /\.pj-popover\s*\{[^}]*overflow:\s*hidden/);
});

test('the box of the icons on a computer is no taller than what is left in the dialog under the name', async () => {
  const t = setup({ folders: [], conversations: [], wide: true });
  try {
    t.open({ list: true }, { sourcesEnabled: true });
    t.$$('.pj-head .pj-round').at(-1).click();
    const sheet = t.$('.pj-sheet');
    const rect = (top, bottom) => ({ top, bottom, left: 0, right: 100, width: 100, height: bottom - top });
    sheet.getBoundingClientRect = () => rect(100, 600);
    t.$('.pj-name-input').parentElement.getBoundingClientRect = () => rect(170, 220);
    t.$('.pj-name-icon').click();
    assert.equal(t.$('.pj-popover').style.maxHeight, `${600 - 220 - 6 - 12}px`);
  } finally { await t.finish(); }
});

test('the ⋯ of a project (on the list and on its page) and of a chat closes its menu when it is pressed again', async () => {
  const t = setup();
  try {
    t.open();
    const press = (button) => { button.dispatchEvent(new t.window.PointerEvent('pointerdown', { bubbles: true })); button.click(); };
    const rowMore = () => t.$('.pj-row .pj-more');
    press(rowMore());
    assert.equal(t.$$('.pj-menu').length, 1);
    press(rowMore());
    assert.equal(t.$$('.pj-menu').length, 0, 'closed, not opened again');
    press(rowMore());
    assert.equal(t.$$('.pj-menu').length, 1);
    t.$('.pj-row').dispatchEvent(new t.window.PointerEvent('pointerdown', { bubbles: true }));
    assert.equal(t.$$('.pj-menu').length, 0, 'a press elsewhere closes it');
    t.$('.pj-row').click();
    const headMore = () => t.$$('.pj-head .pj-round').at(-1);
    press(headMore());
    assert.equal(t.$$('.pj-menu').length, 1);
    press(headMore());
    assert.equal(t.$$('.pj-menu').length, 0);
  } finally { await t.finish(); }
});

test('the list of the projects on a computer keeps what the list has (pills, search, +, pin, count, ⋯) with the search and the + in the title bar', async () => {
  const t = setup({ wide: true });
  try {
    t.open();
    assert.equal(t.$('.pj').classList.contains('is-list'), true);
    assert.ok(t.$('.pj-head .pj-head-actions .pj-search-input'), 'the search is in the title bar');
    assert.equal(t.$('.pj-head .pj-round.has-label .pj-round-label').textContent, 'New project');
    assert.equal(t.$$('.pj-bar .pj-tab').length, 3, 'the pills are under the title bar');
    assert.equal(t.$('.pj-foot'), null, 'no foot with the search on a computer');
    assert.equal(t.$$('.pj-row').length, 2);
    assert.ok(t.$('.pj-row .pj-more'), 'each row has its menu');
    t.type(t.$('.pj-search-input'), 'Trip');
    assert.deepEqual(t.$$('.pj-row .pj-row-title').map((node) => node.textContent), ['Trip <b>plans</b>']);
    t.$('.pj-row').click();
    assert.equal(t.$('.pj').classList.contains('is-list'), false, 'a project has its own page');
  } finally { await t.finish(); }
});

test('one project on a computer is three columns: the projects (to go to another), the box and the chats, the instructions and the sources', async () => {
  const folders = [
    { id: 'f1', name: 'Research', icon: 'globe', color: 'blue', conversationIds: [], instructions: 'Be brief.', sources: [{ id: 's1', kind: 'text', title: 'Brief', mime: '', size: 5, text: 'hello', addedAt: '' }] },
    { id: 'f2', name: 'Plans', icon: 'book', color: 'green', conversationIds: [], instructions: '', pinned: true, sources: [] }
  ];
  const t = setup({ folders, conversations: [{ id: 'c1', title: 'Chat one', folderId: 'f1', lastUpdatedAt: '2026-10-20T00:00:00.000Z', messages: [] }], wide: true });
  try {
    t.open({ id: 'f1' }, { sourcesEnabled: true });
    assert.equal(t.$('.pj').classList.contains('is-project'), true);
    assert.equal(t.$$('.pj-three > *').length, 3);
    assert.deepEqual(t.$$('.pj-side-row').map((row) => row.dataset.projectId), ['f2', 'f1'], 'the projects, the pinned one first');
    assert.equal(t.$('.pj-side-row.is-current').dataset.projectId, 'f1');
    assert.ok(t.$('.pj-main .pj-composer'), 'the box is at the top of the middle column');
    assert.deepEqual(t.$$('.pj-main .pj-chat').map((row) => row.dataset.conversationId), ['c1']);
    assert.equal(t.$('.pj-panel .pj-card-text').textContent, 'Be brief.');
    assert.deepEqual(t.$$('.pj-panel .pj-sources .pj-row-title').map((node) => node.textContent), ['Brief']);
    assert.equal(t.$('.pj-tabs'), null, 'no pills: nothing is hidden behind a tab');
    // The list at the left goes to another project; its search narrows the list.
    t.type(t.$('.pj-side .pj-search-input'), 'Pla');
    assert.deepEqual(t.$$('.pj-side-row').map((row) => row.dataset.projectId), ['f2']);
    t.$('.pj-side-row').click();
    assert.equal(t.$('.pj-title-text').textContent, 'Plans');
    assert.match(t.$('.pj-panel .pj-card-text').textContent, /No instructions yet/);
    // The pencil opens the instructions, the + of the sources opens the list of what can be added.
    t.$('.pj-panel .pj-card-head .pj-more').click();
    assert.ok(t.$('.pj-textarea'), 'the instructions are open');
  } finally { await t.finish(); }
});

test('a folder dropped on the sheet that makes a project is read with what is in it and becomes the source folder; single files go to the list of sources', async () => {
  const t = setup({ folders: [], conversations: [], wide: true });
  const read = [];
  const file = (name, size = 5) => new t.window.File(['x'.repeat(size)], name);
  const fileEntry = (name, size) => ({ isFile: true, isDirectory: false, name, file: (done) => done(file(name, size)) });
  const dirEntry = (name, children) => ({ isFile: false, isDirectory: true, name, createReader: () => { let given = false; return { readEntries: (done) => { done(given ? [] : children); given = true; } }; } });
  try {
    t.open({ create: true }, { sourcesEnabled: true, readFile: async (f) => { read.push(f.name); return { ok: true, title: f.name, mime: 'text/plain', size: 5, text: 'hello' }; } });
    t.type(t.$('.pj-name-input'), 'Dropped');
    const tree = dirEntry('Docs', [fileEntry('a.txt'), fileEntry('.env'), dirEntry('sub', [fileEntry('b.md')]), dirEntry('node_modules', [fileEntry('x.js')]), fileEntry('empty.txt', 0)]);
    const drop = new t.window.Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', { value: { types: ['Files'], items: [{ kind: 'file', webkitGetAsEntry: () => tree, getAsFile: () => null }, { kind: 'file', webkitGetAsEntry: () => fileEntry('loose.txt'), getAsFile: () => file('loose.txt') }] } });
    t.$('.pj-backdrop').dispatchEvent(drop);
    await t.tick(); await t.tick();
    assert.equal(drop.defaultPrevented, true);
    assert.match(t.$('.pj-folder-result').textContent, /2 files from "Docs"/);
    assert.deepEqual(t.$$('.pj-sources-list .pj-row-title').map((node) => node.textContent), ['loose.txt']);
    t.byText('.pj-sheet .pj-button', 'Create project').click();
    for (let n = 0; n < 6; n += 1) await t.tick();
    assert.deepEqual(read.sort(), ['a.txt', 'b.md', 'loose.txt']);
  } finally { await t.finish(); }
});

test('the cards of the right column fold and unfold, and what was folded is remembered', async () => {
  const folders = [{ id: 'f1', name: 'Research', icon: 'globe', color: 'blue', conversationIds: [], instructions: 'Be brief.', sources: Array.from({ length: 4 }, (_, n) => ({ id: `s${n}`, kind: 'text', title: `Note ${n}`, mime: '', size: 5, text: 'hello', addedAt: '' })) }];
  const t = setup({ folders, conversations: [], wide: true });
  try {
    t.open({ id: 'f1' }, { sourcesEnabled: true });
    const toggle = () => t.$('.pj-card-toggle[data-card="sources"]');
    const card = () => toggle().closest('.pj-card');
    assert.equal(toggle().getAttribute('aria-expanded'), 'true');
    assert.equal(card().classList.contains('is-folded'), false);
    assert.equal(t.$$('.pj-panel .pj-sources .pj-row').length, 4);
    toggle().click();
    assert.equal(card().classList.contains('is-folded'), true);
    assert.equal(toggle().getAttribute('aria-expanded'), 'false');
    assert.equal(t.$('.pj-card-toggle[data-card="instructions"]').closest('.pj-card').classList.contains('is-folded'), false, 'the other card is not folded');
    assert.deepEqual(JSON.parse(t.window.localStorage.getItem('noureon.projectPanels.v1')), ['sources']);
    // Drawn again (another project, a source added) it stays folded; the count is still in the title.
    t.$('.pj-side-row').click();
    assert.equal(card().classList.contains('is-folded'), true);
    assert.match(toggle().textContent, /4 of 20/);
    toggle().click();
    assert.equal(card().classList.contains('is-folded'), false);
    assert.deepEqual(JSON.parse(t.window.localStorage.getItem('noureon.projectPanels.v1')), []);
  } finally { await t.finish(); }
});
