import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createLocalSkillFolders, importsCode, writeFileCode } from '../src/app/runtime/skill/local-skill-folders.js';

const script = readFileSync(new URL('../src/data/official-skills/deck-style-replica/scripts/deckstyle.py', import.meta.url));
const FILES = [{ path: 'scripts/deckstyle.py', size: script.byteLength, kind: 'script', bytes: new Uint8Array(script) }];
const hasPython = spawnSync('python3', ['--version']).status === 0;

test('the Python that writes a skill file puts the same bytes in /skills/<name>/, read only, and refuses paths that leave the folder', { skip: !hasPython && 'no python3 here' }, () => {
  const root = mkdtempSync(join(tmpdir(), 'skills-'));
  try {
    const code = writeFileCode('deck-style-replica', 'scripts/deckstyle.py', FILES[0].bytes).replace('"/skills/', JSON.stringify(`${root}/`).slice(0, -1));
    execFileSync('python3', ['-c', code]);
    execFileSync('python3', ['-c', code], { stdio: 'pipe' });
    const written = join(root, 'deck-style-replica/scripts/deckstyle.py');
    assert.deepEqual(readFileSync(written), script, 'the same bytes, and writing again over a read-only file works');
    assert.equal(statSync(written).mode & 0o222, 0, 'read only');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  for (const [name, path] of [['deck-style-replica', '../x.py'], ['deck-style-replica', '/etc/x'], ['Bad Name', 'x.py'], ['deck-style-replica', 'a/./b.py']]) {
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
    'deck-style-replica': { name: 'deck-style-replica', body: 'b', files: [{ path: 'scripts/deckstyle.py', kind: 'script', size: 1 }] },
    'plain': { name: 'plain', body: 'p' }
  };
  const folders = createLocalSkillFolders({ lookup: async (name) => skills[name] || null, openFiles: async (name) => (name === 'deck-style-replica' ? FILES : null) });
  await folders.include([skills['deck-style-replica']]);
  const attached = folders.attach(sandbox);
  assert.equal(runs.length, 0, 'nothing is written before the sandbox is made');
  assert.deepEqual(await attached.mount([{ name: 'a.pptx' }]), { mounted: 1 }, 'the sandbox\'s own mount is done as before');
  assert.ok(runs[0].includes('/skills/deck-style-replica/scripts/deckstyle.py'));
  assert.match(runs[1], /import pptx/);
  assert.equal(typeof attached.run, 'function', 'the other methods are the sandbox\'s');

  assert.deepEqual(await folders.lookup('plain'), skills.plain, 'a skill without scripts is as it was');
  const loaded = await folders.lookup('deck-style-replica');
  assert.equal(loaded.canRun, true);
  assert.equal(runs.length, 2, 'a folder already there is not written twice');

  const broken = createLocalSkillFolders({ lookup: async () => skills['deck-style-replica'], openFiles: async () => null });
  assert.equal((await broken.lookup('deck-style-replica')).canRun, false, 'files that cannot be had: the model is told the scripts cannot run');
});
