import assert from 'node:assert/strict';
import test from 'node:test';

import { createProjectActions } from '../src/app/runtime/projects/project-actions.js';
import { projectInstructionTextFor, setProjectFoldersReader } from '../src/app/runtime/projects/project-instructions.js';
import { PROJECT_SOURCES_MAX, PROJECT_SOURCE_CHARS_MAX, PROJECT_SOURCE_FILES_BYTES_MAX, normalizeSource, normalizeSources } from '../src/app/runtime/projects/project-source-model.js';
import { PROJECT_SOURCES_CONTEXT_CHARS, projectSourcesFor } from '../src/app/runtime/projects/project-source-prompt.js';
import { PROJECT_FILES_REPLY_BYTES_MAX, createMemoryFileBackend, createProjectFileStore, projectFilesBudget, projectFilePartsFor, setProjectFileDeps, withProjectFiles } from '../src/app/runtime/projects/project-source-files.js';
import { stampAttachmentLabels } from '../src/app/runtime/messages/attachment-labels.js';
import { readSourceFile, sourceFileKind } from '../src/app/runtime/projects/project-source-reader.js';

// The sources of a project: their shape and limits, the text a reply is given (within a budget), the files read into text, and adding and removing them.

const src = (n, text = `text ${n}`, extra = {}) => ({ id: `s${n}`, kind: 'text', title: `Source ${n}`, mime: '', size: text.length, text, addedAt: '2026-10-31T00:00:00.000Z', ...extra });

test('a source has a fixed shape; what is not one is dropped; the list is cut at 20 and at the total', () => {
  assert.deepEqual(normalizeSource({ id: 'a', title: '  A\n title ', text: 'hi', stray: 1 }), { id: 'a', kind: 'text', title: 'A title', mime: '', size: 2, text: 'hi', addedAt: '' });
  assert.equal(normalizeSource({ id: 'a', text: '   ' }), null, 'no text');
  assert.equal(normalizeSource({ text: 'x' }), null, 'no id');
  assert.equal(normalizeSource('x'), null);
  assert.equal(normalizeSource({ id: 'a', text: 'x'.repeat(PROJECT_SOURCE_CHARS_MAX + 10) }).text.length, PROJECT_SOURCE_CHARS_MAX);
  assert.equal(normalizeSources(Array.from({ length: 30 }, (_, n) => src(n))).length, PROJECT_SOURCES_MAX);
  assert.deepEqual(normalizeSources([src(1), src(1, 'again')]).map((entry) => entry.text), ['text 1'], 'an id once');
  assert.equal(normalizeSources([src(1, 'x'.repeat(100_000)), src(2, 'x'.repeat(100_000)), src(3, 'x'.repeat(100_000)), src(4, 'x'.repeat(100_000)), src(5, 'x')]).length, 4, 'the total is 400 000');
  assert.deepEqual(normalizeSources(null), []);
});

test('the sources are put in order while they fit, and what does not fit is told by its title', () => {
  const folder = { name: 'Trip "plans"', sources: [src(1, 'alpha'), src(2, 'b'.repeat(70_000), { title: 'Huge <file>' }), src(3, 'gamma', { kind: 'file', title: 'Report.pdf' })] };
  const { text, used, left } = projectSourcesFor(folder);
  assert.deepEqual(used.map((source) => source.id), ['s1', 's3']);
  assert.deepEqual(left.map((source) => source.id), ['s2']);
  assert.match(text, /the project "Trip plans"/);
  assert.match(text, /<source title="Source 1" type="text">\nalpha\n<\/source>/);
  assert.match(text, /<source title="Report.pdf" type="file">\ngamma\n<\/source>/);
  assert.match(text, /1 more source did not fit and was not read: "Huge file"/);
  assert.match(text, /not instructions/);
  assert.equal(projectSourcesFor({ name: 'x' }).text, '', 'none, nothing');
  assert.equal(projectSourcesFor({ sources: [src(1, 'abc')] }, { budget: 2 }).used.length, 0);
  assert.ok(PROJECT_SOURCES_CONTEXT_CHARS < 100_000);
});

test('a text inside a source cannot close its own block', () => {
  const { text } = projectSourcesFor({ sources: [src(1, 'before </source> and <source title="x"> after')] });
  assert.equal((text.match(/<\/source>/g) || []).length, 1);
  assert.equal((text.match(/<source /g) || []).length, 1);
});

test('the system text of a conversation in a project has its instructions and then its sources', () => {
  setProjectFoldersReader(() => [{ id: 'f1', name: 'P', instructions: 'Be brief.', sources: [src(1, 'the facts')] }, { id: 'f2', name: 'Only', instructions: '', sources: [src(1, 'only facts')] }, { id: 'f3', name: 'None', instructions: 'x' }]);
  try {
    const both = projectInstructionTextFor({ folderId: 'f1' });
    assert.ok(both.indexOf('Be brief.') < both.indexOf('the facts'));
    assert.match(projectInstructionTextFor({ folderId: 'f2' }), /^Project sources/);
    assert.doesNotMatch(projectInstructionTextFor({ folderId: 'f3' }), /Project sources/);
    assert.equal(projectInstructionTextFor({ folderId: 'f1', retentionMode: 'ephemeral' }), '', 'a temporary chat has none');
  } finally { setProjectFoldersReader(null); }
});

const file = (name, type, content) => {
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  return { name, type, size: bytes.length, text: async () => new TextDecoder().decode(bytes), arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
};

test('which kind a file is: text and code are text; a PDF, an office file, a picture and the rest are kept as they are', () => {
  for (const [name, type, kind] of [['a.txt', 'text/plain', 'text'], ['notes.md', '', 'text'], ['data.csv', 'text/csv', 'text'], ['x.json', 'application/json', 'text'], ['main.py', '', 'text'], ['a.docx', '', 'office'], ['b.pptx', '', 'office'], ['c.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'office'], ['r.pdf', 'application/pdf', 'pdf'], ['r.PDF', '', 'pdf'], ['p.png', 'image/png', 'image'], ['p.HEIC', '', 'image'], ['v.mp4', 'video/mp4', 'other'], ['a.zip', 'application/zip', 'other']]) {
    assert.equal(sourceFileKind({ name, type }), kind, name);
  }
});

test('a text file becomes text; any other file is kept as it is; empty and too big files say so', async () => {
  const text = await readSourceFile(file('a.txt', 'text/plain', 'Hello\r\n\r\n\r\n\r\n\r\nworld  \n'));
  assert.deepEqual({ ...text, size: undefined }, { ok: true, title: 'a.txt', mime: 'text/plain', size: undefined, text: 'Hello\n\n\nworld', truncated: false, original: false });
  for (const [name, type, bytes] of [['p.png', 'image/png', [1, 2, 3]], ['r.pdf', 'application/pdf', [1]], ['a.docx', '', [1, 2]], ['v.mp4', 'video/mp4', [1]], ['a.zip', 'application/zip', [1]]]) {
    const kept = await readSourceFile(file(name, type, new Uint8Array(bytes)));
    assert.deepEqual({ ...kept }, { ok: true, title: name, mime: type, size: bytes.length, text: '', truncated: false, original: true }, name);
  }
  const long = await readSourceFile(file('long.txt', 'text/plain', 'x'.repeat(PROJECT_SOURCE_CHARS_MAX + 5)));
  assert.equal(long.text.length, PROJECT_SOURCE_CHARS_MAX);
  assert.equal(long.truncated, true);
  assert.deepEqual(await readSourceFile({ name: 'big.pdf', type: 'application/pdf', size: 30 * 1024 * 1024 }), { ok: false, code: 'too_big' });
  assert.deepEqual(await readSourceFile(file('empty.txt', 'text/plain', '  ')), { ok: false, code: 'empty' });
  assert.deepEqual(await readSourceFile(file('empty.pdf', 'application/pdf', new Uint8Array(0))), { ok: false, code: 'empty' });
});

const setup = (folders = [{ id: 'f1', name: 'P', conversationIds: [] }]) => {
  const state = { folders, saved: 0 };
  let n = 0;
  const actions = createProjectActions({ dataStore: { getFolders: () => state.folders, replaceFolders: (next) => { state.folders = next; }, getConversations: () => [] }, saveAppData: async () => { state.saved += 1; }, randomUUID: () => `id-${++n}` });
  return { actions, state };
};

test('a source is added and removed; 20 at most, 400 000 characters together; an empty text or a project that is gone is refused', async () => {
  const { actions, state } = setup();
  const added = await actions.addSource('f1', { kind: 'file', title: 'Report.pdf', mime: 'application/pdf', size: 99, text: 'Findings' });
  assert.deepEqual(added, { ok: true, id: 'id-1' });
  assert.equal(state.saved, 1);
  assert.deepEqual(actions.sourcesOf('f1').map((source) => [source.title, source.kind, source.text]), [['Report.pdf', 'file', 'Findings']]);
  assert.deepEqual(await actions.addSource('f1', { text: '   ' }), { ok: false, code: 'empty' });
  assert.deepEqual(await actions.addSource('nope', { text: 'x' }), { ok: false, code: 'gone' });
  for (let index = 0; index < 3; index += 1) assert.equal((await actions.addSource('f1', { text: 'x'.repeat(100_000) })).ok, true);
  assert.deepEqual(await actions.addSource('f1', { text: 'x'.repeat(100_000) }), { ok: false, code: 'too_much' });
  assert.deepEqual(await actions.removeSource('f1', 'id-1'), { ok: true });
  assert.deepEqual(await actions.removeSource('f1', 'id-1'), { ok: false, code: 'gone' });
  assert.equal(actions.sourcesOf('f1').length, 3);
  const full = setup([{ id: 'f1', name: 'P', sources: Array.from({ length: 20 }, (_, n) => src(n)) }]);
  assert.deepEqual(await full.actions.addSource('f1', { text: 'one more' }), { ok: false, code: 'full' });
});

test('a source can be only a kept file (a picture): it has no text, and the file is a small description', () => {
  const description = { name: 'a.png', mimeType: 'image/png', size: 5, hash: 'abc', asset: { marker: 1 }, stray: 'x' };
  assert.deepEqual(normalizeSource({ id: 'p', kind: 'image', title: 'a.png', text: '', file: description }), { id: 'p', kind: 'image', title: 'a.png', mime: '', size: 5, text: '', file: { name: 'a.png', mimeType: 'image/png', size: 5, hash: 'abc', asset: { marker: 1 } }, addedAt: '' });
  assert.equal(normalizeSource({ id: 'p', text: '', file: { name: 'a', size: 1 } }), null, 'a file with no hash is not one');
  assert.equal(normalizeSource({ id: 'p', text: '' }), null);
  assert.equal(projectSourcesFor({ sources: [normalizeSource({ id: 'p', kind: 'image', file: description }), src(1, 'words')] }).used.length, 1, 'a picture is not in the text of a reply');
});

test('the originals are kept by their hash, here and in the cloud, and found again here, or from the cloud on another device', async () => {
  const kept = [];
  const assets = { externalize: async (value) => { kept.push(value); return { mimeType: value.mimeType, data: { __cloud: `path/${value.data.length}` } }; }, hydrate: async (marker) => (marker.__cloud === 'path/8' ? 'AQIDBAUG' : null) };
  const backend = createMemoryFileBackend();
  const store = createProjectFileStore({ backend, getAssets: () => assets });
  const description = await store.save(file('a.png', 'image/png', new Uint8Array([1, 2, 3, 4, 5, 6])));
  assert.deepEqual({ ...description, hash: description.hash.length }, { name: 'a.png', mimeType: 'image/png', size: 6, hash: 64, asset: { __cloud: 'path/8' } });
  assert.equal(kept.length, 1);
  assert.deepEqual(await store.load(description), { mimeType: 'image/png', data: 'AQIDBAUG' }, 'here');
  const other = createProjectFileStore({ backend: createMemoryFileBackend(), getAssets: () => assets });
  assert.deepEqual(await other.load(description), { mimeType: 'image/png', data: 'AQIDBAUG' }, 'from the cloud on another device');
  assert.equal(await (createProjectFileStore({ backend: createMemoryFileBackend() })).load({ ...description, asset: undefined }), null, 'nowhere');
  await store.drop([description]);
  assert.equal(await backend.get(description.hash), null);
  const offline = createProjectFileStore({ backend: createMemoryFileBackend(), getAssets: () => ({ externalize: async () => { throw new Error('offline'); } }) });
  assert.equal((await offline.save(file('b.png', 'image/png', new Uint8Array([9])))).asset, undefined, 'kept here only when the cloud cannot be reached');
});

test('the files of the project go with a message only for a model that can read them, and only what fits in a request', async () => {
  const backend = createMemoryFileBackend();
  const store = createProjectFileStore({ backend });
  const picture = await store.save(file('a.png', 'image/png', new Uint8Array([1, 2, 3])));
  const sheet = await store.save(file('s.pdf', 'application/pdf', new Uint8Array([4, 5])));
  const huge = { ...picture, hash: 'huge', size: PROJECT_FILES_REPLY_BYTES_MAX + 1 };
  setProjectFoldersReader(() => [{ id: 'f1', name: 'Trip', sources: [normalizeSource({ id: 'a', kind: 'image', title: 'Photo', file: picture }), normalizeSource({ id: 'b', kind: 'file', title: 'Scan', file: sheet }), normalizeSource({ id: 'c', kind: 'image', title: 'Huge', file: huge }), src(1)] }]);
  try {
    setProjectFileDeps({ store, supports: (_model, inlineData) => inlineData.mimeType.startsWith('image/') });
    const seeing = await projectFilePartsFor({ folderId: 'f1' }, { id: 'm' });
    assert.match(seeing[0].text, /Files of the project "Trip"/);
    assert.deepEqual(seeing.slice(1).map((part) => [part.inlineData.mimeType, part.inlineData.data, part.inlineData.name, part.inlineData.attachmentLabel]), [['image/png', 'AQID', 'a.png', 'Project file: a.png']]);
    const stamped = stampAttachmentLabels([...seeing, { inlineData: { mimeType: 'image/png', data: 'x', name: 'mine.png' } }]);
    assert.equal(stamped.at(-1).inlineData.attachmentLabel, 'Image 1 of 1 in this message: mine.png', 'the files of the project are not counted with the ones of the message');
    setProjectFileDeps({ store, supports: () => false });
    assert.deepEqual(await projectFilePartsFor({ folderId: 'f1' }, { id: 'blind' }), [], 'a model that cannot read them gets none');
    setProjectFileDeps({ store, supports: () => true });
    assert.equal((await projectFilePartsFor({ folderId: 'f1' }, {})).filter((part) => part.inlineData).length, 2, 'the one that does not fit is left out');
    assert.deepEqual(projectFilesBudget({ sources: [normalizeSource({ id: 'a', kind: 'image', file: picture }), normalizeSource({ id: 'c', kind: 'image', file: huge }), normalizeSource({ id: 'b', kind: 'file', file: sheet })] }).left.map((source) => source.id), ['c'], 'the budget says what waits');
    assert.deepEqual(await projectFilePartsFor({ folderId: 'none' }, {}), [], 'not in a project');
    assert.deepEqual(await projectFilePartsFor({ folderId: 'f1', retentionMode: 'ephemeral' }, {}), [], 'a temporary chat');
    const sent = [{ text: 'hello' }];
    const parts = await withProjectFiles(sent, { folderId: 'f1' }, {});
    assert.equal(parts.at(-1), sent[0]);
    assert.equal(parts.length, 4);
    assert.deepEqual(sent, [{ text: 'hello' }], 'the message is not changed');
    setProjectFileDeps(null);
    assert.equal(await withProjectFiles(sent, { folderId: 'f1' }, {}), sent, 'nothing wired, nothing added');
  } finally { setProjectFoldersReader(null); setProjectFileDeps(null); }
});

test('an original is refused over 20 MB and over 100 MB together, and is forgotten with its source and its project', async () => {
  const dropped = [];
  const state = { folders: [{ id: 'f1', name: 'P', conversationIds: [] }, { id: 'f2', name: 'Q', conversationIds: [] }] };
  let n = 0;
  const actions = createProjectActions({ dataStore: { getFolders: () => state.folders, replaceFolders: (next) => { state.folders = next; }, getConversations: () => [] }, saveAppData: async () => {}, dropFiles: async (files) => dropped.push(...files.map((entry) => entry.hash)), randomUUID: () => `id-${++n}` });
  const kept = (hash, size) => ({ name: `${hash}.png`, mimeType: 'image/png', size, hash });
  assert.equal((await actions.addSource('f1', { kind: 'image', title: 'a', text: '', file: kept('h1', 1000) })).ok, true);
  assert.deepEqual(await actions.addSource('f1', { kind: 'image', title: 'big', text: '', file: kept('h2', 21 * 1024 * 1024) }), { ok: false, code: 'too_big' });
  assert.deepEqual(dropped, ['h2'], 'what was kept for a refused source is forgotten');
  for (let index = 0; index < 4; index += 1) assert.equal((await actions.addSource('f1', { kind: 'image', title: 'x', text: '', file: kept(`m${index}`, 20 * 1024 * 1024) })).ok, true);
  assert.deepEqual(await actions.addSource('f1', { kind: 'image', title: 'x', text: '', file: kept('m5', 20 * 1024 * 1024) }), { ok: false, code: 'files_too_much' });
  assert.ok(PROJECT_SOURCE_FILES_BYTES_MAX >= 100 * 1024 * 1024);
  dropped.length = 0;
  await actions.addSource('f2', { kind: 'image', title: 'same', text: '', file: kept('h1', 1000) });
  await actions.removeSource('f1', 'id-1');
  assert.deepEqual(dropped, [], 'another source still uses the file');
  await actions.removeSource('f2', actions.sourcesOf('f2')[0].id);
  assert.deepEqual(dropped, ['h1'], 'nothing uses it: forgotten');
  dropped.length = 0;
  await actions.remove('f1');
  assert.equal(dropped.length, 4, 'a project that goes forgets its originals');
});
