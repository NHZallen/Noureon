import assert from 'node:assert/strict';
import test from 'node:test';

import { EMBEDDING_PROVIDERS } from '../src/app/runtime/memory-store/embedding-client.js';
import { createPageVectors } from '../src/app/runtime/memory-store/page-vectors.js';
import { createPageHistory } from '../src/app/runtime/memory-store/page-history.js';
import { createNotesMemory } from '../src/app/runtime/memory-store/notes-memory.js';
import { createProjectPieces } from '../src/app/runtime/projects/project-pieces.js';
import { projectPassages } from '../src/data/project-files-tool.js';
import { textHash } from '../src/app/runtime/memory-notes/vector-math.js';
import { createFakeIndexedDb } from './helpers/fake-indexeddb.js';

// The passages of the files of the projects become vectors with the ones of the past conversations, when the person turned that on (docs/superpowers/specs/2026-11-01-project-files-multimodal-design.md, R1).

const DIMS = EMBEDDING_PROVIDERS.gemini.dimensions;
const AXES = [['dog', 'puppy', '狗'], ['invoice', 'tax', '發票'], ['trip', 'travel', 'japan']];
const embedText = (text) => {
  const vector = new Array(DIMS).fill(0);
  const lower = String(text).toLowerCase();
  AXES.forEach((words, axis) => { for (const word of words) if (lower.includes(word)) vector[axis] += 1; });
  vector[DIMS - 1] = 0.01;
  return vector;
};
const textOf = (value) => value.replace(/^task: search result \| query: /, '').replace(/^title: none \| text: /, '');
const geminiFetch = (calls = []) => async (url, options) => {
  const body = JSON.parse(options.body);
  calls.push({ url, body });
  if (url.endsWith(':batchEmbedContents')) return Response.json({ embeddings: body.requests.map((request) => ({ values: embedText(textOf(request.content.parts[0].text)) })) });
  return Response.json({ embedding: { values: embedText(textOf(body.content.parts[0].text)) } });
};

const FOLDERS = () => [
  { id: 'p1', sources: [
    { id: 's1', title: 'notes.txt', file: { hash: 'h1', name: 'notes.txt' } },
    { id: 's2', title: 'invoices.md', text: 'The tax invoice of March is attached to this note.' },
    { id: 's3', title: 'photo.jpg', file: { hash: 'h3', name: 'photo.jpg' } },
    { id: 's4', title: 'broken.pdf', file: { hash: 'h4', name: 'broken.pdf' } }
  ] },
  { id: 'p2', deletedAt: '2026-10-30T00:00:00.000Z', sources: [{ id: 's5', title: 'gone.txt', text: 'A puppy of a deleted project.' }] }
];
const TEXTS = { s1: 'My puppy learned to sit on Monday. The dog is happy about the walk.', s2: 'The tax invoice of March is attached to this note.' };
const fakeAccess = () => ({
  searchableKindOf: (source) => (source.id === 's3' ? '' : 'text'),
  sourceTextOf: async (source) => {
    if (source.id === 's4') throw new Error('The file is not here.');
    return TEXTS[source.id] ?? source.text;
  }
});

test('the pieces of the projects are the passages the search cuts: the same ids, the hash of the text, and nothing of a file that cannot be read, a picture or a deleted project', async () => {
  const pieces = createProjectPieces({ getFolders: FOLDERS, loadAccess: async () => fakeAccess(), logger: { warn() {} } });
  assert.deepEqual(pieces.pieces(), [], 'nothing before the first read');
  await pieces.refresh();
  const made = pieces.pieces();
  assert.deepEqual(made.map((piece) => piece.id), ['src:s1:0', 'src:s2:0']);
  const expected = projectPassages([{ id: 's1', name: 'notes.txt', text: TEXTS.s1 }]);
  assert.equal(made[0].hash, textHash(expected[0].text));
  assert.equal(made[0].text, expected[0].text);
  assert.equal(made.every((piece) => piece.kind === 'project'), true);
  assert.deepEqual(made.map((piece) => piece.sourceId), ['s1', 's2']);
});

async function setup({ keys = { gemini: 'g-key' }, folders = FOLDERS, fetchImpl = geminiFetch() } = {}) {
  const rows = [{ record_key: 'meta:settings', payload: {}, version: 1, updated_at: '2026-10-30T00:00:00.000Z', deleted_at: null }];
  const data = new Map([['noureon.memoryNotes.v1.tester', JSON.stringify({ version: 1, rows })]]);
  const memory = createNotesMemory({ storage: { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } }, logger: { warn() {} } });
  await memory.attach({ username: 'tester' });
  const history = createPageHistory({ getConversations: () => [{ id: 'c1', lastUpdatedAt: '2026-10-01T00:00:00.000Z', messages: [{ role: 'user', createdAt: '2026-10-01T00:00:00.000Z', parts: [{ text: 'A conversation about my puppy and the dog park.' }] }] }] });
  const projectPieces = createProjectPieces({ getFolders: folders, loadAccess: async () => fakeAccess(), logger: { warn() {} } });
  const vectors = createPageVectors({ getStore: () => memory.getStore(), getHistory: () => history, getProjectPieces: () => projectPieces, getApiKeyForProvider: (name) => keys[name] || '', indexedDB: createFakeIndexedDb(), userKey: () => 'tester', fetchImpl, wait: async () => {}, logger: { warn() {} }, options: { pauseMs: 0 } });
  history.setVectors(vectors);
  return { memory, vectors, history, projectPieces };
}

test('nothing of a project leaves the device until the person agreed; then the passages are sent and counted in what turning it on sends', async () => {
  const calls = [];
  const { vectors, projectPieces } = await setup({ fetchImpl: geminiFetch(calls) });
  await projectPieces.refresh();
  assert.equal((await vectors.sync()).status, 'off');
  assert.equal(calls.length, 0, 'no consent, nothing sent');
  assert.equal(vectors.estimate().pieces, 3, 'the conversation and two passages of the project files');
  await vectors.enable('gemini');
  await vectors.sync();
  const sent = calls.filter((call) => call.url.endsWith(':batchEmbedContents')).flatMap((call) => call.body.requests.map((request) => request.content.parts[0].text));
  assert.ok(sent.some((text) => text.includes('My puppy learned to sit')), 'a passage of a project file was sent');
  assert.equal(sent.some((text) => text.includes('deleted project')), false, 'not one of a deleted project');
});

test('the search over the past conversations does not return passages of project files, and the search over the files returns only the sources asked about', async () => {
  const { vectors } = await setup();
  await vectors.enable('gemini');
  await vectors.sync();
  const history = await vectors.search('puppy');
  assert.deepEqual(history.map((hit) => hit.conversationId), ['c1'], 'only the conversation, though the files hold puppies too');
  const found = await vectors.searchProject('puppy', { sourceIds: ['s1', 's2'] });
  assert.deepEqual(found.map((hit) => hit.id), ['src:s1:0']);
  assert.equal(found[0].hash, textHash(TEXTS.s1));
  assert.ok(found[0].cosine > 0.5);
  assert.deepEqual(await vectors.searchProject('puppy', { sourceIds: ['s2'] }), [], 'not a source that was not asked about');
  assert.deepEqual(await vectors.searchProject('puppy', { sourceIds: [] }), []);
  assert.deepEqual(await vectors.searchProject('   ', { sourceIds: ['s1'] }), []);
});

test('a source that goes loses its vectors at the next build, and one that comes gets them', async () => {
  let current = FOLDERS();
  const calls = [];
  const { vectors } = await setup({ folders: () => current, fetchImpl: geminiFetch(calls) });
  await vectors.enable('gemini');
  await vectors.sync();
  assert.equal((await vectors.searchProject('tax invoice', { sourceIds: ['s2'] })).length, 1);
  current = [{ id: 'p1', sources: [{ id: 's1', title: 'notes.txt', file: { hash: 'h1' } }, { id: 's6', title: 'trip.txt', text: 'The travel plan: a trip to Japan in spring.' }] }];
  await vectors.sync();
  assert.deepEqual(await vectors.searchProject('tax invoice', { sourceIds: ['s2'] }), [], 'the vector of the source that went is gone');
  assert.equal((await vectors.searchProject('trip to japan', { sourceIds: ['s6'] })).length, 1, 'the new source has its own');
  assert.equal(calls.filter((call) => call.url.endsWith(':batchEmbedContents')).flatMap((call) => call.body.requests).filter((request) => request.content.parts[0].text.includes('Monday')).length, 1, 'what did not change was not sent again');
});

test('asked to run again while it builds, it runs once more (so that a source added meanwhile is not missed)', async () => {
  const { vectors } = await setup();
  await vectors.enable('gemini');
  const first = vectors.sync();
  vectors.sync({ rerun: true });
  await first;
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(vectors.getState().status, 'idle');
});
