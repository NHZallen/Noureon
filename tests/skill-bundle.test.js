import assert from 'node:assert/strict';
import test from 'node:test';

import JSZip from 'jszip';

import {
  SKILL_BUNDLE_LIMITS,
  bundleFileList,
  bundleFileText,
  classifyFile,
  cleanBundlePath,
  hasRunnableScript,
  readSkillBundle,
  skillBundlePath
} from '../src/data/skill-bundle.js';

const SKILL_MD = '---\nname: sales-report\ndescription: Builds the monthly sales report from a spreadsheet. Use when asked for the monthly numbers.\n---\n\nRun scripts/summary.py on the spreadsheet, then read references/format.md.\n';

const zipOf = async (files, options = {}) => {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) {
    if (content === null) zip.folder(path);
    else zip.file(path, content, typeof options[path] === 'object' ? options[path] : undefined);
  }
  return zip.generateAsync({ type: 'uint8array', platform: 'UNIX', compression: 'DEFLATE' });
};

test('a zip with SKILL.md and folders is read: the skill, the files with their kind, and a clean copy to keep', async () => {
  const bytes = await zipOf({
    'SKILL.md': SKILL_MD,
    'scripts/summary.py': 'print("hi")\n',
    'scripts/run.sh': 'echo hi\n',
    'references/format.md': '# Format\n',
    'assets/logo.png': new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe, 0x00])
  });
  const result = await readSkillBundle(bytes);
  assert.equal(result.ok, true);
  assert.equal(result.skill.name, 'sales-report');
  assert.deepEqual(result.files.map((file) => [file.path, file.kind]), [
    ['assets/logo.png', 'binary'],
    ['references/format.md', 'text'],
    ['scripts/run.sh', 'script'],
    ['scripts/summary.py', 'script']
  ]);
  // The clean copy reads back the same.
  const again = await readSkillBundle(result.bundle, { buildBundle: false });
  assert.equal(again.ok, true);
  assert.deepEqual(again.files.map((file) => file.path), result.files.map((file) => file.path));
  assert.equal(again.bundle, null);
});

test('one folder around everything is taken off, and the first level of files stays as it is', async () => {
  const result = await readSkillBundle(await zipOf({ 'sales-report/SKILL.md': SKILL_MD, 'sales-report/scripts/summary.py': 'x = 1\n', 'sales-report/notes.txt': 'n' }));
  assert.equal(result.ok, true);
  assert.deepEqual(result.files.map((file) => file.path), ['notes.txt', 'scripts/summary.py']);
});

test('hidden files and folders and macOS leftovers are left out without a word', async () => {
  const result = await readSkillBundle(await zipOf({ 'SKILL.md': SKILL_MD, '.env': 'KEY=1', '.git/config': 'x', '__MACOSX/._SKILL.md': 'x', 'references/.DS_Store': 'x', 'references/a.md': 'a' }));
  assert.equal(result.ok, true);
  assert.deepEqual(result.files.map((file) => file.path), ['references/a.md']);
});

test('what is not a skill is refused with a reason', async () => {
  assert.equal((await readSkillBundle(new Uint8Array([1, 2, 3]))).error, 'not_a_zip');
  assert.equal((await readSkillBundle(new Uint8Array(0))).error, 'not_a_zip');
  assert.equal((await readSkillBundle(null)).error, 'not_a_zip');
  assert.equal((await readSkillBundle(await zipOf({ 'references/a.md': 'a' }))).error, 'skill_md_missing');
  // The text of SKILL.md follows the rules of a pasted skill.
  assert.equal((await readSkillBundle(await zipOf({ 'SKILL.md': '---\nname: Bad Name\ndescription: x\n---\nbody' }))).error, 'name_invalid');
  assert.equal((await readSkillBundle(await zipOf({ 'SKILL.md': 'just text' }))).error, 'no_header');
});

test('programs and installers are not kept', async () => {
  for (const name of ['tool.exe', 'lib/x.so', 'run.bat', 'a/b.dll', 'setup.msi', 'x.ps1']) {
    const result = await readSkillBundle(await zipOf({ 'SKILL.md': SKILL_MD, [name]: 'x' }));
    assert.equal(result.error, 'blocked_file', name);
    assert.equal(result.detail, name);
  }
});

test('paths that leave the skill are refused', async () => {
  // (JSZip itself drops ".." parts when it reads a zip, so those are tried on the function that cleans a path; the rest reach it.)
  for (const path of ['/abs/evil.py', 'C:/evil.py', 'a\\b.py']) {
    const zip = new JSZip();
    zip.file('SKILL.md', SKILL_MD);
    zip.file(path, 'x');
    const result = await readSkillBundle(await zip.generateAsync({ type: 'uint8array' }));
    assert.equal(result.error, 'bad_path', path);
  }
  for (const path of ['../evil.py', 'a/../../evil.py', 'a/..']) assert.equal(cleanBundlePath(path).error, 'bad_path', path);
  assert.deepEqual(cleanBundlePath('./a//b.md'), { path: 'a/b.md' });
  assert.deepEqual(cleanBundlePath('a/.hidden/b.md'), { skip: true });
  assert.equal(cleanBundlePath('a/\0b').error, 'bad_path');
  assert.equal(cleanBundlePath(`${'a/'.repeat(120)}b`).error, 'bad_path');
});

test('a link to another place is refused', async () => {
  const zip = new JSZip();
  zip.file('SKILL.md', SKILL_MD);
  zip.file('link.md', '/etc/passwd', { unixPermissions: 0o120777 });
  const result = await readSkillBundle(await zip.generateAsync({ type: 'uint8array', platform: 'UNIX' }));
  assert.equal(result.error, 'symlink');
  assert.equal(result.detail, 'link.md');
});

test('the same path twice (even with other capitals) is refused', async () => {
  const zip = new JSZip();
  zip.file('SKILL.md', SKILL_MD);
  zip.file('references/A.md', 'a');
  zip.file('references/a.md', 'b');
  assert.equal((await readSkillBundle(await zip.generateAsync({ type: 'uint8array' }))).error, 'duplicate_path');
});

test('the limits: the number of files, one file, everything together, the zip itself', async () => {
  const many = { 'SKILL.md': SKILL_MD };
  for (let index = 0; index <= SKILL_BUNDLE_LIMITS.files; index += 1) many[`references/f${index}.md`] = String(index);
  assert.equal((await readSkillBundle(await zipOf(many))).error, 'too_many_files');
  // Exactly the limit is fine.
  delete many[`references/f${SKILL_BUNDLE_LIMITS.files}.md`];
  assert.equal((await readSkillBundle(await zipOf(many))).ok, true);

  const big = await zipOf({ 'SKILL.md': SKILL_MD, 'references/big.txt': 'a'.repeat(SKILL_BUNDLE_LIMITS.fileBytes + 1) });
  assert.ok(big.byteLength < SKILL_BUNDLE_LIMITS.zipBytes, 'it compresses small: the declared size is what is looked at');
  const tooBig = await readSkillBundle(big);
  assert.equal(tooBig.error, 'file_too_large');
  assert.equal(tooBig.detail, 'references/big.txt');

  const together = {};
  for (let index = 0; index < 6; index += 1) together[`references/p${index}.txt`] = 'b'.repeat(SKILL_BUNDLE_LIMITS.fileBytes - 10);
  assert.equal((await readSkillBundle(await zipOf({ 'SKILL.md': SKILL_MD, ...together }))).error, 'bundle_too_large');

  const huge = new Uint8Array(SKILL_BUNDLE_LIMITS.zipBytes + 1);
  assert.equal((await readSkillBundle(huge)).error, 'zip_too_large');
});

test('files are told apart: scripts by extension, text by decoding, the rest binary', () => {
  assert.equal(classifyFile('scripts/a.py', new Uint8Array([0xff])), 'script');
  assert.equal(classifyFile('scripts/a.SH', new Uint8Array([0x61])), 'script');
  assert.equal(classifyFile('a.md', new TextEncoder().encode('héllo 你好')), 'text');
  assert.equal(classifyFile('a.js', new TextEncoder().encode('let a = 1')), 'text');
  assert.equal(classifyFile('a.png', new Uint8Array([0x89, 0xff, 0xfe])), 'binary');
});

test('the list kept in the row has no content, and a script is found in it', async () => {
  const result = await readSkillBundle(await zipOf({ 'SKILL.md': SKILL_MD, 'scripts/a.py': 'x', 'references/b.md': 'y' }));
  const list = bundleFileList(result.files);
  assert.deepEqual(list, [{ path: 'references/b.md', size: 1, kind: 'text' }, { path: 'scripts/a.py', size: 1, kind: 'script' }]);
  assert.equal(JSON.stringify(list).includes('bytes'), false);
  assert.equal(hasRunnableScript(list), true);
  assert.equal(hasRunnableScript([{ path: 'a.md', kind: 'text' }]), false);
  assert.equal(hasRunnableScript(null), false);
});

test('the text of a file is given to a model only for text, and cut at the limit', async () => {
  const long = 'z'.repeat(SKILL_BUNDLE_LIMITS.readChars + 50);
  const result = await readSkillBundle(await zipOf({ 'SKILL.md': SKILL_MD, 'references/long.md': long, 'references/short.md': 'short', 'assets/a.bin2': new Uint8Array([0xff, 0xfe, 0xfd]) }));
  assert.deepEqual(bundleFileText(result.files, 'references/short.md'), { text: 'short', cut: false });
  const cut = bundleFileText(result.files, 'references/long.md');
  assert.equal(cut.cut, true);
  assert.equal(cut.text.length, SKILL_BUNDLE_LIMITS.readChars);
  assert.equal(bundleFileText(result.files, 'assets/a.bin2'), null);
  assert.equal(bundleFileText(result.files, 'nothing.md'), null);
  assert.equal(bundleFileText(null, 'a'), null);
});

test('the clean copy is kept at the folder of the person under the name of the skill', () => {
  assert.equal(skillBundlePath('11111111-2222-3333-4444-555555555555', 'sales-report'), '11111111-2222-3333-4444-555555555555/sales-report.zip');
});
