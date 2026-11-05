import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';
import { mountSettingsHead } from '../src/app/ui/rail/rail-panels.js';

// The title and the search above the list of the settings' parts (the panel of the settings).

const setup = () => {
  const window = new Window({ url: 'https://noureon.test/' });
  const { document } = window;
  document.body.innerHTML = '<div id="settings-modal"><nav class="settings-sidebar"><ul id="settings-nav"><li class="settings-nav-item" data-section="a">個人化</li><li class="settings-nav-item" data-section="b">Memory</li><li class="settings-nav-item" data-section="c">資料管理</li></ul></nav></div>';
  const words = { settings: '設定', search: '搜尋' };
  const head = mountSettingsHead({ document, text: (key) => words[key] ?? key });
  return { window, document, head, words, items: () => [...document.querySelectorAll('.settings-nav-item')] };
};

test('without the list of parts there is no head', () => {
  const window = new Window({ url: 'https://noureon.test/' });
  assert.equal(mountSettingsHead({ document: window.document, text: (key) => key }), null);
});

test('the title and the search come before the list, once, in the language', () => {
  const t = setup();
  const nav = t.document.querySelector('nav.settings-sidebar');
  assert.deepEqual([...nav.children].map((node) => node.className), ['rail-panel-head', 'rail-panel-search', '']);
  assert.equal(nav.querySelector('.rail-panel-title').textContent, '設定');
  assert.equal(nav.querySelector('input').placeholder, '搜尋');
  assert.equal(mountSettingsHead({ document: t.document, text: (key) => key }), null, 'not made twice');
  assert.equal(nav.querySelectorAll('.rail-panel-head').length, 1);
  t.words.settings = 'Settings';
  t.words.search = 'Search';
  t.head.labels();
  assert.equal(nav.querySelector('.rail-panel-title').textContent, 'Settings');
  assert.equal(nav.querySelector('input').getAttribute('aria-label'), 'Search');
});

test('the search narrows the list to the parts whose name holds the words, and an empty search brings them all back', () => {
  const t = setup();
  const input = t.document.querySelector('.rail-panel-search-input');
  const type = (value) => { input.value = value; input.dispatchEvent(new t.window.Event('input', { bubbles: true })); };
  type('資料');
  assert.deepEqual(t.items().map((item) => item.hidden), [true, true, false]);
  type('MEM');
  assert.deepEqual(t.items().map((item) => item.hidden), [true, false, true], 'not case sensitive');
  type('  ');
  assert.deepEqual(t.items().map((item) => item.hidden), [false, false, false]);
});
