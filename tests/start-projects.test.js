import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';
import { startProjects } from '../src/app/runtime/projects/start-projects.js';
import i18nParts from '../src/data/i18n/parts/projects.js';

// Starting the projects for the page: the entry of the left menu (in the language of the page, below the Extensions, drawn again when the language changes), the page that is loaded when it is
// opened, and the address that opens it.

const i18n = { 'zh-TW': i18nParts['zh-TW'], en: i18nParts.en, fr: i18nParts.fr };
const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

const setup = ({ url = 'https://noureon.test/', language = 'en', withExtensions = true, staticEntry = false } = {}) => {
  const window = new Window({ url });
  const { document } = window;
  document.body.innerHTML = `<aside id="sidebar"><div class="overflow-y-auto">${staticEntry ? '<button id="open-projects-btn" class="sidebar-item"><span class="cli-sidebar-label">專案</span></button>' : ''}${withExtensions ? '<button id="open-cli-store-btn">Extensions</button>' : ''}<div id="rest">history</div></div></aside><div id="sidebar-overlay"></div>`;
  const config = { language };
  const opened = [];
  const state = { folders: [{ id: 'f1', name: 'Trip', conversationIds: [] }], conversations: [] };
  const started = startProjects({
    document,
    configAccess: { getUiLanguage: () => config.language },
    dataStore: { getFolders: () => state.folders, replaceFolders: (next) => { state.folders = next; }, getConversations: () => state.conversations },
    i18n,
    getDefaultFolder: () => ({ color: 'gray', icon: 'default', textColor: 'gray', isOpen: false }),
    saveAppData: async () => {}, renderSidebar: () => {}, deleteFolderFromCloud: async () => {}, deferConversationFolderSync: () => {},
    startNewChat: async () => {}, loadChat: () => {}, archiveChat: async () => {}, deleteChat: async () => {}, getCurrentConversationId: () => null,
    load: async () => ({ openProjectsPage: (args) => { opened.push(args.route); return { go: (route) => opened.push(['go', route]) }; } })
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
  t.$('#sidebar-overlay').addEventListener('click', () => { overlayClicks += 1; });
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
