import assert from 'node:assert/strict';
import test from 'node:test';

import { createRebuildJobs } from '../../server/memory-rebuild.js';
import { createMemoryRecords } from '../../server/memory-records.js';
import { CURATOR_DEFAULTS } from '../../src/data/memory-curator.js';
import { MODELS } from '../../src/app/runtime/shell/model-registry.js';
import { createFakeTable } from '../helpers/fake-memory-supabase.js';

const USER = '11111111-1111-4111-8111-111111111111';
const C1 = '22222222-2222-4222-8222-222222222222';
const C2 = '33333333-3333-4333-8333-333333333333';
const KEY = 'sk-rebuild-key-that-must-not-leak';
const MODEL_ID = CURATOR_DEFAULTS.openrouter;
const sse = (...objects) => `${objects.map((object) => `data: ${JSON.stringify(object)}\n\n`).join('')}data: [DONE]\n\n`;
const answer = (text) => new Response(sse({ choices: [{ delta: { content: text } }] }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const message = (conversationId, sequence, text) => ({ conversation_id: conversationId, role: 'user', parts: [{ text }], created_at: `2026-10-0${sequence}T00:00:00.000Z`, sequence });
const quiet = [];

function setup({ conversations = [C1, C2], texts = { [C1]: 'I live in Hsinchu and I work as a nurse', [C2]: 'My cat is called Momo and she is three years old' }, settings = null, fetchImpl } = {}) {
  const table = createFakeTable();
  if (settings) table.write({ user_id: USER, record_key: 'meta:settings', payload: settings });
  const memory = createMemoryRecords({ db: table.service });
  const db = { rpc: async () => ({ conversations: conversations.map((id, index) => ({ id, updated_at: `2026-10-0${index + 1}T00:00:00.000Z` })), messages: conversations.map((id, index) => message(id, index + 1, texts[id])) }) };
  const requests = [];
  const answers = { 'I live in Hsinchu and I work as a nurse': { op: 'add', text: 'The user lives in Hsinchu and works as a nurse', quote: 'I live in Hsinchu and I work as a nurse', kind: 'fact', keywords: ['hsinchu', 'nurse'] }, 'My cat is called Momo and she is three years old': { op: 'add', text: 'The user has a cat called Momo', quote: 'My cat is called Momo', kind: 'relationship', keywords: ['cat', 'momo'] } };
  const model = fetchImpl || (async (url, options) => {
    const body = JSON.parse(options.body);
    requests.push({ url, headers: options.headers, body });
    const asked = JSON.stringify(body.messages);
    const key = Object.keys(answers).find((text) => asked.includes(text));
    return answer(JSON.stringify({ ops: key ? [answers[key]] : [] }));
  });
  const jobs = createRebuildJobs({ memory, db, fetchImpl: model, log: (event, data) => quiet.push([event, data]) });
  return { table, memory, jobs, requests };
}

const stateOf = async (memory) => (await memory.load(USER, { conversationId: '' })).settings;

test('the server reads the old conversations with the key it was given, adds the notes, and tells how far it is in the settings of the person', async () => {
  const { memory, jobs, requests } = setup();
  assert.deepEqual(await jobs.start({ userId: USER, modelId: MODEL_ID, key: KEY, language: 'en' }), { ok: true });
  assert.equal(jobs.isRunning(USER), true);
  await jobs.finished(USER);
  const settings = await stateOf(memory);
  assert.equal(settings.rebuildJob.status, 'done');
  assert.deepEqual([settings.rebuildJob.done, settings.rebuildJob.total, settings.rebuildJob.added], [2, 2, 2]);
  assert.ok(settings.rebuiltAt, 'the memory counts as built');
  const loaded = await memory.load(USER, { conversationId: C1 });
  assert.deepEqual(loaded.notes.map((note) => note.text).sort(), ['The user has a cat called Momo', 'The user lives in Hsinchu and works as a nurse']);
  assert.equal(loaded.cursor.processedThroughMessageId.length > 0, true, 'how far each was read is kept');
  assert.equal(requests.length, 2);
  assert.match(requests[0].headers.Authorization, new RegExp(KEY));
  assert.equal(jobs.isRunning(USER), false, 'the job and its key are gone');
});

test('the key is never written anywhere: not in the settings, the notes, the events or the log', async () => {
  const { table, jobs } = setup();
  await jobs.start({ userId: USER, modelId: MODEL_ID, key: KEY });
  await jobs.finished(USER);
  assert.equal(JSON.stringify([...table.rows.values()]).includes(KEY), false);
  assert.equal(JSON.stringify(quiet).includes(KEY), false);
});

test('a conversation that was read through is not read again, and the second job does not add the notes twice', async () => {
  const { memory, jobs, requests } = setup();
  await jobs.start({ userId: USER, modelId: MODEL_ID, key: KEY });
  await jobs.finished(USER);
  const first = requests.length;
  await jobs.start({ userId: USER, modelId: MODEL_ID, key: KEY });
  await jobs.finished(USER);
  assert.equal(requests.length, first, 'nothing was asked the second time');
  assert.equal((await memory.load(USER, { conversationId: '' })).notes.length, 2);
});

test('it refuses what it cannot do: another job running, no such model, no key, the memory switched off or paused', async () => {
  const { jobs } = setup();
  const first = await jobs.start({ userId: USER, modelId: MODEL_ID, key: KEY });
  assert.deepEqual(await jobs.start({ userId: USER, modelId: MODEL_ID, key: KEY }), { ok: false, code: 'already_running' });
  await jobs.finished(USER);
  assert.equal(first.ok, true);
  assert.deepEqual(await jobs.start({ userId: USER, modelId: 'not-a-model', key: KEY }), { ok: false, code: 'unknown_model' });
  const image = MODELS.find((model) => model.category === 'image_generation' || model.outputModality === 'image');
  if (image) assert.deepEqual(await jobs.start({ userId: USER, modelId: image.id, key: KEY }), { ok: false, code: 'unknown_model' });
  assert.deepEqual(await jobs.start({ userId: USER, modelId: MODEL_ID, key: '' }), { ok: false, code: 'no_key' });
  for (const settings of [{ use: false }, { learn: false }, { paused: true }]) {
    const other = setup({ settings });
    assert.deepEqual(await other.jobs.start({ userId: USER, modelId: MODEL_ID, key: KEY }), { ok: false, code: 'memory_off' });
  }
});

test('a model that fails leaves the notes as they were, and the job still ends with a state the person can read', async () => {
  const { memory, jobs } = setup({ conversations: [C1, C2], fetchImpl: async () => new Response('no', { status: 500 }) });
  await jobs.start({ userId: USER, modelId: MODEL_ID, key: KEY });
  await jobs.finished(USER);
  const settings = await stateOf(memory);
  assert.equal(settings.rebuildJob.status, 'done', 'two conversations is under the three failures that end it');
  assert.equal(settings.rebuildJob.added, 0);
  assert.equal((await memory.load(USER, { conversationId: '' })).notes.length, 0);
});

test('a stop ends it after the conversation it is reading, and says so', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  const { memory, jobs } = setup({ fetchImpl: async () => { calls += 1; await gate; return answer(JSON.stringify({ ops: [] })); } });
  await jobs.start({ userId: USER, modelId: MODEL_ID, key: KEY });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(jobs.stop(USER), true);
  release();
  await jobs.finished(USER);
  assert.equal(calls, 1, 'the second conversation was not started');
  assert.equal((await stateOf(memory)).rebuildJob.status, 'stopped');
  assert.equal(jobs.stop(USER), false, 'nothing left to stop');
});
