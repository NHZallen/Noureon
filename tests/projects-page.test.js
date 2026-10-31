import assert from 'node:assert/strict';
import test from 'node:test';

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

const setup = ({ folders, conversations, url = 'https://noureon.test/' } = {}) => {
  const window = new Window({ url });
  const { document } = window;
  document.body.innerHTML = '<div id="app"></div>';
  const state = {
    folders: folders || [
      { id: 'f1', name: 'Translation', icon: 'book', color: 'blue', conversationIds: ['c1', 'c2'], instructions: 'Answer in English.' },
      { id: 'f2', name: 'Trip <b>plans</b>', icon: 'plane', color: 'green', conversationIds: [], instructions: '' }
    ],
    conversations: conversations || [
      { id: 'c1', title: 'Chinese to English', folderId: 'f1', lastUpdatedAt: '2026-10-20T00:00:00.000Z', messages: [{ role: 'user', parts: [{ text: 'translate' }] }, { role: 'model', parts: [{ text: 'Here is **the** translation' }] }] },
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
    assert.equal(chats[1].querySelector('.pj-chat-preview').textContent, 'Here is **the** translation');
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
    assert.equal(t.$('.pj-count').textContent, '18 / 4000');
    t.type(t.$('.pj-textarea'), 'Answer in French.');
    assert.equal(t.$('.pj-count').textContent, '17 / 4000');
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
      readFile: async (file) => { reads.push(file.name); return file.name.endsWith('.png') ? { ok: false, code: 'unsupported' } : { ok: true, title: file.name, mime: 'text/plain', size: 2048, text: `text of ${file.name}`, truncated: false }; }
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
    assert.match(t.state.notified.at(-1)[0], /"photo.png" is a kind of file that cannot be read yet/);
    assert.equal(t.state.notified.at(-1)[1], 'error');

    const photos = t.$$('.pj-file-input').find((node) => node.accept === 'image/*' && !node.getAttribute('capture'));
    assert.ok(photos && t.$$('.pj-file-input').some((node) => node.getAttribute('capture') === 'environment'), 'a photo input and a camera input');
    Object.defineProperty(photos, 'files', { value: [{ name: 'receipt.jpg', type: 'image/jpeg' }], configurable: true });
    photos.dispatchEvent(new t.window.Event('change'));
    await t.tick();
    assert.deepEqual(t.state.folders.find((folder) => folder.id === 'f2').sources.map((source) => source.kind), ['text', 'file', 'image']);
    assert.match(t.$$('.pj-source .pj-row-meta')[2].textContent, /^Picture · 2 KB$/);

    t.$$('.pj-source .pj-more')[0].click();
    await t.tick();
    assert.deepEqual(t.$$('.pj-source .pj-row-title').map((node) => node.textContent), ['report.txt', 'receipt.jpg']);
    assert.deepEqual(t.state.notified.at(-1), ['Source removed.', 'success']);

    await t.actions.addSource('f2', { text: 'x'.repeat(70_000), title: 'Huge' });
    t.$('.pj-tab[aria-selected="false"]').click();
    t.byText('.pj-tab', 'Sources').click();
    assert.match(t.$('.pj-sources').textContent, /1 source\(s\) are too big/);
  } finally { await t.finish(); }
});
