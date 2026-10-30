import assert from 'node:assert/strict';
import test from 'node:test';

import { CONSOLIDATE, buildGroupPrompt, parseGroupOps, pickTidyModel, runConsolidation } from '../../src/data/memory-consolidate.js';
import { describeTidy, joinTidyEvents, undoEvent, undoTidy } from '../../src/app/runtime/memory-notes/manage.js';
import { isActive, createNote } from '../../src/app/runtime/memory-notes/notes.js';
import { normalizeSettings } from '../../src/app/runtime/memory-notes/records.js';

const NOW = '2026-10-30T12:00:00.000Z';
const make = (id, text, keywords, extra = {}) => ({ ...createNote({ id, text, keywords, kind: extra.kind || 'fact', source: { conversationId: 'c1', messageIds: [`m${id}`], quote: 'q', seen: ['c1|2026-10-01'] }, observedAt: extra.observedAt || '2026-10-01T00:00:00.000Z', now: () => '2026-10-01T00:00:00.000Z' }), ...extra.patch });
let counter = 0;
const createId = () => `e${(counter += 1)}`;
const base = { now: () => NOW, createId };

const TAIPEI = () => make('taipei', 'The user lives in Taipei and works as a nurse', ['taipei', 'nurse', 'lives'], { observedAt: '2026-03-02T00:00:00.000Z' });
const TAICHUNG = () => make('taichung', 'The user lives in Taichung and works as a nurse', ['taichung', 'nurse', 'lives'], { observedAt: '2026-08-15T00:00:00.000Z' });
const DOG = () => make('dog', 'The user has a dog named Rex', ['dog', 'rex']);

const supersede = JSON.stringify({ ops: [{ type: 'supersede', keep: 'taichung', drop: 'taipei' }] });

test('the tidy is not made when it is not due, and is made when it never ran or a week has passed', async () => {
  const notes = [DOG()];
  const recent = await runConsolidation({ ...base, notes, settings: { consolidatedAt: '2026-10-29T00:00:00.000Z' }, commit: async () => { throw new Error('nothing to save'); } });
  assert.equal(recent.skipped, 'not_due');
  const never = await runConsolidation({ ...base, notes, settings: {}, commit: async () => {} });
  assert.equal(never.ran, true);
  const old = await runConsolidation({ ...base, notes, settings: { consolidatedAt: '2026-10-01T00:00:00.000Z' }, commit: async () => {} });
  assert.equal(old.ran, true);
  const forced = await runConsolidation({ ...base, notes, settings: { consolidatedAt: '2026-10-29T00:00:00.000Z' }, force: true, commit: async () => {} });
  assert.equal(forced.ran, true);
  assert.equal((await runConsolidation({ ...base, notes: [], settings: {}, force: true, commit: async () => {} })).skipped, 'empty');
});

test('twenty notes changed since the last tidy make it due', async () => {
  const notes = Array.from({ length: 20 }, (_, index) => make(`n${index}`, `Fact number ${index} about topic${index}`, [`topic${index}`], { patch: { updatedAt: '2026-10-29T10:00:00.000Z' } }));
  const result = await runConsolidation({ ...base, notes, settings: { consolidatedAt: '2026-10-29T00:00:00.000Z' }, commit: async () => {} });
  assert.equal(result.ran, true);
});

test('the first layer archives what ran out, and the claim is made before the work', async () => {
  const order = [];
  const ended = make('trip', 'The user travels to Japan', ['japan', 'travel'], { patch: { validUntil: '2026-10-01T00:00:00.000Z' } });
  const result = await runConsolidation({ ...base, notes: [ended, DOG()], settings: {}, claim: async (at) => { order.push(['claim', at]); }, commit: async ({ events }) => { order.push(['commit', events.length]); } });
  assert.deepEqual(order, [['claim', NOW], ['commit', 1]]);
  assert.equal(result.notes.find((note) => note.id === 'trip').status, 'archived');
  assert.equal(result.notes.find((note) => note.id === 'dog').status, 'active');
  assert.equal(result.summary.expire, 1);
  const [event] = result.events;
  assert.equal(event.who, 'consolidation');
  assert.equal(event.ops.length, 1);
  assert.equal(event.ops[0].before.status, 'active', 'the note as it was is kept for the undo');
});

test('a claim that fails stops the tidy before it changes anything', async () => {
  const result = await runConsolidation({ ...base, notes: [DOG()], settings: {}, claim: async () => { throw new Error('offline'); }, commit: async () => { throw new Error('must not be called'); } });
  assert.equal(result.skipped, 'claim_failed');
});

test('the second layer: the model says the later note holds, the program applies it, and the older note is archived with a pointer, not deleted', async () => {
  const prompts = [];
  const saved = [];
  const result = await runConsolidation({ ...base, notes: [TAIPEI(), TAICHUNG(), DOG()], settings: {}, callModel: async (prompt) => { prompts.push(prompt); return supersede; }, commit: async (out) => { saved.push(out); } });
  assert.equal(prompts.length, 1);
  assert.match(prompts[0], /taipei/);
  assert.match(prompts[0], /taichung/);
  assert.equal(prompts[0].includes('Rex'), false, 'only the group is sent');
  const old = result.notes.find((note) => note.id === 'taipei');
  assert.equal(old.status, 'archived');
  assert.equal(old.archivedReason, 'merged');
  assert.equal(old.supersededBy, 'taichung');
  assert.equal(result.notes.find((note) => note.id === 'taichung').text, 'The user lives in Taichung and works as a nurse');
  assert.equal(result.notes.length, 3, 'no note is lost');
  assert.equal(saved.length, 1);
  assert.equal(result.summary.supersede, 1);
});

test('what the model answers is checked: a note outside the group, a merge that adds something, and an older note that is told to win are not trusted', async () => {
  const answer = JSON.stringify({ ops: [
    { type: 'merge', ids: ['taipei', 'dog'], text: 'x' },
    { type: 'merge', ids: ['taipei', 'taichung'], text: 'The user lives in Tokyo and owns three horses and a boat', keywords: [] },
    { type: 'supersede', keep: 'taipei', drop: 'taichung' }
  ] });
  const result = await runConsolidation({ ...base, notes: [TAIPEI(), TAICHUNG(), DOG()], settings: {}, callModel: async () => answer, commit: async () => {} });
  assert.equal(result.rejected.length, 2);
  // The model said the earlier note wins; the later one holds whatever the model says.
  assert.equal(result.notes.find((note) => note.id === 'taichung').status, 'active');
  assert.equal(result.notes.find((note) => note.id === 'taipei').status, 'archived');
  assert.equal(result.notes.find((note) => note.id === 'dog').status, 'active');
});

test('a locked note is never touched by the model, and a model that fails twice is not asked again', async () => {
  const locked = { ...TAIPEI(), locked: true };
  const kept = await runConsolidation({ ...base, notes: [locked, TAICHUNG()], settings: {}, callModel: async () => { throw new Error('should not be asked: a locked note leaves no group'); }, commit: async () => {} });
  assert.equal(kept.asked, 0);
  const many = [];
  for (let index = 0; index < 5; index += 1) {
    many.push(make(`a${index}`, `The user plays tennis every week number${index}`, [`tennis`, `week${index}`], { kind: 'routine' }));
    many.push(make(`b${index}`, `The user plays tennis every week number${index} again`, [`tennis`, `week${index}`], { kind: 'routine' }));
  }
  let calls = 0;
  const failing = await runConsolidation({ ...base, notes: many, settings: {}, callModel: async () => { calls += 1; throw new Error('model down'); }, commit: async () => {} });
  assert.ok(calls <= CONSOLIDATE.modelFailures, `asked ${calls} times`);
  assert.equal(failing.ran, true, 'the first layer still ran');
});

test('the model is not used when learning is off, and not after the deadline', async () => {
  let asked = 0;
  const callModel = async () => { asked += 1; return supersede; };
  await runConsolidation({ ...base, notes: [TAIPEI(), TAICHUNG()], settings: { learn: false }, callModel, commit: async () => {} });
  assert.equal(asked, 0);
  await runConsolidation({ ...base, notes: [TAIPEI(), TAICHUNG()], settings: {}, callModel, commit: async () => {}, deadlineAt: 10, clock: () => 11 });
  assert.equal(asked, 0);
});

test('a tidy that nothing changed saves nothing', async () => {
  const result = await runConsolidation({ ...base, notes: [DOG()], settings: {}, commit: async () => { throw new Error('nothing to save'); } });
  assert.equal(result.ran, true);
  assert.deepEqual(result.events, []);
  assert.deepEqual(result.changed, []);
});

test('a commit that fails is reported, not thrown', async () => {
  const ended = make('trip', 'The user travels to Japan', ['japan'], { patch: { validUntil: '2026-10-01T00:00:00.000Z' } });
  const result = await runConsolidation({ ...base, notes: [ended], settings: {}, commit: async () => { throw new Error('disk full'); } });
  assert.equal(result.ran, false);
  assert.equal(result.skipped, 'commit_failed');
});

test('a tidy that touched many notes is written as several small events of one batch, and the settings join them', async () => {
  const notes = Array.from({ length: 60 }, (_, index) => make(`old${index}`, `The user went to place${index} for ${'a long reason '.repeat(8)}`, [`place${index}`], { patch: { validUntil: '2026-09-01T00:00:00.000Z', source: { conversationId: 'c1', messageIds: [], quote: 'q'.repeat(300), seen: [] } } }));
  const result = await runConsolidation({ ...base, notes, settings: {}, commit: async () => {} });
  assert.ok(result.events.length > 1, 'more than one event');
  for (const event of result.events) assert.ok(JSON.stringify(event).length < 20000, 'each fits a row');
  assert.equal(new Set(result.events.map((event) => event.batch)).size, 1);
  assert.equal(result.events[0].batch, result.events[0].id);
  const joined = joinTidyEvents([...result.events, { id: 'x', who: 'tool', ops: [] }]);
  assert.equal(joined.length, 2);
  assert.equal(joined[0].ids.length, result.events.length);
  assert.equal(describeTidy(joined[0]).count, 60);
  assert.equal(describeTidy({ who: 'tool', ops: [{ action: 'add' }] }), null);
});

test('undo brings back every note as it was, except one the person changed after the tidy', async () => {
  const result = await runConsolidation({ ...base, notes: [TAIPEI(), TAICHUNG(), DOG()], settings: {}, callModel: async () => supersede, commit: async () => {} });
  const [event] = result.events;
  const undone = undoEvent(result.notes, event);
  assert.equal(undone.ok, true);
  assert.equal(undone.undone, 2);
  assert.deepEqual(undone.notes.find((note) => note.id === 'taipei'), TAIPEI());
  assert.deepEqual(undone.notes.find((note) => note.id === 'taichung'), TAICHUNG());
  // The person edited the note that took the place after the tidy: it stays as they left it.
  const edited = result.notes.map((note) => (note.id === 'taichung' ? { ...note, text: 'The user lives in Hsinchu', updatedAt: '2026-10-30T13:00:00.000Z' } : note));
  const partial = undoTidy(edited, event);
  assert.equal(partial.skipped, 1);
  assert.equal(partial.notes.find((note) => note.id === 'taichung').text, 'The user lives in Hsinchu');
  assert.equal(partial.notes.find((note) => note.id === 'taipei').status, 'active');
});

test('the prompt and the parsing: the notes of the group only, JSON in any wrapping, nothing outside the three kinds', () => {
  const prompt = buildGroupPrompt({ group: [TAIPEI(), TAICHUNG()], now: NOW });
  assert.match(prompt, /taipei 2026-03-02 The user lives in Taipei/);
  assert.match(prompt, /Answer:$/);
  const ops = parseGroupOps('Sure!\n```json\n{"ops":[{"type":"supersede","keep":"a","drop":"b"},{"type":"delete_everything"},{"type":"merge","ids":["a","b"],"text":"x","keywords":["k","k","l"]},{"type":"keep"}]}\n```');
  assert.deepEqual(ops.map((op) => op.type), ['supersede', 'merge', 'keep']);
  assert.deepEqual(ops[1].keywords, ['k', 'l']);
  assert.deepEqual(parseGroupOps('no json here'), []);
  assert.deepEqual(parseGroupOps('{"ops": "bad"}'), []);
});

test('the model for the tidy: the person\'s choice, then the cheap one of the provider, then any provider that has a key', () => {
  const models = [{ id: 'gemini-3.8-flash', provider: 'gemini' }, { id: 'gemini-3.5-flash-lite', provider: 'gemini' }, { id: 'google/gemini-3.5-flash-lite', provider: 'openrouter' }, { id: 'img', provider: 'gemini', category: 'image_generation' }];
  assert.equal(pickTidyModel({ currentId: 'gemini-3.8-flash', models, hasKey: () => true }).id, 'gemini-3.5-flash-lite');
  assert.equal(pickTidyModel({ settingsId: 'gemini-3.8-flash', currentId: 'gemini-3.8-flash', models, hasKey: () => true }).id, 'gemini-3.8-flash');
  assert.equal(pickTidyModel({ models, hasKey: (provider) => provider === 'openrouter' }).id, 'google/gemini-3.5-flash-lite', 'no current model: the cheap one of a provider with a key');
  assert.equal(pickTidyModel({ models, hasKey: () => false }), null);
  assert.notEqual(pickTidyModel({ settingsId: 'img', models, hasKey: () => true })?.id, 'img', 'a model that draws pictures is never chosen');
});

test('the settings keep the time of the last tidy, and drop anything that is not a time', () => {
  assert.equal(normalizeSettings({ consolidatedAt: NOW }).consolidatedAt, NOW);
  assert.equal(normalizeSettings({ consolidatedAt: 'yesterday' }).consolidatedAt, null);
  assert.equal(normalizeSettings({}).consolidatedAt, null);
  assert.ok(isActive(DOG()));
});
