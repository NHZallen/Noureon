import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_USER_SKILLS,
  SKILL_BODY_MAX,
  SKILL_DESCRIPTION_MAX,
  SKILL_NAME_MAX,
  isSkillName,
  parseSkillMarkdown,
  serializeSkillMarkdown
} from '../src/data/skill-format.js';

const file = (header, body = 'Do the thing.\n\n1. First\n2. Second') => `---\n${header}\n---\n\n${body}\n`;

test('a skill in the public form is read: name, description, text', () => {
  const result = parseSkillMarkdown(file('name: meeting-notes\ndescription: Turns a transcript into decisions and to-dos. Use for meetings.'));
  assert.equal(result.ok, true);
  assert.deepEqual(result.skill, { name: 'meeting-notes', description: 'Turns a transcript into decisions and to-dos. Use for meetings.', body: 'Do the thing.\n\n1. First\n2. Second' });
});

test('the header may use quotes, a folded or literal block, comments, a longer value on indented lines, and other keys (kept only if they are plain)', () => {
  const quoted = parseSkillMarkdown(file('name: "code-review"\ndescription: \'It\'\'s careful: it reads the diff.\'\nlicense: MIT'));
  assert.equal(quoted.skill.name, 'code-review');
  assert.equal(quoted.skill.description, "It's careful: it reads the diff.");
  assert.equal(quoted.skill.license, 'MIT');

  const folded = parseSkillMarkdown(file('name: writing\ndescription: >\n  Polishes writing.\n  Keeps the meaning.\n# a comment\ncompatibility: Needs nothing'));
  assert.equal(folded.skill.description, 'Polishes writing. Keeps the meaning.');
  assert.equal(folded.skill.compatibility, 'Needs nothing');

  const literal = parseSkillMarkdown(file('name: a1\ndescription: |-\n  Line one\n  line two'));
  assert.equal(literal.skill.description, 'Line one line two', 'a description is one line whatever the block style');

  const plainLong = parseSkillMarkdown(file('name: long\ndescription: first part\n  second part'));
  assert.equal(plainLong.skill.description, 'first part second part');

  const withMap = parseSkillMarkdown(file('name: mapped\ndescription: ok\nmetadata:\n  author: someone\n  version: "1"\nallowed-tools: Bash Read'));
  assert.equal(withMap.ok, true);
  assert.deepEqual(Object.keys(withMap.skill).sort(), ['body', 'description', 'name'], 'what is not used is left out');

  assert.equal(parseSkillMarkdown(file('name: commented # not part\ndescription: ok')).skill.name, 'commented');
});

test('Windows line ends, a byte order mark and blank lines before the header are fine', () => {
  const text = '﻿\r\n---\r\nname: x1\r\ndescription: d\r\n---\r\n\r\nBody\r\nmore\r\n';
  const result = parseSkillMarkdown(text);
  assert.equal(result.ok, true);
  assert.equal(result.skill.body, 'Body\nmore');
});

test('what is wrong is named', () => {
  const error = (text) => parseSkillMarkdown(text).error;
  assert.equal(error(''), 'empty');
  assert.equal(error('   \n  '), 'empty');
  assert.equal(error(undefined), 'empty');
  assert.equal(error('just some text'), 'no_header');
  assert.equal(error('---\nname: a1\ndescription: d\nbody without a closing line'), 'header_unclosed');
  assert.equal(error('---\nthis is not a key\n---\nbody'), 'header_invalid');
  assert.equal(error(file('description: d')), 'name_missing');
  assert.equal(error(file('name: Has-Capitals\ndescription: d')), 'name_invalid');
  assert.equal(error(file('name: two--hyphens\ndescription: d')), 'name_invalid');
  assert.equal(error(file('name: -starts\ndescription: d')), 'name_invalid');
  assert.equal(error(file('name: ends-\ndescription: d')), 'name_invalid');
  assert.equal(error(file(`name: ${'a'.repeat(SKILL_NAME_MAX + 1)}\ndescription: d`)), 'name_invalid');
  assert.equal(error(file('name: ok1')), 'description_missing');
  assert.equal(error(file(`name: ok1\ndescription: ${'d'.repeat(SKILL_DESCRIPTION_MAX + 1)}`)), 'description_too_long');
  assert.equal(error(file('name: ok1\ndescription: d', '   \n ')), 'body_empty');
  assert.equal(error(file('name: ok1\ndescription: d', 'x'.repeat(SKILL_BODY_MAX + 1))), 'body_too_long');
  assert.equal(error(`${file('name: ok1\ndescription: d')}${'y'.repeat(70_000)}`), 'text_too_long');
  // The limits themselves are allowed.
  assert.equal(parseSkillMarkdown(file(`name: ${'a'.repeat(SKILL_NAME_MAX)}\ndescription: ${'d'.repeat(SKILL_DESCRIPTION_MAX)}`, 'x'.repeat(SKILL_BODY_MAX))).ok, true);
});

test('names: lower-case words joined by single hyphens, up to 64', () => {
  for (const good of ['a', 'a1', 'write-up', '2024-plan', 'a'.repeat(64)]) assert.equal(isSkillName(good), true, good);
  for (const bad of ['', 'A', 'a_b', 'a b', '-a', 'a-', 'a--b', 'a'.repeat(65), 'é', null, 5, undefined]) assert.equal(isSkillName(bad), false, String(bad));
  assert.equal(MAX_USER_SKILLS, 50);
});

test('a skill written out in the public form is read back the same, whatever is in its description', () => {
  const skill = { name: 'tricky', description: 'Says "hello": a # sign, a colon and a\nnew line', body: 'Text with --- inside\n\n---\nand more' };
  const text = serializeSkillMarkdown(skill);
  assert.match(text, /^---\nname: tricky\ndescription: "Says/);
  const back = parseSkillMarkdown(text);
  assert.equal(back.ok, true);
  assert.equal(back.skill.name, 'tricky');
  assert.equal(back.skill.description, 'Says "hello": a # sign, a colon and a new line');
  assert.equal(back.skill.body, skill.body, 'a line of --- in the text does not end the header');
});
