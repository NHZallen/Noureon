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
  assert.equal(PROJECT_MEDIA_EMBED_BYTES_MAX, 20 * MB, 'a picture is sent as a small copy: only what a project cannot hold is too big');
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
  assert.deepEqual(result.pictures.map((entry) => [entry.file, entry.in_this_message]), [['tax-receipt.png', true], ['IMG_4412.png', undefined]], 'by name and by meaning; the stale vector of p3 is not believed');
  assert.match(result.pictures_note, /You cannot look at pictures in this reply/, 'a loader that cannot show pictures says so');
  assert.equal(result.search, 'keywords and meaning');
  // A file named in the call that is a picture: only it.
  const only = JSON.parse(await loader.run({ name: 'search_project_files', args: { query: 'receipt', file: 'IMG_4412.png' } }));
  assert.deepEqual(only.pictures.map((entry) => entry.file), ['IMG_4412.png']);
  assert.deepEqual(only.passages, []);
  // The ones told later (setAttached) change what the search says.
  loader.setAttached(['p2']);
  const again = JSON.parse(await loader.run({ name: 'search_project_files', args: { query: 'receipt photo' } }));
  assert.deepEqual(again.pictures.map((entry) => [entry.file, entry.in_this_message]), [['tax-receipt.png', undefined], ['IMG_4412.png', true]]);
  const seeing = createProjectFilesLoader({ entries, mediaEntries: media, canView: true, viewMedia: async () => ({ mimeType: 'image/jpeg', data: 'QUJD' }), readText: async () => 'x' });
  assert.match(JSON.parse(await seeing.run({ name: 'search_project_files', args: { query: 'receipt' } })).pictures_note, /Look at one with view_project_file/);
  // Without the vectors only the names are used, and a query that matches nothing says so.
  const plain = createProjectFilesLoader({ entries, mediaEntries: media, readText: async () => 'Notes about a trip to Japan.' });
  assert.deepEqual(JSON.parse(await plain.run({ name: 'search_project_files', args: { query: 'receipt' } })).pictures.map((entry) => entry.file), ['tax-receipt.png']);
  assert.match(await plain.run({ name: 'search_project_files', args: { query: 'zzzz qqqq' } }), /Nothing in the project files matches/);
});

// ---------- R3: view_project_file

const pictures = () => [
  { id: 'p1', name: 'receipt.png', kind: 'image', size: 3 * MB, fileHash: 'a'.repeat(64), attached: false },
  { id: 'p2', name: 'trip.png', kind: 'image', size: 3 * MB, fileHash: 'b'.repeat(64), attached: true },
  { id: 'p3', name: 'plan.png', kind: 'image', size: 5 * MB, fileHash: 'c'.repeat(64), attached: false },
  { id: 'p4', name: 'map.png', kind: 'image', size: 2 * MB, fileHash: 'd'.repeat(64), attached: false }
];
const names = (loader) => loader.tools.map((tool) => tool.name);

test('view_project_file is given only to a model that can see, and only when the project has pictures; a project of pictures alone has the search too', () => {
  const texts = [{ id: 't', name: 'notes.md', kind: 'text', size: 10 }];
  const view = async () => ({ mimeType: 'image/jpeg', data: 'QUJD' });
  assert.deepEqual(names(createProjectFilesLoader({ entries: texts, mediaEntries: pictures(), canView: true, viewMedia: view, readText: async () => 'x' })), ['search_project_files', 'read_project_file', 'view_project_file']);
  assert.deepEqual(names(createProjectFilesLoader({ entries: texts, mediaEntries: pictures(), canView: false, viewMedia: view, readText: async () => 'x' })), ['search_project_files', 'read_project_file'], 'a model that cannot see: no such tool');
  assert.deepEqual(names(createProjectFilesLoader({ entries: texts, mediaEntries: [], canView: true, viewMedia: view, readText: async () => 'x' })), ['search_project_files', 'read_project_file'], 'no pictures');
  assert.deepEqual(names(createProjectFilesLoader({ entries: [], mediaEntries: pictures(), canView: true, viewMedia: view, readText: async () => '' })), ['search_project_files', 'view_project_file'], 'pictures alone: nothing to read');
  assert.deepEqual(names(createProjectFilesLoader({ entries: [], mediaEntries: pictures(), canView: false, readText: async () => '' })), [], 'pictures alone and a model that cannot see: nothing');
});

test('view_project_file gives pictures back as small copies (up to 4 in a call); one that came with the message or was shown before is not given again; what is counted is the copies, not the originals', async () => {
  const shown = [];
  const loader = createProjectFilesLoader({
    entries: [{ id: 't', name: 'notes.md', kind: 'text', size: 10 }], mediaEntries: pictures(), canView: true, readText: async () => 'x',
    viewMedia: async (entry) => { shown.push(entry.name); return entry.name === 'map.png' ? null : { mimeType: 'image/jpeg', data: `data-of-${entry.name}` }; }
  });
  const first = await loader.run({ name: 'view_project_file', args: { file: 'receipt.png' } });
  assert.equal(first.content, 'The picture follows: "receipt.png".');
  assert.deepEqual(first.images, [{ label: 'receipt.png', mimeType: 'image/jpeg', data: 'data-of-receipt.png' }]);
  assert.deepEqual(loader.outcome(), { key: 'projectFilesViewing', count: 1 });
  assert.match(await loader.run({ name: 'view_project_file', args: { file: 'trip.png' } }), /already in front of you/);
  assert.match(await loader.run({ name: 'view_project_file', args: { file: 'receipt.png' } }), /shown to you earlier in this reply/);
  assert.deepEqual(shown, ['receipt.png'], 'what came with the message, or was shown, is not read again');
  assert.match(await loader.run({ name: 'view_project_file', args: { file: 'nothing.png' } }), /There is no picture called "nothing.png"/);
  assert.match(await loader.run({ name: 'view_project_file', args: {} }), /Say which picture/);
  // Several in a call, in the order asked; a name that holds the words; one that cannot be shown is told, the others still follow.
  const many = await loader.run({ name: 'view_project_file', args: { files: ['plan', 'map.png', 'receipt.png'] } });
  assert.deepEqual(many.images.map((image) => image.label), ['plan.png']);
  assert.match(many.content, /The picture follows: "plan.png"\./);
  assert.match(many.content, /"map.png" could not be shown now|The picture "map.png" could not be shown now/);
  assert.match(many.content, /shown to you earlier/);
  assert.equal(loader.stepEvent({ name: 'view_project_file' }, 'en').key, 'projectFilesViewing');
});

test('the pictures of a reply are limited by how many there are and how big the small copies are together (every round sends the earlier ones again), never by the size of the originals', async () => {
  const { PROJECT_VIEW_CHARS_MAX, PROJECT_VIEW_PICTURES_MAX, PROJECT_VIEW_PICTURES_PER_CALL } = await import('../src/data/project-files-tool.js');
  // Twelve pictures of 9 MB each: the originals together are far above any limit, the copies are small.
  const big = Array.from({ length: 12 }, (_, n) => ({ id: `b${n}`, name: `IMG_${n}.jpeg`, kind: 'image', size: 9 * MB, fileHash: String(n).padStart(64, '0'), attached: false }));
  const loader = createProjectFilesLoader({ entries: [], mediaEntries: big, canView: true, readText: async () => '', viewMedia: async () => ({ mimeType: 'image/jpeg', data: 'A'.repeat(200_000) }) });
  let looked = 0;
  for (let n = 0; n < 12; n += 1) {
    const result = await loader.run({ name: 'view_project_file', args: { file: `IMG_${n}.jpeg` } });
    if (typeof result === 'string') break;
    looked += result.images.length;
  }
  assert.equal(looked, 12, 'twelve pictures of 9 MB are looked at one after the other: the originals do not count');
  const { MAX_PROJECT_VIEW_CALLS } = await import('../src/data/project-files-tool.js');
  assert.equal(MAX_PROJECT_VIEW_CALLS, 12);
  assert.match(await loader.run({ name: 'view_project_file', args: { file: 'IMG_0.jpeg' } }), /The limit of 12 calls to look at pictures/);
  assert.equal(loader.tools.some((tool) => tool.name === 'view_project_file'), false, 'no more calls: the tool is not offered');
  // The copies are what is counted: 6 MB of them in a reply, 24 pictures at most, 4 in a call.
  assert.equal(PROJECT_VIEW_PICTURES_PER_CALL, 4);
  assert.equal(PROJECT_VIEW_PICTURES_MAX, 24);
  assert.equal(PROJECT_VIEW_CHARS_MAX, 6_000_000);
  const heavy = createProjectFilesLoader({ entries: [], mediaEntries: big, canView: true, readText: async () => '', viewMedia: async () => ({ mimeType: 'image/jpeg', data: 'A'.repeat(390_000) }) });
  let got = 0;
  let last = '';
  for (let n = 0; n < 12 && !last; n += 1) {
    const result = await heavy.run({ name: 'view_project_file', args: { files: [`IMG_${n}.jpeg`] } });
    if (typeof result === 'string') last = result; else got += result.images.length;
  }
  assert.equal(got, 12, '12 x 390 000 = 4.7 MB is under the limit');
  const crowd = createProjectFilesLoader({ entries: [], mediaEntries: [...big, ...Array.from({ length: 20 }, (_, n) => ({ ...big[0], id: `c${n}`, name: `more_${n}.jpeg` }))], canView: true, readText: async () => '', viewMedia: async () => ({ mimeType: 'image/jpeg', data: 'A'.repeat(399_000) }) });
  let total = 0;
  let stopped = '';
  const crowdNames = [...big, ...Array.from({ length: 20 }, (_, n) => ({ name: `more_${n}.jpeg` }))].map((entry) => entry.name);
  for (let n = 0; n < crowdNames.length && !stopped; n += 2) {
    const result = await crowd.run({ name: 'view_project_file', args: { files: [crowdNames[n], crowdNames[n + 1]] } });
    if (typeof result === 'string') stopped = result; else { total += result.images.length; if (/most one reply can carry|as many as one reply/.test(result.content)) stopped = result.content; }
  }
  assert.ok(total * 399_000 <= PROJECT_VIEW_CHARS_MAX, 'never above the limit of the copies');
  assert.match(stopped, /say which are left so that the person can ask again/, 'the model is told which are left, not that a file is too big');
  // Four in a call; the others are asked for again.
  const four = createProjectFilesLoader({ entries: [], mediaEntries: big, canView: true, readText: async () => '', viewMedia: async () => ({ mimeType: 'image/jpeg', data: 'QUJD' }) });
  const answer = await four.run({ name: 'view_project_file', args: { files: big.slice(0, 6).map((entry) => entry.name) } });
  assert.equal(answer.images.length, 4);
  assert.match(answer.content, /Only the first 4 were looked at/);
});

test('the page shrinks a picture to a JPEG that fits an answer, trying smaller sides, and gives it as it is only when it is small', async () => {
  const { makeViewThumbnail, VIEW_SIDES } = await import('../src/app/runtime/projects/project-picture-thumb.js');
  const sizes = [];
  const deps = {
    createImageBitmap: async () => ({ width: 4000, height: 2000 }),
    makeCanvas: (width, height) => { sizes.push([width, height]); return { getContext: () => ({ fillRect() {}, drawImage() {} }), toBlob: async () => new Blob([new Uint8Array(sizes.length === 1 ? 400_000 : 1000)]) }; }
  };
  const big = await makeViewThumbnail({ mimeType: 'image/png', data: Buffer.from('x'.repeat(10)).toString('base64') }, deps);
  assert.equal(big.mimeType, 'image/jpeg');
  assert.deepEqual(sizes, [[1280, 640], [900, 450]], 'the first copy was too big for an answer, the second fits');
  assert.equal(VIEW_SIDES[0], 1280);
  const broken = { createImageBitmap: async () => { throw new Error('no'); } };
  assert.deepEqual(await makeViewThumbnail({ mimeType: 'image/png', data: 'QUJD' }, broken), { mimeType: 'image/png', data: 'QUJD' });
  assert.equal(await makeViewThumbnail({ mimeType: 'image/png', data: 'x'.repeat(300_000) }, broken), null, 'a big picture that cannot be shrunk is not shown');
  assert.equal(await makeViewThumbnail({ mimeType: 'application/pdf', data: 'QUJD' }, broken), null);
});

test('the picture of view_project_file reaches the model in each of the four forms (Gemini, chat, Responses, Messages)', async () => {
  const { keepToolResult } = await import('../src/data/tool-result.js');
  const { applyGeminiTools, applyOpenAiTools, applyResponsesTools } = await import('../src/app/runtime/features/tool-call-formats.js');
  const { applyAnthropicTools } = await import('../src/app/runtime/reply/anthropic-messages-format.js');
  const loader = createProjectFilesLoader({ entries: [], mediaEntries: pictures(), canView: true, readText: async () => '', viewMedia: async () => ({ mimeType: 'image/jpeg', data: 'QUJD' }) });
  const call = { id: 'c1', geminiId: 'g1', name: 'view_project_file', arguments: '{"file":"receipt.png"}', args: { file: 'receipt.png' } };
  const turn = { assistant: { text: '', toolCalls: [call] }, results: [keepToolResult(call, await loader.run(call))] };
  assert.equal(turn.results[0].content, 'The picture follows: "receipt.png".');
  assert.deepEqual(applyGeminiTools({ contents: [] }, { toolTurns: [turn] }).contents.at(-1).parts.slice(1), [{ text: 'receipt.png' }, { inlineData: { mimeType: 'image/jpeg', data: 'QUJD' } }]);
  assert.deepEqual(applyOpenAiTools({ messages: [] }, { toolTurns: [turn] }).messages.at(-1).content, [{ type: 'text', text: 'receipt.png' }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUJD' } }]);
  assert.deepEqual(applyResponsesTools({ input: [] }, { toolTurns: [turn] }).input.at(-1).content, [{ type: 'input_text', text: 'receipt.png' }, { type: 'input_image', image_url: 'data:image/jpeg;base64,QUJD' }]);
  assert.deepEqual(applyAnthropicTools({ messages: [] }, { toolTurns: [turn] }).messages.at(-1).content.slice(1), [{ type: 'text', text: 'receipt.png' }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' } }]);
});

// ---------- R4: pictures are sent small, and nothing of the media goes with the message

test('a picture is made small before it goes to the model of the vectors; one the browser cannot open goes as it is only when it is a PNG or a JPEG that is not too big; else it is marked and not tried again', async () => {
  const { makeEmbedThumbnail, EMBED_SIDES } = await import('../src/app/runtime/projects/project-picture-thumb.js');
  const sizes = [];
  const deps = { createImageBitmap: async () => ({ width: 6000, height: 4000 }), makeCanvas: (width, height) => { sizes.push([width, height]); return { getContext: () => ({ fillRect() {}, drawImage() {} }), toBlob: async () => new Blob([new Uint8Array(50_000)]) }; } };
  const small = await makeEmbedThumbnail({ mimeType: 'image/heic', data: Buffer.from('x').toString('base64') }, deps);
  assert.equal(small.mimeType, 'image/jpeg');
  assert.deepEqual(sizes, [[1024, 683]], 'at most 1024 on the longest side, whatever the kind of picture');
  assert.deepEqual(EMBED_SIDES, [1024, 768]);
  const broken = { createImageBitmap: async () => { throw new Error('cannot open'); } };
  assert.deepEqual(await makeEmbedThumbnail({ mimeType: 'image/png', data: 'QUJD' }, broken), { mimeType: 'image/png', data: 'QUJD' });
  assert.equal(await makeEmbedThumbnail({ mimeType: 'image/gif', data: 'QUJD' }, broken), null, 'the model of the vectors takes PNG and JPEG only');
  assert.equal(await makeEmbedThumbnail({ mimeType: 'image/png', data: 'A'.repeat(13 * 1024 * 1024) }, broken), null, 'too big to send as it is');
  // The piece: the bytes come made small; a picture that cannot be sent is marked `unreadable`.
  const folders = [{ id: 'f', sources: [picture(1), picture(2)] }];
  setProjectFileDeps({ store: { load: async (file) => ({ mimeType: file.mimeType, data: 'QUJD' }) }, supports: () => true });
  try {
    const pieces = createProjectPieces({ getFolders: () => folders, makeThumb: async ({ data }) => (data === 'QUJD' && sizes.length < 2 ? (sizes.push('seen'), { mimeType: 'image/jpeg', data: 'SMALL' }) : null), loadAccess: async () => ({ searchableKindOf: () => '', sourceTextOf: async () => '' }), logger: { warn() {} } });
    await pieces.refresh();
    const [first, second] = pieces.pieces();
    assert.deepEqual(await first.loadMedia(), { mimeType: 'image/jpeg', data: 'SMALL', kind: 'image' });
    assert.deepEqual(await second.loadMedia(), { unreadable: true });
  } finally { setProjectFileDeps(null); }
});

test('a picture that cannot be sent in any form is marked failed at once and not tried again', async () => {
  const folders = [{ id: 'f', sources: [picture(1)] }];
  setProjectFileDeps({ store: { load: async (file) => ({ mimeType: file.mimeType, data: 'QUJD' }) }, supports: () => true });
  let calls = 0;
  const memoryOf = async () => {
    const rows = [{ record_key: 'meta:settings', payload: {}, version: 1, updated_at: '2026-10-30T00:00:00.000Z', deleted_at: null }];
    const data = new Map([['noureon.memoryNotes.v1.tester', JSON.stringify({ version: 1, rows })]]);
    const memory = createNotesMemory({ storage: { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } }, logger: { warn() {} } });
    await memory.attach({ username: 'tester' });
    return memory;
  };
  const memory = await memoryOf();
  const history = createPageHistory({ getConversations: () => [] });
  const projectPieces = createProjectPieces({ getFolders: () => folders, makeThumb: async () => { calls += 1; return null; }, loadAccess: async () => ({ searchableKindOf: () => '', sourceTextOf: async () => '' }), logger: { warn() {} } });
  const vectors = createPageVectors({ getStore: () => memory.getStore(), getHistory: () => history, getProjectPieces: () => projectPieces, getApiKeyForProvider: (name) => (name === 'gemini' ? 'g-key' : ''), indexedDB: createFakeIndexedDb(), userKey: () => 'tester', fetchImpl: async () => { throw new Error('nothing may be sent'); }, wait: async () => {}, logger: { warn() {} }, options: { pauseMs: 0 } });
  history.setVectors(vectors);
  try {
    await projectPieces.refresh();
    await vectors.enable('gemini');
    await vectors.sync();
    assert.equal(vectors.sourceStatus('p1'), 'failed');
    const before = calls;
    await vectors.sync();
    assert.equal(calls, before, 'it is not read again at the next build');
  } finally { setProjectFileDeps(null); }
});
