import assert from 'node:assert/strict';
import test from 'node:test';

import { PROTOCOL_VERSION } from '../../server/protocol.js';
import { executeReply } from '../../server/executor.js';
import { validateRunSpec } from '../../server/run-spec.js';
import { createProjectVectorSearch } from '../../server/project-vectors.js';
import { EMBEDDING_PROVIDERS, versionOf } from '../../src/app/runtime/memory-store/embedding-client.js';
import { projectPassages } from '../../src/data/project-files-tool.js';
import { textHash } from '../../src/app/runtime/memory-notes/vector-math.js';

// The search by meaning over the files of a project on the server (docs/superpowers/specs/2026-11-01-project-files-multimodal-design.md, R1).

const USER = '22222222-2222-4222-8222-222222222222';
const ID_A = '123e4567-e89b-12d3-a456-426614174000';
const ID_B = '223e4567-e89b-12d3-a456-426614174001';
const DIMS = EMBEDDING_PROVIDERS.gemini.dimensions;
const NOTES = 'Der Plan fuer das Buero in Hsinchu: Eroeffnung im Maerz, zehn Leute.';
const sse = (...objects) => `${objects.map((object) => `data: ${JSON.stringify(object)}\n\n`).join('')}data: [DONE]\n\n`;
const streamResponse = (body) => new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const content = (text) => ({ choices: [{ delta: { content: text } }] });
const toolCall = (id, name, args) => ({ choices: [{ delta: { tool_calls: [{ index: 0, id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: 'tool_calls' }] });

const spec = (projectFiles, secrets = { providerKey: 'sk-provider-secret-value', embeddingKey: 'g-key' }, memory = null) => ({
  protocol: PROTOCOL_VERSION,
  clientVersion: '19.1.0',
  conversationId: ID_A,
  assistantMessageId: ID_B,
  sequence: 4,
  model: { provider: 'openrouter', id: 'test/model', info: { name: 'Test', provider: 'openrouter', id: 'openrouter-test', apiId: 'test/model' } },
  request: { history: [], currentMessage: { parts: [{ text: 'When does the office open?' }] }, systemInstruction: 'Be brief.', language: 'en' },
  tools: { webSearch: 'off', searchProvider: 'tavily', advanced: false, ...(projectFiles ? { projectFiles } : {}), ...(memory ? { memory } : {}) },
  secrets
});
const FILES = { vector: { provider: 'gemini' }, entries: [{ id: 's1', name: 'plan.md', size: 80, text: NOTES }] };

test('the request may ask for a search by meaning over the files, with a key for this reply; the key goes only with that, and the provider must be one the page knows', () => {
  const ok = validateRunSpec(spec(FILES));
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.spec.tools.projectFiles.vector, { provider: 'gemini' });
  assert.equal(ok.spec.secrets.embeddingKey, 'g-key');
  assert.equal('vector' in validateRunSpec(spec({ entries: FILES.entries }, { providerKey: 'sk-provider-secret-value' })).spec.tools.projectFiles, false);
  assert.equal(validateRunSpec(spec(FILES, { providerKey: 'sk-provider-secret-value' })).ok, false, 'a search by meaning needs the key');
  const stray = validateRunSpec(spec({ entries: FILES.entries }));
  assert.equal(stray.ok, false, 'a key without a search by meaning is refused');
  assert.ok(stray.errors.some((error) => /embeddingKey/.test(JSON.stringify(error))));
  assert.equal(validateRunSpec(spec({ ...FILES, vector: { provider: 'nobody' } })).ok, false);
  assert.equal(validateRunSpec(spec({ ...FILES, vector: 'gemini' })).ok, false);
  // The search over the past conversations keeps working with the key as before.
  assert.equal(validateRunSpec(spec(null, { providerKey: 'sk-provider-secret-value', embeddingKey: 'g-key' }, { canWrite: false, history: true, vector: { provider: 'gemini' }, messages: [] })).ok, true);
});

test('the question is turned into a vector with the key of this reply and the database function gives the nearest passages of the sources asked about', async () => {
  const calls = [];
  const rpc = [];
  const db = { rpc: async (name, params) => { rpc.push({ name, params }); return [{ piece_id: 'src:s1:0', hash: 'h1', cosine: 0.83 }, { piece_id: 'src:s1:1', hash: 'h2', cosine: 0.6 }]; } };
  const fetchImpl = async (url, options) => {
    calls.push({ url, key: options.headers['x-goog-api-key'], body: JSON.parse(options.body) });
    return Response.json({ embeddings: [{ values: new Array(DIMS).fill(0.1) }] });
  };
  const search = createProjectVectorSearch({ db, fetchImpl, logger: { warn() {} } }).forReply({ userId: USER, vector: { provider: 'gemini', key: 'g-key' } });
  const hits = await search('office opening', { fileIds: ['s1', 's2', 's1'], limit: 12 });
  assert.deepEqual(hits, [{ id: 'src:s1:0', hash: 'h1', cosine: 0.83 }, { id: 'src:s1:1', hash: 'h2', cosine: 0.6 }]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].key, 'g-key');
  assert.match(calls[0].body.requests[0].content.parts[0].text, /office opening/);
  assert.equal(rpc[0].name, 'match_project_vectors');
  assert.equal(rpc[0].params.p_user_id, USER);
  assert.equal(rpc[0].params.p_model, versionOf('gemini'));
  assert.deepEqual(rpc[0].params.p_source_ids, ['s1', 's2'], 'each source once');
  assert.equal(rpc[0].params.p_limit, 12);
  assert.match(rpc[0].params.p_query, /^\[0\.03608\d*,/, "a unit vector of 768 equal numbers");
});

test('it never throws and asks nothing when there is nothing to ask: no key, no sources, an empty question, a provider that fails, a database that fails', async () => {
  const rpc = [];
  const db = { rpc: async (name) => { rpc.push(name); return []; } };
  const fetchImpl = async () => Response.json({ embeddings: [{ values: new Array(DIMS).fill(0.1) }] });
  const make = (extra = {}) => createProjectVectorSearch({ db, fetchImpl, logger: { warn() {} }, ...extra });
  assert.deepEqual(await make().forReply({ userId: USER, vector: { provider: 'gemini', key: '' } })('x', { fileIds: ['s1'] }), []);
  assert.deepEqual(await make().forReply({ userId: USER, vector: { provider: 'gemini', key: 'k' } })('x', { fileIds: [] }), []);
  assert.deepEqual(await make().forReply({ userId: USER, vector: { provider: 'gemini', key: 'k' } })('   ', { fileIds: ['s1'] }), []);
  assert.deepEqual(await make().forReply({ userId: '', vector: { provider: 'gemini', key: 'k' } })('x', { fileIds: ['s1'] }), []);
  assert.deepEqual(rpc, [], 'nothing was asked of the database');
  assert.deepEqual(await make({ fetchImpl: async () => new Response('quota', { status: 429 }) }).forReply({ userId: USER, vector: { provider: 'gemini', key: 'k' } })('x', { fileIds: ['s1'] }), []);
  const broken = createProjectVectorSearch({ db: { rpc: async () => { throw new Error('database down'); } }, fetchImpl, logger: { warn() {} } });
  assert.deepEqual(await broken.forReply({ userId: USER, vector: { provider: 'gemini', key: 'k' } })('x', { fileIds: ['s1'] }), []);
});

test('on the server the search of the model puts what the keywords find and what the vectors find together', async () => {
  const [passage] = projectPassages([{ id: 's1', name: 'plan.md', text: NOTES }]);
  const asked = [];
  const memory = { projectVectors: { forReply: ({ userId, vector }) => async (query, options) => { asked.push({ userId, vector, query, options }); return [{ id: passage.id, hash: textHash(passage.text), cosine: 0.9 }]; } } };
  const requests = [];
  let round = 0;
  const result = await executeReply({
    spec: spec(FILES),
    secrets: { providerKey: 'sk-provider-secret-value', embeddingKey: 'g-key' },
    userId: USER,
    memory,
    fetchImpl: async (url, options) => {
      requests.push(JSON.parse(options.body));
      round += 1;
      if (round === 1) return streamResponse(sse(toolCall('c1', 'search_project_files', { query: 'zzzz qqqq' })));
      return streamResponse(sse(content('In March.')));
    }
  });
  assert.equal(result.status, 'done');
  assert.deepEqual(asked.map((entry) => [entry.userId, entry.vector, entry.query]), [[USER, { provider: 'gemini', key: 'g-key' }, 'zzzz qqqq']]);
  assert.deepEqual(asked[0].options.fileIds, ['s1']);
  const answer = requests[1].messages.filter((entry) => entry.role === 'tool').map((entry) => entry.content).join('\n');
  assert.match(answer, /"search":"keywords and meaning"/);
  assert.match(answer, /Hsinchu/);
});

test('without the key or the vectors of the person the search of the model is by keywords alone', async () => {
  const requests = [];
  let round = 0;
  await executeReply({
    spec: spec({ entries: FILES.entries }, { providerKey: 'sk-provider-secret-value' }),
    secrets: { providerKey: 'sk-provider-secret-value' },
    userId: USER,
    memory: { projectVectors: { forReply: () => { throw new Error('must not be asked'); } } },
    fetchImpl: async (url, options) => {
      requests.push(JSON.parse(options.body));
      round += 1;
      if (round === 1) return streamResponse(sse(toolCall('c1', 'search_project_files', { query: 'Hsinchu Buero' })));
      return streamResponse(sse(content('In March.')));
    }
  });
  assert.match(requests[1].messages.filter((entry) => entry.role === 'tool').map((entry) => entry.content).join('\n'), /"search":"keywords"/);
});

test('the request may name the pictures of the project (with the hash of the file and whether it came with the message), and the search of the model on the server names the ones that match', async () => {
  const HASH_A = 'a'.repeat(64);
  const media = [{ id: 'p1', name: 'tax-receipt.png', size: 90, fileHash: HASH_A, attached: false }];
  const ok = validateRunSpec(spec({ entries: FILES.entries, media }, { providerKey: 'sk-provider-secret-value' }));
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.spec.tools.projectFiles.media, media);
  for (const bad of [[{ ...media[0], fileHash: 'nope' }], [{ ...media[0], attached: 'yes' }], [{ ...media[0], name: '' }], 'p1', Array.from({ length: 60 }, (_, n) => ({ ...media[0], id: `m${n}` }))]) {
    assert.equal(validateRunSpec(spec({ entries: FILES.entries, media: bad }, { providerKey: 'sk-provider-secret-value' })).ok, false, JSON.stringify(bad).slice(0, 60));
  }
  const requests = [];
  let round = 0;
  await executeReply({
    spec: spec({ entries: FILES.entries, media }, { providerKey: 'sk-provider-secret-value' }),
    secrets: { providerKey: 'sk-provider-secret-value' },
    userId: USER,
    memory: null,
    fetchImpl: async (url, options) => {
      requests.push(JSON.parse(options.body));
      round += 1;
      if (round === 1) return streamResponse(sse(toolCall('c1', 'search_project_files', { query: 'receipt' })));
      return streamResponse(sse(content('Done.')));
    }
  });
  const answer = requests[1].messages.filter((entry) => entry.role === 'tool').map((entry) => entry.content).join('\n');
  assert.match(answer, /"pictures":\[\{"file":"tax-receipt.png","in_this_message":false\}\]/);
});
