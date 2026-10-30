import assert from 'node:assert/strict';
import test from 'node:test';

import { PROTOCOL_VERSION } from '../../server/protocol.js';
import { executeReply } from '../../server/executor.js';
import { createMemoryRecords } from '../../server/memory-records.js';
import { createFakeTable } from '../helpers/fake-memory-supabase.js';
import { createNote } from '../../src/app/runtime/memory-notes/notes.js';

const USER = '22222222-2222-4222-8222-222222222222';
const ID_A = '123e4567-e89b-12d3-a456-426614174000';
const ID_B = '223e4567-e89b-12d3-a456-426614174001';
const NOW = '2026-10-30T12:00:00.000Z';
const sse = (...objects) => `${objects.map((object) => `data: ${JSON.stringify(object)}\n\n`).join('')}data: [DONE]\n\n`;
const streamResponse = (body) => new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const content = (text) => ({ choices: [{ delta: { content: text } }] });
const make = (id, text, keywords, observedAt) => createNote({ id, text, keywords, kind: 'fact', source: { conversationId: 'c1', messageIds: [], quote: 'q', seen: [] }, observedAt, now: () => '2026-10-01T00:00:00.000Z' });
const supersede = JSON.stringify({ ops: [{ type: 'supersede', keep: 'taichung', drop: 'taipei' }] });

const spec = (memory = { canWrite: true, messages: [{ id: 'm1', text: 'Please write a short poem about the sea.', at: '2026-10-30T09:00:00.000Z' }] }) => ({
  protocol: PROTOCOL_VERSION,
  clientVersion: '18.24.0',
  conversationId: ID_A,
  assistantMessageId: ID_B,
  sequence: 4,
  model: { provider: 'openrouter', id: 'test/model', info: { name: 'Test', provider: 'openrouter', id: 'openrouter-test', apiId: 'test/model' } },
  request: { history: [], currentMessage: { parts: [{ text: 'Please write a short poem about the sea.' }] }, systemInstruction: 'Be brief.', language: 'en' },
  tools: { webSearch: 'off', searchProvider: 'tavily', advanced: false, memory },
  secrets: { providerKey: 'sk-provider-secret-value' }
});

const seed = (table) => {
  for (const note of [make('taipei', 'The user lives in Taipei and works as a nurse', ['taipei', 'nurse', 'lives'], '2026-03-02T00:00:00.000Z'), make('taichung', 'The user lives in Taichung and works as a nurse', ['taichung', 'nurse', 'lives'], '2026-08-15T00:00:00.000Z')]) {
    table.write({ user_id: USER, record_key: `note:${note.id}`, payload: note });
  }
};

test('the settings of the table are saved without losing the others, and old events are taken away', async () => {
  const table = createFakeTable({ now: () => NOW });
  const records = createMemoryRecords({ db: table.service, now: () => NOW });
  table.write({ user_id: USER, record_key: 'meta:settings', payload: { learn: false, curatorModelId: 'gemini-3.5-flash-lite' } });
  const saved = await records.saveSettings(USER, { consolidatedAt: NOW });
  assert.equal(saved.consolidatedAt, NOW);
  assert.equal(saved.learn, false, 'the other settings stay');
  assert.equal(saved.curatorModelId, 'gemini-3.5-flash-lite');
  assert.equal((await records.load(USER)).settings.consolidatedAt, NOW);
  // A person with no settings row yet gets one.
  const empty = createFakeTable({ now: () => NOW });
  const fresh = createMemoryRecords({ db: empty.service, now: () => NOW });
  assert.equal((await fresh.saveSettings(USER, { consolidatedAt: NOW })).consolidatedAt, NOW);
  // Events: the old one goes, the recent one stays.
  empty.write({ user_id: USER, record_key: 'event:old', payload: { id: 'old', at: '2026-08-01T00:00:00.000Z', ops: [] } });
  empty.write({ user_id: USER, record_key: 'event:new', payload: { id: 'new', at: '2026-10-29T00:00:00.000Z', ops: [] } });
  assert.equal(await fresh.pruneEvents(USER), 1);
  const remaining = [...empty.rows.values()].filter((row) => row.record_key.startsWith('event:') && !row.deleted_at).map((row) => row.record_key);
  assert.deepEqual(remaining, ['event:new']);
});

test('after a reply the server tidies the notes if that is due: the older note is archived, the time is kept, and the event is there to be undone', async () => {
  const table = createFakeTable({ now: () => NOW });
  seed(table);
  const memory = createMemoryRecords({ db: table.service, now: () => NOW });
  const memoryOut = {};
  const requests = [];
  await executeReply({
    spec: spec(),
    secrets: { providerKey: 'sk-provider-secret-value' },
    userId: USER,
    memory,
    memoryOut,
    now: () => Date.parse(NOW),
    fetchImpl: async (url, options) => {
      requests.push(JSON.parse(options.body));
      return streamResponse(requests.length === 1 ? sse(content('The sea is wide.')) : sse(content(supersede)));
    }
  });
  assert.equal(requests.length, 1, 'nothing is tidied while the reply is made');
  assert.equal(typeof memoryOut.afterReply, 'function');
  await memoryOut.afterReply();
  assert.equal(requests.length, 2);
  assert.equal(requests[1].model, 'google/gemini-3.5-flash-lite', 'the cheap model of the reply\'s provider');
  assert.match(JSON.stringify(requests[1].messages), /Taichung/);
  const after = await memory.load(USER);
  assert.equal(after.notes.find((note) => note.id === 'taipei').status, 'archived');
  assert.equal(after.notes.find((note) => note.id === 'taipei').supersededBy, 'taichung');
  assert.equal(after.settings.consolidatedAt, NOW);
  const events = [...table.rows.values()].filter((row) => row.record_key.startsWith('event:'));
  assert.equal(events.length, 1);
  assert.equal(events[0].payload.who, 'consolidation');
  assert.equal(events[0].payload.ops[0].before.status, 'active');
  // The next reply finds it done: no second tidy.
  const again = {};
  await executeReply({ spec: spec(), secrets: { providerKey: 'sk-provider-secret-value' }, userId: USER, memory, memoryOut: again, now: () => Date.parse(NOW), fetchImpl: async (url, options) => { requests.push(JSON.parse(options.body)); return streamResponse(sse(content('Again.'))); } });
  await again.afterReply();
  assert.equal(requests.length, 3, 'only the reply was asked');
});

test('the server does not tidy when the memory is paused or not in use, and a failing model leaves the first layer done', async () => {
  for (const settings of [{ paused: true }, { use: false }]) {
    const table = createFakeTable({ now: () => NOW });
    seed(table);
    table.write({ user_id: USER, record_key: 'meta:settings', payload: settings });
    const memoryOut = {};
    const requests = [];
    await executeReply({ spec: spec(), secrets: { providerKey: 'sk-provider-secret-value' }, userId: USER, memory: createMemoryRecords({ db: table.service, now: () => NOW }), memoryOut, now: () => Date.parse(NOW), fetchImpl: async (url, options) => { requests.push(1); return streamResponse(sse(content('ok'))); } });
    await memoryOut.afterReply?.();
    assert.equal(requests.length, 1);
    assert.equal([...table.rows.values()].filter((row) => row.record_key.startsWith('event:')).length, 0);
  }
  const table = createFakeTable({ now: () => NOW });
  seed(table);
  const memory = createMemoryRecords({ db: table.service, now: () => NOW });
  const memoryOut = {};
  let round = 0;
  await executeReply({ spec: spec(), secrets: { providerKey: 'sk-provider-secret-value' }, userId: USER, memory, memoryOut, now: () => Date.parse(NOW), fetchImpl: async () => { round += 1; return round === 1 ? streamResponse(sse(content('ok'))) : new Response('rate limited', { status: 429 }); } });
  await memoryOut.afterReply();
  assert.equal((await memory.load(USER)).notes.find((note) => note.id === 'taipei').status, 'active');
  assert.equal((await memory.load(USER)).settings.consolidatedAt, NOW, 'the tidy ran (its first layer); the claim is kept');
});
