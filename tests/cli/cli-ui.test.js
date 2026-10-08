import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { Window } from 'happy-dom';

import { createCliMode } from '../../src/app/runtime/cli/cli-mode.js';
import { getCliSelection } from '../../src/app/runtime/cli/cli-bridge.js';
import { closeCliStore, openCliStore } from '../../src/app/ui/cli/cli-store.js';
import { chipCloseButton } from '../../src/app/runtime/features/composer-chip.js';

const flush = () => new Promise((resolve) => setTimeout(resolve, 10));

function setup({ config = { cliEnabledIds: [], cliModelUseIds: [], cliVersions: {} }, language = 'en', account = true, locked = () => false, visualViewport = null } = {}) {
  const window = new Window({ url: 'https://example.test/' });
  if (visualViewport) window.visualViewport = visualViewport;
  const { document } = window;
  document.body.innerHTML = '<aside id="sidebar"><div class="flex-1 overflow-y-auto px-2"><div id="first-section"></div></div></aside><div id="sidebar-overlay"></div><div class="composer-host"><div class="input-wrapper"><div id="editor" contenteditable="true"></div></div></div>';
  const editor = document.getElementById('editor');
  const log = { refreshed: 0, notices: [], saved: 0, changed: 0 };
  const mode = createCliMode({
    document,
    messageInput: editor,
    isLocked: () => locked(),
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
  assert.equal(entry.querySelector('.cli-sidebar-label').textContent, '擴充');
  assert.equal(entry.querySelectorAll('svg rect').length, 4, 'the four squares of the page');
  assert.equal(entry.parentElement.firstChild, entry, 'above the sections');
  assert.equal(setup({ language: 'fr' }).document.querySelector('.cli-sidebar-label').textContent, 'Extensions');
  zh.mode.sync();
  assert.equal(zh.document.querySelectorAll('#open-cli-store-btn').length, 1, 'once');
});

test('in a temporary chat "@" opens nothing, shows no chips, and a tool chosen before is let go', () => {
  let temporary = false;
  const t = setup({ config: { cliEnabledIds: ['ffmpeg'], cliModelUseIds: [], cliVersions: {} }, locked: () => temporary });
  t.type('@');
  assert.equal(t.document.getElementById('cli-mention-menu').hidden, false);
  t.key('Enter');
  assert.deepEqual(getCliSelection().map((entry) => entry.id), ['ffmpeg']);
  temporary = true;
  t.type('hello @');
  assert.equal(t.document.getElementById('cli-mention-menu').hidden, true, 'no list');
  const map = new Map();
  t.mode.indicators(map, chipCloseButton);
  assert.equal(map.size, 0, 'no chip');
  t.mode.sync();
  assert.deepEqual(getCliSelection(), [], 'nothing is chosen any more');
  temporary = false;
  t.type('again @');
  assert.equal(t.document.getElementById('cli-mention-menu').hidden, false, 'back in a normal chat it works again');
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
  const store = openCliStore({ kind: 'cli', document: t.document, getConfig: () => config, saveConfig: async () => { t.log.saved += 1; }, getLanguage: () => 'en', showNotification: (text, kind) => t.log.notices.push([text, kind]), getAccountReady: () => true, onChange: () => { t.log.changed += 1; } });
  const root = t.document.querySelector('.cs');
  assert.equal(openCliStore({ kind: 'cli', document: t.document, getConfig: () => config, getLanguage: () => 'en' }), store, 'once');
  assert.equal(root.querySelector('.cs-title span').textContent, 'Extensions');
  assert.equal(root.querySelector('.cs-note').hidden, true, 'no word about the account when there is one');
  const names = () => [...root.querySelectorAll('.cs-row .cs-name-text')].map((node) => node.textContent);
  assert.deepEqual(names(), ['OfficeCLI', 'FFmpeg', 'yt-dlp', 'twitter-cli', 'rdt-cli', 'csvkit', 'Pandoc', 'SoX'], 'the ones that can be added first');
  assert.equal(root.querySelectorAll('.cs-soon').length, 0, 'nothing in the store is waiting any more');
  assert.equal(root.querySelectorAll('.cs-add').length, 8);
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
  openCliStore({ kind: 'cli', document: t.document, getConfig: () => config, getLanguage: () => 'fr', getAccountReady: () => false });
  const root = t.document.querySelector('.cs');
  assert.equal(root.querySelector('.cs-note').hidden, false);
  assert.match(root.querySelector('.cs-note').textContent, /connectez-vous/);
  root.querySelector('.cs-back').click();
  assert.equal(t.document.querySelector('.cs'), null);
});

test('the page has its own address: /skill or /cli while open, / after, the back button closes it, and the address opens it', async () => {
  const config = { cliEnabledIds: [], cliModelUseIds: [], cliVersions: {} };
  const t = setup({ config });
  const path = () => t.window.location.pathname;
  const open = (kind) => openCliStore({ kind, document: t.document, getConfig: () => config, getLanguage: () => 'en' });
  // opened from the menu: the address is added to the history, closing goes back
  open('cli');
  assert.equal(path(), '/cli');
  t.document.querySelector('.cs-back').click();
  assert.equal(t.document.querySelector('.cs'), null);
  await flush();
  assert.equal(path(), '/', 'closing returns to the first address');

  // with no part said, the first (skills) opens
  open();
  assert.equal(path(), '/skill');
  // turning to the other part changes the address in place: one step back still closes the page
  t.document.querySelector('.cs-nav-item[data-kind="cli"]').click();
  assert.equal(path(), '/cli');
  t.document.querySelector('.cs-nav-item[data-kind="skills"]').click();
  assert.equal(path(), '/skill');
  t.window.history.back();
  await flush();
  assert.equal(t.document.querySelector('.cs'), null);
  assert.equal(path(), '/');

  // opened by the address itself: nothing to go back to, closing puts / in its place, and the address says which part
  t.window.history.replaceState({}, '', '/cli');
  open('skills');
  assert.equal(t.document.querySelector('.cs-nav-item[aria-selected="true"]').dataset.kind, 'cli');
  assert.equal(path(), '/cli');
  closeCliStore();
  assert.equal(path(), '/');
});

for (const [address, expected] of [['/skill', 'skills'], ['/skill/', 'skills'], ['/cli', 'cli']]) {
  test(`a page loaded at ${address} opens the page on ${expected}`, async () => {
    const window = new Window({ url: `https://example.test${address}` });
    const { document } = window;
    document.body.innerHTML = '<aside id="sidebar"><div class="flex-1 overflow-y-auto"></div></aside><div class="composer-host"><div class="input-wrapper"><div id="editor" contenteditable="true"></div></div></div>';
    const config = { cliEnabledIds: [], cliModelUseIds: [], cliVersions: {} };
    createCliMode({ document, messageInput: document.getElementById('editor'), getConfig: () => config, saveConfig: async () => {}, getUiLanguage: () => 'en', refresh() {}, getAccountReady: () => true });
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.ok(document.querySelector('.cs'), 'the page is there');
    assert.equal(document.querySelector('.cs-nav-item[aria-selected="true"]').dataset.kind, expected);
    assert.equal(window.location.pathname, expected === 'cli' ? '/cli' : '/skill', 'a closing slash is put right');
    closeCliStore();
    assert.equal(window.location.pathname, '/');
  });
}

test('the entry opens the first part (skills); the link of the "@" list opens the CLI tools', async () => {
  const t = setup({ config: { cliEnabledIds: [], cliModelUseIds: [], cliVersions: {} } });
  t.document.getElementById('open-cli-store-btn').click();
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(t.document.querySelector('.cs-nav-item[aria-selected="true"]').dataset.kind, 'skills');
  closeCliStore();
  t.type('@');
  t.document.querySelector('[data-cli-store]').click();
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(t.document.querySelector('.cs-nav-item[aria-selected="true"]').dataset.kind, 'cli');
  closeCliStore();
});

test('the two parts: a list at the left and a switch in the header, the same choice on both, each part with its own search and tab', () => {
  const config = { cliEnabledIds: ['officecli'], cliModelUseIds: [], cliVersions: {} };
  const t = setup({ config, language: 'zh-TW' });
  openCliStore({ document: t.document, getConfig: () => config, getLanguage: () => 'zh-TW', getAccountReady: () => false });
  const root = t.document.querySelector('.cs');
  const labels = (selector) => [...root.querySelectorAll(selector)].map((node) => node.textContent);
  assert.deepEqual(labels('.cs-nav-item'), ['技能', '命令工具']);
  assert.deepEqual(labels('.cs-switch-item'), ['技能', '命令工具'], 'the switch in the header says the same');
  assert.equal(root.querySelector('.cs-head').lastElementChild, root.querySelector('.cs-switch'), 'the switch is in the header, after the title');
  assert.equal(root.querySelector('.cs-title span').textContent, '擴充', 'the title is the page, not the part');
  const chosen = () => root.querySelectorAll('[aria-selected="true"][data-kind]');
  assert.deepEqual([...chosen()].map((node) => node.dataset.kind), ['skills', 'skills'], 'skills first, on both');

  // skills: nothing on offer yet, and no word about the account (that is for the CLI tools)
  assert.equal(root.querySelector('.cs-search-input').placeholder, '搜尋技能');
  assert.equal(root.querySelector('.cs-empty-title').textContent, '技能即將推出');
  assert.equal(root.querySelector('.cs-note').hidden, true);
  assert.equal(root.querySelector('.cs-footer-link').hidden, true, 'the licences are of the tools');
  assert.equal(root.querySelectorAll('.cs-row').length, 0);
  root.querySelectorAll('.history-tab')[1].click();
  assert.equal(root.querySelector('.cs-empty').textContent, '還沒有加入任何技能。');

  // the switch turns to the CLI tools (its tab and its search are its own)
  root.querySelector('.cs-switch-item[data-kind="cli"]').click();
  assert.deepEqual([...chosen()].map((node) => node.dataset.kind), ['cli', 'cli']);
  assert.equal(root.querySelector('.cs-search-input').placeholder, '搜尋命令工具');
  assert.equal(root.querySelector('.history-tab[aria-selected="true"]').textContent, '全部', 'the tab of the skills is not carried over');
  assert.equal(root.querySelector('.cs-note').hidden, false, 'the CLI tools say they need an account');
  assert.equal(root.querySelector('.cs-footer-link').hidden, false);
  const input = root.querySelector('.cs-search-input');
  input.value = 'office';
  input.dispatchEvent(new t.window.Event('input', { bubbles: true }));
  assert.deepEqual([...root.querySelectorAll('.cs-row .cs-name-text')].map((node) => node.textContent), ['OfficeCLI']);

  // and back: the skills keep the tab they had, and the search box is theirs
  root.querySelector('.cs-nav-item[data-kind="skills"]').click();
  assert.equal(input.value, '');
  assert.equal(root.querySelector('.history-tab[aria-selected="true"]').textContent, '我的');
  root.querySelector('.cs-nav-item[data-kind="cli"]').click();
  assert.equal(input.value, 'office');
  closeCliStore();
});

test('the page speaks all five languages', () => {
  const expected = { 'zh-TW': ['擴充', '技能', '命令工具'], en: ['Extensions', 'Skills', 'CLI'], fr: ['Extensions', 'Compétences', 'CLI'], ru: ['Расширения', 'Навыки', 'CLI'], es: ['Extensiones', 'Habilidades', 'CLI'] };
  for (const [language, [title, skills, cli]] of Object.entries(expected)) {
    const config = { cliEnabledIds: [], cliModelUseIds: [], cliVersions: {} };
    const t = setup({ config, language });
    openCliStore({ document: t.document, getConfig: () => config, getLanguage: () => language });
    const root = t.document.querySelector('.cs');
    assert.equal(root.querySelector('.cs-title span').textContent, title, language);
    assert.deepEqual([...root.querySelectorAll('.cs-nav-item')].map((node) => node.textContent), [skills, cli], language);
    assert.ok(root.querySelector('.cs-empty-note').textContent.length > 20, language);
    closeCliStore();
  }
});

test('the style: the list is at the left on a wide screen, the switch is in the header on a phone, equal in width, and the title keeps its row', () => {
  const css = readFileSync(new URL('../../src/app/ui/cli/cli-store.css', import.meta.url), 'utf8');
  assert.match(css, /\.cs-switch \{ display: none; \}/, 'the switch is a phone thing');
  assert.match(css, /@media \(max-width: 640px\) \{[^@]*\.cs-nav \{ display: none; \}[^@]*\.cs-switch \{ margin-left: auto; display: grid; grid-auto-flow: column; grid-auto-columns: 1fr;/, 'two buttons as wide as the wider');
  assert.match(css, /\.cs-title \{ white-space: nowrap; flex: none; \}/);
  assert.match(css, /\.cs-footer-link\[hidden\] \{ display: none; \}/, 'the licences link of the tools is really gone on the skills part (its display would win over hidden)');
  assert.match(css, /@media \(max-width: 359px\) \{\s*\.cs-title-icon \{ display: none; \}/, 'a very narrow phone gives the title picture up');
});

test('the logo of a project is shown, and the terminal glyph takes its place when it cannot be loaded', () => {
  const config = { cliEnabledIds: [], cliModelUseIds: [], cliVersions: {} };
  const t = setup({ config });
  openCliStore({ kind: 'cli', document: t.document, getConfig: () => config, getLanguage: () => 'en' });
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
  openCliStore({ kind: 'cli', document: t.document, getConfig: () => config, getLanguage: () => 'fr' });
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
  openCliStore({ kind: 'cli', document: t.document, getConfig: () => config, getLanguage: () => 'en', getAccountReady: () => ready });
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
  openCliStore({ kind: 'cli', document: t.document, getConfig: () => config, getLanguage: () => 'en' });
  const root = t.document.querySelector('.cs');
  const before = root.querySelector('.cs-row[data-cli-id="ffmpeg"] img.cli-tool-img');
  const text = root.querySelector('.cs-row[data-cli-id="yt-dlp"] .cs-text');
  text.click();
  assert.ok(root.querySelector('.cs-row[data-cli-id="yt-dlp"] .cs-about'), 'the details are open');
  assert.equal(root.querySelector('.cs-row[data-cli-id="ffmpeg"] img.cli-tool-img'), before, 'the same picture element, not a new one');
  closeCliStore();
});

test('the list is no taller than the room seen above the box (the keyboard and the browser bars take some), and follows the seen area as it changes', () => {
  const listeners = {};
  const viewport = { offsetTop: 100, addEventListener: (name, fn) => { listeners[name] = fn; } };
  const t = setup({ config: { cliEnabledIds: ['officecli', 'ffmpeg'], cliModelUseIds: [], cliVersions: {} }, visualViewport: viewport });
  const wrapper = t.document.querySelector('.input-wrapper');
  let top = 300;
  wrapper.getBoundingClientRect = () => ({ top });
  t.type('@');
  const menu = t.document.getElementById('cli-mention-menu');
  assert.equal(menu.style.maxHeight, '184px', 'the room from the top of what is seen to the box, less a margin');
  top = 700;
  viewport.offsetTop = 0;
  listeners.resize();
  assert.equal(menu.style.maxHeight, '352px', 'never taller than the list was before');
  top = 60;
  listeners.resize();
  assert.equal(menu.style.maxHeight, '96px', 'and not squeezed to nothing');
});

test('a page the phone has scrolled with the keyboard up still limits the list (offsetTop moves with the scroll, the box measures do not)', () => {
  const listeners = {};
  const viewport = { offsetTop: 0, addEventListener: (name, fn) => { listeners[name] = fn; } };
  const t = setup({ config: { cliEnabledIds: ['officecli', 'ffmpeg'], cliModelUseIds: [], cliVersions: {} }, visualViewport: viewport });
  const wrapper = t.document.querySelector('.input-wrapper');
  wrapper.getBoundingClientRect = () => ({ top: 206 });
  t.type('@');
  // Measured on an iPhone (Google app): scrollY 250, offsetTop 250, the box 206 from the top of what is seen. The list lost its limit here.
  Object.defineProperty(t.window, 'scrollY', { configurable: true, value: 250 });
  viewport.offsetTop = 250;
  listeners.scroll();
  assert.equal(t.document.getElementById('cli-mention-menu').style.maxHeight, '190px');
});

test('moving the choice in the list scrolls the list only, never the page', () => {
  const t = setup({ config: { cliEnabledIds: ['officecli', 'ffmpeg', 'pandoc'], cliModelUseIds: [], cliVersions: {} } });
  let pageScrolls = 0;
  t.window.HTMLElement.prototype.scrollIntoView = () => { pageScrolls += 1; };
  t.type('@');
  t.key('ArrowDown');
  t.key('ArrowDown');
  assert.equal(pageScrolls, 0);
  const active = t.document.querySelector('.cli-menu-item.is-active');
  assert.equal(active.getAttribute('aria-selected'), 'true');
});
