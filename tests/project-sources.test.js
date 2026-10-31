import assert from 'node:assert/strict';
import test from 'node:test';

import { createProjectActions } from '../src/app/runtime/projects/project-actions.js';
import { projectInstructionTextFor, setProjectFoldersReader } from '../src/app/runtime/projects/project-instructions.js';
import { PROJECT_SOURCES_MAX, PROJECT_SOURCE_CHARS_MAX, normalizeSource, normalizeSources } from '../src/app/runtime/projects/project-source-model.js';
import { PROJECT_SOURCES_CONTEXT_CHARS, projectSourcesFor } from '../src/app/runtime/projects/project-source-prompt.js';
import { createVisionReader, pickVisionModel } from '../src/app/runtime/projects/project-source-vision.js';
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

test('which files can be read: text and code, Word, PowerPoint and Excel, PDF, pictures (a model looks at them); not video or programs', () => {
  for (const [name, type, kind] of [['a.txt', 'text/plain', 'text'], ['notes.md', '', 'text'], ['data.csv', 'text/csv', 'text'], ['x.json', 'application/json', 'text'], ['main.py', '', 'text'], ['a.docx', '', 'office'], ['b.pptx', '', 'office'], ['c.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'office'], ['r.pdf', 'application/pdf', 'pdf'], ['r.PDF', '', 'pdf'], ['p.png', 'image/png', 'image'], ['p.HEIC', '', 'image'], ['v.mp4', 'video/mp4', ''], ['a.exe', 'application/octet-stream', '']]) {
    assert.equal(sourceFileKind({ name, type }), kind, name);
  }
});

test('a file is read into text; a PDF through the PDF reader; empty, too big, unsupported and damaged files say why', async () => {
  const text = await readSourceFile(file('a.txt', 'text/plain', 'Hello\r\n\r\n\r\n\r\n\r\nworld  \n'));
  assert.deepEqual({ ...text, size: undefined }, { ok: true, title: 'a.txt', mime: 'text/plain', size: undefined, text: 'Hello\n\n\nworld', truncated: false });
  const pdf = await readSourceFile(file('r.pdf', 'application/pdf', new Uint8Array([1, 2, 3])), { readPdfText: async (bytes) => `pdf of ${bytes.length} bytes` });
  assert.equal(pdf.text, 'pdf of 3 bytes');
  assert.deepEqual(await readSourceFile(file('scan.pdf', 'application/pdf', new Uint8Array([1])), { readPdfText: async () => '  ' }), { ok: false, code: 'empty' });
  assert.deepEqual(await readSourceFile(file('p.png', 'image/png', 'x')), { ok: false, code: 'unsupported' }, 'a picture with no way to look at it');
  assert.deepEqual(await readSourceFile(file('v.mp4', 'video/mp4', 'x')), { ok: false, code: 'unsupported' });
  assert.deepEqual(await readSourceFile({ name: 'big.txt', type: 'text/plain', size: 30 * 1024 * 1024 }), { ok: false, code: 'too_big' });
  assert.deepEqual(await readSourceFile(file('bad.pdf', 'application/pdf', new Uint8Array([1])), { readPdfText: async () => { throw new Error('encrypted'); } }), { ok: false, code: 'unreadable' });
  assert.deepEqual(await readSourceFile(file('bad.docx', '', 'not a zip'), { loadOfficeDeps: async () => ({ JSZip: { loadAsync: async () => { throw new Error('not a zip'); } }, DOMParser: class {} }) }), { ok: false, code: 'unreadable' });
  const long = await readSourceFile(file('long.txt', 'text/plain', 'x'.repeat(PROJECT_SOURCE_CHARS_MAX + 5)));
  assert.equal(long.text.length, PROJECT_SOURCE_CHARS_MAX);
  assert.equal(long.truncated, true);
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

test('a picture is read by a model that sees: the chat\'s own when it can, else the first one with a key; a scanned PDF is read page by page; no such model says so', async () => {
  const models = [{ id: 'text-only', provider: 'a' }, { id: 'sees-nokey', provider: 'b', vision: true }, { id: 'sees', provider: 'c', vision: true }, { id: 'painter', provider: 'c', vision: true, outputModality: 'image' }];
  const supportsVision = (model) => Boolean(model.vision);
  const hasKey = (provider) => provider === 'a' || provider === 'c';
  assert.equal(pickVisionModel({ models, currentId: 'text-only', supportsVision, hasKey }), 'sees', 'the chat\'s model does not see');
  assert.equal(pickVisionModel({ models, currentId: 'sees', supportsVision, hasKey }), 'sees');
  assert.equal(pickVisionModel({ models, currentId: 'sees-nokey', supportsVision, hasKey }), 'sees', 'no key for it');
  assert.equal(pickVisionModel({ models: [models[0], models[3]], supportsVision, hasKey }), '', 'a model that draws is not one that reads');

  const calls = [];
  const reader = createVisionReader({
    getModels: () => models, supportsVision, hasKey, getCurrentModelId: () => 'text-only',
    getRunner: () => async (request) => { calls.push(request); return 'Total: 42\nA receipt.'; },
    shrinkImage: async (image) => ({ ...image, shrunk: true }),
    renderPdfPages: async (bytes, { maxPages }) => [{ mimeType: 'image/jpeg', bytes: new Uint8Array([1]) }, { mimeType: 'image/jpeg', bytes: new Uint8Array([2]) }].slice(0, maxPages)
  });
  assert.equal(reader.available(), true);
  const seen = await readSourceFile(file('receipt.jpg', 'image/jpeg', new Uint8Array([9, 9])), { readImage: reader.readImage });
  assert.equal(seen.ok, true);
  assert.equal(seen.text, '[Picture: receipt.jpg]\nTotal: 42\nA receipt.');
  assert.equal(calls[0].modelId, 'sees');
  assert.match(calls[0].parts[0].text, /all the text that is visible/);
  assert.equal(calls[0].parts[1].inlineData.mimeType, 'image/jpeg');

  const scan = await readSourceFile(file('scan.pdf', 'application/pdf', new Uint8Array([1])), { readPdfText: async () => '', readScan: reader.readScan });
  assert.equal(scan.ok, true);
  assert.equal(calls[1].parts.filter((part) => part.inlineData).length, 2, 'both pages in one request');
  assert.match(calls[1].parts[0].text, /pages of a document/);
  const withText = await readSourceFile(file('t.pdf', 'application/pdf', new Uint8Array([1])), { readPdfText: async () => 'has text', readScan: reader.readScan });
  assert.equal(withText.text, 'has text');
  assert.equal(calls.length, 2, 'a PDF with text is not looked at');

  const blind = createVisionReader({ getModels: () => [models[0]], supportsVision, hasKey, getRunner: () => async () => 'x' });
  assert.equal(blind.available(), false);
  assert.deepEqual(await readSourceFile(file('a.png', 'image/png', 'x'), { readImage: blind.readImage }), { ok: false, code: 'no_vision_model' });
  assert.deepEqual(await readSourceFile(file('s.pdf', 'application/pdf', new Uint8Array([1])), { readPdfText: async () => '', readScan: blind.readScan }), { ok: false, code: 'no_vision_model' });
  const failing = createVisionReader({ getModels: () => models, supportsVision, hasKey, getRunner: () => async () => { throw new Error('quota'); } });
  assert.deepEqual(await readSourceFile(file('a.png', 'image/png', 'x'), { readImage: failing.readImage }), { ok: false, code: 'unreadable' });
  const empty = createVisionReader({ getModels: () => models, supportsVision, hasKey, getRunner: () => async () => '  ' });
  assert.deepEqual(await readSourceFile(file('a.png', 'image/png', 'x'), { readImage: empty.readImage }), { ok: false, code: 'empty' });
});
