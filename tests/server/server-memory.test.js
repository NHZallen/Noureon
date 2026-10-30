import assert from 'node:assert/strict';
import test from 'node:test';

import { PROTOCOL_VERSION } from '../../server/protocol.js';
import { executeReply } from '../../server/executor.js';
import { validateRunSpec } from '../../server/run-spec.js';
import { createMemoryRecords } from '../../server/memory-records.js';
import { createFakeTable } from '../helpers/fake-memory-supabase.js';
import { createNote } from '../../src/app/runtime/memory-notes/notes.js';

const USER = '22222222-2222-4222-8222-222222222222';
const ID_A = '123e4567-e89b-12d3-a456-426614174000';
const ID_B = '223e4567-e89b-12d3-a456-426614174001';
const sse = (...objects) => `${objects.map((object) => `data: ${JSON.stringify(object)}\n\n`).join('')}data: [DONE]\n\n`;
const streamResponse = (body) => new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const content = (text) => ({ choices: [{ delta: { content: text } }] });
const toolCall = (id, name, args) => ({ choices: [{ delta: { tool_calls: [{ index: 0, id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: 'tool_calls' }] });
const USER_MESSAGE = 'I live in Hsinchu and I work as a nurse. Please write a short poem.';

const goodSpec = (memory = { canWrite: true, messages: [{ id: 'm1', text: USER_MESSAGE, at: '2026-10-30T09:00:00.000Z' }] }, extra = {}) => ({
  protocol: PROTOCOL_VERSION,
  clientVersion: '18.24.0',
  conversationId: ID_A,
  assistantMessageId: ID_B,
  sequence: 4,
  model: { provider: 'openrouter', id: 'test/model', info: { name: 'Test', provider: 'openrouter', id: 'openrouter-test', apiId: 'test/model' } },
  request: { history: [], currentMessage: { parts: [{ text: USER_MESSAGE }] }, systemInstruction: 'Be brief.', language: 'en', ...extra },
  tools: { webSearch: 'off', searchProvider: 'tavily', advanced: false, ...(memory ? { memory } : {}) },
  secrets: { providerKey: 'sk-provider-secret-value' }
});

const rowCount = (table, prefix) => [...table.rows.keys()].filter((key) => key.startsWith(prefix)).length;

test('the request carries what the memory needs: whether it may write, and the person\'s messages', () => {
  const ok = validateRunSpec(goodSpec());
  assert.equal(ok.ok, true);
  assert.equal(ok.spec.tools.memory.canWrite, true);
  assert.equal(ok.spec.tools.memory.messages[0].id, 'm1');
  assert.equal('memory' in validateRunSpec(goodSpec(null)).spec.tools, false, 'nothing when the page offers none');
  for (const bad of [
    'yes',
    { canWrite: 'yes', messages: [] },
    { canWrite: true },
    { canWrite: true, messages: Array.from({ length: 13 }, (_, index) => ({ id: `m${index}`, text: 'x' })) },
    { canWrite: true, messages: [{ id: 'm', text: 'x'.repeat(6001) }] },
    { canWrite: true, messages: [{ text: 'no id' }] }
  ]) {
    const result = validateRunSpec(goodSpec(bad));
    assert.equal(result.ok, false, JSON.stringify(bad).slice(0, 60));
    assert.ok(result.errors.some((error) => /tools\.memory/.test(JSON.stringify(error))));
  }
});

test('a reply on the server writes a note straight into the table, tells the pages, and leaves the ids for the message', async () => {
  const table = createFakeTable();
  const memory = createMemoryRecords({ db: table.service });
  const requests = [];
  const live = [];
  const memoryOut = {};
  let round = 0;
  const result = await executeReply({
    spec: goodSpec(),
    secrets: { providerKey: 'sk-provider-secret-value' },
    userId: USER,
    memory,
    memoryOut,
    onLive: (event) => live.push(event),
    fetchImpl: async (url, options) => {
      requests.push(JSON.parse(options.body));
      round += 1;
      return streamResponse(round === 1
        ? sse(toolCall('call_1', 'memory_write', { op: 'add', text: 'The user lives in Hsinchu', quote: 'I live in Hsinchu', keywords: ['hsinchu', 'home'], kind: 'fact' }))
        : sse(content('Roses are red.')));
    }
  });
  assert.equal(result.status, 'done');
  assert.ok(result.parts[0].text.endsWith('Roses are red.'));
  assert.match(result.parts[0].text, /"tools":\[\{"kind":"memory","key":"memoryWriting"\}\]/, 'the saved reply keeps the row of the memory');
  assert.ok(requests[0].tools.some((tool) => (tool.function?.name || tool.name) === 'memory_write'), 'the tool is offered');
  assert.equal(requests[0].tools.some((tool) => (tool.function?.name || tool.name) === 'search_memory'), false, 'no notes yet, so nothing to look up');
  assert.match(JSON.stringify(requests[1].messages), /Saved/, 'the second request carries the answer of the tool');
  assert.equal(rowCount(table, `${USER}\u0000note:`), 1);
  assert.equal(rowCount(table, `${USER}\u0000event:`), 1);
  const saved = await memory.load(USER, { conversationId: ID_A });
  assert.equal(saved.notes[0].text, 'The user lives in Hsinchu');
  assert.equal(saved.notes[0].source.quote, 'I live in Hsinchu');
  assert.deepEqual(memoryOut.used, []);
  assert.equal(memoryOut.events.length, 1);
  assert.equal(live.find((event) => event.ev?.type === 'memory')?.ev.label, 'Updating memory');
});

test('a write whose words the person never wrote is refused, and nothing is saved', async () => {
  const table = createFakeTable();
  const memory = createMemoryRecords({ db: table.service });
  let round = 0;
  const requests = [];
  await executeReply({
    spec: goodSpec(),
    secrets: { providerKey: 'sk-provider-secret-value' },
    userId: USER,
    memory,
    memoryOut: {},
    fetchImpl: async (url, options) => {
      requests.push(JSON.parse(options.body));
      round += 1;
      return streamResponse(round === 1 ? sse(toolCall('c', 'memory_write', { op: 'add', text: 'The user loves jazz', quote: 'I love jazz' })) : sse(content('ok')));
    }
  });
  assert.match(JSON.stringify(requests[1].messages), /quote_not_found/);
  assert.equal(rowCount(table, `${USER}\u0000note:`), 0);
});

test('the server reads the notes from the table: a search finds them, and the ones looked up are kept for the message', async () => {
  const table = createFakeTable();
  const note = createNote({ id: 'n1', text: 'The user prefers jasmine tea', keywords: ['tea', 'jasmine'], kind: 'preference' });
  table.write({ user_id: USER, record_key: 'note:n1', payload: note });
  const memory = createMemoryRecords({ db: table.service });
  const requests = [];
  const memoryOut = {};
  let round = 0;
  await executeReply({
    spec: goodSpec(undefined, {}),
    secrets: { providerKey: 'sk-provider-secret-value' },
    userId: USER,
    memory,
    memoryOut,
    fetchImpl: async (url, options) => {
      requests.push(JSON.parse(options.body));
      round += 1;
      return streamResponse(round === 1 ? sse(toolCall('c', 'search_memory', { query: 'what tea does the user like' })) : sse(content('Jasmine.')));
    }
  });
  assert.ok(requests[0].tools.some((tool) => (tool.function?.name || tool.name) === 'search_memory'));
  assert.match(JSON.stringify(requests[1].messages), /jasmine tea/);
  assert.deepEqual(memoryOut.used, ['n1']);
});

test('with learning off in the table, or the page not offering it, the model cannot write; with use off it has no memory tools at all', async () => {
  const run = async (settings, memorySpec) => {
    const table = createFakeTable();
    if (settings) table.write({ user_id: USER, record_key: 'meta:settings', payload: settings });
    const memory = createMemoryRecords({ db: table.service });
    const requests = [];
    await executeReply({ spec: goodSpec(memorySpec), secrets: { providerKey: 'sk-provider-secret-value' }, userId: USER, memory, memoryOut: {}, fetchImpl: async (url, options) => { requests.push(JSON.parse(options.body)); return streamResponse(sse(content('hi'))); } });
    return (requests[0].tools || []).map((tool) => tool.function?.name || tool.name);
  };
  const messages = [{ id: 'm1', text: USER_MESSAGE }];
  assert.deepEqual(await run({ learn: false }, { canWrite: true, messages }), []);
  assert.deepEqual(await run(null, { canWrite: false, messages }), []);
  assert.deepEqual(await run({ use: false }, { canWrite: true, messages }), []);
  assert.deepEqual(await run(null, { canWrite: true, messages }), ['memory_write']);
});

test('a table that cannot be read leaves the reply without memory tools, and the reply goes on', async () => {
  const problems = [];
  const memory = { load: async () => { throw new Error('table is missing'); } };
  const requests = [];
  const result = await executeReply({ spec: goodSpec(), secrets: { providerKey: 'sk-provider-secret-value' }, userId: USER, memory, memoryOut: {}, onProblem: (what) => problems.push(what), fetchImpl: async (url, options) => { requests.push(JSON.parse(options.body)); return streamResponse(sse(content('fine'))); } });
  assert.equal(result.parts[0].text, 'fine');
  assert.deepEqual(problems, ['memory_unavailable']);
  assert.equal(requests[0].tools, undefined);
});

const CURATOR_SPEC = (extra = {}) => goodSpec({ canWrite: true, curator: true, messages: [{ id: 'm1', text: USER_MESSAGE, at: '2026-10-30T09:00:00.000Z' }], ...extra });

test('a model with no memory tools is followed by the curator: no tools are offered, and after the reply a small model of the same provider is asked and its notes are kept', async () => {
  const table = createFakeTable();
  const memory = createMemoryRecords({ db: table.service });
  const requests = [];
  const memoryOut = {};
  const curatorAnswer = JSON.stringify({ ops: [{ op: 'add', text: 'The user lives in Hsinchu and works as a nurse', quote: 'I live in Hsinchu and I work as a nurse', kind: 'fact', keywords: ['hsinchu', 'nurse'] }] });
  const result = await executeReply({
    spec: CURATOR_SPEC(),
    secrets: { providerKey: 'sk-provider-secret-value' },
    userId: USER,
    memory,
    memoryOut,
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body);
      requests.push(body);
      return streamResponse(requests.length === 1 ? sse(content('Roses are red.')) : sse(content(curatorAnswer)));
    }
  });
  assert.equal(result.parts[0].text, 'Roses are red.');
  assert.equal(requests[0].tools, undefined, 'the reply itself gets no memory tools');
  assert.equal(typeof memoryOut.afterReply, 'function');
  assert.equal(rowCount(table, `${USER}\u0000note:`), 0, 'nothing is written while the reply is made');
  await memoryOut.afterReply();
  assert.equal(requests.length, 2);
  assert.equal(requests[1].model, 'google/gemini-3.5-flash-lite', 'the cheap model of the same provider');
  assert.match(JSON.stringify(requests[1].messages), /I live in Hsinchu and I work as a nurse/);
  assert.match(JSON.stringify(requests[1].messages), /Roses are red/, 'the start of the reply is there as context');
  const saved = await memory.load(USER, { conversationId: ID_A });
  assert.deepEqual(saved.notes.map((note) => note.text), ['The user lives in Hsinchu and works as a nurse']);
  assert.equal(rowCount(table, `${USER}\u0000event:`), 1);
});

test('the curator does nothing when learning is off in the table, or the page does not allow writing', async () => {
  for (const [settings, spec] of [[{ learn: false }, CURATOR_SPEC()], [null, CURATOR_SPEC({ canWrite: false })], [{ paused: true }, CURATOR_SPEC()]]) {
    const table = createFakeTable();
    if (settings) table.write({ user_id: USER, record_key: 'meta:settings', payload: settings });
    const memory = createMemoryRecords({ db: table.service });
    const requests = [];
    const memoryOut = {};
    await executeReply({ spec, secrets: { providerKey: 'sk-provider-secret-value' }, userId: USER, memory, memoryOut, fetchImpl: async (url, options) => { requests.push(JSON.parse(options.body)); return streamResponse(sse(content('hi'))); } });
    await memoryOut.afterReply?.();
    assert.equal(requests.length, 1, 'the model is asked only for the reply');
    assert.equal(rowCount(table, `${USER}\u0000note:`), 0);
  }
});

test('a curator whose model fails leaves the memory as it was and does not throw', async () => {
  const table = createFakeTable();
  const memory = createMemoryRecords({ db: table.service });
  const memoryOut = {};
  let round = 0;
  await executeReply({ spec: CURATOR_SPEC(), secrets: { providerKey: 'sk-provider-secret-value' }, userId: USER, memory, memoryOut, fetchImpl: async () => { round += 1; return round === 1 ? streamResponse(sse(content('fine'))) : new Response('rate limited', { status: 429 }); } });
  await memoryOut.afterReply();
  assert.equal(rowCount(table, `${USER}\u0000note:`), 0);
});
