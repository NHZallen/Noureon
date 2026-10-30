import assert from 'node:assert/strict';
import test from 'node:test';

import { pickConversations, rebuildFromHistory, turnOfConversation } from '../../src/data/memory-rebuild.js';
import { createRebuildController } from '../../src/app/runtime/memory-store/page-rebuild.js';
import { createMemoryBackend } from '../../src/app/runtime/memory-store/backends.js';
import { createNotesStore } from '../../src/app/runtime/memory-store/notes-store.js';
import { createNote, isActive, isTombstone } from '../../src/app/runtime/memory-notes/notes.js';
import { makeTombstone } from '../../src/app/runtime/memory-notes/tombstone.js';

let counter = 0;
const createId = () => `r-${(counter += 1)}`;
const now = () => '2026-10-30T10:00:00.000Z';
const day = (n) => `2026-0${n}-01T00:00:00.000Z`;
const conv = (id, month, lines, extra = {}) => ({ id, model: 'm1', createdAt: day(month), lastUpdatedAt: day(month), messages: lines.flatMap((text, index) => [{ role: 'user', parts: [{ text }], createdAt: `2026-0${month}-0${index + 1}T00:00:00.000Z` }, { role: 'model', parts: [{ text: 'ok' }] }]), ...extra });

const CONVERSATIONS = [
  conv('c1', 1, ['I live in Taipei and I work as a nurse']),
  conv('c2', 2, ['I moved to Hsinchu last week for the new hospital']),
  conv('c3', 3, ['Please translate this paragraph into French for me']),
  conv('temp', 4, ['I secretly love opera music a lot'], { isTemporary: true }),
  conv('gone', 5, ['I own a red bicycle that I ride to work'], { deletedAt: '2026-06-01T00:00:00.000Z' })
];

const newStore = async (rows = []) => {
  const store = createNotesStore({ backend: createMemoryBackend({ rows }), logger: { warn() {} } });
  await store.load();
  return store;
};

test('the conversations to read: the newest first, none temporary or deleted, read from the oldest of them to the newest', () => {
  assert.deepEqual(pickConversations(CONVERSATIONS).map((entry) => entry.id), ['c1', 'c2', 'c3']);
  assert.deepEqual(pickConversations(CONVERSATIONS, { limit: 2 }).map((entry) => entry.id), ['c2', 'c3'], 'the newest two, oldest of them first');
  assert.deepEqual(pickConversations(CONVERSATIONS, { limit: 2, skip: 2 }).map((entry) => entry.id), ['c1'], 'further back');
});

test('a conversation is read through the last of the person\'s messages, numbered, within the size limit', () => {
  const long = conv('long', 1, Array.from({ length: 20 }, (_, index) => `message number ${index} about my work and my home and more`));
  const turn = turnOfConversation(long);
  assert.equal(turn.messages.length, 12);
  assert.match(turn.current.text, /^1\. message number 8/);
  assert.ok(turn.current.text.length <= 6200);
  assert.equal(turn.current.id, turn.messages.at(-1).id);
  assert.equal(turnOfConversation(conv('x', 1, ['ok'])), null, 'nothing worth reading');
});

const scripted = (map) => async (prompt) => {
  const hit = Object.entries(map).find(([needle]) => prompt.includes(needle));
  return hit ? JSON.stringify({ ops: hit[1] }) : '{"ops":[]}';
};

test('the notes are built from the old conversations, the later one replacing the earlier, and a conversation that says nothing adds nothing', async () => {
  const store = await newStore();
  const progress = [];
  const result = await rebuildFromHistory({
    conversations: CONVERSATIONS,
    store,
    callModel: scripted({
      'I live in Taipei': [{ op: 'add', text: 'The user lives in Taipei and works as a nurse', quote: 'I live in Taipei and I work as a nurse', keywords: ['taipei', 'nurse', 'lives'], kind: 'fact' }],
      'moved to Hsinchu': [{ op: 'add', text: 'The user lives in Hsinchu', quote: 'I moved to Hsinchu last week', keywords: ['hsinchu', 'lives'], kind: 'fact' }]
    }),
    onProgress: (entry) => progress.push(`${entry.done}/${entry.total}`),
    createId,
    now
  });
  assert.deepEqual(progress, ['1/3', '2/3', '3/3']);
  assert.equal(result.done, 3);
  assert.equal(result.added, 2);
  const notes = store.getNotes().filter(isActive);
  assert.ok(notes.some((note) => /Hsinchu/.test(note.text)));
  assert.equal(store.getCursor('c1').processedThroughMessageId, 't:2026-01-01T00:00:00.000Z');
});

test('what the person deleted does not come back, and the temporary and deleted conversations are never read', async () => {
  const gone = makeTombstone(createNote({ id: 'old', text: 'The user lives in Taipei', keywords: ['taipei', 'lives'] }), now);
  const store = await newStore([{ record_key: 'note:old', payload: gone }]);
  const prompts = [];
  await rebuildFromHistory({
    conversations: CONVERSATIONS,
    store,
    callModel: async (prompt) => { prompts.push(prompt); return JSON.stringify({ ops: [{ op: 'add', text: 'The user lives in Taipei', quote: 'I live in Taipei and I work as a nurse', keywords: ['taipei', 'lives'] }] }); },
    createId,
    now
  });
  assert.equal(store.getNotes().filter(isActive).length, 0);
  assert.equal(isTombstone(store.getNotes()[0]), true);
  assert.equal(prompts.some((prompt) => /secretly love opera|red bicycle that I ride/.test(prompt)), false);
});

test('it can be stopped between conversations, clear the notes first, and a failing model ends it after three in a row', async () => {
  const keep = createNote({ id: 'k', text: 'The user prefers tea', keywords: ['tea'] });
  const store = await newStore([{ record_key: 'note:k', payload: keep }]);
  let calls = 0;
  const stopped = await rebuildFromHistory({ conversations: CONVERSATIONS, store, callModel: async () => { calls += 1; return '{"ops":[]}'; }, shouldStop: () => calls >= 1, createId, now });
  assert.equal(stopped.stopped, true);
  assert.equal(stopped.done, 1);

  await rebuildFromHistory({ conversations: CONVERSATIONS, store, callModel: async () => '{"ops":[]}', clearFirst: true, createId, now });
  assert.equal(store.getNotes().filter(isActive).length, 0, 'the notes were cleared first');

  const fresh = await newStore();
  const failing = await rebuildFromHistory({ conversations: [...CONVERSATIONS, conv('c4', 6, ['I like hiking in the mountains every weekend'])], store: fresh, callModel: async () => { throw new Error('no key'); }, createId, now });
  assert.equal(failing.failed, 3);
  assert.ok(failing.error);
  assert.equal(failing.done, 2, 'it gave up after the third failure');
});

test('the controller: starts, reports progress, pauses, and goes further back; it picks the model like the curator', async () => {
  const store = await newStore();
  const models = [{ id: 'm1', provider: 'gemini' }, { id: 'gemini-3.5-flash-lite', provider: 'gemini' }];
  const used = [];
  const many = Array.from({ length: 35 }, (_, index) => conv(`n${index}`, (index % 9) + 1, [`I like topic number ${index} very much indeed`], { lastUpdatedAt: `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00.000Z` }));
  const controller = createRebuildController({
    getStore: () => store,
    getConversations: () => many,
    getConfig: () => ({ memoryModelId: 'm1' }),
    getModelRunner: () => async ({ modelId }) => { used.push(modelId); return '{"ops":[]}'; },
    models,
    getApiKeyForProvider: () => 'key',
    createId,
    now,
    logger: { warn() {} }
  });
  assert.equal(controller.available(), 30);
  const states = [];
  controller.subscribe((state) => states.push(state.status));
  const first = await controller.start();
  assert.equal(first.status, 'done');
  assert.equal(first.total, 30);
  assert.equal(used.length, 30);
  assert.ok(used.every((id) => id === 'gemini-3.5-flash-lite'), 'the cheap model of the same provider');
  assert.ok(states.includes('running'));
  const more = await controller.older();
  assert.equal(more.status, 'done');
  assert.equal(more.total, 5, 'the five before the first thirty');
  assert.equal(used.length, 35);

  const pausingStore = await newStore();
  const pausing = createRebuildController({ getStore: () => pausingStore, getConversations: () => many, getConfig: () => ({}), getModelRunner: () => async () => { pausing.pause(); return '{"ops":[]}'; }, models, getApiKeyForProvider: () => 'key', createId, now, logger: { warn() {} } });
  const paused = await pausing.start();
  assert.equal(paused.status, 'paused');
  assert.ok(paused.done >= 1 && paused.done < 30);
});

test('the controller reports an error when there is no model with a key, and when the memory is not loaded', async () => {
  const store = await newStore();
  const noKey = createRebuildController({ getStore: () => store, getConversations: () => CONVERSATIONS, getConfig: () => ({}), getModelRunner: () => async () => '{"ops":[]}', models: [{ id: 'm1', provider: 'gemini' }], getApiKeyForProvider: () => '', createId, now, logger: { warn() {} } });
  const result = await noKey.start();
  assert.equal(result.status, 'error');
  const notLoaded = createRebuildController({ getStore: () => null, getConversations: () => CONVERSATIONS, getConfig: () => ({}), getModelRunner: () => null, models: [], getApiKeyForProvider: () => 'k', createId, now, logger: { warn() {} } });
  assert.equal((await notLoaded.start()).status, 'error');
});

test('carrying on after a pause does not read again what was read through the same message', async () => {
  const store = await newStore();
  const asked = [];
  const model = async (prompt) => { asked.push(prompt); return '{"ops":[]}'; };
  await rebuildFromHistory({ conversations: CONVERSATIONS, store, callModel: model, shouldStop: () => asked.length >= 1, createId, now });
  assert.equal(asked.length, 1);
  const carried = await rebuildFromHistory({ conversations: CONVERSATIONS, store, callModel: model, createId, now });
  assert.equal(carried.done, 3);
  assert.equal(asked.length, 3, 'the first was not read again; the other two were');
});
