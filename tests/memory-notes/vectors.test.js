import assert from 'node:assert/strict';
import test from 'node:test';

import { dot, fuseRanks, textHash, toUnit, topByCosine } from '../../src/app/runtime/memory-notes/vector-math.js';
import { EMBEDDING_PROVIDERS, createEmbeddingClient, pickEmbeddingProvider, versionOf } from '../../src/app/runtime/memory-store/embedding-client.js';
import { createIdbBackend, createMemoryBackend, createVectorStore } from '../../src/app/runtime/memory-store/vector-store.js';
import { createPageVectors } from '../../src/app/runtime/memory-store/page-vectors.js';
import { createPageHistory } from '../../src/app/runtime/memory-store/page-history.js';
import { createNotesMemory } from '../../src/app/runtime/memory-store/notes-memory.js';
import { createFakeIndexedDb } from '../helpers/fake-indexeddb.js';

const DIMS = EMBEDDING_PROVIDERS.gemini.dimensions;
// A made-up "meaning": each group of words points along one axis, so that "dog", "puppy" and "狗" are alike and "invoice" is not.
const AXES = [['dog', 'puppy', '狗', '小狗'], ['invoice', 'tax', '發票', '稅'], ['trip', 'travel', '旅行', 'japan']];
const embedText = (text) => {
  const vector = new Array(DIMS).fill(0);
  const lower = String(text).toLowerCase();
  AXES.forEach((words, axis) => { for (const word of words) if (lower.includes(word)) vector[axis] += 1; });
  vector[DIMS - 1] = 0.01;
  return vector;
};
const textOf = (value) => value.replace(/^task: search result \| query: /, '').replace(/^title: none \| text: /, '');

function geminiFetch({ batch = true, calls = [] } = {}) {
  return async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url, body, headers: options.headers });
    if (url.endsWith(':batchEmbedContents')) {
      if (!batch) return new Response('not found', { status: 404 });
      return Response.json({ embeddings: body.requests.map((request) => ({ values: embedText(textOf(request.content.parts[0].text)) })) });
    }
    return Response.json({ embedding: { values: embedText(textOf(body.content.parts[0].text)) } });
  };
}

test('unit vectors, the likeness of two, and the best of many above a bar', () => {
  const unit = toUnit([3, 4]);
  assert.ok(Math.abs(dot(unit, unit) - 1) < 1e-6);
  assert.deepEqual([...toUnit([0, 0])], [0, 0]);
  assert.equal(dot(toUnit([1, 2]), toUnit([1, 2, 3])), 0, 'different lengths are not alike');
  const entries = [{ id: 'a', vector: toUnit([1, 0]) }, { id: 'b', vector: toUnit([1, 1]) }, { id: 'c', vector: toUnit([0, 1]) }];
  assert.deepEqual(topByCosine(toUnit([1, 0.1]), entries, { limit: 2, minCosine: 0.5 }).map((hit) => hit.id), ['a', 'b']);
  assert.deepEqual(topByCosine(toUnit([1, 0]), entries, { minCosine: 0.99 }).map((hit) => hit.id), ['a']);
});

test('two orders put together: what both put high comes first, and nothing is listed twice', () => {
  assert.deepEqual(fuseRanks([['a', 'b', 'c'], ['b', 'd', 'a']], { limit: 3 }), ['b', 'a', 'd']);
  assert.deepEqual(fuseRanks([[], ['x']], { limit: 5 }), ['x']);
  assert.equal(textHash('same'), textHash('same'));
  assert.notEqual(textHash('same'), textHash('other'));
});

test('Gemini: a group of texts is one request with the document format, a query has its own format, and a model with no batch call is asked one text at a time', async () => {
  const calls = [];
  const client = createEmbeddingClient({ provider: 'gemini', getApiKey: () => 'g-key', fetchImpl: geminiFetch({ calls }) });
  const vectors = await client.embed(['my puppy', 'the tax invoice'], { kind: 'document' });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /gemini-embedding-2:batchEmbedContents$/);
  assert.equal(calls[0].headers['x-goog-api-key'], 'g-key');
  assert.equal(calls[0].body.requests[0].content.parts[0].text, 'title: none | text: my puppy');
  assert.equal(calls[0].body.requests[0].outputDimensionality, DIMS);
  assert.equal(vectors.length, 2);
  assert.ok(Math.abs(dot(vectors[0], vectors[0]) - 1) < 1e-5, 'unit vectors');
  const [query] = await client.embed(['dog'], { kind: 'query' });
  assert.equal(calls[1].body.requests[0].content.parts[0].text, 'task: search result | query: dog');
  assert.ok(dot(query, vectors[0]) > dot(query, vectors[1]));
  const singleCalls = [];
  const single = createEmbeddingClient({ provider: 'gemini', getApiKey: () => 'g-key', fetchImpl: geminiFetch({ batch: false, calls: singleCalls }) });
  assert.equal((await single.embed(['a puppy', 'a trip'])).length, 2);
  assert.deepEqual(singleCalls.map((call) => call.url.split(':').pop()), ['batchEmbedContents', 'embedContent', 'embedContent']);
});

test('OpenRouter: the same model through its own address, the size asked for, answers put back in order, and a route that refuses the size is asked again without it', async () => {
  const seen = [];
  const client = createEmbeddingClient({
    provider: 'openrouter',
    getApiKey: () => 'o-key',
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body);
      seen.push({ url, body, auth: options.headers.Authorization });
      if (body.dimensions && seen.length === 1) return new Response('no dimensions here', { status: 400 });
      return Response.json({ data: [{ index: 1, embedding: [...embedText('invoice'), 0.5] }, { index: 0, embedding: [...embedText('dog'), 0.5] }] });
    }
  });
  const [first, second] = await client.embed(['dog', 'invoice']);
  assert.equal(seen[0].url, 'https://openrouter.ai/api/v1/embeddings');
  assert.equal(seen[0].auth, 'Bearer o-key');
  assert.equal(seen[0].body.model, 'google/gemini-embedding-2');
  assert.equal(seen[0].body.dimensions, DIMS);
  assert.equal(seen[1].body.dimensions, undefined, 'asked again without the size');
  assert.equal(seen[1].body.input[0], 'title: none | text: dog');
  assert.ok(first[0] > 0.9 && second[1] > 0.9, 'index 0 is the first text');
  assert.equal(first.length, DIMS, 'an answer longer than the size is cut');
  assert.ok(Math.abs(dot(first, first) - 1) < 1e-5);
});

test('files: Gemini takes them inline, OpenRouter as content blocks of their kind', async () => {
  const geminiCalls = [];
  const gemini = createEmbeddingClient({ provider: 'gemini', getApiKey: () => 'g', fetchImpl: async (url, options) => { geminiCalls.push({ url, body: JSON.parse(options.body) }); return Response.json({ embedding: { values: embedText('dog') } }); } });
  const vector = await gemini.embedMedia({ mimeType: 'image/png', data: 'QUJD', kind: 'image' });
  assert.match(geminiCalls[0].url, /gemini-embedding-2:embedContent$/);
  assert.deepEqual(geminiCalls[0].body.content.parts, [{ inline_data: { mime_type: 'image/png', data: 'QUJD' } }]);
  assert.equal(geminiCalls[0].body.outputDimensionality, DIMS);
  assert.ok(vector[0] > 0.9);
  const sent = [];
  const router = createEmbeddingClient({ provider: 'openrouter', getApiKey: () => 'o', fetchImpl: async (url, options) => { sent.push(JSON.parse(options.body).input[0].content[0]); return Response.json({ data: [{ index: 0, embedding: embedText('trip') }] }); } });
  for (const [mimeType, kind] of [['image/jpeg', 'image'], ['video/mp4', 'video'], ['audio/mpeg', 'audio'], ['application/pdf', 'document']]) await router.embedMedia({ mimeType, data: 'QUJD', kind });
  assert.deepEqual(sent.map((block) => block.type), ['image_url', 'video_url', 'input_audio', 'file']);
  assert.equal(sent[0].image_url.url, 'data:image/jpeg;base64,QUJD');
  assert.deepEqual(sent[2].input_audio, { data: 'QUJD', format: 'mpeg' });
});

test('no key, a refusal, or a wrong count is an error; the provider is chosen by the key the person has; both providers make the same kind of vectors', async () => {
  await assert.rejects(createEmbeddingClient({ provider: 'gemini', getApiKey: () => '' }).embed(['x']), /Gemini key/);
  await assert.rejects(createEmbeddingClient({ provider: 'openrouter', getApiKey: () => 'k', fetchImpl: async () => new Response('no', { status: 401 }) }).embed(['x']), (error) => error.status === 401);
  await assert.rejects(createEmbeddingClient({ provider: 'openrouter', getApiKey: () => 'k', fetchImpl: async () => Response.json({ data: [] }) }).embed(['x']), /one vector/);
  assert.deepEqual(await createEmbeddingClient({ provider: 'openrouter', getApiKey: () => 'k' }).embed([]), []);
  assert.throws(() => createEmbeddingClient({ provider: 'openai' }), /no embedding provider/);
  assert.equal(pickEmbeddingProvider({ chosen: 'openrouter', hasKey: () => true }), 'openrouter');
  assert.equal(pickEmbeddingProvider({ chosen: 'openrouter', hasKey: (name) => name === 'gemini' }), 'gemini');
  assert.equal(pickEmbeddingProvider({ chosen: 'openai', hasKey: (name) => name === 'openrouter' }), 'openrouter', 'a provider that is not supported (any more) is not chosen');
  assert.equal(pickEmbeddingProvider({ hasKey: () => false }), '');
  assert.equal(versionOf('gemini'), 'gemini-embedding-2:768:v1');
  assert.equal(versionOf('openrouter'), versionOf('gemini'), 'one index serves both');
});

test('the store keeps vectors with the hash of their text, drops the pieces that are gone, and throws all away when the model changes', async () => {
  const backend = createMemoryBackend();
  const store = createVectorStore({ backend });
  await store.load('v1');
  await store.putMany([{ id: 'a', hash: 'h1', vector: toUnit([1, 0]) }, { id: 'b', hash: 'h2', vector: toUnit([0, 1]) }]);
  assert.equal(store.size, 2);
  assert.equal(store.has('a', 'h1'), true);
  assert.equal(store.has('a', 'changed'), false, 'a text that changed needs a new vector');
  assert.equal(await store.prune(['a']), 1);
  assert.equal(store.size, 1);
  const again = createVectorStore({ backend });
  assert.equal(await again.load('v1'), 1, 'the same model: what was kept is read');
  const other = createVectorStore({ backend });
  assert.equal(await other.load('v2'), 0, 'another model: the old vectors are thrown away');
  assert.equal((await createVectorStore({ backend }).load('v2')), 0);
});

test('the vectors are kept in IndexedDB under the name of the person, and read back as unit vectors', async () => {
  const indexedDB = createFakeIndexedDb();
  const first = createVectorStore({ backend: createIdbBackend({ indexedDB, name: 'vectors-allen' }) });
  await first.load('v1');
  await first.putMany([{ id: 'a', hash: 'h', vector: toUnit([3, 4]) }]);
  const second = createVectorStore({ backend: createIdbBackend({ indexedDB, name: 'vectors-allen' }) });
  assert.equal(await second.load('v1'), 1);
  assert.ok(second.entries()[0].vector instanceof Float32Array);
  assert.ok(Math.abs(dot(second.entries()[0].vector, toUnit([3, 4])) - 1) < 1e-6);
  const stranger = createVectorStore({ backend: createIdbBackend({ indexedDB, name: 'vectors-someone-else' }) });
  assert.equal(await stranger.load('v1'), 0, 'another person on the device has their own');
  await second.clear();
  assert.equal(await createVectorStore({ backend: createIdbBackend({ indexedDB, name: 'vectors-allen' }) }).load('v1'), 0);
});

const conversation = (id, text, extra = {}) => ({ id, lastUpdatedAt: '2026-10-01T00:00:00.000Z', messages: [{ role: 'user', parts: [{ text }], createdAt: '2026-10-01T00:00:00.000Z' }, { role: 'model', parts: [{ text: 'Sure.' }] }], ...extra });
const CONVERSATIONS = [
  conversation('dogs', '我家的小狗最近一直不吃飯，該怎麼辦'),
  conversation('tax', 'Please check my invoice for the quarterly tax filing'),
  conversation('japan', 'Planning a trip to Osaka in the spring')
];

async function setup({ conversations = CONVERSATIONS, keys = { gemini: 'g-key' }, settings = {}, fetchImpl = geminiFetch(), options = { pauseMs: 0 } } = {}) {
  const rows = settings ? [{ record_key: 'meta:settings', payload: settings, version: 1, updated_at: '2026-10-30T00:00:00.000Z', deleted_at: null }] : [];
  const data = new Map([['noureon.memoryNotes.v1.tester', JSON.stringify({ version: 1, rows })]]);
  const memory = createNotesMemory({ storage: { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } }, logger: { warn() {} } });
  await memory.attach({ username: 'tester' });
  const history = createPageHistory({ getConversations: () => conversations });
  const indexedDB = createFakeIndexedDb();
  const vectors = createPageVectors({ getStore: () => memory.getStore(), getHistory: () => history, getApiKeyForProvider: (name) => keys[name] || '', indexedDB, userKey: () => 'tester', fetchImpl, wait: async () => {}, logger: { warn() {} }, options });
  history.setVectors(vectors);
  return { memory, store: memory.getStore(), history, vectors, indexedDB };
}

test('it is off until the person agrees: nothing is sent, and a search uses the keywords alone', async () => {
  const calls = [];
  const { vectors, history } = await setup({ fetchImpl: geminiFetch({ calls }) });
  assert.equal(vectors.isEnabled(), false);
  assert.equal((await vectors.sync()).status, 'off');
  assert.deepEqual(await vectors.search('puppy'), []);
  assert.equal(calls.length, 0, 'nothing left the device');
  assert.deepEqual(await history.lookupHybrid('puppy', 3), [], 'and the keywords find nothing for a word that is not in the text');
  assert.deepEqual(vectors.estimate().pieces, 3);
});

test('turning it on records the consent, builds the vectors in groups, and then a search finds what means the same, across languages', async () => {
  const calls = [];
  const { vectors, store, history } = await setup({ fetchImpl: geminiFetch({ calls }) });
  const estimate = vectors.estimate();
  assert.equal(estimate.provider, 'gemini');
  assert.ok(estimate.chars > 50 && estimate.tokens > 0);
  assert.equal(await vectors.enable('gemini'), true);
  await vectors.sync();
  const saved = store.getSettings().vector;
  assert.equal(saved.enabled, true);
  assert.equal(saved.provider, 'gemini');
  assert.ok(Date.parse(saved.consentAt), 'the time of the consent is kept');
  assert.equal(vectors.getState().status, 'idle');
  assert.equal(vectors.getState().done, vectors.getState().total);
  assert.equal(vectors.available(), true);
  const sent = calls.filter((call) => call.url.endsWith(':batchEmbedContents')).flatMap((call) => call.body.requests.map((request) => request.content.parts[0].text));
  assert.ok(sent.some((text) => text.includes('小狗')), 'the conversations were sent');
  // The keywords know nothing about "puppy" for a Chinese conversation about 小狗; the vectors do.
  assert.deepEqual(history.lookup('puppy', 3), []);
  const found = await history.lookupHybrid('my puppy will not eat', 3);
  assert.equal(found[0].conversationId, 'dogs');
  assert.equal(found.some((hit) => hit.conversationId === 'tax'), false, 'a different meaning is not brought');
});

test('vectors that exist are not made again; a changed or new conversation gets its own; a deleted one loses its vector', async () => {
  const calls = [];
  const conversations = [...CONVERSATIONS];
  const { vectors } = await setup({ conversations, fetchImpl: geminiFetch({ calls }) });
  await vectors.enable('gemini');
  await vectors.sync();
  const countTexts = () => calls.filter((call) => call.url.endsWith(':batchEmbedContents')).reduce((sum, call) => sum + call.body.requests.length, 0);
  const first = countTexts();
  await vectors.sync();
  assert.equal(countTexts(), first, 'nothing new, nothing sent');
  conversations.push(conversation('new', 'A new talk about a puppy vaccine', { lastUpdatedAt: '2026-10-02T00:00:00.000Z' }));
  await vectors.sync();
  assert.equal(countTexts(), first + 1);
  conversations.splice(0, 1);
  await vectors.sync();
  const found = await vectors.search('puppy', { limit: 5 });
  assert.equal(found.some((hit) => hit.conversationId === 'dogs'), false, 'the deleted conversation is gone from the vectors');
  assert.equal(found[0].conversationId, 'new');
});

test('the conversation being written is left out, and so are temporary ones', async () => {
  const conversations = [...CONVERSATIONS, conversation('secret', 'my puppy secret', { isTemporary: true })];
  const calls = [];
  const { vectors } = await setup({ conversations, fetchImpl: geminiFetch({ calls }) });
  await vectors.enable('gemini');
  await vectors.sync();
  assert.equal(JSON.stringify(calls).includes('secret'), false, 'a temporary conversation is never sent');
  const found = await vectors.search('puppy', { limit: 5, excludeConversationId: 'dogs' });
  assert.equal(found.some((hit) => hit.conversationId === 'dogs'), false);
});

test('without a key it cannot be turned on; a key that goes away stops it; a provider that fails stops the build with the reason', async () => {
  const none = await setup({ keys: {} });
  assert.equal(none.vectors.provider(), '');
  assert.equal(await none.vectors.enable('gemini'), false);
  assert.equal(none.store.getSettings().vector.enabled, false);

  const failing = await setup({ fetchImpl: async () => new Response('quota', { status: 429 }), options: { pauseMs: 0, batchTexts: 1 } });
  await failing.vectors.enable('gemini');
  await failing.vectors.sync();
  assert.equal(failing.vectors.getState().status, 'error');
  assert.match(failing.vectors.getState().error, /429/);
  assert.equal(failing.vectors.available(), false);
  assert.deepEqual(await failing.history.lookupHybrid('trip', 3), [{ conversationId: 'japan', at: '2026-10-01T00:00:00.000Z', role: 'user', text: 'Planning a trip to Osaka in the spring' }], 'the keywords still work');

  const refused = await setup({ fetchImpl: async () => new Response('bad key', { status: 401 }) });
  await refused.vectors.enable('gemini');
  await refused.vectors.sync();
  assert.equal(refused.vectors.getState().status, 'error');
});

test('turning it off deletes the vectors of this device and sends nothing more', async () => {
  const calls = [];
  const { vectors, store, indexedDB } = await setup({ fetchImpl: geminiFetch({ calls }) });
  await vectors.enable('gemini');
  await vectors.sync();
  assert.equal(vectors.available(), true);
  await vectors.disable();
  assert.equal(store.getSettings().vector.enabled, false);
  assert.equal(store.getSettings().vector.consentAt, null);
  assert.equal(vectors.getState().status, 'off');
  assert.equal(vectors.available(), false);
  const before = calls.length;
  await vectors.sync();
  assert.deepEqual(await vectors.search('puppy'), []);
  assert.equal(calls.length, before);
  const stored = createVectorStore({ backend: createIdbBackend({ indexedDB, name: 'noureon-memory-vectors-tester' }) });
  assert.equal(await stored.load(versionOf('gemini')), 0, 'nothing is left on the device');
});

test('the settings of a person who never agreed do not turn it on, whatever the provider field says', async () => {
  const { vectors } = await setup({ settings: { vector: { enabled: true, provider: 'gemini' } } });
  assert.equal(vectors.isEnabled(), false, 'enabled needs the time of the consent');
});

const { mediaPiecesOf, mediaPiecesOfAll, mediaKindOf, MAX_MEDIA_CHARS } = await import('../../src/app/runtime/memory-notes/media-pieces.js');
const withMedia = (id, parts, extra = {}) => ({ id, lastUpdatedAt: '2026-10-02T00:00:00.000Z', messages: [{ role: 'user', parts, createdAt: '2026-10-02T00:00:00.000Z' }], ...extra });

test('the files of the messages are pieces of their own, with a label, and only the ones that are here and small enough', () => {
  assert.equal(mediaKindOf('image/png'), 'image');
  assert.equal(mediaKindOf('Video/MP4'), 'video');
  assert.equal(mediaKindOf('audio/mpeg'), 'audio');
  assert.equal(mediaKindOf('application/pdf'), 'document');
  assert.equal(mediaKindOf('application/zip'), '');
  const conversation = withMedia('m1', [{ text: 'my receipt from the dog shop' }, { inlineData: { mimeType: 'image/png', data: 'QUJD' } }, { inlineData: { mimeType: 'application/zip', data: 'QUJD' } }, { inlineData: { mimeType: 'image/png', __astraCloudAsset: {} } }, { inlineData: { mimeType: 'video/mp4', data: 'x'.repeat(MAX_MEDIA_CHARS + 1) } }]);
  const pieces = mediaPiecesOf(conversation);
  assert.equal(pieces.length, 1);
  assert.equal(pieces[0].id, 'm1:0:m1');
  assert.match(pieces[0].text, /^\[image: image\/png\] my receipt from the dog shop/);
  assert.equal(pieces[0].media.kind, 'image');
  assert.equal(mediaPiecesOf(withMedia('m1', [{ inlineData: { mimeType: 'image/png', data: 'QUJE' } }]))[0].hash === pieces[0].hash, false, 'another file, another hash');
  assert.deepEqual(mediaPiecesOfAll([conversation, { ...conversation, id: 't', isTemporary: true }, { ...conversation, id: 'd', deletedAt: 'x' }]).map((piece) => piece.conversationId), ['m1']);
});

test('the files go into the vectors one request each, with the consent that names them; one the model cannot read is marked and not tried again', async () => {
  const media = [
    withMedia('photo', [{ text: 'receipt photo' }, { inlineData: { mimeType: 'image/png', data: 'QUJD' } }]),
    withMedia('long', [{ inlineData: { mimeType: 'video/mp4', data: 'VklERU8=' } }])
  ];
  const calls = [];
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url, body });
    if (body.content?.parts?.[0]?.inline_data?.mime_type === 'video/mp4') return new Response('too long', { status: 400 });
    if (body.content?.parts?.[0]?.inline_data) return Response.json({ embedding: { values: embedText('invoice receipt tax') } });
    return Response.json({ embeddings: body.requests.map((request) => ({ values: embedText(request.content.parts[0].text) })) });
  };
  const { vectors, store } = await setup({ conversations: [...CONVERSATIONS, ...media], fetchImpl });
  assert.equal(vectors.estimate().media, 2);
  await vectors.enable('gemini');
  await vectors.sync();
  assert.equal(vectors.getState().status, 'idle');
  assert.equal(calls.filter((call) => call.url.endsWith(':embedContent')).length, 2, 'one request for each file');
  const before = calls.length;
  await vectors.sync();
  assert.equal(calls.length, before, 'the file that failed is not tried again');
  const found = await vectors.search('tax invoice', { limit: 5 });
  assert.ok(found.some((hit) => hit.conversationId === 'photo' && hit.text.startsWith('[image: image/png]')), 'the picture is found by a question about what it shows');
  assert.equal(found.some((hit) => hit.conversationId === 'long'), false);
  assert.equal(store.getSettings().vector.enabled, true);
});
