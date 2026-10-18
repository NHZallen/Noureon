import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import test from 'node:test';

import { OFFICIAL_SKILL_CATALOG, getOfficialSkill } from '../src/data/skill-catalog.js';
import { loadOfficialSkillFiles } from '../src/app/runtime/skill/official-skill-files.js';
import { readOfficialSkillFiles } from '../server/official-skill-files.js';
import { createServerSkills } from '../server/skills.js';

const ROOT = new URL('../src/data/official-skills/', import.meta.url);
// Python's own cache (from running a script while working on it) is not part of a skill.
const walk = (url, prefix = '') => readdirSync(url).filter((name) => name !== '__pycache__').flatMap((name) => {
  const inner = new URL(`${name}`, url);
  return statSync(inner).isDirectory() ? walk(new URL(`${name}/`, url), `${prefix}${name}/`) : [`${prefix}${name}`];
});

test('the files an official skill lists are the files of its folder, with their real sizes, and nothing else is in the folder', () => {
  const withFiles = OFFICIAL_SKILL_CATALOG.filter((skill) => Array.isArray(skill.files) && skill.files.length);
  assert.ok(withFiles.some((skill) => skill.name === 'deck-style-replica'));
  assert.deepEqual(readdirSync(ROOT).sort(), withFiles.map((skill) => skill.name).sort(), 'a folder for each skill with files, and no other');
  for (const skill of withFiles) {
    const folder = new URL(`${skill.name}/`, ROOT);
    assert.deepEqual(walk(folder).sort(), skill.files.map((file) => file.path).sort(), `${skill.name}: the list is the folder`);
    for (const file of skill.files) {
      assert.equal(file.size, statSync(new URL(file.path, folder)).size, `${skill.name}/${file.path}: the size in skill-catalog.js is the file's (change it with the file)`);
      assert.equal(file.kind, /\.(py|sh)$/.test(file.path) ? 'script' : 'text', `${skill.name}/${file.path}: kind`);
      assert.doesNotMatch(file.path, /(^|\/)\.\.?(\/|$)|^\//, 'a plain path inside the folder');
    }
  }
});

test('the server reads an official skill\'s files from the app itself, for anyone, and only the listed ones', async () => {
  const files = await readOfficialSkillFiles('deck-style-replica');
  assert.equal(files.length, 1);
  assert.equal(files[0].path, 'scripts/deckstyle.py');
  assert.equal(files[0].kind, 'script');
  assert.match(Buffer.from(files[0].bytes).toString('utf8'), /^"""deckstyle:/);
  assert.equal(await readOfficialSkillFiles('summarize'), null, 'a skill without files has none');
  assert.equal(await readOfficialSkillFiles('no-such-skill'), null);

  // An entry whose path leaves its folder is not read at all.
  const asked = [];
  OFFICIAL_SKILL_CATALOG.push({ name: 'bad-paths', description: 'x', version: '1', author: 'Noureon', files: [{ path: '../skill-catalog.js', size: 1, kind: 'text' }] });
  try {
    assert.equal(await readOfficialSkillFiles('bad-paths', { read: async (url) => { asked.push(String(url)); return Buffer.from('x'); } }), null);
    assert.deepEqual(asked, []);
  } finally {
    OFFICIAL_SKILL_CATALOG.pop();
  }

  const skills = createServerSkills({ db: { select: async () => [] } });
  const body = await skills.body(null, 'deck-style-replica');
  assert.deepEqual(body.files, [{ path: 'scripts/deckstyle.py', size: getOfficialSkill('deck-style-replica').files[0].size, kind: 'script' }], 'the model is told the skill has a script');
  assert.equal((await skills.files(null, 'deck-style-replica'))[0].path, 'scripts/deckstyle.py', 'the sandbox gets it without a person\'s zip');
  const read = await skills.readFile(null, 'deck-style-replica', 'scripts/deckstyle.py');
  assert.equal(read.ok, true);
  assert.match(read.text, /^"""deckstyle:/);
  assert.deepEqual(await skills.readFile(null, 'deck-style-replica', 'scripts/other.py'), { ok: false, reason: 'not_found' });
  assert.equal(await skills.files(null, 'someone-elses'), null, 'a person\'s skill still needs the person');
});

test('the page gets an official skill\'s files from the build, as text', async () => {
  const text = readFileSync(new URL('deck-style-replica/scripts/deckstyle.py', ROOT), 'utf8');
  const table = { '../../../data/official-skills/deck-style-replica/scripts/deckstyle.py': async () => text };
  const files = await loadOfficialSkillFiles('deck-style-replica', { table });
  assert.equal(files[0].size, getOfficialSkill('deck-style-replica').files[0].size, 'the same bytes as the file');
  assert.equal(await loadOfficialSkillFiles('deck-style-replica', { table: {} }), null, 'a file missing from the build gives nothing, not part of the skill');
  assert.equal(await loadOfficialSkillFiles('deck-style-replica'), null, 'Node has no build table');
  assert.equal(await loadOfficialSkillFiles('summarize', { table }), null);
});
