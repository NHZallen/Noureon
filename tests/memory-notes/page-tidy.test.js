import assert from 'node:assert/strict';
import test from 'node:test';

import { tidyNotes } from '../../src/app/runtime/memory-store/page-tidy.js';
import { curateNotesTurn } from '../../src/app/runtime/memory-store/page-curator.js';
import { createNotesMemory } from '../../src/app/runtime/memory-store/notes-memory.js';
import { resetTrace } from '../../src/app/runtime/memory-store/memory-trace.js';
import { createNote } from '../../src/app/runtime/memory-notes/notes.js';
import { undoEvent, joinTidyEvents } from '../../src/app/runtime/memory-notes/manage.js';

const NOW = '2026-10-30T12:00:00.000Z';
const row = (key, payload) => ({ record_key: key, payload, version: 1, updated_at: '2026-10-30T00:00:00.000Z', deleted_at: null });
const make = (id, text, keywords, observedAt) => createNote({ id, text, keywords, kind: 'fact', source: { conversationId: 'c1', messageIds: [], quote: 'q', seen: [] }, observedAt, now: () => '2026-10-01T00:00:00.000Z' });
const MODELS = [{ id: 'gemini-3.8-flash', provider: 'gemini' }, { id: 'gemini-3.5-flash-lite', provider: 'gemini' }];
const NOTES = [
  make('taipei', 'The user lives in Taipei and works as a nurse', ['taipei', 'nurse', 'lives'], '2026-03-02T00:00:00.000Z'),
  make('taichung', 'The user lives in Taichung and works as a nurse', ['taichung', 'nurse', 'lives'], '2026-08-15T00:00:00.000Z'),
  make('trip', 'The user travels to Japan', ['japan'], '2026-09-01T00:00:00.000Z')
];

async function memoryWith({ notes = NOTES, settings = {} } = {}) {
  const rows = [...notes.map((note) => row(`note:${note.id}`, note)), row('meta:settings', settings)];
  const data = new Map([['noureon.memoryNotes.v1.tester', JSON.stringify({ version: 1, rows })]]);
  const memory = createNotesMemory({ storage: { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } }, logger: { warn() {} } });
  await memory.attach({ username: 'tester' });
  return { memory, store: memory.getStore() };
}

const supersede = JSON.stringify({ ops: [{ type: 'supersede', keep: 'taichung', drop: 'taipei' }] });
const common = (store, runner) => ({ store, getConfig: () => ({ memorySystem: 'notes', memoryModelId: 'gemini-3.8-flash' }), getRunner: () => runner, models: MODELS, getApiKeyForProvider: () => 'key', now: () => NOW, createId: (() => { let count = 0; return () => `ev${(count += 1)}`; })(), logger: { warn() {} } });

test('the page tidies the notes: the older note is archived, the time of the tidy is kept, and the change is one event that can be undone', async () => {
  const { store } = await memoryWith();
  const prompts = [];
  const result = await tidyNotes({ ...common(store, async ({ modelId, prompt }) => { prompts.push({ modelId, prompt }); return supersede; }) });
  assert.equal(result.ran, true);
  assert.equal(prompts.length, 1);
  assert.equal(prompts[0].modelId, 'gemini-3.5-flash-lite', 'the cheap model of the same provider');
  const byId = new Map(store.getNotes().map((note) => [note.id, note]));
  assert.equal(byId.get('taipei').status, 'archived');
  assert.equal(byId.get('taipei').supersededBy, 'taichung');
  assert.equal(byId.get('trip').status, 'active');
  assert.equal(store.getSettings().consolidatedAt, NOW);
  const events = joinTidyEvents(store.getEvents());
  assert.equal(events.length, 1);
  assert.equal(events[0].who, 'consolidation');
  // Undo from the settings: the notes come back, the event goes away.
  const undone = undoEvent(store.getNotes(), events[0]);
  await store.commitNotes(undone.notes);
  for (const id of events[0].ids) await store.removeEvent(id);
  assert.equal(store.getNotes().find((note) => note.id === 'taipei').status, 'active');
  assert.equal(store.getEvents().length, 0);
});

test('a second try right after finds nothing due; "tidy now" does it again whatever the schedule says', async () => {
  const { store } = await memoryWith();
  await tidyNotes({ ...common(store, async () => supersede) });
  const again = await tidyNotes({ ...common(store, async () => { throw new Error('not due, no model call'); }) });
  assert.equal(again.skipped, 'not_due');
  const forced = await tidyNotes({ ...common(store, async () => supersede), force: true });
  assert.equal(forced.ran, true);
});

test('with learning off only the first layer runs; paused or not in use, nothing runs', async () => {
  const learningOff = await memoryWith({ settings: { learn: false } });
  let asked = 0;
  const result = await tidyNotes({ ...common(learningOff.store, async () => { asked += 1; return supersede; }) });
  assert.equal(result.ran, true);
  assert.equal(asked, 0);
  assert.equal(learningOff.store.getNotes().find((note) => note.id === 'taipei').status, 'active');
  for (const settings of [{ paused: true }, { use: false }]) {
    const { store } = await memoryWith({ settings });
    assert.equal((await tidyNotes({ ...common(store, async () => supersede) })).skipped, 'off');
  }
});

test('a model that fails or a page with no key leaves the notes as the first layer made them, and nothing throws', async () => {
  const failing = await memoryWith();
  const result = await tidyNotes({ ...common(failing.store, async () => { throw new Error('down'); }) });
  assert.equal(result.ran, true);
  assert.equal(failing.store.getNotes().find((note) => note.id === 'taipei').status, 'active');
  const noKey = await memoryWith();
  let asked = 0;
  await tidyNotes({ ...common(noKey.store, async () => { asked += 1; return supersede; }), getApiKeyForProvider: () => '' });
  assert.equal(asked, 0);
  assert.equal((await tidyNotes({ ...common(null, null) })).skipped, 'not_loaded');
});

test('events older than thirty days are taken away after a tidy', async () => {
  const { store } = await memoryWith();
  const old = { id: 'old', at: '2026-08-01T00:00:00.000Z', who: 'tool', ops: [{ action: 'add', noteId: 'x', after: { text: 'x' } }] };
  await store.commitWrite({ notes: store.getNotes(), event: old });
  assert.equal(store.getEvents().length, 1);
  await tidyNotes({ ...common(store, async () => '{"ops":[]}') });
  assert.equal(store.getEvents().some((event) => event.id === 'old'), false);
});

test('the tidy follows the turn the page curated: it runs when due, and a turn that is skipped still lets it run', async () => {
  resetTrace?.();
  const { memory, store } = await memoryWith();
  const calls = [];
  await curateNotesTurn({
    conversation: { id: 'conv-tidy', model: 'gemini-3.8-flash', retentionMode: 'ephemeral', messages: [{ role: 'user', parts: [{ text: 'hello there friend' }] }] },
    getConfig: () => ({ memorySystem: 'notes', memoryModelId: 'gemini-3.5-flash-lite' }),
    getMemory: () => memory,
    runMemoryModel: async (options) => { calls.push(options.prompt); return supersede; },
    models: MODELS,
    getApiKeyForProvider: () => 'key',
    now: () => NOW,
    wait: async () => {},
    logger: { warn() {} }
  });
  assert.equal(calls.length, 1, 'only the tidy asked the model (the turn was temporary)');
  assert.equal(store.getNotes().find((note) => note.id === 'taipei').status, 'archived');
  // The old memory system does not tidy.
  const classic = await memoryWith();
  const quiet = [];
  await curateNotesTurn({ conversation: { id: 'c2', messages: [] }, getConfig: () => ({ memorySystem: 'classic' }), getMemory: () => classic.memory, runMemoryModel: async () => { quiet.push(1); return supersede; }, models: MODELS, getApiKeyForProvider: () => 'key', logger: { warn() {} } });
  assert.deepEqual(quiet, []);
});
