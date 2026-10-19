import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createLocalSkillFolders, importsCode, writeFileCode } from '../src/app/runtime/skill/local-skill-folders.js';

// A script of a made-up skill (no official skill has one now): what it imports is what the page loads with the folder.
const script = Buffer.from('"""sample: a script of a skill"""\nimport pptx\nimport lxml\nimport zipfile\nimport collections\nprint(1)\n');
const FILES = [{ path: 'scripts/sample.py', size: script.byteLength, kind: 'script', bytes: new Uint8Array(script) }];
const hasPython = spawnSync('python3', ['--version']).status === 0;

test('the Python that writes a skill file puts the same bytes in /skills/<name>/, read only, and refuses paths that leave the folder', { skip: !hasPython && 'no python3 here' }, () => {
  const root = mkdtempSync(join(tmpdir(), 'skills-'));
  try {
    const code = writeFileCode('sample-skill', 'scripts/sample.py', FILES[0].bytes).replace('"/skills/', JSON.stringify(`${root}/`).slice(0, -1));
    execFileSync('python3', ['-c', code]);
    execFileSync('python3', ['-c', code], { stdio: 'pipe' });
    const written = join(root, 'sample-skill/scripts/sample.py');
    assert.deepEqual(readFileSync(written), script, 'the same bytes, and writing again over a read-only file works');
    assert.equal(statSync(written).mode & 0o222, 0, 'read only');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  for (const [name, path] of [['sample-skill', '../x.py'], ['sample-skill', '/etc/x'], ['Bad Name', 'x.py'], ['sample-skill', 'a/./b.py']]) {
    assert.throws(() => writeFileCode(name, path, new Uint8Array([1])), /Not a file of a skill/, `${name}/${path}`);
  }
});

test('what the scripts import is loaded with the folder, each on its own', () => {
  const code = importsCode(FILES);
  for (const name of ['pptx', 'lxml', 'zipfile', 'collections']) assert.match(code, new RegExp(`import ${name}\\n`), name);
  assert.equal(importsCode([{ path: 'notes.md', kind: 'text', bytes: new TextEncoder().encode('import os') }]), '', 'only scripts count');
});

test('a reply\'s skills with scripts get their folder: when the sandbox is made, and at once when one is loaded later', async () => {
  const runs = [];
  const sandbox = { mounted: [], async mount(files) { this.mounted.push(files); return { mounted: files.length }; }, async run(code) { runs.push(code); return {}; }, async prepare() {} };
  const skills = {
    'sample-skill': { name: 'sample-skill', body: 'b', files: [{ path: 'scripts/sample.py', kind: 'script', size: 1 }] },
    'plain': { name: 'plain', body: 'p' }
  };
  const folders = createLocalSkillFolders({ lookup: async (name) => skills[name] || null, openFiles: async (name) => (name === 'sample-skill' ? FILES : null) });
  await folders.include([skills['sample-skill']]);
  const attached = folders.attach(sandbox);
  assert.equal(runs.length, 0, 'nothing is written before the sandbox is made');
  assert.deepEqual(await attached.mount([{ name: 'a.pptx' }]), { mounted: 1 }, 'the sandbox\'s own mount is done as before');
  assert.ok(runs[0].includes('/skills/sample-skill/scripts/sample.py'));
  assert.match(runs[1], /import pptx/);
  assert.equal(typeof attached.run, 'function', 'the other methods are the sandbox\'s');

  assert.deepEqual(await folders.lookup('plain'), skills.plain, 'a skill without scripts is as it was');
  const loaded = await folders.lookup('sample-skill');
  assert.equal(loaded.canRun, true);
  assert.equal(runs.length, 2, 'a folder already there is not written twice');

  const broken = createLocalSkillFolders({ lookup: async () => skills['sample-skill'], openFiles: async () => null });
  assert.equal((await broken.lookup('sample-skill')).canRun, false, 'files that cannot be had: the model is told the scripts cannot run');
});
