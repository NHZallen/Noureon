import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';
import { mountSettingsHead, groupOfSection, SETTINGS_GROUPS } from '../src/app/ui/rail/rail-panels.js';
import railTexts from '../src/data/i18n/parts/rail.js';

// The title, the search and the groups above and in the list of the settings' parts (the panel of the settings).

const WORDS = { ...railTexts.en, settings: 'Settings', search: 'Search' };
const sections = [['personalization', 'Personalization'], ['memory', 'Memory'], ['model-management', 'Models'], ['data-management', 'Data'], ['accessibility', 'Accessibility'], ['trash', 'Trash'], ['about', 'About']];

const setup = ({ items = sections } = {}) => {
  const window = new Window({ url: 'https://noureon.test/' });
  const { document } = window;
  document.body.innerHTML = `<div id="settings-modal"><nav class="settings-sidebar"><ul id="settings-nav">${items.map(([id, label]) => `<li class="settings-nav-item" data-section="${id}">${label}</li>`).join('')}</ul></nav></div>`;
  const state = { words: { ...WORDS } };
  const head = mountSettingsHead({ document, text: (key) => state.words[key] ?? key });
  const rows = () => [...document.querySelectorAll('#settings-nav > li')].map((node) => (node.classList.contains('rail-panel-group') ? `# ${node.textContent}` : node.dataset.section));
  return { window, document, head, state, rows, items: () => [...document.querySelectorAll('.settings-nav-item')] };
};

test('without the list of parts there is no head', () => {
  const window = new Window({ url: 'https://noureon.test/' });
  assert.equal(mountSettingsHead({ document: window.document, text: (key) => key }), null);
});

test('the title and the search come before the list, once, in the language', () => {
  const t = setup();
  const nav = t.document.querySelector('nav.settings-sidebar');
  assert.deepEqual([...nav.children].map((node) => node.className), ['rail-panel-head', 'rail-panel-search', '']);
  assert.equal(nav.querySelector('.rail-panel-title').textContent, 'Settings');
  assert.equal(nav.querySelector('input').placeholder, 'Search');
  assert.equal(mountSettingsHead({ document: t.document, text: (key) => key }), null, 'not made twice');
  t.state.words.settings = 'Paramètres';
  t.state.words.railGroupPersonal = 'Personnel';
  t.head.labels();
  assert.equal(nav.querySelector('.rail-panel-title').textContent, 'Paramètres');
  assert.equal(nav.querySelector('.rail-panel-group').textContent, 'Personnel', 'the names of the groups follow the language');
});

test('the parts are in groups, each with its name above it, in the order of the groups', () => {
  const t = setup();
  assert.deepEqual(t.rows(), ['# Personal', 'personalization', 'accessibility', 'memory', '# Models and integrations', 'model-management', '# Data and more', 'data-management', 'trash', 'about']);
  assert.equal(groupOfSection('permissions'), 1);
  assert.equal(groupOfSection('something-new'), 0, 'a part nobody placed goes to the first group');
  assert.equal(SETTINGS_GROUPS.length, 3);
});

test('a part that is added later takes its place in its group, and the list is not moved when it is in order already', async () => {
  const t = setup();
  const list = t.document.getElementById('settings-nav');
  const permissions = t.document.createElement('li');
  permissions.className = 'settings-nav-item';
  permissions.dataset.section = 'permissions';
  permissions.textContent = 'Permissions';
  list.append(permissions);
  const user = t.document.createElement('li');
  user.className = 'settings-nav-item';
  user.dataset.section = 'user';
  user.textContent = 'User';
  list.insertBefore(user, list.firstChild);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(t.rows(), ['# Personal', 'user', 'personalization', 'accessibility', 'memory', '# Models and integrations', 'model-management', 'permissions', '# Data and more', 'data-management', 'trash', 'about']);
  const before = [...list.children];
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual([...list.children], before, 'nothing moves again');
});

test('the search narrows the list to the parts whose name holds the words, and a group with no part left loses its name', () => {
  const t = setup();
  const input = t.document.querySelector('.rail-panel-search-input');
  const type = (value) => { input.value = value; input.dispatchEvent(new t.window.Event('input', { bubbles: true })); };
  const visible = () => [...t.document.querySelectorAll('#settings-nav > li')].filter((node) => !node.hidden).map((node) => node.textContent);
  type('data');
  assert.deepEqual(visible(), ['Data and more', 'Data']);
  type('MEM');
  assert.deepEqual(visible(), ['Personal', 'Memory'], 'not case sensitive');
  type('  ');
  assert.equal(visible().length, 10, 'an empty search brings everything back');
});
