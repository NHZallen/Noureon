import assert from 'node:assert/strict';
import test from 'node:test';

import { EMBEDDING_PROVIDERS } from '../src/app/runtime/memory-store/embedding-client.js';
import { createPageVectors } from '../src/app/runtime/memory-store/page-vectors.js';
import { createPageHistory } from '../src/app/runtime/memory-store/page-history.js';
import { createNotesMemory } from '../src/app/runtime/memory-store/notes-memory.js';
import { PROJECT_MEDIA_EMBED_BYTES_MAX, createProjectPieces, pictureOf } from '../src/app/runtime/projects/project-pieces.js';
import { PROJECT_FILES_REPLY_BYTES_MAX, createMemoryFileBackend, createProjectFileStore, projectFilesBudget, setProjectFileDeps, withProjectFiles } from '../src/app/runtime/projects/project-source-files.js';
import { setProjectFoldersReader } from '../src/app/runtime/projects/project-instructions.js';
import { createProjectFilesLoader, mediaPieceHash, pieceIdOf } from '../src/data/project-files-tool.js';
import { createFakeIndexedDb } from './helpers/fake-indexeddb.js';

// The pictures of a project in the vectors and in the reply (docs/superpowers/specs/2026-11-01-project-files-multimodal-design.md, R2): a picture is a piece of its own, the pictures, videos,
// sounds and scans share a reply of 10 MB, and when they do not all fit the question picks them.

const DIMS = EMBEDDING_PROVIDERS.gemini.dimensions;
const MB = 1024 * 1024;
const AXES = [['dog', 'puppy'], ['invoice', 'tax', 'receipt'], ['trip', 'travel']];
const vectorOf = (label) => {
  const vector = new Array(DIMS).fill(0);
  AXES.forEach((words, axis) => { for (const word of words) if (String(label).toLowerCase().includes(word)) vector[axis] += 1; });
  vector[DIMS - 1] = 0.01;
  return vector;
};
const textOf = (value) => value.replace(/^task: search result \| query: /, '').replace(/^title: none \| text: /, '');
const picture = (n, extra = {}) => ({ id: `p${n}`, kind: 'image', title: `pic${n}.png`, mime: 'image/png', size: 1000, text: '', file: { hash: `h${n}`.padEnd(64, '0'), name: `pic${n}.png`, mimeType: 'image/png', size: 1000, ...extra } });

test('a picture is one piece made from the file; a big one, a vector drawing and a file with no kept original are not', () => {
  assert.deepEqual(pictureOf(picture(1)), { tooBig: false });
  assert.deepEqual(pictureOf(picture(1, { size: PROJECT_MEDIA_EMBED_BYTES_MAX + 1 })), { tooBig: true });
  assert.equal(pictureOf(picture(1, { mimeType: 'image/svg+xml' })), null);
  assert.equal(pictureOf({ id: 's', kind: 'text', text: 'x' }), null);
  assert.equal(pictureOf({ id: 'x', file: { hash: 'h', mimeType: 'application/pdf' } }), null);
});

test('the pieces of a project hold a piece for each picture (its bytes are read when its turn comes) and none for a picture that is too big', async () => {
  const folders = [{ id: 'f', sources: [picture(1), picture(2, { size: PROJECT_MEDIA_EMBED_BYTES_MAX + 5 }), { id: 't', kind: 'text', title: 'n.txt', text: 'A dog and a puppy in the park.' }] }];
  let loads = 0;
  setProjectFileDeps({ store: { load: async (file) => { loads += 1; return { mimeType: file.mimeType, data: 'QUJD' }; } }, supports: () => true });
  const pieces = createProjectPieces({ getFolders: () => folders, loadAccess: async () => ({ searchableKindOf: (source) => (source.text ? 'text' : ''), sourceTextOf: async (source) => source.text }), logger: { warn() {} } });
  try {
    await pieces.refresh();
    const made = pieces.pieces();
    assert.deepEqual(made.map((piece) => piece.id).sort(), [pieceIdOf('p1', 0), pieceIdOf('t', 0)].sort());
    const one = made.find((piece) => piece.id === pieceIdOf('p1', 0));
    assert.equal(one.hash, mediaPieceHash(folders[0].sources[0].file.hash));
    assert.match(one.text, /pic1\.png/);
    assert.equal(loads, 0, 'the bytes are not read to make the piece');
    assert.deepEqual(await one.loadMedia(), { mimeType: 'image/png', data: 'QUJD', kind: 'image' });
    assert.equal(loads, 1);
  } finally { setProjectFileDeps(null); }
});

async function setup(folders, { fetchImpl } = {}) {
  const rows = [{ record_key: 'meta:settings', payload: {}, version: 1, updated_at: '2026-10-30T00:00:00.000Z', deleted_at: null }];
  const data = new Map([['noureon.memoryNotes.v1.tester', JSON.stringify({ version: 1, rows })]]);
  const memory = createNotesMemory({ storage: { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } }, logger: { warn() {} } });
  await memory.attach({ username: 'tester' });
  const history = createPageHistory({ getConversations: () => [] });
  const embedded = [];
  const fetcher = fetchImpl || (async (url, options) => {
    const body = JSON.parse(options.body);
    if (url.endsWith(':batchEmbedContents')) return Response.json({ embeddings: body.requests.map((request) => ({ values: vectorOf(textOf(request.content.parts[0].text)) })) });
    const part = body.content.parts[0];
    embedded.push(part.inline_data ? 'media' : 'text');
    return Response.json({ embedding: { values: vectorOf(part.inline_data ? Buffer.from(part.inline_data.data, 'base64').toString() : textOf(part.text)) } });
  });
  const projectPieces = createProjectPieces({ getFolders: () => folders, loadAccess: async () => ({ searchableKindOf: () => '', sourceTextOf: async () => '' }), logger: { warn() {} } });
  const vectors = createPageVectors({ getStore: () => memory.getStore(), getHistory: () => history, getProjectPieces: () => projectPieces, getApiKeyForProvider: (name) => (name === 'gemini' ? 'g-key' : ''), indexedDB: createFakeIndexedDb(), userKey: () => 'tester', fetchImpl: fetcher, wait: async () => {}, logger: { warn() {} }, options: { pauseMs: 0 } });
  history.setVectors(vectors);
  return { vectors, projectPieces, embedded };
}

test('with the vectors on a picture is sent to the model of the vectors once, found by what it shows, and shows where its vector is', async () => {
  // The "bytes" of a picture are a word here, so that the fake model puts it on an axis.
  const folders = [{ id: 'f', sources: [picture(1), picture(2), picture(3, { size: PROJECT_MEDIA_EMBED_BYTES_MAX + 1 })] }];
  const words = { h1: 'puppy', h2: 'receipt' };
  setProjectFileDeps({ store: { load: async (file) => ({ mimeType: 'image/png', data: Buffer.from(words[file.hash.slice(0, 2)] || 'x').toString('base64') }) }, supports: () => true });
  const t = await setup(folders);
  try {
    await t.projectPieces.refresh();
    assert.equal(t.vectors.sourceStatus('p1'), 'off', 'nothing before the person agreed');
    await t.vectors.enable('gemini');
    await t.vectors.sync();
    assert.equal(t.embedded.filter((kind) => kind === 'media').length, 2, 'the two pictures that are not too big were sent');
    assert.equal(t.vectors.sourceStatus('p1'), 'ready');
    assert.equal(t.vectors.sourceStatus('p3'), 'none', 'a picture that is too big has no piece');
    const found = await t.vectors.searchProject('a photo of a puppy', { sourceIds: ['p1', 'p2'] });
    assert.equal(found[0].id, pieceIdOf('p1', 0));
    assert.equal(found[0].hash, mediaPieceHash(folders[0].sources[0].file.hash));
    assert.deepEqual(await t.vectors.rankProjectSources('the tax receipt', ['p1', 'p2']), ['p2', 'p1'], 'the nearest first');
    await t.vectors.sync();
    assert.equal(t.embedded.filter((kind) => kind === 'media').length, 2, 'what is made is not sent again');
  } finally { setProjectFileDeps(null); }
});

test('a picture that the model of the vectors cannot read is marked and not tried again; one that cannot be read here is left for the next build', async () => {
  const folders = [{ id: 'f', sources: [picture(1), picture(2)] }];
  let calls = 0;
  setProjectFileDeps({ store: { load: async (file) => (file.hash.startsWith('h2') ? null : { mimeType: 'image/png', data: 'QUJD' }) }, supports: () => true });
  const t = await setup(folders, { fetchImpl: async () => { calls += 1; return new Response('bad image', { status: 400 }); } });
  try {
    await t.projectPieces.refresh();
    await t.vectors.enable('gemini');
    await t.vectors.sync();
    assert.equal(t.vectors.sourceStatus('p1'), 'failed');
    assert.equal(t.vectors.sourceStatus('p2'), 'pending', 'it is not here now: tried again later');
    const before = calls;
    await t.vectors.sync();
    assert.equal(calls, before, 'a picture that failed is not asked again');
  } finally { setProjectFileDeps(null); }
});

test('the reply takes 10 MB of originals; when they do not all fit the ones nearest to the question come first, else the order they were added in', async () => {
  assert.equal(PROJECT_FILES_REPLY_BYTES_MAX, 10 * MB);
  const big = (n) => picture(n, { size: 4 * MB });
  const folder = { id: 'f', name: 'P', sources: [big(1), big(2), big(3)] };
  assert.deepEqual(projectFilesBudget(folder).used.map((source) => source.id), ['p1', 'p2'], 'the order they were added in');
  assert.deepEqual(projectFilesBudget(folder, { rank: ['p3', 'p1'] }).used.map((source) => source.id), ['p1', 'p3'], 'the nearest first (the ones given stay in the order they were added in)');
  assert.deepEqual(projectFilesBudget(folder, { rank: ['p3', 'p1'] }).left.map((source) => source.id), ['p2']);
  assert.deepEqual(projectFilesBudget({ sources: [big(1), picture(2, { size: 2 * MB + 1 })] }).used.length, 2, '4 + 2 MB fit');
  // The reply: the vectors pick and say which went with the message.
  const backend = createMemoryFileBackend();
  const store = createProjectFileStore({ backend, cryptoProvider: globalThis.crypto });
  const files = [big(1), big(2), big(3)].map((source) => ({ ...source, file: { ...source.file, hash: source.file.hash } }));
  for (const source of files) await backend.put({ id: source.file.hash, mimeType: 'image/png', bytes: new Uint8Array([1, 2, 3]) });
  setProjectFoldersReader(() => [{ id: 'f', name: 'P', sources: files }]);
  const asked = [];
  setProjectFileDeps({ store, supports: () => true, rank: async (question, ids) => { asked.push([question, ids]); return ['p3']; } });
  try {
    let picked = null;
    const parts = await withProjectFiles([{ text: 'which one is the receipt?' }], { id: 'c', folderId: 'f' }, {}, { onPicked: (value) => { picked = value; } });
    assert.deepEqual(asked, [['which one is the receipt?', ['p1', 'p2', 'p3']]]);
    assert.deepEqual(parts.filter((part) => part.inlineData).map((part) => part.inlineData.name), ['pic1.png', 'pic3.png']);
    assert.deepEqual(picked, { attached: ['p1', 'p3'], left: ['p2'], ranked: true });
    // Everything fits: nobody is asked.
    asked.length = 0;
    setProjectFoldersReader(() => [{ id: 'f', name: 'P', sources: [files[0]] }]);
    await withProjectFiles([{ text: 'hi' }], { id: 'c', folderId: 'f' }, {}, {});
    assert.deepEqual(asked, [], 'the vectors are asked only when the files do not all fit');
  } finally { setProjectFoldersReader(null); setProjectFileDeps(null); }
});

test('the search names the pictures that match (by their names, and by the vectors when the vector is the one of the file that is there now), and says which came with the message', async () => {
  const media = [
    { id: 'p1', name: 'tax-receipt.png', kind: 'image', size: 100, fileHash: 'a'.repeat(64), attached: true },
    { id: 'p2', name: 'IMG_4412.png', kind: 'image', size: 100, fileHash: 'b'.repeat(64), attached: false },
    { id: 'p3', name: 'IMG_4413.png', kind: 'image', size: 100, fileHash: 'c'.repeat(64), attached: false }
  ];
  const entries = [{ id: 't', name: 'notes.md', kind: 'text', size: 10 }];
  const asked = [];
  const loader = createProjectFilesLoader({
    entries, mediaEntries: media, readText: async () => 'Notes about a trip to Japan.',
    vectorSearch: async (query, options) => {
      asked.push(options.fileIds);
      return [
        { id: pieceIdOf('p2', 0), hash: mediaPieceHash('b'.repeat(64)), cosine: 0.9 },
        { id: pieceIdOf('p3', 0), hash: mediaPieceHash('stale'), cosine: 0.8 }
      ];
    }
  });
  const result = JSON.parse(await loader.run({ name: 'search_project_files', args: { query: 'receipt photo' } }));
  assert.deepEqual(asked[0].sort(), ['p1', 'p2', 'p3', 't'], 'the pictures are searched too');
  assert.deepEqual(result.pictures.map((entry) => [entry.file, entry.in_this_message]), [['tax-receipt.png', true], ['IMG_4412.png', false]], 'by name and by meaning; the stale vector of p3 is not believed');
  assert.match(result.pictures_note, /cannot see it/);
  assert.equal(result.search, 'keywords and meaning');
  // A file named in the call that is a picture: only it.
  const only = JSON.parse(await loader.run({ name: 'search_project_files', args: { query: 'receipt', file: 'IMG_4412.png' } }));
  assert.deepEqual(only.pictures.map((entry) => entry.file), ['IMG_4412.png']);
  assert.deepEqual(only.passages, []);
  // The ones told later (setAttached) change what the search says.
  loader.setAttached(['p2']);
  const again = JSON.parse(await loader.run({ name: 'search_project_files', args: { query: 'receipt photo' } }));
  assert.deepEqual(again.pictures.map((entry) => [entry.file, entry.in_this_message]), [['tax-receipt.png', false], ['IMG_4412.png', true]]);
  // Without the vectors only the names are used, and a query that matches nothing says so.
  const plain = createProjectFilesLoader({ entries, mediaEntries: media, readText: async () => 'Notes about a trip to Japan.' });
  assert.deepEqual(JSON.parse(await plain.run({ name: 'search_project_files', args: { query: 'receipt' } })).pictures.map((entry) => entry.file), ['tax-receipt.png']);
  assert.match(await plain.run({ name: 'search_project_files', args: { query: 'zzzz qqqq' } }), /Nothing in the project files matches/);
});
