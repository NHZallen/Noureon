import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';

import { Window } from 'happy-dom';

import { clearSkillSelection, getAvailableSkills, getSkillSelection, lookupSkill, readSkillFile, resolveInvokedSkills } from '../src/app/runtime/skill/skill-bridge.js';
import { createLazySkillMode } from '../src/app/runtime/skill/lazy-skill-mode.js';
import { createSkillStore } from '../src/app/runtime/skill/skill-store.js';
import { OFFICIAL_SKILL_CATALOG } from '../src/data/skill-catalog.js';

// These tests use names of their own (some are the names of official skills, which a person cannot take): the official skills are looked at in official-skills.test.js.
OFFICIAL_SKILL_CATALOG.length = 0;

afterEach(() => clearSkillSelection());

const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

function page({ config = {}, rows = [] } = {}) {
  const window = new Window({ url: 'https://example.test/' });
  const { document } = window;
  document.body.innerHTML = '<div class="composer-host"><div class="input-wrapper"><div id="editor" contenteditable="true"></div></div></div>';
  const editor = document.getElementById('editor');
  const cloud = { from: () => { const chain = { select: () => chain, eq: () => chain, order: () => chain, limit: () => chain, then: (resolve) => Promise.resolve({ data: rows.map((row) => ({ user_id: 'u1', ...row })), error: null }).then(resolve) }; return chain; } };
  const skillStore = createSkillStore({ getClient: () => cloud, getUserId: () => 'u1' });
  const settings = { skillEnabledIds: [], skillModelUseIds: [], skillStamps: {}, skillUseStamps: {}, ...config };
  const mode = createLazySkillMode({ document, messageInput: editor, getConfig: () => settings, getUiLanguage: () => 'en', refresh: () => {}, skillStore });
  const type = (text) => {
    editor.textContent = text;
    const selection = document.getSelection();
    selection.removeAllRanges();
    const range = document.createRange();
    range.setStart(editor.firstChild, text.length);
    range.collapse(true);
    selection.addRange(range);
    editor.dispatchEvent(new window.Event('input', { bubbles: true }));
  };
  return { window, document, editor, settings, mode, type, menu: () => document.getElementById('skill-slash-menu') };
}
const own = (name, description = 'd', body = `Text of ${name}.`) => ({ name, description, body });

test('a person with no skills never loads the composer side: nothing is chosen, nothing is offered, and a name that is asked for is the only thing that loads it', async () => {
  const t = page();
  t.type('hello, no slash here');
  await tick(30);
  assert.equal(t.mode.loaded, false, 'typing without "/" loads nothing');
  assert.deepEqual(getSkillSelection(), []);
  assert.deepEqual(await getAvailableSkills(), []);
  assert.equal(t.mode.loaded, false, 'a reply for a person with no skills loads nothing either');
  assert.equal(t.mode.sync(), undefined);
  assert.equal(t.mode.indicators(new Map(), () => ''), undefined);
  assert.equal(t.mode.closeMenu(), undefined);
  assert.deepEqual(await resolveInvokedSkills([]), []);
  assert.equal(t.mode.loaded, false);
});

test('"/" in the box loads it, and the list shows for what is already typed', async () => {
  const t = page({ rows: [own('meeting-notes'), own('write-up')], config: { skillEnabledIds: ['meeting-notes', 'write-up'], skillModelUseIds: ['meeting-notes'] } });
  t.type('hi /');
  await tick(150);
  assert.equal(t.mode.loaded, true);
  assert.ok(t.menu() && !t.menu().hidden, 'the list is open');
  assert.deepEqual([...t.menu().querySelectorAll('[data-skill-name]')].map((node) => node.dataset.skillName), ['meeting-notes', 'write-up']);
  t.menu().querySelector('[data-skill-name="write-up"]').click();
  await tick(30);
  assert.deepEqual(getSkillSelection().map((chip) => chip.name), ['write-up'], 'once loaded it is the one the bridge holds');
  assert.equal(t.mode.indicators instanceof Function, true);
});

test('a reply for a person who has skills loads it, and gets the skills the model may use, their text and their files', async () => {
  const t = page({ rows: [own('meeting-notes', 'Minutes.', 'List decisions.'), own('write-up')], config: { skillEnabledIds: ['meeting-notes', 'write-up'], skillModelUseIds: ['meeting-notes'] } });
  assert.equal(t.mode.loaded, false);
  assert.deepEqual(await getAvailableSkills(), [{ name: 'meeting-notes', description: 'Minutes.' }]);
  assert.equal(t.mode.loaded, true);
  assert.deepEqual(await lookupSkill('meeting-notes'), { name: 'meeting-notes', body: 'List decisions.' });
  assert.deepEqual((await resolveInvokedSkills(['write-up'])).map((skill) => skill.name), ['write-up']);
  assert.deepEqual(await readSkillFile('meeting-notes', 'a.md'), { ok: false, reason: 'not_found' });
});

test('a name that is asked for loads it even when the settings list nothing (a message that carries a chip, sent again)', async () => {
  const t = page({ rows: [own('meeting-notes')], config: { skillEnabledIds: ['meeting-notes'], skillModelUseIds: [] } });
  assert.equal(t.mode.loaded, false);
  assert.deepEqual((await resolveInvokedSkills(['meeting-notes'])).map((skill) => skill.name), ['meeting-notes']);
  assert.equal(t.mode.loaded, true);
});
