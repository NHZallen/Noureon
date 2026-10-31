import assert from 'node:assert/strict';
import test from 'node:test';

import { PROTOCOL_VERSION } from '../../server/protocol.js';
import { executeReply } from '../../server/executor.js';
import { validateRunSpec } from '../../server/run-spec.js';
import { createMemoryRecords } from '../../server/memory-records.js';
import { createHistorySearch, readConversations } from '../../server/memory-history.js';
import { scopedMemory } from '../../server/memory-scope.js';
import { createFakeTable } from '../helpers/fake-memory-supabase.js';
import { createNote } from '../../src/app/runtime/memory-notes/notes.js';

// Project memory on the server (docs/superpowers/specs/2026-10-31-projects-design.md, §14): a reply in a chat of a project that keeps its notes for itself reads and writes those only.

const USER = '22222222-2222-4222-8222-222222222222';
const ID_A = '123e4567-e89b-12d3-a456-426614174000';
const ID_B = '223e4567-e89b-12d3-a456-426614174001';
const PROJECT = '323e4567-e89b-12d3-a456-426614174002';
const sse = (...objects) => `${objects.map((object) => `data: ${JSON.stringify(object)}\n\n`).join('')}data: [DONE]\n\n`;
const streamResponse = (body) => new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const content = (text) => ({ choices: [{ delta: { content: text } }] });
const toolCall = (id, name, args) => ({ choices: [{ delta: { tool_calls: [{ index: 0, id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: 'tool_calls' }] });
const MESSAGE = 'We always keep the drafts in the shared folder. Please write a short poem.';

const goodSpec = (memory) => ({
  protocol: PROTOCOL_VERSION,
  clientVersion: '19.1.0',
  conversationId: ID_A,
  assistantMessageId: ID_B,
  sequence: 4,
  model: { provider: 'openrouter', id: 'test/model', info: { name: 'Test', provider: 'openrouter', id: 'openrouter-test', apiId: 'test/model' } },
  request: { history: [], currentMessage: { parts: [{ text: MESSAGE }] }, systemInstruction: 'Be brief.', language: 'en' },
  tools: { webSearch: 'off', searchProvider: 'tavily', advanced: false, memory },
  secrets: { providerKey: 'sk-provider-secret-value' }
});
const rowsOf = (table) => [...table.rows.values()].filter((row) => row.record_key.startsWith('note:'));

test('the scope of the chat travels with the request, and only as the id of a project', () => {
  const ok = validateRunSpec(goodSpec({ canWrite: true, scope: PROJECT, messages: [{ id: 'm1', text: MESSAGE }] }));
  assert.equal(ok.ok, true);
  assert.equal(ok.spec.tools.memory.scope, PROJECT);
  assert.equal('scope' in validateRunSpec(goodSpec({ canWrite: true, messages: [] })).spec.tools.memory, false);
  for (const scope of ['', 5, 'x'.repeat(81)]) assert.equal(validateRunSpec(goodSpec({ canWrite: true, scope, messages: [] })).ok, false, JSON.stringify(scope));
});

test('a wrapped memory shows one scope and tags what is new, leaving the rest of the table alone', async () => {
  const table = createFakeTable();
  const own = createNote({ id: 'own', text: 'The user prefers jasmine tea', keywords: ['tea'] });
  const inside = { ...createNote({ id: 'inside', text: 'The project uses the blue logo', keywords: ['logo'] }), projectId: PROJECT };
  table.write({ user_id: USER, record_key: 'note:own', payload: own });
  table.write({ user_id: USER, record_key: 'note:inside', payload: inside });
  const memory = createMemoryRecords({ db: table.service });
  const project = scopedMemory(memory, PROJECT);
  const state = await project.load(USER, { conversationId: ID_A });
  assert.deepEqual(state.notes.map((note) => note.id), ['inside']);
  const fresh = createNote({ id: 'fresh', text: 'The project keeps drafts in the shared folder', keywords: ['drafts'] });
  await project.saveWrite(USER, { before: state, result: { notes: [...state.notes, fresh] }, conversationId: ID_A });
  assert.equal(rowsOf(table).find((row) => row.record_key === 'note:fresh').payload.projectId, PROJECT);
  assert.deepEqual((await scopedMemory(memory, '').load(USER, {})).notes.map((note) => note.id), ['own'], 'the other chats do not see the project notes');
  assert.deepEqual((await project.load(USER, {})).notes.map((note) => note.id).sort(), ['fresh', 'inside']);
});

test('a reply in a project chat finds the notes of the project only, and what it writes stays in the project', async () => {
  const table = createFakeTable();
  table.write({ user_id: USER, record_key: 'note:own', payload: createNote({ id: 'own', text: 'The user prefers jasmine tea', keywords: ['tea', 'jasmine'] }) });
  table.write({ user_id: USER, record_key: 'note:inside', payload: { ...createNote({ id: 'inside', text: 'The project uses the blue logo', keywords: ['logo', 'blue'] }), projectId: PROJECT } });
  const memory = createMemoryRecords({ db: table.service });
  const requests = [];
  let round = 0;
  const result = await executeReply({
    spec: goodSpec({ canWrite: true, scope: PROJECT, messages: [{ id: 'm1', text: MESSAGE, at: '2026-10-30T09:00:00.000Z' }] }),
    secrets: { providerKey: 'sk-provider-secret-value' },
    userId: USER,
    memory,
    memoryOut: {},
    fetchImpl: async (url, options) => {
      requests.push(JSON.parse(options.body));
      round += 1;
      if (round === 1) return streamResponse(sse(toolCall('c1', 'search_memory', { query: 'logo blue jasmine tea' })));
      if (round === 2) return streamResponse(sse(toolCall('c2', 'memory_write', { op: 'add', text: 'The drafts are kept in the shared folder', quote: 'keep the drafts in the shared folder', keywords: ['drafts', 'folder'] })));
      return streamResponse(sse(content('Done.')));
    }
  });
  assert.equal(result.status, 'done');
  const lookedUp = requests[1].messages.filter((entry) => entry.role === 'tool').map((entry) => entry.content).join('\n');
  assert.match(lookedUp, /blue logo/);
  assert.doesNotMatch(lookedUp, /jasmine tea/, 'the notes of the account are not read in the project');
  const written = rowsOf(table).find((row) => /shared folder/.test(row.payload.text));
  assert.equal(written.payload.projectId, PROJECT, 'the new note belongs to the project');
  assert.equal(rowsOf(table).find((row) => row.record_key === 'note:own').payload.projectId, undefined);
});

test('a reply outside such projects does not read their notes', async () => {
  const table = createFakeTable();
  table.write({ user_id: USER, record_key: 'note:own', payload: createNote({ id: 'own', text: 'The user prefers jasmine tea', keywords: ['tea', 'jasmine'] }) });
  table.write({ user_id: USER, record_key: 'note:inside', payload: { ...createNote({ id: 'inside', text: 'The project uses the blue logo', keywords: ['logo', 'blue'] }), projectId: PROJECT } });
  const memory = createMemoryRecords({ db: table.service });
  const requests = [];
  let round = 0;
  await executeReply({
    spec: goodSpec({ canWrite: true, messages: [{ id: 'm1', text: MESSAGE }] }),
    secrets: { providerKey: 'sk-provider-secret-value' },
    userId: USER,
    memory,
    memoryOut: {},
    fetchImpl: async (url, options) => {
      requests.push(JSON.parse(options.body));
      round += 1;
      return streamResponse(round === 1 ? sse(toolCall('c1', 'search_memory', { query: 'logo blue jasmine tea' })) : sse(content('Done.')));
    }
  });
  const lookedUp = requests[1].messages.filter((entry) => entry.role === 'tool').map((entry) => entry.content).join('\n');
  assert.match(lookedUp, /jasmine tea/);
  assert.doesNotMatch(lookedUp, /blue logo/);
});

test('the look back through past chats stays inside the scope of the chat that asks', async () => {
  const OUT = '44444444-4444-4444-8444-444444444444';
  const IN = '55555555-5555-4555-8555-555555555555';
  const read = {
    conversations: [{ id: OUT, updated_at: '2026-10-02T00:00:00.000Z', folder_id: null }, { id: IN, updated_at: '2026-10-01T00:00:00.000Z', folder_id: PROJECT }],
    project_folders: [PROJECT],
    messages: [
      { conversation_id: OUT, role: 'user', parts: [{ text: 'Our quarterly budget review is on Monday' }], created_at: '2026-10-02T00:00:00.000Z', sequence: 1 },
      { conversation_id: IN, role: 'user', parts: [{ text: 'The quarterly budget of the project is secret' }], created_at: '2026-10-01T00:00:00.000Z', sequence: 1 }
    ]
  };
  const db = { rpc: async () => read };
  assert.deepEqual((await readConversations(db, USER)).map((conversation) => conversation.scopeId), ['', PROJECT]);
  const history = createHistorySearch({ db, logger: { warn() {} } });
  assert.deepEqual((await history.forReply({ userId: USER, scopeId: PROJECT })('quarterly budget', 5)).map((hit) => hit.conversationId), [IN]);
  assert.deepEqual((await history.forReply({ userId: USER })('quarterly budget', 5)).map((hit) => hit.conversationId), [OUT]);
  const wrapped = scopedMemory({ history }, PROJECT);
  assert.deepEqual((await wrapped.history.forReply({ userId: USER })('quarterly budget', 5)).map((hit) => hit.conversationId), [IN], 'the wrapped memory asks with its own scope');
});

test('the server tidies each scope on its own, and says when each was tidied', async () => {
  const { createServerTidy } = await import('../../server/memory-tidy.js');
  const table = createFakeTable();
  const put = (id, text, keywords, extra = {}) => table.write({ user_id: USER, record_key: `note:${id}`, payload: { ...createNote({ id, text, keywords, observedAt: id.includes('old') ? '2026-03-02T00:00:00.000Z' : '2026-08-15T00:00:00.000Z' }), ...extra } });
  put('a-old', 'The user lives in Taipei and works as a nurse', ['taipei', 'nurse', 'lives']);
  put('a-new', 'The user lives in Taichung and works as a nurse', ['taichung', 'nurse', 'lives']);
  put('p-old', 'The project ships on Mondays', ['ships', 'mondays'], { projectId: PROJECT });
  put('p-new', 'The project ships on Fridays', ['ships', 'fridays'], { projectId: PROJECT });
  const memory = createMemoryRecords({ db: table.service });
  const prompts = [];
  const tidy = createServerTidy({
    memory, userId: USER, replyModel: { id: 'm' }, provider: 'gemini',
    models: [{ id: 'm', provider: 'gemini' }, { id: 'm-lite', provider: 'gemini' }],
    makeRunner: () => async ({ prompt }) => { prompts.push(prompt); return JSON.stringify({ ops: [{ type: 'supersede', keep: prompts.length === 1 ? 'a-new' : 'p-new', drop: prompts.length === 1 ? 'a-old' : 'p-old' }] }); },
    now: () => Date.parse('2026-10-31T00:00:00.000Z'), createId: (() => { let n = 0; return () => `e${++n}`; })()
  });
  await tidy();
  assert.equal(prompts.length, 2);
  assert.doesNotMatch(prompts[0].split('The notes:')[1], /ships on/);
  assert.doesNotMatch(prompts[1].split('The notes:')[1], /Taipei|Taichung/);
  const status = (id) => rowsOf(table).find((row) => row.record_key === `note:${id}`).payload.status;
  assert.deepEqual([status('a-old'), status('p-old')], ['archived', 'archived']);
  const settings = (await memory.load(USER, { conversationId: '' })).settings;
  assert.ok(settings.consolidatedAt && settings.consolidatedScopes[PROJECT]);
});
