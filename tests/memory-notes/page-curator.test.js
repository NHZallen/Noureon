import assert from 'node:assert/strict';
import test from 'node:test';

import { curateNotesTurn } from '../../src/app/runtime/memory-store/page-curator.js';
import { createNotesMemory } from '../../src/app/runtime/memory-store/notes-memory.js';
import { resetTrace } from '../../src/app/runtime/memory-store/memory-trace.js';

const row = (key, payload) => ({ record_key: key, payload, version: 1, updated_at: '2026-10-30T00:00:00.000Z', deleted_at: null });
const MODELS = [{ id: 'gemini-3.8-flash', provider: 'gemini' }, { id: 'gemini-3.5-flash-lite', provider: 'gemini' }];

async function memoryWith(settings) {
  const data = new Map([['noureon.memoryNotes.v1.tester', JSON.stringify({ version: 1, rows: settings ? [row('meta:settings', settings)] : [] })]]);
  const memory = createNotesMemory({ storage: { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } }, logger: { warn() {} } });
  await memory.attach({ username: 'tester' });
  return memory;
}

const conversation = (extra = {}) => ({
  id: 'conv-cur',
  model: 'gemini-3.8-flash',
  messages: [
    { role: 'user', parts: [{ text: 'I live in Taipei and I am a nurse' }], createdAt: '2026-10-30T08:00:00.000Z' },
    { role: 'model', parts: [{ text: 'Nice to meet you!' }] }
  ],
  ...extra
});

function run({ memory, conv = conversation(), config = { memoryModelId: 'gemini-3.5-flash-lite' }, output = '{"ops":[]}', keys = () => 'key' }) {
  const calls = [];
  const saved = [];
  return {
    calls,
    saved,
    done: curateNotesTurn({
      conversation: conv,
      getConfig: () => config,
      getMemory: () => memory,
      runMemoryModel: async (options) => { calls.push(options); return output; },
      models: MODELS,
      getApiKeyForProvider: keys,
      saveAppData: async () => { saved.push(true); },
      wait: async () => {},
      createId: (() => { let index = 0; return () => `p-${(index += 1)}`; })(),
      now: () => '2026-10-30T10:00:00.000Z',
      logger: { warn() {} }
    })
  };
}

const ADD = JSON.stringify({ ops: [{ op: 'add', text: 'The user lives in Taipei', quote: 'I live in Taipei', kind: 'fact', keywords: ['taipei'] }] });

test('for a model with no memory tools, the curator reads the turn with the cheap model of the same provider and saves what is accepted', async () => {
  resetTrace('conv-cur');
  const memory = await memoryWith();
  const conv = conversation();
  const { calls, saved, done } = run({ memory, conv, output: ADD });
  const result = await done;
  assert.equal(result.applied.length, 1);
  assert.equal(calls[0].modelId, 'gemini-3.5-flash-lite');
  assert.match(calls[0].prompt, /I live in Taipei and I am a nurse/);
  assert.deepEqual(memory.getStore().getNotes().filter((note) => note.status === 'active').map((note) => note.text), ['The user lives in Taipei']);
  const message = conv.messages[1];
  assert.equal(message.metadata.memoryUpdated.length, 1, 'the reply\'s message carries the change');
  assert.equal(saved.length, 1);
  assert.equal(memory.getStore().getEvents().length, 1);
});

test('nothing is read or written when learning is off, paused, the memory is off, there is no conversation, or the chat is temporary', async () => {
  resetTrace('conv-cur');
  for (const [settings, conv, why] of [
    [{ learn: false }, conversation(), 'learn off'],
    [{ paused: true }, conversation(), 'paused'],
    [{ use: false }, conversation(), 'use off'],
    [undefined, conversation({ retentionMode: 'ephemeral' }), 'temporary chat']
  ]) {
    const memory = await memoryWith(settings);
    const { calls, done } = run({ memory, conv, output: ADD });
    const result = await done;
    assert.ok(result.skipped, why);
    assert.equal(calls.length, 0, `${why}: the model is not called`);
    assert.equal(memory.getStore().getNotes().length, 0, `${why}: nothing is written`);
  }
  const memory = await memoryWith();
  const { calls, done } = run({ memory, conv: { id: '', messages: [] }, output: ADD });
  assert.equal((await done).skipped, 'off');
  assert.equal(calls.length, 0);
});

test('a reply whose model had the memory tools is not read again (it wrote its own notes)', async () => {
  resetTrace('conv-cur', { toolsOffered: true });
  const memory = await memoryWith();
  const { calls, done } = run({ memory, output: ADD });
  assert.equal((await done).skipped, 'wrote_itself');
  assert.equal(calls.length, 0);
  resetTrace('conv-cur');
});

test('no usable model, a model that fails, and a message too short all leave the memory as it was', async () => {
  resetTrace('conv-cur');
  const memory = await memoryWith();
  assert.equal((await run({ memory, keys: () => '' }).done).skipped, 'no_model');
  const failing = curateNotesTurn({ conversation: conversation(), getConfig: () => ({}), getMemory: () => memory, runMemoryModel: async () => { throw new Error('rate limited'); }, models: MODELS, getApiKeyForProvider: () => 'key', wait: async () => {}, logger: { warn() {} } });
  assert.equal((await failing).skipped, 'model_failed');
  const short = conversation({ messages: [{ role: 'user', parts: [{ text: 'ok' }], createdAt: '2026-10-30T08:00:00.000Z' }, { role: 'model', parts: [{ text: 'hi' }] }] });
  const { calls, done } = run({ memory, conv: short, output: ADD });
  assert.equal((await done).skipped, 'too_short');
  assert.equal(calls.length, 0);
  assert.equal(memory.getStore().getNotes().length, 0);
});

test('the person\'s choice of the curator model is used when it can be', async () => {
  resetTrace('conv-cur');
  const memory = await memoryWith({ curatorModelId: 'gemini-3.8-flash' });
  const { calls, done } = run({ memory, output: '{"ops":[]}' });
  await done;
  assert.equal(calls[0].modelId, 'gemini-3.8-flash');
});
