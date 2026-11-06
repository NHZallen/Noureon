import assert from 'node:assert/strict';
import test from 'node:test';

import { PROTOCOL_VERSION } from '../../server/protocol.js';
import { validateRunSpec } from '../../server/run-spec.js';
import { createMemoryRecords } from '../../server/memory-records.js';
import { readConversations, createHistorySearch } from '../../server/memory-history.js';
import { scopedMemory } from '../../server/memory-scope.js';
import { sharedProjectMemory } from '../../server/shared-project-memory.js';
import { createFakeTable } from '../helpers/fake-memory-supabase.js';
import { createNote } from '../../src/app/runtime/memory-notes/notes.js';

// The memory of a shared project on the server (server/shared-project-memory.js): the notes are the owner's notes of the project; the settings, cursors and events stay with the person who writes.

const OWNER = '11111111-1111-4111-8111-111111111111';
const MEMBER = '22222222-2222-4222-8222-222222222222';
const PROJECT = '323e4567-e89b-12d3-a456-426614174002';

function setup() {
  const table = createFakeTable();
  const projectNote = { ...createNote({ id: 'shared', text: 'The client likes red', keywords: ['client'] }), projectId: PROJECT };
  const privateNote = createNote({ id: 'private', text: 'Ada drinks jasmine tea', keywords: ['tea'] });
  const memberNote = createNote({ id: 'mine', text: 'Bob likes coffee', keywords: ['coffee'] });
  table.write({ user_id: OWNER, record_key: 'note:shared', payload: projectNote });
  table.write({ user_id: OWNER, record_key: 'note:private', payload: privateNote });
  table.write({ user_id: MEMBER, record_key: 'note:mine', payload: memberNote });
  const memory = createMemoryRecords({ db: table.service });
  const view = scopedMemory(sharedProjectMemory(memory, { ownerId: OWNER, projectId: PROJECT }), PROJECT, PROJECT);
  return { table, memory, view };
}
const keysOf = (table, user) => [...table.rows.values()].filter((row) => row.user_id === user).map((row) => row.record_key).sort();

test('a person in a shared project reads the notes of the project and nothing else: not the owner’s other notes and not their own', async () => {
  const { view } = setup();
  const loaded = await view.load(MEMBER, { conversationId: 'c1' });
  assert.deepEqual(loaded.notes.map((note) => note.id), ['shared']);
  assert.ok(loaded.versions.get('note:shared') >= 1);
});

test('what is written goes into the owner’s project notes (tagged with the project); the events and the cursor stay with the writer', async () => {
  const { table, view } = setup();
  const before = await view.load(MEMBER, { conversationId: 'c1' });
  const fresh = createNote({ id: 'fresh', text: 'The deadline is Friday', keywords: ['deadline'] });
  const changed = { ...before.notes[0], text: 'The client likes dark red' };
  await view.saveWrite(MEMBER, { before, result: { notes: [changed, fresh], event: { id: 'e1', kind: 'add', noteIds: ['fresh'], at: new Date().toISOString() }, opId: 'op-1' }, conversationId: 'c1' });
  const rows = [...table.rows.values()];
  const owned = rows.filter((row) => row.user_id === OWNER && row.record_key.startsWith('note:'));
  assert.deepEqual(owned.map((row) => row.record_key).sort(), ['note:fresh', 'note:private', 'note:shared']);
  assert.equal(owned.find((row) => row.record_key === 'note:fresh').payload.projectId, PROJECT);
  assert.equal(owned.find((row) => row.record_key === 'note:shared').payload.text, 'The client likes dark red');
  assert.equal(owned.find((row) => row.record_key === 'note:private').payload.text, 'Ada drinks jasmine tea');
  // the writer's own rows: the event and the cursor, and their own note as it was; nothing of the project notes
  assert.deepEqual(keysOf(table, MEMBER), ['cursor:c1', 'event:e1', 'note:mine']);
  assert.deepEqual(keysOf(table, OWNER).filter((key) => key.startsWith('event:') || key.startsWith('cursor:')), []);
});

test('the notes a reply looked up count as used in the owner’s rows', async () => {
  const { table, memory } = setup();
  const shared = sharedProjectMemory(memory, { ownerId: OWNER, projectId: PROJECT });
  assert.equal(await shared.markUsed(MEMBER, ['shared']), 1);
  assert.equal([...table.rows.values()].find((row) => row.user_id === OWNER && row.record_key === 'note:shared').payload.recallCount, 1);
});

test('the memory asks the database who the person is in the project', async () => {
  const calls = [];
  const memory = createMemoryRecords({ db: { ...createFakeTable().service, rpc: async (name, params) => { calls.push([name, params]); return params.p_user_id === MEMBER ? { owner_id: OWNER, role: 'editor' } : null; } } });
  assert.deepEqual(await memory.projectAccess(MEMBER, PROJECT), { owner_id: OWNER, role: 'editor' });
  assert.equal(await memory.projectAccess(OWNER + 'x', PROJECT), null);
  assert.equal(calls[0][0], 'server_project_memory_access');
});

test('in a shared project the search of the past conversations reads the conversations of all its people', async () => {
  const calls = [];
  const db = { rpc: async (name, params) => {
    calls.push(name);
    return name === 'server_read_project_history'
      ? { conversations: [{ id: 'c-own', updated_at: '2026-11-01T00:00:00Z', folder_id: PROJECT }, { id: 'c-bob', updated_at: '2026-11-02T00:00:00Z', folder_id: PROJECT }], project_folders: [PROJECT], messages: [
        { conversation_id: 'c-own', role: 'user', created_at: '2026-11-01T00:00:00Z', sequence: 0, parts: [{ text: 'the harbour redevelopment budget' }] },
        { conversation_id: 'c-bob', role: 'user', created_at: '2026-11-02T00:00:00Z', sequence: 0, parts: [{ text: 'the airport terminal schedule' }] }] }
      : { conversations: [], project_folders: [], messages: [] };
  } };
  const conversations = await readConversations(db, MEMBER, undefined, PROJECT);
  assert.deepEqual(conversations.map((entry) => [entry.id, entry.scopeId, entry.projectId]), [['c-own', PROJECT, PROJECT], ['c-bob', PROJECT, PROJECT]]);
  const search = createHistorySearch({ db }).forReply({ userId: MEMBER, conversationId: 'now', scopeId: PROJECT, projectId: PROJECT, sharedProject: PROJECT });
  const hits = await search('airport terminal', 5);
  assert.deepEqual(hits.map((hit) => hit.conversationId), ['c-bob']);
  assert.ok(calls.every((name) => name === 'server_read_project_history'));
});

test('the request says that the chat was made in a shared project, only as the id of one', () => {
  const spec = (memory) => ({
    protocol: PROTOCOL_VERSION, clientVersion: '19.4.0', conversationId: '123e4567-e89b-12d3-a456-426614174000', assistantMessageId: '223e4567-e89b-12d3-a456-426614174001', sequence: 4,
    model: { provider: 'openrouter', id: 'test/model', info: { name: 'Test', provider: 'openrouter', id: 'openrouter-test', apiId: 'test/model' } },
    request: { history: [], currentMessage: { parts: [{ text: 'hi' }] }, systemInstruction: 'Be brief.', language: 'en' },
    tools: { webSearch: 'off', searchProvider: 'tavily', advanced: false, memory }, secrets: { providerKey: 'sk-provider-secret-value' }
  });
  const ok = validateRunSpec(spec({ canWrite: true, scope: PROJECT, sharedProject: PROJECT.toUpperCase(), messages: [] }));
  assert.equal(ok.ok, true);
  assert.equal(ok.spec.tools.memory.sharedProject, PROJECT);
  assert.equal('sharedProject' in validateRunSpec(spec({ canWrite: true, messages: [] })).spec.tools.memory, false);
  for (const sharedProject of ['', 'not-an-id', 5]) assert.equal(validateRunSpec(spec({ canWrite: true, sharedProject, messages: [] })).ok, false, JSON.stringify(sharedProject));
});

import { executeReply } from '../../server/executor.js';

const sse = (...objects) => `${objects.map((object) => `data: ${JSON.stringify(object)}\n\n`).join('')}data: [DONE]\n\n`;
const streamResponse = (body) => new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const content = (text) => ({ choices: [{ delta: { content: text } }] });
const toolCall = (id, name, args) => ({ choices: [{ delta: { tool_calls: [{ index: 0, id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: 'tool_calls' }] });
const MESSAGE = 'We always keep the drafts in the shared folder. Please write a short poem.';
const replySpec = (memory) => ({
  protocol: PROTOCOL_VERSION, clientVersion: '19.4.0', conversationId: '123e4567-e89b-12d3-a456-426614174000', assistantMessageId: '223e4567-e89b-12d3-a456-426614174001', sequence: 4,
  model: { provider: 'openrouter', id: 'test/model', info: { name: 'Test', provider: 'openrouter', id: 'openrouter-test', apiId: 'test/model' } },
  request: { history: [], currentMessage: { parts: [{ text: MESSAGE }] }, systemInstruction: 'Be brief.', language: 'en' },
  tools: { webSearch: 'off', searchProvider: 'tavily', advanced: false, memory }, secrets: { providerKey: 'sk-provider-secret-value' }
});

async function reply(role) {
  const { table, memory } = setup();
  const checked = [];
  const withAccess = { ...memory, projectAccess: async (userId, projectId) => { checked.push([userId, projectId]); return role ? { owner_id: OWNER, role } : null; } };
  const requests = [];
  let round = 0;
  await executeReply({
    spec: replySpec({ canWrite: true, scope: PROJECT, sharedProject: PROJECT, messages: [{ id: 'm1', text: MESSAGE, at: '2026-11-06T09:00:00.000Z' }] }),
    secrets: { providerKey: 'sk-provider-secret-value' }, userId: MEMBER, memory: withAccess, memoryOut: {},
    fetchImpl: async (url, options) => {
      requests.push(JSON.parse(options.body));
      round += 1;
      if (!role) return streamResponse(sse(content('Done.')));
      if (round === 1) return streamResponse(sse(toolCall('c1', 'search_memory', { query: 'client red tea coffee' })));
      if (round === 2) return streamResponse(sse(toolCall('c2', 'memory_write', { op: 'add', text: 'The drafts are kept in the shared folder', quote: 'keep the drafts in the shared folder', keywords: ['drafts', 'folder'] })));
      return streamResponse(sse(content('Done.')));
    }
  });
  const lookedUp = requests[1]?.messages.filter((entry) => entry.role === 'tool').map((entry) => entry.content).join('\n') || '';
  const owned = [...table.rows.values()].filter((row) => row.user_id === OWNER && row.record_key.startsWith('note:'));
  return { table, checked, lookedUp, owned, requests };
}

test('an editor’s reply reads the project notes (not the owner’s other notes, not the editor’s own) and its new note lands in the owner’s project notes', async () => {
  const run = await reply('editor');
  assert.deepEqual(run.checked, [[MEMBER, PROJECT]]);
  assert.match(run.lookedUp, /likes red/);
  assert.doesNotMatch(run.lookedUp, /jasmine tea/);
  assert.doesNotMatch(run.lookedUp, /coffee/);
  const written = run.owned.find((row) => /shared folder/.test(row.payload.text));
  assert.equal(written?.payload.projectId, PROJECT);
});

test('a chat member’s reply reads the project notes but writes nothing', async () => {
  const run = await reply('chat');
  assert.match(run.lookedUp, /likes red/);
  assert.equal(run.owned.some((row) => /shared folder/.test(row.payload.text)), false);
  assert.equal([...run.table.rows.values()].some((row) => row.user_id === MEMBER && /shared folder/.test(JSON.stringify(row.payload))), false);
});

test('a person who is not in the project gets no memory from it', async () => {
  const run = await reply(null);
  assert.equal(run.requests.length, 1, 'no memory tools were offered, so the model answered at once');
  assert.ok(!(run.requests[0].tools || []).some((tool) => /memory/.test(JSON.stringify(tool))));
  assert.equal(run.owned.length, 2);
});
