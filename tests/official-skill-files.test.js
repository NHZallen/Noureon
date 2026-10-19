import assert from 'node:assert/strict';
import { existsSync, readdirSync, statSync } from 'node:fs';
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

// No official skill comes with files now, so these tests use one made up for them (put in the catalog while a test runs).
const SCRIPT = '"""sample: a script of a skill"""\nprint(1)\n';
const SAMPLE = {
  name: 'sample-scripts',
  description: 'A made-up skill with a script.',
  version: '1',
  author: 'Noureon',
  body: '# Sample\n\nRun scripts/run.py.',
  files: [{ path: 'scripts/run.py', size: Buffer.byteLength(SCRIPT), kind: 'script' }]
};
const withSample = async (run) => {
  OFFICIAL_SKILL_CATALOG.push(SAMPLE);
  try {
    return await run();
  } finally {
    OFFICIAL_SKILL_CATALOG.pop();
  }
};

test('the files an official skill lists are the files of its folder, with their real sizes, and nothing else is in the folder', () => {
  const withFiles = OFFICIAL_SKILL_CATALOG.filter((skill) => Array.isArray(skill.files) && skill.files.length);
  const folders = existsSync(ROOT) ? readdirSync(ROOT).filter((name) => name !== '__pycache__').sort() : [];
  assert.deepEqual(folders, withFiles.map((skill) => skill.name).sort(), 'a folder for each skill with files, and no other');
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

test('the server reads an official skill\'s files from the app itself, for anyone, and only the listed ones', () => withSample(async () => {
  const read = async () => Buffer.from(SCRIPT);
  const files = await readOfficialSkillFiles('sample-scripts', { read });
  assert.equal(files.length, 1);
  assert.equal(files[0].path, 'scripts/run.py');
  assert.equal(files[0].kind, 'script');
  assert.match(Buffer.from(files[0].bytes).toString('utf8'), /^"""sample:/);
  assert.equal(await readOfficialSkillFiles('summarize', { read }), null, 'a skill without files has none');
  assert.equal(await readOfficialSkillFiles('no-such-skill', { read }), null);

  // An entry whose path leaves its folder is not read at all.
  const asked = [];
  OFFICIAL_SKILL_CATALOG.push({ name: 'bad-paths', description: 'x', version: '1', author: 'Noureon', files: [{ path: '../skill-catalog.js', size: 1, kind: 'text' }] });
  try {
    assert.equal(await readOfficialSkillFiles('bad-paths', { read: async (url) => { asked.push(String(url)); return Buffer.from('x'); } }), null);
    assert.deepEqual(asked, []);
  } finally {
    OFFICIAL_SKILL_CATALOG.pop();
  }

  const skills = createServerSkills({ db: { select: async () => [] }, officialFiles: (name) => readOfficialSkillFiles(name, { read }) });
  const body = await skills.body(null, 'sample-scripts');
  assert.deepEqual(body.files, [{ path: 'scripts/run.py', size: getOfficialSkill('sample-scripts').files[0].size, kind: 'script' }], 'the model is told the skill has a script');
  assert.equal((await skills.files(null, 'sample-scripts'))[0].path, 'scripts/run.py', 'the sandbox gets it without a person\'s zip');
  const readFile = await skills.readFile(null, 'sample-scripts', 'scripts/run.py');
  assert.equal(readFile.ok, true);
  assert.match(readFile.text, /^"""sample:/);
  assert.deepEqual(await skills.readFile(null, 'sample-scripts', 'scripts/other.py'), { ok: false, reason: 'not_found' });
  assert.equal(await skills.files(null, 'someone-elses'), null, 'a person\'s skill still needs the person');
}));

test('the page gets an official skill\'s files from the build, as text', () => withSample(async () => {
  const table = { '../../../data/official-skills/sample-scripts/scripts/run.py': async () => SCRIPT };
  const files = await loadOfficialSkillFiles('sample-scripts', { table });
  assert.equal(files[0].size, getOfficialSkill('sample-scripts').files[0].size, 'the same bytes as the file');
  assert.equal(await loadOfficialSkillFiles('sample-scripts', { table: {} }), null, 'a file missing from the build gives nothing, not part of the skill');
  assert.equal(await loadOfficialSkillFiles('sample-scripts'), null, 'Node has no build table');
  assert.equal(await loadOfficialSkillFiles('summarize', { table }), null);
}));
