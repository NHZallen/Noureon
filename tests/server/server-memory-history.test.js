import assert from 'node:assert/strict';
import test from 'node:test';

import { createHistorySearch } from '../../server/memory-history.js';
import { executeReply } from '../../server/executor.js';
import { createMemoryRecords } from '../../server/memory-records.js';
import { validateRunSpec } from '../../server/run-spec.js';
import { PROTOCOL_VERSION } from '../../server/protocol.js';
import { EMBEDDING_PROVIDERS, versionOf } from '../../src/app/runtime/memory-store/embedding-client.js';
import { textHash } from '../../src/app/runtime/memory-notes/vector-math.js';
import { createFakeTable } from '../helpers/fake-memory-supabase.js';

const USER = '11111111-1111-4111-8111-111111111111';
const CONVERSATION = '22222222-2222-4222-8222-222222222222';
const DOGS = '33333333-3333-4333-8333-333333333333';
const TAX = '44444444-4444-4444-8444-444444444444';
const NOW = '2026-10-30T09:00:00.000Z';
const quiet = { warn() {} };
const DIMS = EMBEDDING_PROVIDERS.gemini.dimensions;

const message = (conversationId, sequence, role, text) => ({ conversation_id: conversationId, role, parts: [{ text }], created_at: NOW, sequence });
const HISTORY_READ = {
  conversations: [{ id: DOGS, updated_at: '2026-10-02T00:00:00.000Z' }, { id: TAX, updated_at: '2026-10-01T00:00:00.000Z' }],
  messages: [
    message(DOGS, 1, 'user', 'My puppy has not eaten for two days, the vet was worried'),
    message(DOGS, 2, 'model', 'Sorry to hear that. Try warm food.'),
    message(TAX, 1, 'user', 'Please check my invoice for the quarterly tax filing')
  ]
};
const fakeDb = ({ vectors = [] } = {}) => {
  const calls = [];
  return {
    calls,
    rpc: async (name, args) => { calls.push({ name, args }); return name === 'server_read_history' ? HISTORY_READ : vectors; }
  };
};
const geminiFetch = (calls = []) => async (url, options) => {
  calls.push({ url, headers: options.headers });
  const body = JSON.parse(options.body);
  return Response.json({ embeddings: body.requests.map(() => ({ values: new Array(DIMS).fill(0).map((_, index) => (index === 0 ? 1 : 0)) })) });
};

test('the server looks back through the conversations of the person with the same keyword index, leaving out the one being written', async () => {
  const db = fakeDb();
  const search = createHistorySearch({ db, logger: quiet }).forReply({ userId: USER, conversationId: TAX });
  const found = await search('puppy not eating', 5);
  assert.equal(found[0].conversationId, DOGS);
  assert.match(found[0].text, /puppy/);
  assert.deepEqual(await createHistorySearch({ db, logger: quiet }).forReply({ userId: USER, conversationId: DOGS })('puppy not eating', 5), [], 'the conversation being written is left out');
  assert.equal(db.calls.find((call) => call.name === 'server_read_history').args.p_user_id, USER, 'only the conversations of the person are asked for');
});

test('the conversations are read once for a while, and a database that fails gives an empty answer, not an error', async () => {
  const db = fakeDb();
  const history = createHistorySearch({ db, logger: quiet });
  await history.forReply({ userId: USER })('puppy', 3);
  await history.forReply({ userId: USER })('invoice', 3);
  assert.equal(db.calls.filter((call) => call.name === 'server_read_history').length, 1);
  const broken = createHistorySearch({ db: { rpc: async () => { throw new Error('down'); } }, logger: quiet });
  assert.deepEqual(await broken.forReply({ userId: USER })('puppy', 3), []);
});

test('with the vectors synced and a key for this run, the question is turned into a vector and the nearest pieces are put together with the keywords', async () => {
  const pieceId = `${DOGS}:0:0`;
  const text = 'My puppy has not eaten for two days, the vet was worried';
  const taxId = `${TAX}:0:0`;
  const db = fakeDb({ vectors: [{ piece_id: taxId, hash: textHash('Please check my invoice for the quarterly tax filing'), cosine: 0.9 }, { piece_id: pieceId, hash: textHash(text), cosine: 0.8 }] });
  const calls = [];
  const search = createHistorySearch({ db, fetchImpl: geminiFetch(calls), logger: quiet }).forReply({ userId: USER, conversationId: CONVERSATION, vector: { provider: 'gemini', key: 'g-key-for-this-run' } });
  const found = await search('dog that will not eat', 5);
  assert.equal(calls[0].headers['x-goog-api-key'], 'g-key-for-this-run');
  const rpc = db.calls.find((call) => call.name === 'match_workspace_memory_vectors');
  assert.equal(rpc.args.p_user_id, USER);
  assert.equal(rpc.args.p_model, versionOf('gemini'));
  assert.match(rpc.args.p_query, /^\[1,0,/);
  assert.deepEqual(found.map((hit) => hit.conversationId).sort(), [DOGS, TAX].sort(), 'what only the meaning found is there too');
});

test('a vector made from another text is not used, and a search by meaning that fails leaves the keywords', async () => {
  const stale = fakeDb({ vectors: [{ piece_id: `${TAX}:0:0`, hash: 'something-else', cosine: 0.99 }] });
  const keywordsOnly = await createHistorySearch({ db: stale, fetchImpl: geminiFetch(), logger: quiet }).forReply({ userId: USER, vector: { provider: 'gemini', key: 'k' } })('puppy not eating', 5);
  assert.deepEqual(keywordsOnly.map((hit) => hit.conversationId), [DOGS]);
  const failing = createHistorySearch({ db: fakeDb(), fetchImpl: async () => new Response('no', { status: 500 }), logger: quiet });
  assert.deepEqual((await failing.forReply({ userId: USER, vector: { provider: 'gemini', key: 'k' } })('puppy not eating', 5)).map((hit) => hit.conversationId), [DOGS]);
});

const specWith = (memory, secrets = {}) => ({
  protocol: PROTOCOL_VERSION,
  clientVersion: '18.24.0',
  conversationId: CONVERSATION,
  assistantMessageId: '55555555-5555-4555-8555-555555555555',
  sequence: 4,
  model: { provider: 'openrouter', id: 'test/model', info: { name: 'Test', provider: 'openrouter', id: 'openrouter-test', apiId: 'test/model' } },
  request: { history: [], currentMessage: { parts: [{ text: 'hello' }] }, systemInstruction: '', language: 'en' },
  tools: { webSearch: 'off', searchProvider: 'tavily', advanced: false, memory: { canWrite: false, messages: [], ...memory } },
  secrets: { providerKey: 'sk-provider', ...secrets }
});

test('the request may say that the reply can look back, and by meaning only with a provider and a key for this run', () => {
  const ok = validateRunSpec(specWith({ history: true, vector: { provider: 'gemini' } }, { embeddingKey: 'g-key' }));
  assert.equal(ok.ok, true);
  assert.equal(ok.spec.tools.memory.history, true);
  assert.deepEqual(ok.spec.tools.memory.vector, { provider: 'gemini' });
  assert.equal(ok.spec.secrets.embeddingKey, 'g-key');
  assert.equal('history' in validateRunSpec(specWith({})).spec.tools.memory, false);
  for (const bad of [
    specWith({ history: 'yes' }),
    specWith({ history: true, vector: { provider: 'openai' } }),
    specWith({ history: true, vector: { provider: 'gemini' } }),
    specWith({ vector: { provider: 'gemini' } }, { embeddingKey: 'k' }),
    specWith({ history: true }, { embeddingKey: 'k' })
  ]) assert.equal(validateRunSpec(bad).ok, false, JSON.stringify(bad.tools.memory));
});

const sse = (...chunks) => new Response(chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const content = (text) => ({ choices: [{ delta: { content: text } }] });
const toolCall = (id, name, args) => ({ choices: [{ delta: { tool_calls: [{ index: 0, id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: 'tool_calls' }] });

test('a reply on the server can search the past conversations: the tool takes a scope and the answer carries the pieces', async () => {
  const table = createFakeTable();
  const memory = Object.assign(createMemoryRecords({ db: table.service }), { history: createHistorySearch({ db: fakeDb(), logger: quiet }) });
  const requests = [];
  let round = 0;
  const result = await executeReply({
    spec: validateRunSpec(specWith({ history: true })).spec,
    secrets: { providerKey: 'sk-provider' },
    userId: USER,
    memory,
    memoryOut: {},
    fetchImpl: async (url, options) => {
      requests.push(JSON.parse(options.body));
      round += 1;
      return round === 1 ? sse(toolCall('c1', 'search_memory', { query: 'puppy not eating', scope: 'history' })) : sse(content('Warm food helps.'));
    }
  });
  assert.equal(result.status, 'done');
  const tool = requests[0].tools.find((entry) => (entry.function?.name || entry.name) === 'search_memory');
  assert.ok(JSON.stringify(tool).includes('history'), 'the tool offers the scope');
  assert.match(JSON.stringify(requests[1].messages), /puppy/, 'the piece of the past conversation is in the answer of the tool');
  assert.doesNotMatch(JSON.stringify(requests), /sk-provider-secret/, 'no key is in the text');
});

test('without the flag the tool has no scope and the past conversations are not read', async () => {
  const table = createFakeTable();
  const db = fakeDb();
  const memory = Object.assign(createMemoryRecords({ db: table.service }), { history: createHistorySearch({ db, logger: quiet }) });
  table.write({ user_id: USER, record_key: 'note:n1', payload: { id: 'n1', text: 'The user prefers jasmine tea', keywords: ['tea'], kind: 'preference', status: 'active', observedAt: NOW, createdAt: NOW, updatedAt: NOW } });
  const requests = [];
  await executeReply({ spec: validateRunSpec(specWith({})).spec, secrets: { providerKey: 'sk-provider' }, userId: USER, memory, memoryOut: {}, fetchImpl: async (url, options) => { requests.push(JSON.parse(options.body)); return sse(content('ok')); } });
  const tool = requests[0].tools.find((entry) => (entry.function?.name || entry.name) === 'search_memory');
  assert.equal(JSON.stringify(tool).includes('"history"'), false);
  assert.equal(db.calls.length, 0);
});

test('the notes a reply looked up are marked as used, so the list in the settings no longer says "never used"', async () => {
  const table = createFakeTable();
  const note = { id: 'n1', text: 'The user lives in Banqiao', keywords: ['banqiao', 'home'], kind: 'fact', status: 'active', observedAt: NOW, createdAt: NOW, updatedAt: NOW, recallCount: 0, lastUsedAt: null };
  table.write({ user_id: USER, record_key: 'note:n1', payload: note });
  const memory = createMemoryRecords({ db: table.service });
  let round = 0;
  const memoryOut = {};
  await executeReply({
    spec: validateRunSpec(specWith({})).spec,
    secrets: { providerKey: 'sk-provider' },
    userId: USER,
    memory,
    memoryOut,
    fetchImpl: async () => { round += 1; return round === 1 ? sse(toolCall('c1', 'search_memory', { query: 'where does the user live' })) : sse(content('Banqiao.')); }
  });
  for (let wait = 0; wait < 20 && !(await memory.load(USER)).notes[0].lastUsedAt; wait += 1) await new Promise((resolve) => setImmediate(resolve));
  const saved = (await memory.load(USER)).notes[0];
  assert.ok(saved.lastUsedAt, 'used now');
  assert.equal(saved.recallCount, 1);
  assert.deepEqual(memoryOut.used, ['n1']);
  assert.equal(await memory.markUsed(USER, ['gone']), 0, 'a note that is not there is left alone');
});
