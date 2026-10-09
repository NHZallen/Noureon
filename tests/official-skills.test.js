import assert from 'node:assert/strict';
import test from 'node:test';

import { OFFICIAL_SKILL_BODIES } from '../src/data/skill-catalog-bodies.js';
import { OFFICIAL_SKILL_CATALOG, getOfficialSkill, loadOfficialSkillBody, skillDescription, skillTitle, validateSkillEntry } from '../src/data/skill-catalog.js';
import { SKILL_BODY_MAX, SKILL_DESCRIPTION_MAX, parseSkillMarkdown, serializeSkillMarkdown } from '../src/data/skill-format.js';
import { LISTED_DESCRIPTION_CHARS, availableSkillsInstruction, listedSkills } from '../src/data/skill-tool.js';

const LANGUAGES = ['zh-TW', 'en', 'fr', 'ru', 'es'];

test('every official skill follows the rules of a skill, has its text, and is shown the same way in each language', () => {
  assert.ok(OFFICIAL_SKILL_CATALOG.length >= 2);
  assert.deepEqual(Object.keys(OFFICIAL_SKILL_BODIES).sort(), OFFICIAL_SKILL_CATALOG.map((skill) => skill.name).sort(), 'every skill has its text and no text is left over');
  for (const skill of OFFICIAL_SKILL_CATALOG) {
    const body = OFFICIAL_SKILL_BODIES[skill.name];
    assert.deepEqual(validateSkillEntry({ ...skill, body }), [], skill.name);
    assert.ok(body.length <= SKILL_BODY_MAX, `${skill.name} text`);
    assert.doesNotMatch(body, /<\/skill/i, `${skill.name}: the text cannot close the block it is given in`);
    assert.equal(skill.author, 'Noureon', skill.name);
    for (const language of LANGUAGES) {
      assert.ok(skill.i18n?.[language]?.title?.trim(), `${skill.name} ${language} title`);
      assert.ok(skill.i18n?.[language]?.description?.trim(), `${skill.name} ${language} description`);
      assert.equal(skillTitle(skill, language), skill.i18n[language].title);
      assert.equal(skillDescription(skill, language), skill.i18n[language].description);
    }
    // The text reads back as a skill in the public form, so it can be copied out and used elsewhere.
    const file = serializeSkillMarkdown({ name: skill.name, description: skill.description, body });
    const parsed = parseSkillMarkdown(file);
    assert.equal(parsed.ok, true, skill.name);
    assert.equal(parsed.skill.body, body.trimEnd(), skill.name);
  }
});

test('the description a model is shown is shown whole: the list cuts at 300 characters, so an official description is never longer, and says when to use the skill', () => {
  for (const skill of OFFICIAL_SKILL_CATALOG) {
    assert.ok(skill.description.length <= LISTED_DESCRIPTION_CHARS, `${skill.name}: ${skill.description.length} characters`);
    assert.ok(skill.description.length <= SKILL_DESCRIPTION_MAX);
    assert.match(skill.description, /Use (whenever|when)\b/, `${skill.name} says when it applies`);
  }
  const shown = listedSkills(OFFICIAL_SKILL_CATALOG);
  assert.deepEqual(shown.map((skill) => skill.description), OFFICIAL_SKILL_CATALOG.map((skill) => skill.description), 'nothing is cut');
  assert.match(availableSkillsInstruction(OFFICIAL_SKILL_CATALOG), /^- meeting-notes: Turns raw meeting notes/m);
});

test('the text of each official skill is loaded when it is needed', async () => {
  for (const skill of OFFICIAL_SKILL_CATALOG) assert.equal(await loadOfficialSkillBody(skill.name), OFFICIAL_SKILL_BODIES[skill.name]);
});

test('meeting-notes: a record people can act on, from notes of any kind of meeting, without inventing anything', () => {
  const skill = getOfficialSkill('meeting-notes');
  assert.ok(skill);
  const body = OFFICIAL_SKILL_BODIES['meeting-notes'];
  assert.ok(body.length > 3000 && body.length < 7000, `${body.length} characters: long enough to teach, short enough to be followed`);
  // The answers a good record gives, and the order it is written in.
  for (const part of ['## Language', '## Before you write', '## How to read the notes', '## The standard record', '## Other kinds of meeting', '## Example', '## Before you send', '## Follow-up message']) assert.ok(body.includes(part), part);
  assert.match(body, /what was decided, who does what by when, and what is still open/);
  // Honesty: nothing is invented, a missing owner stays visible, a proposal is not a decision.
  assert.match(body, /Never invent a meeting/);
  assert.match(body, /write "Unassigned"/);
  assert.match(body, /not decisions: they are open questions or actions/);
  assert.match(body, /Ask one question only when a missing fact changes the result/);
  assert.match(body, /Reply in the language the user writes in/);
  // The kinds of meeting.
  for (const kind of ['Stand-up', 'Client call', 'Project review', 'Interview or research session', 'Brainstorm']) assert.ok(body.includes(`**${kind}:**`), kind);
  // The example has an action without an owner, written the way the rules say.
  assert.match(body, /\| Tell stakeholders about the new date \| Unassigned \| No date \|/);
  assert.match(body, /Write one only when asked, or offer it in a single closing line/);
});
