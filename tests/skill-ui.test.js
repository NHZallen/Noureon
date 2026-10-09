import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test, { afterEach } from 'node:test';

import { Window } from 'happy-dom';

import { OFFICIAL_SKILL_CATALOG } from '../src/data/skill-catalog.js';
import { createSkillStore } from '../src/app/runtime/skill/skill-store.js';
import { closeCliStore, openCliStore } from '../src/app/ui/cli/cli-store.js';
import { openSkillPasteModal } from '../src/app/ui/skill/skill-paste-modal.js';

afterEach(() => closeCliStore());

const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

// The cloud table behind the store, in memory.
function memoryClient(rows = []) {
  const table = { rows };
  table.from = () => {
    const state = { op: 'select', filters: {}, payload: null };
    const chain = {
      select: () => chain,
      insert: (payload) => { state.op = 'insert'; state.payload = payload; return chain; },
      update: (payload) => { state.op = 'update'; state.payload = payload; return chain; },
      delete: () => { state.op = 'delete'; return chain; },
      eq: (key, value) => { state.filters[key] = value; return chain; },
      order: () => chain,
      limit: () => chain,
      then: (resolve, reject) => {
        if (state.op === 'insert') table.rows.push({ ...state.payload });
        if (state.op === 'update') table.rows = table.rows.map((row) => (row.name === state.filters.name ? { ...row, ...state.payload } : row));
        if (state.op === 'delete') table.rows = table.rows.filter((row) => row.name !== state.filters.name);
        const data = state.op === 'select' ? table.rows.filter((row) => row.user_id === state.filters.user_id) : null;
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      }
    };
    return chain;
  };
  return table;
}

const skillText = (name, description = 'Does a thing. Use it for things.', body = 'Step one.\nStep two.') => `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`;

function page({ language = 'en', rows = [], config = {}, accountReady = true } = {}) {
  const window = new Window({ url: 'https://example.test/' });
  const { document } = window;
  document.body.innerHTML = '<main id="app"></main>';
  const settings = { cliEnabledIds: [], cliModelUseIds: [], cliVersions: {}, skillEnabledIds: [], skillModelUseIds: [], skillStamps: {}, skillUseStamps: {}, ...config };
  const log = { saved: 0, notices: [] };
  const cloud = memoryClient(rows);
  const skillStore = createSkillStore({ getClient: () => cloud, getUserId: () => (accountReady ? 'u1' : '') });
  const state = { ready: accountReady };
  openCliStore({
    document,
    kind: 'skills',
    getConfig: () => settings,
    saveConfig: async () => { log.saved += 1; },
    getLanguage: () => language,
    showNotification: (text, kind) => log.notices.push([text, kind]),
    getAccountReady: () => state.ready,
    skillStore
  });
  const root = document.querySelector('.cs');
  const names = () => [...root.querySelectorAll('.cs-skill .cs-name-text')].map((node) => node.textContent);
  return { window, document, root, settings, log, cloud, skillStore, names, state };
}
const row = (name, description = 'd', body = 'b') => ({ user_id: 'u1', name, description, body });

test('the skills part lists the skills the person pasted before (read from the cloud), in "mine"; the ones missing from the list are put on it', async () => {
  const t = page({ rows: [row('write-up', 'Polishes writing.', 'Keep the meaning.'), row('notes', 'Meeting notes.')], config: { skillEnabledIds: ['write-up'] } });
  await tick(50);
  assert.deepEqual(t.names(), ['notes', 'write-up'].filter((name) => t.settings.skillEnabledIds.includes(name)).length ? t.names() : [], 'shown');
  assert.deepEqual(t.settings.skillEnabledIds.sort(), ['notes', 'write-up'], 'a skill in the cloud and not on the list is put on it');
  assert.deepEqual(t.names().sort(), ['notes', 'write-up']);
  assert.equal(t.root.querySelector('.cs-section-title').textContent, 'My skills');
  assert.equal(t.root.querySelector('.cs-empty-soon') === null, true, 'not the "coming soon" page any more');
  assert.equal(t.root.querySelectorAll('.cs-badge').length, 0, 'their own, so no "Official" badge');
  assert.ok(t.root.querySelector('.cs-skill .cs-added'), 'added');
  t.root.querySelectorAll('.history-tab')[1].click();
  assert.deepEqual(t.names().sort(), ['notes', 'write-up'], 'and in the "Mine" tab');
  closeCliStore();
});

test('the details show the whole text the model is given, then the menu lets the model use it or not, and removing deletes it from the cloud', async () => {
  const t = page({ rows: [row('write-up', 'Polishes writing.', 'Keep the meaning.\nNo more than asked.')], config: { skillEnabledIds: ['write-up'], skillModelUseIds: ['write-up'] } });
  await tick(50);
  t.root.querySelector('.cs-skill .cs-text').click();
  assert.equal(t.root.querySelector('.cs-skill-text').textContent, 'Keep the meaning.\nNo more than asked.');
  assert.match(t.root.querySelector('.cs-about').textContent, /Polishes writing\./);
  const details = [...t.root.querySelectorAll('.cs-details dd')].map((node) => node.textContent);
  assert.deepEqual(details, ['Added by you', '37 characters']);

  t.root.querySelector('.cs-skill .cs-icon-button').click();
  const items = [...t.root.querySelectorAll('.cs-menu-item')];
  assert.deepEqual(items.map((item) => item.querySelector('.cs-menu-label').textContent), ['Hide details', 'Let the model use it by itself', 'Remove']);
  assert.equal(items[1].getAttribute('aria-checked'), 'true');
  items[1].click();
  assert.deepEqual(t.settings.skillModelUseIds, [], 'off');
  assert.ok(t.settings.skillUseStamps['write-up'] > 0);
  t.root.querySelector('.cs-skill .cs-icon-button').click();
  assert.equal([...t.root.querySelectorAll('.cs-menu-item')][1].getAttribute('aria-checked'), 'false');
  [...t.root.querySelectorAll('.cs-menu-item')][2].click();
  await tick(50);
  assert.equal(t.cloud.rows.length, 0, 'deleted from the cloud');
  assert.deepEqual(t.settings.skillEnabledIds, []);
  assert.ok(t.settings.skillStamps['write-up'] > 0, 'the removal is stamped, so other devices follow');
  assert.equal(t.root.querySelectorAll('.cs-skill').length, 0);
  assert.match(t.log.notices.at(-1)[0], /removed/);
  closeCliStore();
});

test('a skill whose removal from the cloud fails stays', async () => {
  const t = page({ rows: [row('stays')], config: { skillEnabledIds: ['stays'] } });
  await tick(50);
  t.cloud.from = () => {
    const chain = { delete: () => chain, eq: () => chain, then: (resolve) => Promise.resolve({ data: null, error: { message: 'network' } }).then(resolve) };
    return chain;
  };
  t.root.querySelector('.cs-skill .cs-icon-button').click();
  [...t.root.querySelectorAll('.cs-menu-item')][2].click();
  await tick(50);
  assert.deepEqual(t.settings.skillEnabledIds, ['stays']);
  assert.equal(t.log.notices.at(-1)[1], 'error');
  assert.match(t.log.notices.at(-1)[0], /Saving failed/);
  closeCliStore();
});

test('an official skill is added with the "+" (the model may use it by itself from the start), and is a row of "mine" after', async () => {
  OFFICIAL_SKILL_CATALOG.push({ name: 'official-one', description: 'English description.', body: 'Official text.', version: '1.0', author: 'Noureon', i18n: { 'zh-TW': { title: '官方一號', description: '中文描述' } } });
  try {
    const t = page({ language: 'zh-TW' });
    await tick(30);
    assert.deepEqual(t.names(), ['官方一號']);
    assert.equal(t.root.querySelector('.cs-skill .cs-badge').textContent, '官方');
    assert.equal(t.root.querySelector('.cs-skill .cs-desc').textContent, '中文描述');
    assert.equal(t.root.querySelector('.cs-skill .cs-add') !== null, true);
    t.root.querySelector('.cs-skill .cs-add').click();
    await tick(30);
    assert.deepEqual(t.settings.skillEnabledIds, ['official-one']);
    assert.deepEqual(t.settings.skillModelUseIds, ['official-one']);
    assert.equal(t.log.saved, 1);
    assert.match(t.log.notices.at(-1)[0], /已加入技能「官方一號」/);
    assert.equal(t.root.querySelector('.cs-skill .cs-add') === null, true);
    assert.equal(t.root.querySelector('.cs-section-title').textContent, '我的技能');
    t.root.querySelector('.cs-skill .cs-text').click();
    assert.equal(t.root.querySelector('.cs-skill-text').textContent, 'Official text.');
    assert.ok([...t.root.querySelectorAll('.cs-details dt')].some((node) => node.textContent === '版本'));
    closeCliStore();
  } finally {
    OFFICIAL_SKILL_CATALOG.length = 0;
  }
});

test('search narrows the skills, and says so when nothing matches', async () => {
  const t = page({ rows: [row('write-up', 'Polishes writing.'), row('notes', 'Meeting notes.')], config: { skillEnabledIds: ['write-up', 'notes'] } });
  await tick(50);
  const input = t.root.querySelector('.cs-search-input');
  input.value = 'meeting';
  input.dispatchEvent(new t.window.Event('input', { bubbles: true }));
  assert.deepEqual(t.names(), ['notes']);
  input.value = 'zzz';
  input.dispatchEvent(new t.window.Event('input', { bubbles: true }));
  assert.equal(t.root.querySelector('.cs-empty').textContent, 'No skills match your search.');
  assert.equal(t.root.querySelectorAll('.cs-skill').length, 0);
  closeCliStore();
});

test('pasting a skill: the check as it is typed, the warning, and adding it only when it is good', async () => {
  const t = page();
  await tick(30);
  assert.equal(t.root.querySelector('.cs-paste').hidden, false, 'the button is on the skills part');
  t.root.querySelector('.cs-paste').click();
  await tick(50);
  const modal = t.document.querySelector('.skill-paste');
  assert.ok(modal, 'the window');
  const area = modal.querySelector('.skill-paste-text');
  const add = modal.querySelector('button[type="submit"]');
  assert.equal(add.disabled, true, 'nothing yet');
  assert.match(modal.querySelector('.skill-paste-warning').textContent, /Only add what you trust/);
  const type = (value) => { area.value = value; area.dispatchEvent(new t.window.Event('input', { bubbles: true })); };

  type('hello');
  assert.match(modal.querySelector('.skill-paste-error').textContent, /must start with a header/);
  assert.equal(add.disabled, true);
  type(skillText('Bad Name'));
  assert.match(modal.querySelector('.skill-paste-error').textContent, /lower-case letters/);

  type(skillText('meeting-notes', 'Turns a transcript into decisions.'));
  assert.equal(modal.querySelector('.skill-paste-error'), null);
  assert.deepEqual([...modal.querySelectorAll('.skill-paste-found dd')].map((node) => node.textContent), ['meeting-notes', 'Turns a transcript into decisions.', '19 characters of text']);
  assert.equal(add.disabled, false);

  modal.querySelector('form').dispatchEvent(new t.window.Event('submit', { bubbles: true, cancelable: true }));
  await tick(80);
  assert.equal(t.document.querySelector('.skill-paste') === null, true, 'closed');
  assert.equal(t.cloud.rows.length, 1);
  assert.deepEqual(t.settings.skillEnabledIds, ['meeting-notes']);
  assert.deepEqual(t.settings.skillModelUseIds, ['meeting-notes']);
  assert.deepEqual(t.names(), ['meeting-notes']);
  assert.match(t.log.notices.at(-1)[0], /Skill “meeting-notes” added/);
  closeCliStore();
});

test('pasting a name the person has offers "Replace"; escape and "Cancel" close the window without adding', async () => {
  const t = page({ rows: [row('notes', 'Old.', 'Old text.')], config: { skillEnabledIds: ['notes'] } });
  await tick(50);
  t.root.querySelector('.cs-paste').click();
  await tick(50);
  const modal = t.document.querySelector('.skill-paste');
  const area = modal.querySelector('.skill-paste-text');
  const add = modal.querySelector('button[type="submit"]');
  area.value = skillText('notes', 'New description.', 'New text.');
  area.dispatchEvent(new t.window.Event('input', { bubbles: true }));
  assert.equal(add.textContent, 'Replace');
  modal.querySelector('form').dispatchEvent(new t.window.Event('submit', { bubbles: true, cancelable: true }));
  await tick(80);
  assert.equal(t.document.querySelector('.skill-paste') === null, true);
  assert.equal(t.cloud.rows[0].body, 'New text.');
  assert.equal(t.cloud.rows.length, 1);
  t.root.querySelector('.cs-skill .cs-text').click();
  assert.equal(t.root.querySelector('.cs-skill-text').textContent, 'New text.');

  t.root.querySelector('.cs-paste').click();
  await tick(50);
  t.document.dispatchEvent(new t.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.equal(t.document.querySelector('.skill-paste') === null, true, 'escape');
  t.root.querySelector('.cs-paste').click();
  await tick(50);
  t.document.querySelector('.skill-paste button[type="button"]').click();
  assert.equal(t.document.querySelector('.skill-paste') === null, true, 'cancel');
  assert.equal(t.cloud.rows.length, 1);
  closeCliStore();
});

test('without a cloud account, pasting says so and opens nothing', async () => {
  const t = page({ accountReady: false });
  await tick(30);
  t.root.querySelector('.cs-paste').click();
  await tick(30);
  assert.equal(t.document.querySelector('.skill-paste') === null, true);
  assert.equal(t.log.notices.at(-1)[1], 'error');
  assert.match(t.log.notices.at(-1)[0], /needs a cloud account/);
  closeCliStore();
});

test('the paste window alone: a refusal from the cloud stays on the window with its reason, and the box is the whole text of the skill', async () => {
  const window = new Window({ url: 'https://example.test/' });
  const { document } = window;
  document.body.innerHTML = '';
  let answer = { ok: false, error: 'too_many' };
  openSkillPasteModal({ document, language: 'fr', onSubmit: async () => answer });
  const modal = document.querySelector('.skill-paste');
  const area = modal.querySelector('.skill-paste-text');
  area.value = skillText('fr-one');
  area.dispatchEvent(new window.Event('input', { bubbles: true }));
  modal.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await tick(30);
  assert.ok(document.querySelector('.skill-paste'), 'still open');
  assert.match(modal.querySelector('.skill-paste-error').textContent, /50 compétences au plus/);
  assert.equal(modal.querySelector('button[type="submit"]').disabled, false, 'can be tried again');
  answer = { ok: true };
  modal.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await tick(30);
  assert.equal(document.querySelector('.skill-paste') === null, true);
});

test('the CLI part has no paste button, and the style of the skills is in black and white from the tokens', async () => {
  const t = page();
  t.root.querySelector('.cs-nav-item[data-kind="cli"]').click();
  assert.equal(t.root.querySelector('.cs-paste').hidden, true);
  closeCliStore();
  const css = readFileSync(new URL('../src/app/ui/cli/cli-store.css', import.meta.url), 'utf8') + readFileSync(new URL('../src/styles/permissions.css', import.meta.url), 'utf8');
  assert.match(css, /\.cs-paste\[hidden\] \{ display: none; \}/);
  assert.match(css, /\.cs-skill-text \{[^}]*var\(--border-color\)/);
  assert.match(css, /\.skill-paste-text \{[^}]*var\(--border-color\)/);
});
