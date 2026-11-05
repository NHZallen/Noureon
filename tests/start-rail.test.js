import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';
import { startRail } from '../src/app/ui/rail/start-rail.js';
import { announceUser, USER_READY_EVENT } from '../src/app/runtime/features/user-ready.js';
import railTexts from '../src/data/i18n/parts/rail.js';

// Starting the rail: it starts at once (it does not wait for the account), takes the words of the language of the page, and a person can turn it off.

const i18n = { 'zh-TW': railTexts['zh-TW'], en: railTexts.en };
const tick = () => new Promise((resolve) => setTimeout(resolve, 30));

function page({ width = 1440, stored = null } = {}) {
  const window = new Window({ url: 'https://noureon.test/', width, height: 900 });
  window.innerWidth = width;
  window.matchMedia = (query) => ({ matches: true, media: query, addEventListener() {}, removeEventListener() {} });
  if (stored) window.localStorage.setItem('noureon.rail', stored);
  window.document.body.innerHTML = '<nav id="desktop-rail"></nav><aside id="sidebar"></aside><button id="menu-toggle-btn"></button>';
  return window;
}

test('it starts at once, without waiting for the account, in the language of the page', async () => {
  const window = page();
  const calls = [];
  const started = startRail({ document: window.document, getLanguage: () => 'en', i18n, toggleSidebar: (show) => calls.push(show) });
  await tick();
  assert.ok(started.rail, 'the rail is there before any account is known');
  assert.equal(window.document.querySelector('.rail-btn').getAttribute('aria-label'), 'Home');
  assert.equal(window.document.documentElement.getAttribute('data-rail-layout'), 'pinned');
  assert.deepEqual(calls, [true], 'docked, the panel is opened');
  started.rail.stop();
});

test('the account that comes later does not make a second rail, and one that was known before is told again once the rail is built (its picture is painted)', async () => {
  announceUser(page().document, { username: 'a' });
  const window = page();
  const told = [];
  window.document.addEventListener(USER_READY_EVENT, (event) => told.push(event.detail.user.username));
  const started = startRail({ document: window.document, getLanguage: () => 'zh-TW', i18n, toggleSidebar() {} });
  await tick();
  assert.ok(started.rail);
  assert.deepEqual(told, ['a'], 'told again when the rail was built');
  const first = started.rail;
  await started.begin();
  window.document.dispatchEvent(new window.CustomEvent(USER_READY_EVENT, { detail: { user: { username: 'a' } } }));
  assert.equal(started.rail, first);
  assert.equal(window.document.querySelectorAll('#desktop-rail .rail-top').length, 1);
  assert.equal(window.document.querySelector('.rail-btn').getAttribute('aria-label'), '首頁');
  first.stop();
  announceUser(window.document, null);
});

test('a person can turn it off', () => {
  const window = page({ stored: 'off' });
  assert.equal(startRail({ document: window.document, getLanguage: () => 'en', i18n, toggleSidebar() {} }), null);
  assert.equal(window.document.querySelector('.rail-btn'), null);
});

test('it starts even when the settings are not read yet (the language cannot be asked): the words are Traditional Chinese until the account is known', async () => {
  const window = page();
  const started = startRail({ document: window.document, getLanguage: () => { throw new TypeError('no settings yet'); }, i18n, toggleSidebar() {} });
  await tick();
  assert.ok(started.rail, 'the rail is there');
  assert.equal(window.document.querySelector('.rail-btn').getAttribute('aria-label'), '首頁');
  started.rail.stop();
});
