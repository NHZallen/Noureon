import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';

import { Window } from 'happy-dom';

import { OFFICIAL_SKILL_CATALOG } from '../src/data/skill-catalog.js';
import { skillIndicatorId } from '../src/data/skill-prompt.js';
import { createSkillMode } from '../src/app/runtime/skill/skill-mode.js';
import { clearSkillSelection, getSkillSelection, resolveInvokedSkills } from '../src/app/runtime/skill/skill-bridge.js';
import { createSkillStore } from '../src/app/runtime/skill/skill-store.js';

const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

function page({ language = 'en', config = {}, rows = [], opened = [] } = {}) {
  const window = new Window({ url: 'https://example.test/' });
  const { document } = window;
  document.body.innerHTML = '<div class="composer-host"><div class="input-wrapper"><div id="editor" contenteditable="true"></div></div></div>';
  const editor = document.getElementById('editor');
  const settings = { skillEnabledIds: [], skillModelUseIds: [], skillStamps: {}, skillUseStamps: {}, ...config };
  const log = { refreshed: 0 };
  const cloud = {
    from: () => {
      const chain = { select: () => chain, eq: () => chain, order: () => chain, limit: () => chain, then: (resolve) => Promise.resolve({ data: rows.map((row) => ({ user_id: 'u1', ...row })), error: null }).then(resolve) };
      return chain;
    }
  };
  const skillStore = createSkillStore({ getClient: () => cloud, getUserId: () => 'u1' });
  const mode = createSkillMode({ document, messageInput: editor, getConfig: () => settings, getUiLanguage: () => language, refresh: () => { log.refreshed += 1; }, skillStore, openStore: (kind) => opened.push(kind) });
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
  const menu = () => document.getElementById('skill-slash-menu');
  const names = () => [...(menu()?.querySelectorAll('[data-skill-name]') || [])].map((node) => node.dataset.skillName);
  return { window, document, editor, mode, settings, log, type, key, menu, names, skillStore, opened };
}
const own = (name, description = 'd', body = `Text of ${name}.`) => ({ name, description, body });

afterEach(() => clearSkillSelection());

test('"/" opens the list of the skills the person has, narrows as it is typed, and Enter puts a chip in and takes the "/" away', async () => {
  const t = page({ rows: [own('meeting-notes'), own('write-up'), own('not-added')], config: { skillEnabledIds: ['meeting-notes', 'write-up'] } });
  await t.skillStore.list();
  t.type('hello /');
  assert.equal(t.menu().hidden, false);
  assert.deepEqual(t.names(), ['meeting-notes', 'write-up'], 'only the ones added');
  assert.equal(t.menu().querySelector('.cli-menu-header').textContent, 'Type to search skills');
  assert.equal(t.menu().querySelector('.cli-menu-kind').textContent, 'Skill');
  t.type('hello /wri');
  assert.deepEqual(t.names(), ['write-up']);
  t.key('Enter');
  assert.equal(t.editor.textContent, 'hello ', 'the "/" and what followed are gone');
  assert.equal(t.menu().hidden, true);
  assert.deepEqual(getSkillSelection(), [{ name: 'write-up', indicatorId: skillIndicatorId('write-up'), label: 'write-up' }]);
  assert.ok(t.log.refreshed >= 1);
  const map = new Map();
  t.mode.indicators(map, (id, label) => `<button id="${id}" aria-label="${label}"></button>`);
  assert.deepEqual([...map.keys()], [skillIndicatorId('write-up')]);
  assert.match(map.get(skillIndicatorId('write-up')).html, /Remove write-up/);
  t.mode.clear();
  assert.deepEqual(getSkillSelection(), []);
});

test('a "/" inside a word or an address, or one with a space after it, opens nothing; "@" is the CLI tools\' and is left alone', async () => {
  const t = page({ rows: [own('a1')], config: { skillEnabledIds: ['a1'] } });
  await t.skillStore.list();
  for (const text of ['https://example.com/a', 'and/or', 'a / b', 'one /two three', '@']) {
    t.type(text);
    assert.equal(!t.menu() || t.menu().hidden, true, text);
  }
  t.type('/');
  assert.equal(t.menu().hidden, false, 'at the very start');
  t.type('see /');
  assert.equal(t.menu().hidden, false, 'after a space');
});

test('the keys: arrows move, Escape closes, Tab chooses; the mouse moves the choice and clicking chooses', async () => {
  const t = page({ rows: [own('aa1'), own('bb2'), own('cc3')], config: { skillEnabledIds: ['aa1', 'bb2', 'cc3'] } });
  await t.skillStore.list();
  t.type('/');
  const active = () => t.menu().querySelector('.is-active')?.dataset.skillName;
  assert.equal(active(), 'aa1');
  t.key('ArrowDown');
  t.key('ArrowDown');
  assert.equal(active(), 'cc3');
  t.key('ArrowDown');
  assert.equal(active(), 'aa1', 'it wraps');
  t.key('ArrowUp');
  assert.equal(active(), 'cc3');
  assert.equal(t.key('Escape').defaultPrevented, true);
  assert.equal(t.menu().hidden, true);
  t.type('/');
  t.key('Tab');
  assert.deepEqual(getSkillSelection().map((entry) => entry.name), ['aa1']);
  t.type('/');
  t.menu().querySelectorAll('[data-skill-name]')[1].dispatchEvent(new t.window.MouseEvent('mousemove', { bubbles: true }));
  assert.equal(active(), 'bb2');
  t.menu().querySelectorAll('[data-skill-name]')[1].click();
  assert.deepEqual(getSkillSelection().map((entry) => entry.name), ['aa1', 'bb2']);
});

test('a skill is chosen once and at most five at a time; one that is removed is not kept chosen', async () => {
  const names = ['s1', 's2', 's3', 's4', 's5', 's6'];
  const t = page({ rows: names.map((name) => own(name)), config: { skillEnabledIds: [...names] } });
  await t.skillStore.list();
  for (const name of [...names, 's1']) {
    t.type(`/${name}`);
    t.key('Enter');
  }
  assert.deepEqual(getSkillSelection().map((entry) => entry.name), ['s1', 's2', 's3', 's4', 's5']);
  t.settings.skillEnabledIds = ['s1', 's2'];
  t.mode.sync();
  assert.deepEqual(getSkillSelection().map((entry) => entry.name), ['s1', 's2']);
});

test('with no skill the list says so and offers the page of skills; with no match it says that', async () => {
  const t = page({ language: 'zh-TW' });
  await t.skillStore.list();
  t.type('/');
  assert.match(t.menu().querySelector('.cli-menu-empty').textContent, /還沒有加入技能/);
  t.menu().querySelector('[data-skill-store]').click();
  assert.deepEqual(t.opened, ['skills']);
  assert.equal(t.menu().hidden, true);

  const u = page({ rows: [own('only-one')], config: { skillEnabledIds: ['only-one'] } });
  await u.skillStore.list();
  u.type('/zzz');
  assert.equal(u.menu().querySelector('.cli-menu-empty').textContent, 'No skill matches.');
  assert.equal(u.menu().querySelector('[data-skill-store]'), null);
});

test('the pasted skills are read from the cloud when the list opens, and an official skill is among them with its title', async () => {
  OFFICIAL_SKILL_CATALOG.push({ name: 'official-one', description: 'D', body: 'Official text.', version: '1', i18n: { 'zh-TW': { title: '官方一號' } } });
  try {
    const t = page({ language: 'zh-TW', rows: [own('mine-1')], config: { skillEnabledIds: ['official-one', 'mine-1'] } });
    t.type('/');
    assert.deepEqual(t.names(), ['official-one'], 'the cloud has not answered yet');
    await tick(40);
    assert.deepEqual(t.names(), ['official-one', 'mine-1'], 'the list is drawn again when it has');
    assert.equal(t.menu().querySelector('.cli-menu-name').textContent, '官方一號');
  } finally {
    OFFICIAL_SKILL_CATALOG.length = 0;
  }
});

test('the text of the skills a message asks for: the ones the person has, in the order asked', async () => {
  const t = page({ rows: [own('a1', 'd', 'A text.'), own('b2', 'd', 'B text.')], config: { skillEnabledIds: ['a1', 'b2'] } });
  assert.deepEqual(await resolveInvokedSkills(['b2', 'gone', 'a1', 'b2']), [{ name: 'b2', body: 'B text.' }, { name: 'a1', body: 'A text.' }]);
  assert.deepEqual(await resolveInvokedSkills([]), []);
  assert.deepEqual(await t.mode.resolve(['a1']), [{ name: 'a1', body: 'A text.' }]);
});

test('the skills the model may load by itself: the ones the person has and allowed, without the ones just given whole; and one skill\'s text by name', async () => {
  const t = page({
    rows: [own('a1', 'Does a.', 'A text.'), own('b2', 'Does b.', 'B text.'), own('c3', 'Does c.', 'C text.')],
    config: { skillEnabledIds: ['a1', 'b2', 'c3'], skillModelUseIds: ['a1', 'b2'] }
  });
  assert.deepEqual(await t.mode.available(), [{ name: 'a1', description: 'Does a.' }, { name: 'b2', description: 'Does b.' }], 'c3 is not allowed for the model');
  assert.deepEqual(await t.mode.available(['a1']), [{ name: 'b2', description: 'Does b.' }]);
  assert.deepEqual(await t.mode.lookup('c3'), { name: 'c3', body: 'C text.' }, 'asked for by name it is still found');
  assert.equal(await t.mode.lookup('nothing'), null);
  const { getAvailableSkills, lookupSkill } = await import('../src/app/runtime/skill/skill-bridge.js');
  assert.deepEqual((await getAvailableSkills()).map((entry) => entry.name), ['a1', 'b2']);
  assert.deepEqual(await lookupSkill('a1'), { name: 'a1', body: 'A text.' });
});
