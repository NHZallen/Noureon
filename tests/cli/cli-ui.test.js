import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { createCliMode } from '../../src/app/runtime/cli/cli-mode.js';
import { getCliSelection } from '../../src/app/runtime/cli/cli-bridge.js';
import { closeCliStore, openCliStore } from '../../src/app/ui/cli/cli-store.js';
import { chipCloseButton } from '../../src/app/runtime/features/composer-chip.js';

const flush = () => new Promise((resolve) => setTimeout(resolve, 10));

function setup({ config = { cliEnabledIds: [], cliModelUseIds: [], cliVersions: {} }, language = 'en', account = true } = {}) {
  const window = new Window({ url: 'https://example.test/' });
  const { document } = window;
  document.body.innerHTML = '<aside id="sidebar"><div class="flex-1 overflow-y-auto px-2"><div id="first-section"></div></div></aside><div id="sidebar-overlay"></div><div class="composer-host"><div class="input-wrapper"><div id="editor" contenteditable="true"></div></div></div>';
  const editor = document.getElementById('editor');
  const log = { refreshed: 0, notices: [], saved: 0, changed: 0 };
  const mode = createCliMode({
    document,
    messageInput: editor,
    getConfig: () => config,
    saveConfig: async () => { log.saved += 1; },
    getUiLanguage: () => language,
    refresh: () => { log.refreshed += 1; },
    showNotification: (text, kind) => log.notices.push([text, kind]),
    getAccountReady: () => account
  });
  const type = (text) => {
    editor.textContent = text;
    const node = editor.firstChild;
    const selection = document.getSelection();
    selection.removeAllRanges();
    const range = document.createRange();
    range.setStart(node, text.length);
    range.collapse(true);
    selection.addRange(range);
    editor.dispatchEvent(new window.Event('input', { bubbles: true }));
  };
  const key = (name) => {
    const event = new window.KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
    editor.dispatchEvent(event);
    return event;
  };
  return { window, document, editor, mode, config, log, type, key, language };
}

test('the left menu has the entry, named in the person\'s language, that closes the phone\'s drawer and opens the store', () => {
  const zh = setup({ language: 'zh-TW' });
  const entry = zh.document.getElementById('open-cli-store-btn');
  assert.ok(entry, 'the entry');
  assert.equal(entry.querySelector('.cli-sidebar-label').textContent, '命令工具');
  assert.ok(entry.querySelector('svg'), 'the terminal glyph');
  assert.equal(entry.parentElement.firstChild, entry, 'above the sections');
  assert.equal(setup({ language: 'fr' }).document.querySelector('.cli-sidebar-label').textContent, 'CLI');
  zh.mode.sync();
  assert.equal(zh.document.querySelectorAll('#open-cli-store-btn').length, 1, 'once');
});

test('"@" opens the list of the tools that were added, narrows as it is typed, and Enter puts a chip in and takes the "@" away', () => {
  const t = setup({ config: { cliEnabledIds: ['officecli', 'ffmpeg'], cliModelUseIds: [], cliVersions: {} } });
  t.type('make a video @');
  const menu = t.document.getElementById('cli-mention-menu');
  assert.equal(menu.hidden, false);
  assert.match(menu.querySelector('.cli-menu-header').textContent, /Type to search CLI tools/);
  assert.deepEqual([...menu.querySelectorAll('.cli-menu-name')].map((node) => node.textContent), ['OfficeCLI', 'FFmpeg']);
  assert.equal(menu.querySelectorAll('.cli-menu-kind')[0].textContent, 'CLI');
  t.type('make a video @mp');
  assert.deepEqual([...menu.querySelectorAll('.cli-menu-name')].map((node) => node.textContent), ['FFmpeg'], 'narrowed');
  assert.equal(menu.querySelector('.cli-menu-header'), null, 'the header goes once there is something typed');
  const before = t.log.refreshed;
  const enter = t.key('Enter');
  assert.equal(enter.defaultPrevented, true, 'Enter does not send the message');
  assert.equal(menu.hidden, true);
  assert.equal(t.editor.textContent, 'make a video ', 'the "@" and what followed it are gone');
  assert.deepEqual(getCliSelection().map((entry) => entry.id), ['ffmpeg']);
  assert.ok(t.log.refreshed > before, 'the box draws its chips again');
  const map = new Map();
  t.mode.indicators(map, chipCloseButton);
  assert.deepEqual([...map.keys()], ['cli-indicator-ffmpeg']);
  assert.match(map.get('cli-indicator-ffmpeg').html, /FFmpeg/);
  t.mode.clear();
  assert.deepEqual(getCliSelection(), [], 'let go once the message is sent');
});

test('the keys of the list: arrows move, Escape closes, Tab chooses; a "@" inside a word is not a mention', () => {
  const t = setup({ config: { cliEnabledIds: ['officecli', 'ffmpeg'], cliModelUseIds: [], cliVersions: {} } });
  t.type('@');
  const menu = t.document.getElementById('cli-mention-menu');
  assert.equal(menu.querySelector('.is-active .cli-menu-name').textContent, 'OfficeCLI');
  t.key('ArrowDown');
  assert.equal(menu.querySelector('.is-active .cli-menu-name').textContent, 'FFmpeg');
  t.key('ArrowDown');
  assert.equal(menu.querySelector('.is-active .cli-menu-name').textContent, 'OfficeCLI', 'it wraps');
  t.key('ArrowUp');
  assert.equal(menu.querySelector('.is-active .cli-menu-name').textContent, 'FFmpeg');
  assert.equal(t.key('Escape').defaultPrevented, true);
  assert.equal(menu.hidden, true);
  t.type('mail me at x@y');
  assert.equal(menu.hidden, true, 'an address is not a mention');
  t.type('@');
  t.key('Tab');
  assert.deepEqual(getCliSelection().map((entry) => entry.id), ['officecli']);
  t.mode.clear();
});

test('with no tool added the list says so and offers the store; one that was removed is not kept chosen', () => {
  const t = setup();
  t.type('@');
  const menu = t.document.getElementById('cli-mention-menu');
  assert.match(menu.textContent, /No CLI tools added yet/);
  assert.ok(menu.querySelector('[data-cli-store]'), 'a way to the store');
  const noMatch = setup({ config: { cliEnabledIds: ['officecli'], cliModelUseIds: [], cliVersions: {} } });
  noMatch.type('@zzz');
  assert.match(noMatch.document.getElementById('cli-mention-menu').textContent, /No CLI tools match/);

  const kept = setup({ config: { cliEnabledIds: ['ffmpeg'], cliModelUseIds: [], cliVersions: {} } });
  kept.type('@');
  kept.key('Enter');
  assert.equal(getCliSelection().length, 1);
  kept.config.cliEnabledIds = [];
  kept.mode.sync();
  assert.deepEqual(getCliSelection(), [], 'removed in the store, so no longer chosen');
});

test('the store: tools to add, the ones coming, tabs, search, the menu of an added tool, and what is saved', async () => {
  const config = { cliEnabledIds: [], cliModelUseIds: [], cliVersions: {} };
  const t = setup({ config });
  const store = openCliStore({ document: t.document, getConfig: () => config, saveConfig: async () => { t.log.saved += 1; }, getLanguage: () => 'en', showNotification: (text, kind) => t.log.notices.push([text, kind]), getAccountReady: () => true, onChange: () => { t.log.changed += 1; } });
  const root = t.document.querySelector('.cs');
  assert.equal(openCliStore({ document: t.document, getConfig: () => config, getLanguage: () => 'en' }), store, 'once');
  assert.equal(root.querySelector('.cs-title span').textContent, 'CLI');
  assert.equal(root.querySelector('.cs-note').hidden, true, 'no word about the account when there is one');
  const names = () => [...root.querySelectorAll('.cs-row .cs-name-text')].map((node) => node.textContent);
  assert.deepEqual(names(), ['OfficeCLI', 'FFmpeg', 'yt-dlp', 'twitter-cli', 'rdt-cli', 'csvkit', 'Pandoc', 'SoX'], 'the ones that can be added first');
  assert.equal(root.querySelectorAll('.cs-soon').length, 2, 'the others say they are coming');
  assert.equal(root.querySelectorAll('.cs-add').length, 6);
  assert.ok([...root.querySelectorAll('.cs-badge')].every((badge) => badge.textContent === 'Official'));

  root.querySelector('.cs-row[data-cli-id="ffmpeg"] .cs-add').click();
  await flush();
  assert.deepEqual(config.cliEnabledIds, ['ffmpeg']);
  assert.equal(t.log.saved, 1, 'saved');
  assert.equal(t.log.changed, 1, 'the composer is told');
  assert.match(t.log.notices.at(-1)[0], /“FFmpeg” added/);
  assert.equal(root.querySelector('.cs-section-title').textContent, 'My CLI tools');
  assert.equal(root.querySelector('.cs-row[data-cli-id="ffmpeg"] .cs-added').textContent, 'Added');

  // search
  const input = root.querySelector('.cs-search-input');
  input.value = 'word';
  input.dispatchEvent(new t.window.Event('input', { bubbles: true }));
  assert.deepEqual(names(), ['OfficeCLI', 'Pandoc'], 'the words of a tool are searched too');
  input.value = 'zzzz';
  input.dispatchEvent(new t.window.Event('input', { bubbles: true }));
  assert.match(root.textContent, /No CLI tools match your search/);
  input.value = '';
  input.dispatchEvent(new t.window.Event('input', { bubbles: true }));

  // the menu of an added tool
  root.querySelector('.cs-row[data-cli-id="ffmpeg"] .cs-icon-button').click();
  const menu = root.querySelector('.cs-menu');
  assert.deepEqual([...menu.querySelectorAll('.cs-menu-label')].map((node) => node.textContent), ['Details', 'Let the model use it by itself', 'Remove']);
  menu.querySelectorAll('.cs-menu-item')[1].click();
  await flush();
  assert.deepEqual(config.cliModelUseIds, ['ffmpeg']);
  root.querySelector('.cs-row[data-cli-id="ffmpeg"] .cs-icon-button').click();
  assert.equal(root.querySelectorAll('.cs-menu-item')[1].getAttribute('aria-checked'), 'true');
  root.querySelectorAll('.cs-menu-item')[0].click();
  assert.match(root.querySelector('.cs-row[data-cli-id="ffmpeg"] .cs-details').textContent, /GPL-3\.0-or-later/, 'the details open under the row');
  root.querySelector('.cs-row[data-cli-id="ffmpeg"] .cs-icon-button').click();
  root.querySelectorAll('.cs-menu-item')[2].click();
  await flush();
  assert.deepEqual([config.cliEnabledIds, config.cliModelUseIds], [[], []], 'removed with what was kept about it');
  assert.match(t.log.notices.at(-1)[0], /removed/);

  // there is no page of updates: the tools always run at the version of the store, so there is nothing to update
  config.cliEnabledIds = ['officecli'];
  config.cliVersions = { officecli: '1.0.100' };
  root.querySelectorAll('.history-tab')[0].click();
  assert.equal(root.querySelectorAll('.history-tab').length, 2, 'all, and mine');
  assert.doesNotMatch(root.textContent, /Updates|New version/);
  assert.equal(root.querySelector('.cs-button-primary'), null, 'no update button');

  // closing: Escape closes the menu first, then the page
  root.querySelectorAll('.history-tab')[1].click();
  root.querySelector('.cs-icon-button').click();
  const escape = () => t.window.dispatchEvent(new t.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  escape();
  assert.equal(root.querySelector('.cs-menu'), null, 'the menu first');
  assert.ok(t.document.querySelector('.cs'));
  escape();
  assert.equal(t.document.querySelector('.cs'), null);
  assert.equal(t.document.documentElement.classList.contains('cs-open'), false);
  closeCliStore();
});

test('without a cloud account the store says CLI tools need one, and the page can be closed with its back button', () => {
  const config = { cliEnabledIds: [], cliModelUseIds: [], cliVersions: {} };
  const t = setup({ config, account: false });
  openCliStore({ document: t.document, getConfig: () => config, getLanguage: () => 'fr', getAccountReady: () => false });
  const root = t.document.querySelector('.cs');
  assert.equal(root.querySelector('.cs-note').hidden, false);
  assert.match(root.querySelector('.cs-note').textContent, /connectez-vous/);
  root.querySelector('.cs-back').click();
  assert.equal(t.document.querySelector('.cs'), null);
});

test('the page has its own address: /cli while open, / after, the back button closes it, and the address opens it', async () => {
  const config = { cliEnabledIds: [], cliModelUseIds: [], cliVersions: {} };
  const t = setup({ config });
  const path = () => t.window.location.pathname;
  // opened from the menu: /cli is added to the history, closing goes back
  openCliStore({ document: t.document, getConfig: () => config, getLanguage: () => 'en' });
  assert.equal(path(), '/cli');
  t.document.querySelector('.cs-back').click();
  assert.equal(t.document.querySelector('.cs'), null);
  await flush();
  assert.equal(path(), '/', 'closing returns to the first address');

  // the browser's back button closes it
  openCliStore({ document: t.document, getConfig: () => config, getLanguage: () => 'en' });
  assert.equal(path(), '/cli');
  t.window.history.back();
  await flush();
  assert.equal(t.document.querySelector('.cs'), null);
  assert.equal(path(), '/');

  // opened by the address itself: nothing to go back to, closing puts / in its place
  t.window.history.replaceState({}, '', '/cli');
  openCliStore({ document: t.document, getConfig: () => config, getLanguage: () => 'en' });
  assert.equal(path(), '/cli');
  closeCliStore();
  assert.equal(path(), '/');
});

test('a page loaded at /cli opens the store', async () => {
  const window = new Window({ url: 'https://example.test/cli' });
  const { document } = window;
  document.body.innerHTML = '<aside id="sidebar"><div class="flex-1 overflow-y-auto"></div></aside><div class="composer-host"><div class="input-wrapper"><div id="editor" contenteditable="true"></div></div></div>';
  const config = { cliEnabledIds: [], cliModelUseIds: [], cliVersions: {} };
  createCliMode({ document, messageInput: document.getElementById('editor'), getConfig: () => config, saveConfig: async () => {}, getUiLanguage: () => 'en', refresh() {}, getAccountReady: () => true });
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.ok(document.querySelector('.cs'), 'the page is there');
  closeCliStore();
  assert.equal(window.location.pathname, '/');
});

test('the logo of a project is shown, and the terminal glyph takes its place when it cannot be loaded', () => {
  const config = { cliEnabledIds: [], cliModelUseIds: [], cliVersions: {} };
  const t = setup({ config });
  openCliStore({ document: t.document, getConfig: () => config, getLanguage: () => 'en' });
  const root = t.document.querySelector('.cs');
  const image = root.querySelector('.cs-row[data-cli-id="ffmpeg"] .cs-mark img.cli-tool-img');
  assert.ok(image, 'the logo');
  assert.equal(image.getAttribute('src'), 'https://github.com/FFmpeg.png?size=96');
  assert.equal(image.getAttribute('referrerpolicy'), 'no-referrer');
  assert.equal(root.querySelector('.cs-row[data-cli-id="pandoc"] .cs-mark img'), null, 'no logo: the glyph');
  assert.ok(root.querySelector('.cs-row[data-cli-id="pandoc"] .cs-mark svg'));
  image.dispatchEvent(new t.window.Event('error'));
  assert.equal(root.querySelector('.cs-row[data-cli-id="ffmpeg"] .cs-mark img'), null);
  assert.ok(root.querySelector('.cs-row[data-cli-id="ffmpeg"] .cs-mark svg'), 'the glyph instead');
  closeCliStore();
});

test('the details of a tool open with a longer explanation in the language of the page, and the chip carries the logo', () => {
  const config = { cliEnabledIds: ['ffmpeg'], cliModelUseIds: [], cliVersions: { ffmpeg: '7.0.2' } };
  const t = setup({ config, language: 'fr' });
  openCliStore({ document: t.document, getConfig: () => config, getLanguage: () => 'fr' });
  const root = t.document.querySelector('.cs');
  root.querySelector('.cs-row[data-cli-id="ffmpeg"] .cs-icon-button').click();
  root.querySelectorAll('.cs-menu-item')[0].click();
  const about = root.querySelector('.cs-row[data-cli-id="ffmpeg"] .cs-about');
  assert.ok(about && about.textContent.length > 120, 'a few sentences');
  assert.match(about.textContent, /bac à sable/);
  closeCliStore();

  t.type('@');
  t.document.querySelector('[data-cli-id="ffmpeg"]').click();
  const chip = t.document.querySelector('#cli-indicator-ffmpeg, [id*="cli-indicator-ffmpeg"]');
  assert.ok(getCliSelection().some((entry) => entry.id === 'ffmpeg'));
  void chip;
});

test('the note about the account goes away when the account becomes ready while the page is open', async () => {
  const config = { cliEnabledIds: [], cliModelUseIds: [], cliVersions: {} };
  const t = setup({ config });
  let ready = false;
  openCliStore({ document: t.document, getConfig: () => config, getLanguage: () => 'en', getAccountReady: () => ready });
  const note = t.document.querySelector('.cs-note');
  assert.equal(note.hidden, false);
  ready = true;
  await new Promise((resolve) => setTimeout(resolve, 1200));
  assert.equal(note.hidden, true, 'signed in: no note');
  closeCliStore();
});

test('opening the details does not make the logos load again (the same pictures stay in place)', () => {
  const config = { cliEnabledIds: [], cliModelUseIds: [], cliVersions: {} };
  const t = setup({ config });
  openCliStore({ document: t.document, getConfig: () => config, getLanguage: () => 'en' });
  const root = t.document.querySelector('.cs');
  const before = root.querySelector('.cs-row[data-cli-id="ffmpeg"] img.cli-tool-img');
  const text = root.querySelector('.cs-row[data-cli-id="yt-dlp"] .cs-text');
  text.click();
  assert.ok(root.querySelector('.cs-row[data-cli-id="yt-dlp"] .cs-about'), 'the details are open');
  assert.equal(root.querySelector('.cs-row[data-cli-id="ffmpeg"] img.cli-tool-img'), before, 'the same picture element, not a new one');
  closeCliStore();
});
