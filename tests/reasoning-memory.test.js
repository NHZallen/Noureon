import assert from 'node:assert/strict';
import test from 'node:test';

import { chooseEffort, latestSingleModelConversation, rememberedEffort, startingChoice, switchEffort } from '../src/app/runtime/shell/reasoning-memory.js';

const MODELS = [
  { id: 'a', provider: 'p' },
  { id: 'b', provider: 'p' },
  { id: 'c', provider: 'p' }
];
const LEVELS = { a: { options: ['low', 'medium', 'high'], defaultEffort: 'medium' }, c: { options: ['none', 'high'], defaultEffort: 'none' } };
const rules = {
  getModelReasoningConfig: (model) => LEVELS[model?.id] || null,
  normalizeReasoningEffort: (model, value) => (LEVELS[model.id]?.options.includes(value) ? value : LEVELS[model.id]?.defaultEffort || null)
};
const chat = (extra = {}) => ({ id: Math.random().toString(36), messages: [{}], model: 'a', council: { enabled: false }, lastUpdatedAt: '2026-10-01T00:00:00.000Z', ...extra });

test('a level chosen for a model is kept for it, and is the one now', () => {
  const conversation = chat();
  chooseEffort(conversation, 'a', 'high');
  assert.equal(conversation.reasoningEffort, 'high');
  assert.deepEqual(conversation.reasoningEfforts, { a: 'high' });
  assert.equal(rememberedEffort(conversation, 'a'), 'high');
  assert.equal(rememberedEffort(conversation, 'c'), null);
  // An older conversation that only has the one level it was on.
  assert.equal(rememberedEffort({ model: 'a', reasoningEffort: 'low' }, 'a'), 'low');
});

test('going to another model and back leaves the level where it was; a model never chosen for gets its default', () => {
  const conversation = chat({ reasoningEffort: 'high' });
  const [a, b, c] = MODELS;
  switchEffort(conversation, b, rules);
  conversation.model = 'b';
  assert.equal(conversation.reasoningEffort, undefined, 'a model without levels has none');
  switchEffort(conversation, c, rules);
  conversation.model = 'c';
  assert.equal(conversation.reasoningEffort, 'none', 'never chosen: its default');
  chooseEffort(conversation, 'c', 'high');
  switchEffort(conversation, a, rules);
  conversation.model = 'a';
  assert.equal(conversation.reasoningEffort, 'high', 'back on the first one: what was chosen for it');
  switchEffort(conversation, c, rules);
  assert.equal(conversation.reasoningEffort, 'high', 'and the other one keeps its own');
  // A level the model does not have any more falls back to its default.
  const stale = chat({ model: 'a', reasoningEffort: 'high', reasoningEfforts: { c: 'ultra' } });
  switchEffort(stale, MODELS[2], rules);
  assert.equal(stale.reasoningEffort, 'none');
});

test('a new conversation follows the newest real one, as the sidebar lists them, not a council, not what is pinned alone', () => {
  const rows = [
    chat({ id: 'old', model: 'a', reasoningEffort: 'low', lastUpdatedAt: '2026-10-01T00:00:00.000Z' }),
    chat({ id: 'pinned-old', model: 'c', reasoningEffort: 'high', pinned: true, lastUpdatedAt: '2026-09-01T00:00:00.000Z' }),
    chat({ id: 'council', model: 'a', reasoningEffort: 'high', council: { enabled: true }, lastUpdatedAt: '2026-10-05T00:00:00.000Z' }),
    chat({ id: 'trash', model: 'b', deletedAt: '2026-10-06T00:00:00.000Z', lastUpdatedAt: '2026-10-06T00:00:00.000Z' }),
    chat({ id: 'archived', model: 'b', archived: true, lastUpdatedAt: '2026-10-07T00:00:00.000Z' }),
    chat({ id: 'temporary', model: 'b', retentionMode: 'ephemeral', lastUpdatedAt: '2026-10-08T00:00:00.000Z' }),
    chat({ id: 'empty', model: 'b', messages: [], lastUpdatedAt: '2026-10-09T00:00:00.000Z' })
  ];
  assert.equal(latestSingleModelConversation(rows, { models: MODELS }).id, 'old');
  assert.deepEqual(startingChoice(rows, { models: MODELS, ...rules }), { model: 'a', provider: 'p', reasoningEffort: 'low', reasoningEfforts: { a: 'low' } });
  // Its model is not there any more: the next one.
  assert.equal(latestSingleModelConversation([chat({ id: 'gone', model: 'zzz' }), ...rows.slice(0, 2)], { models: MODELS }).id, 'old');
  // Nothing to follow.
  assert.equal(startingChoice([], { models: MODELS, ...rules }), null);
  assert.equal(startingChoice(rows.slice(2), { models: MODELS, ...rules }), null);
  // A model without levels: the model, no level.
  assert.deepEqual(startingChoice([chat({ model: 'b' })], { models: MODELS, ...rules }), { model: 'b', provider: 'p', reasoningEffort: null, reasoningEfforts: {} });
});

test('a new conversation gets a copy of every level chosen in the newest real one, and the two do not follow each other', () => {
  const source = chat({ id: 'src', model: 'a', reasoningEffort: 'low', reasoningEfforts: { a: 'low', c: 'high', b: 'high', gone: 'high' } });
  const starting = startingChoice([source], { models: MODELS, ...rules });
  // A is the model it starts on, with its level; C keeps the level chosen for it; B has no levels and the unknown model is not a model.
  assert.deepEqual(starting, { model: 'a', provider: 'p', reasoningEffort: 'low', reasoningEfforts: { a: 'low', c: 'high' } });
  // A level the model does not have any more is left out (its default is used).
  const stale = chat({ model: 'a', reasoningEffort: 'medium', reasoningEfforts: { c: 'ultra' } });
  assert.deepEqual(startingChoice([stale], { models: MODELS, ...rules }).reasoningEfforts, { a: 'medium' });
  // A copy: changing the new one leaves the old one as it was, and the other way round.
  const fresh = { model: 'a', reasoningEffort: starting.reasoningEffort, reasoningEfforts: { ...starting.reasoningEfforts } };
  chooseEffort(fresh, 'a', 'high');
  switchEffort(fresh, MODELS[2], rules);
  chooseEffort(fresh, 'c', 'none');
  assert.deepEqual(source.reasoningEfforts, { a: 'low', c: 'high', b: 'high', gone: 'high' });
  assert.equal(source.reasoningEffort, 'low');
  chooseEffort(source, 'a', 'medium');
  assert.equal(fresh.reasoningEfforts.a, 'high');
  // On the new one, going to C gives the level copied for it.
  const again = { model: 'a', reasoningEffort: starting.reasoningEffort, reasoningEfforts: { ...starting.reasoningEfforts } };
  switchEffort(again, MODELS[2], rules);
  assert.equal(again.reasoningEffort, 'high');
});
