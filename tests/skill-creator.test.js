import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';

import { Window } from 'happy-dom';

import { OFFICIAL_SKILL_BODIES } from '../src/data/skill-catalog-bodies.js';
import { OFFICIAL_SKILL_CATALOG, getOfficialSkill, isOfficialSkillName, loadOfficialSkillBody, skillDescription, skillTitle, validateSkillEntry } from '../src/data/skill-catalog.js';
import { SKILL_BODY_MAX, SKILL_DESCRIPTION_MAX, parseSkillMarkdown, serializeSkillMarkdown } from '../src/data/skill-format.js';
import { invokedSkillsInstruction } from '../src/data/skill-prompt.js';
import { createSkillMode } from '../src/app/runtime/skill/skill-mode.js';
import { clearSkillSelection, getAvailableSkills, resolveInvokedSkills } from '../src/app/runtime/skill/skill-bridge.js';
import { createSkillStore } from '../src/app/runtime/skill/skill-store.js';
import { closeCliStore, openCliStore } from '../src/app/ui/cli/cli-store.js';
import { createServerSkills } from '../server/skills.js';

afterEach(() => {
  clearSkillSelection();
  closeCliStore();
});

const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));
const LANGUAGES = ['zh-TW', 'en', 'fr', 'ru', 'es'];

test('skill-creator is an official skill that follows the rules of a skill, with a title and a description in each language', () => {
  const entry = getOfficialSkill('skill-creator');
  assert.ok(entry);
  assert.equal(isOfficialSkillName('skill-creator'), true);
  assert.equal(entry.author, 'Noureon');
  assert.deepEqual(validateSkillEntry({ ...entry, body: OFFICIAL_SKILL_BODIES['skill-creator'] }), []);
  assert.ok(entry.description.length <= SKILL_DESCRIPTION_MAX);
  assert.match(entry.description, /Use whenever the user wants to make a skill/, 'it says when to use it, so a model picks it');
  for (const language of LANGUAGES) {
    assert.ok(entry.i18n[language]?.title, `${language} title`);
    assert.ok(entry.i18n[language]?.description, `${language} description`);
  }
  assert.equal(skillTitle(entry, 'zh-TW'), '製作技能');
  assert.equal(skillTitle(entry, 'es'), 'Crear una habilidad');
  assert.equal(skillDescription(entry, 'xx'), entry.i18n.en.description, 'English for a language it does not have');
  assert.equal(OFFICIAL_SKILL_CATALOG.some((skill) => skill.body), false, 'the text of the skills of the app is not in the list the page carries');
});

test('the text of skill-creator teaches the steps and the block that becomes a card, and reads back as a skill in the public form', () => {
  const body = OFFICIAL_SKILL_BODIES['skill-creator'];
  assert.ok(body.length > 1500 && body.length <= SKILL_BODY_MAX, `${body.length} characters`);
  for (const step of ['## 1. Find out', '## 2. Write a draft', '## 3. Try it', '## 4. Improve it', '## 5. Hand it over']) assert.ok(body.includes(step), step);
  assert.match(body, /fenced block whose language is skill-draft/);
  assert.match(body, /three backticks followed by skill-draft/);
  assert.match(body, /You cannot save a skill yourself/);
  assert.match(body, /ordinary code block \(language markdown\)/, 'a draft in progress does not become a card');
  assert.match(body, /## Skills with files/);
  assert.match(body, /three equals signs, a space, the path/, 'how a draft names its files');
  assert.match(body, /four backticks instead of three/, 'a file with backticks in it does not end the block early');
  assert.match(body, /Python or shell/);
  assert.match(body, /only in the Python sandbox on the server/);
  assert.match(body, /at most 1024 characters/);
  assert.match(body, /at most 64 characters/);
  assert.doesNotMatch(body, /<\/skill/i, 'it cannot close the block it is given in');
  const file = serializeSkillMarkdown({ name: 'skill-creator', description: getOfficialSkill('skill-creator').description, body });
  const parsed = parseSkillMarkdown(file);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.skill.body, body.trimEnd());
});

test('the text is loaded when it is needed: the entry\'s own text first, else the file of texts; nothing for a name that is not official', async () => {
  assert.equal(await loadOfficialSkillBody('skill-creator'), OFFICIAL_SKILL_BODIES['skill-creator']);
  assert.equal(await loadOfficialSkillBody('nobody'), '');
  OFFICIAL_SKILL_CATALOG.push({ name: 'inline-one', description: 'D', body: 'Inline text.', version: '1' });
  try {
    assert.equal(await loadOfficialSkillBody('inline-one'), 'Inline text.');
  } finally {
    OFFICIAL_SKILL_CATALOG.pop();
  }
});

test('the server gives the text of skill-creator without asking the database', async () => {
  const asked = [];
  const skills = createServerSkills({ db: { select: async (table) => { asked.push(table); return []; } } });
  assert.deepEqual(await skills.body('u1', 'skill-creator'), { name: 'skill-creator', body: OFFICIAL_SKILL_BODIES['skill-creator'] });
  assert.deepEqual(asked, []);
  assert.equal(await skills.body('u1', 'not-a-skill'), null);
});

function page({ config = {} } = {}) {
  const window = new Window({ url: 'https://example.test/' });
  const { document } = window;
  document.body.innerHTML = '<main id="app"></main><div class="composer-host"><div class="input-wrapper"><div id="editor" contenteditable="true"></div></div></div>';
  const cloud = { from: () => { const chain = { select: () => chain, eq: () => chain, order: () => chain, limit: () => chain, then: (resolve) => Promise.resolve({ data: [], error: null }).then(resolve) }; return chain; } };
  const skillStore = createSkillStore({ getClient: () => cloud, getUserId: () => 'u1' });
  const settings = { cliEnabledIds: [], cliModelUseIds: [], cliVersions: {}, skillEnabledIds: [], skillModelUseIds: [], skillStamps: {}, skillUseStamps: {}, ...config };
  const mode = createSkillMode({ document, messageInput: document.getElementById('editor'), getConfig: () => settings, getUiLanguage: () => 'en', refresh: () => {}, skillStore });
  return { window, document, settings, mode, skillStore };
}

test('a reply is given the text of skill-creator when it is asked for with "/", and the model may load it by itself once it is added', async () => {
  const t = page({ config: { skillEnabledIds: ['skill-creator'], skillModelUseIds: ['skill-creator'] } });
  const asked = await resolveInvokedSkills(['skill-creator']);
  assert.equal(asked.length, 1);
  assert.equal(asked[0].body, OFFICIAL_SKILL_BODIES['skill-creator'], 'the text was loaded for the reply');
  assert.match(invokedSkillsInstruction(asked), /<skill name="skill-creator">\n# Creating a skill/);
  assert.deepEqual((await getAvailableSkills()).map((skill) => skill.name), ['skill-creator']);
  assert.equal((await t.mode.lookup('skill-creator')).body, OFFICIAL_SKILL_BODIES['skill-creator']);
  const notAdded = page();
  assert.deepEqual(await getAvailableSkills(), [], 'a skill that is not added is not offered');
  assert.deepEqual(await resolveInvokedSkills(['skill-creator']), []);
});

test('the Extensions page lists skill-creator as an official skill in the language of the page; "+" adds it, and its details show the text', async () => {
  for (const [language, title] of [['en', 'Make a skill'], ['zh-TW', '製作技能'], ['fr', 'Créer une compétence']]) {
    closeCliStore();
    const t = page();
    const settings = t.settings;
    openCliStore({ document: t.document, kind: 'skills', getConfig: () => settings, saveConfig: async () => {}, getLanguage: () => language, showNotification: () => {}, getAccountReady: () => true, skillStore: t.skillStore });
    await tick(40);
    const row = t.document.querySelector('.cs-skill[data-skill-name="skill-creator"]');
    assert.ok(row, language);
    assert.equal(row.querySelector('.cs-name-text').textContent, title);
    assert.ok(row.querySelector('.cs-badge'), 'it carries the "Official" badge');
  }
  closeCliStore();
  const t = page();
  const settings = t.settings;
  openCliStore({ document: t.document, kind: 'skills', getConfig: () => settings, saveConfig: async () => {}, getLanguage: () => 'en', showNotification: () => {}, getAccountReady: () => true, skillStore: t.skillStore });
  await tick(40);
  t.document.querySelector('.cs-skill[data-skill-name="skill-creator"] .cs-add').click();
  await tick(40);
  assert.deepEqual(settings.skillEnabledIds, ['skill-creator']);
  assert.deepEqual(settings.skillModelUseIds, ['skill-creator']);
  t.document.querySelector('.cs-skill[data-skill-name="skill-creator"] .cs-text').click();
  await tick(80);
  const text = t.document.querySelector('.cs-skill[data-skill-name="skill-creator"] .cs-skill-text');
  assert.equal(text.textContent, OFFICIAL_SKILL_BODIES['skill-creator'], 'the whole text is there to be read');
  assert.match(t.document.querySelector('.cs-skill[data-skill-name="skill-creator"] .cs-details').textContent, new RegExp(`${OFFICIAL_SKILL_BODIES['skill-creator'].length} characters`));
});
