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
  assert.deepEqual([...nav.children].map((node) => node.className), ['rail-panel-head', 'rail-panel-search', '', 'rail-panel-results']);
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

test('the search finds settings: the names of the lines (and the buttons of the data part), the best matches first, each once, with the part; headings and small texts are not listed on their own', async () => {
  const t = setup();
  const page = (id, html) => { const node = t.document.createElement('div'); node.id = `${id}-section`; node.className = 'settings-section'; node.innerHTML = html; t.document.body.append(node); return node; };
  page('personalization', '<div class="pz-head"><h3>Colours</h3></div><div class="pz-row"><label class="pz-label">Interface language</label></div><div class="pz-row"><div class="pz-text"><span class="pz-label">Accent colour</span><p class="pz-sub">Pick the colour of buttons</p></div></div><div class="pz-row"><span class="pz-label">Reply language</span><p class="pz-sub">Replies come in this colour of speech</p></div>');
  page('data-management', '<div class="pz-row"><label class="pz-label">Colour of the export</label></div><button>Export data</button><button>Go</button><button class="pz-label-less">Clear</button>');
  page('accessibility', '<div class="pz-row"><label class="pz-label">Colour of the export</label></div>');
  const input = t.document.querySelector('.rail-panel-search-input');
  const type = (value) => { input.value = value; input.dispatchEvent(new t.window.Event('input', { bubbles: true })); };
  const results = () => [...t.document.querySelectorAll('.rail-panel-result')].map((button) => [button.querySelector('.rail-panel-result-label').textContent, button.querySelector('.rail-panel-result-section').textContent]);
  const list = t.document.getElementById('settings-nav');
  const box = t.document.querySelector('.rail-panel-results');
  assert.equal(box.hidden, true, 'no words: no results, the list of parts is there');
  assert.equal(list.hidden, false);
  type('colour');
  assert.deepEqual(results(), [['Colour of the export', 'Accessibility'], ['Colour of the export', 'Data'], ['Accent colour', 'Personalization'], ['Reply language', 'Personalization']], 'names that begin with the words first (parts in the order of the list), then names that have them, then the one whose small text has them; no heading, no small text of its own');
  assert.equal(list.hidden, true, 'the list of parts gives way to the results');
  type('memory');
  assert.deepEqual(results(), [['Memory', 'Memory']], 'the name of a part is found too');
  type('export');
  assert.deepEqual(results(), [['Export data', 'Data'], ['Colour of the export', 'Accessibility'], ['Colour of the export', 'Data']], 'a button of the data part counts, and the one that begins with the words comes first');
  type('go');
  assert.deepEqual(results(), [], 'a button with a name too short is not a setting');
  assert.equal(t.document.querySelector('.rail-panel-empty').textContent, 'No matching settings');
  type('i');
  assert.ok(results().length <= 10, 'the list is short');
  type('interface');
  let clicked = '';
  t.items().find((item) => item.dataset.section === 'personalization').addEventListener('click', () => { clicked = 'personalization'; });
  const line = t.document.querySelector('#personalization-section .pz-row');
  let scrolled = 0;
  for (const node of t.document.querySelectorAll('#personalization-section .pz-label')) node.scrollIntoView = () => { scrolled += 1; };
  t.document.querySelector('.rail-panel-result').click();
  assert.equal(clicked, 'personalization', 'the part is opened');
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(scrolled, 1, 'the line is brought into view');
  assert.equal(line.classList.contains('rail-flash'), true, 'and shows itself');
  type('  ');
  assert.equal(list.hidden, false, 'an empty search brings the list back');
  assert.equal(box.hidden, true);
});
