import assert from 'node:assert/strict';
import test from 'node:test';

import { createProjectFilesAccess, searchableKindOf } from '../src/app/runtime/projects/project-files-access.js';
import { projectInstructionTextFor, setProjectFoldersReader } from '../src/app/runtime/projects/project-instructions.js';
import { createMemoryFileBackend, createProjectFileStore, projectFilePartsFor, setProjectFileDeps } from '../src/app/runtime/projects/project-source-files.js';

// The files of the project a chat is in, as the model of a reply looks into them: which sources can be searched, the list that tells their names, the tools over the page's own copies, and
// what a reply made by the server is told. A picture goes on being given whole.

const text = (id, title, body) => ({ id, kind: 'text', title, mime: '', size: body.length, text: body, addedAt: '' });
const file = (id, title, hash, mimeType, size = 20) => ({ id, kind: mimeType.startsWith('image/') ? 'image' : 'file', title, mime: mimeType, size, text: '', file: { name: title, mimeType, size, hash, asset: { __astraCloudAsset: { path: `u/${hash}` } } }, addedAt: '' });

const SOURCES = [
  text('s1', 'Brief', 'The launch date is the ninth of March.'),
  file('s2', 'plan.md', 'h-plan', 'text/markdown'),
  file('s3', 'photo.png', 'h-photo', 'image/png'),
  file('s4', 'report.docx', 'h-doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
  file('s5', 'brief.txt', 'h-dup', 'text/plain'),
  file('s6', 'brief.txt', 'h-dup2', 'text/plain')
];
const FOLDER = { id: 'f1', name: 'Launch', instructions: 'Be brief.', sources: SOURCES };

const withFolder = async (fn) => {
  setProjectFoldersReader(() => [FOLDER]);
  const backend = createMemoryFileBackend();
  const store = createProjectFileStore({ backend });
  await backend.put({ id: 'h-plan', mimeType: 'text/markdown', bytes: new TextEncoder().encode('# Plan\n\nThe team ships on Friday.') });
  await backend.put({ id: 'h-photo', mimeType: 'image/png', bytes: new Uint8Array([1, 2, 3]) });
  setProjectFileDeps({ store, supports: () => true });
  try { return await fn(); } finally { setProjectFoldersReader(null); setProjectFileDeps(null); }
};

test('what can be searched: a typed text, a text file, a PDF or an Office file; not a picture', () => {
  assert.equal(searchableKindOf(SOURCES[0]), 'text');
  assert.equal(searchableKindOf(SOURCES[1]), 'text');
  assert.equal(searchableKindOf(SOURCES[2]), '');
  assert.equal(searchableKindOf(SOURCES[3]), 'office');
  assert.equal(searchableKindOf(file('x', 'a.pdf', 'h', 'application/pdf')), 'pdf');
});

test('no files for a reply without tools, a chat outside a project, or a project with nothing to search', async () => {
  await withFolder(async () => {
    assert.equal(createProjectFilesAccess({ conversation: { folderId: 'f1' }, toolsAllowed: false }), null);
    assert.equal(createProjectFilesAccess({ conversation: {}, toolsAllowed: true }), null);
    assert.equal(createProjectFilesAccess({ conversation: { folderId: 'f1', retentionMode: 'ephemeral' }, toolsAllowed: true }), null);
  });
  setProjectFoldersReader(() => [{ id: 'f2', name: 'Pictures', sources: [SOURCES[2]] }]);
  try { assert.equal(createProjectFilesAccess({ conversation: { folderId: 'f2' } }), null); } finally { setProjectFoldersReader(null); }
});

test('the list names the files (a second file with the same name gets its number), and the instructions carry it instead of the text of the sources', async () => {
  await withFolder(async () => {
    const access = createProjectFilesAccess({ conversation: { folderId: 'f1' } });
    assert.deepEqual(access.entries.map((entry) => entry.name), ['Brief', 'plan.md', 'report.docx', 'brief.txt', 'brief.txt (2)']);
    assert.deepEqual([...access.searchableIds], ['s1', 's2', 's4', 's5', 's6']);
    assert.match(access.catalogText, /search_project_files and read_project_file/);
    assert.match(access.catalogText, /- plan\.md \(text,/);
    const withTools = projectInstructionTextFor({ folderId: 'f1' }, { filesCatalog: access.catalogText });
    assert.match(withTools, /Be brief\./);
    assert.match(withTools, /- report\.docx \(Office document,/);
    assert.doesNotMatch(withTools, /ninth of March/, 'the text of a source is not put in front of the model');
    assert.match(projectInstructionTextFor({ folderId: 'f1' }), /ninth of March/, 'without the tools it still is');
  });
});

test('the tools read a typed text and a file kept on this device', async () => {
  await withFolder(async () => {
    const access = createProjectFilesAccess({ conversation: { folderId: 'f1' } });
    const loader = access.make('en');
    assert.match(await loader.run({ name: 'search_project_files', args: { query: 'launch date March' } }), /ninth of March/);
    assert.match(await loader.run({ name: 'read_project_file', args: { file: 'plan.md' } }), /ships on Friday/);
    assert.deepEqual(access.usedNames().sort(), ['Brief', 'plan.md']);
    assert.match(await loader.run({ name: 'read_project_file', args: { file: 'report.docx' } }), /could not be read/, 'a file that is not on this device says so');
  });
});

test('a reply made by the server is told the text, or the hash and place of each file', async () => {
  await withFolder(async () => {
    const snapshot = createProjectFilesAccess({ conversation: { folderId: 'f1' } }).snapshot();
    assert.equal(snapshot.entries.length, 5);
    assert.equal(snapshot.entries[0].text, 'The launch date is the ninth of March.');
    assert.equal(snapshot.entries[1].file.hash, 'h-plan');
    assert.deepEqual(snapshot.entries[1].file.asset, { __astraCloudAsset: { path: 'u/h-plan' } });
    assert.equal('text' in snapshot.entries[1], false);
  });
});

test('a picture is still given whole, and the files that are searched are not (and do not take the room of the picture)', async () => {
  await withFolder(async () => {
    const access = createProjectFilesAccess({ conversation: { folderId: 'f1' } });
    const parts = await projectFilePartsFor({ folderId: 'f1' }, {}, { skipIds: access.searchableIds });
    assert.deepEqual(parts.filter((part) => part.inlineData).map((part) => part.inlineData.name), ['photo.png']);
    const all = await projectFilePartsFor({ folderId: 'f1' }, {});
    assert.deepEqual(all.filter((part) => part.inlineData).map((part) => part.inlineData.name), ['plan.md', 'photo.png'], 'without the tools every file that is here is given');
  });
});
