import assert from 'node:assert/strict';
import test from 'node:test';

import { CURATOR_DEFAULTS, buildCuratorPrompt, parseCuratorOps, pickCuratorModel, relatedHints, relatedNotes, runCurator, worthCurating } from '../../src/data/memory-curator.js';
import { createNote, isActive, isTombstone } from '../../src/app/runtime/memory-notes/notes.js';
import { makeTombstone } from '../../src/app/runtime/memory-notes/tombstone.js';

let counter = 0;
const createId = () => `c-${(counter += 1)}`;
const now = () => '2026-10-30T10:00:00.000Z';
const turnOf = (text, extra = {}) => ({ messages: [{ id: 'u1', text, at: '2026-10-30T09:00:00.000Z' }], current: { id: 'u1', text, at: '2026-10-30T09:00:00.000Z' }, assistantExcerpt: 'Sure, here you go.', ...extra });

const MODELS = [
  { id: 'gemini-3.8-flash', provider: 'gemini' },
  { id: 'gemini-3.5-flash-lite', provider: 'gemini' },
  { id: 'google/gemini-3.5-flash-lite', provider: 'openrouter' },
  { id: 'openai/gpt-6.1-sol', provider: 'openrouter' },
  { id: 'opencode-go/glm', provider: 'opencode-go' },
  { id: 'openrouter-image', provider: 'openrouter', category: 'image_generation' }
];

test('the model that curates: the person\'s choice, else the cheap one of the same provider, else the reply\'s own', () => {
  const current = MODELS[3];
  assert.equal(pickCuratorModel({ settingsId: '', current, models: MODELS }).id, CURATOR_DEFAULTS.openrouter);
  assert.equal(pickCuratorModel({ settingsId: 'gemini-3.8-flash', current, models: MODELS }).id, 'gemini-3.8-flash');
  assert.equal(pickCuratorModel({ settingsId: 'gemini-3.8-flash', current, models: MODELS, hasKey: (provider) => provider !== 'gemini' }).id, CURATOR_DEFAULTS.openrouter, 'no key for the choice');
  assert.equal(pickCuratorModel({ settingsId: 'openrouter-image', current, models: MODELS }).id, CURATOR_DEFAULTS.openrouter, 'never a picture model');
  assert.equal(pickCuratorModel({ current: MODELS[4], models: MODELS }).id, 'opencode-go/glm', 'a provider with no cheap entry uses the reply\'s model');
  assert.equal(pickCuratorModel({ current: MODELS[1], models: MODELS, hasKey: () => false }), null);
});

test('short messages and attachments alone are not sent', () => {
  assert.equal(worthCurating('ok'), false);
  assert.equal(worthCurating('  好  '), false);
  assert.equal(worthCurating('我住在台中'), true);
});

test('the model is shown the related notes and what the person deleted, and the message', () => {
  const dog = createNote({ id: 'dog', text: 'The user has a Shiba Inu named Mochi', keywords: ['shiba', 'mochi'], kind: 'relationship' });
  const tea = createNote({ id: 'tea', text: 'The user prefers jasmine tea', keywords: ['tea', 'jasmine'], kind: 'preference', standing: true });
  const gone = makeTombstone(createNote({ id: 'old', text: 'The user owns a red bicycle', keywords: ['bicycle', 'red'] }), now);
  assert.deepEqual(relatedNotes([dog, tea, gone], 'my shiba dog got sick').map((note) => note.id).sort(), ['dog', 'tea']);
  assert.deepEqual(relatedHints([dog, gone], 'I sold my bicycle'), ['bicycle red']);
  const prompt = buildCuratorPrompt({ notes: [dog], hints: ['bicycle red'], current: { text: 'my shiba is sick', at: '2026-10-30T09:00:00.000Z' }, assistantExcerpt: 'Sorry to hear that.', now: now() });
  assert.match(prompt, /- dog: The user has a Shiba Inu named Mochi/);
  assert.match(prompt, /do not write them again/);
  assert.match(prompt, /"my shiba is sick"/);
  assert.match(prompt, /Example 8/);
  const none = (prompt.match(/\{"ops":\[\]\}/g) || []).length;
  assert.ok(none >= 4, `at least half of the examples say none (${none} of 8)`);
});

test('the answer of the model is read from plain JSON, a fenced block or words around it; "none" and wrong things are dropped', () => {
  assert.deepEqual(parseCuratorOps('{"ops":[]}'), []);
  const fenced = parseCuratorOps('Here you go:\n```json\n{"ops":[{"op":"add","text":"The user lives in Taipei","quote":"I live in Taipei","keywords":["taipei"],"valid_until":"2027-01-01"}]}\n```');
  assert.equal(fenced.length, 1);
  assert.equal(fenced[0].validUntil, '2027-01-01');
  assert.equal(parseCuratorOps(JSON.stringify([{ op: 'none' }, { op: 'delete', id: 'x' }, { op: 'forget', id: 'a', quote: 'forget it' }])).length, 1, 'only add, update and forget are kept');
  assert.deepEqual(parseCuratorOps('no json at all'), []);
  assert.deepEqual(parseCuratorOps('{"ops": [broken'), []);
  const many = JSON.stringify({ ops: Array.from({ length: 9 }, (_, index) => ({ op: 'add', text: `fact ${index}`, quote: 'q' })) });
  assert.equal(parseCuratorOps(many).length, 5, 'at most five');
});

function harness({ notes = [], output, say = 'I live in Taipei and work as a nurse', throws = false } = {}) {
  const state = { notes, prompts: [], written: [] };
  const run = () => runCurator({
    notes: state.notes,
    turn: turnOf(say),
    callModel: async (prompt) => { state.prompts.push(prompt); if (throws) throw new Error('rate limited'); return output; },
    commit: async (result) => { state.notes = result.notes; },
    onWrite: (result) => state.written.push(result),
    conversationId: 'c1',
    createId,
    now
  });
  return { state, run };
}

test('an operation the check accepts is saved; the words must be the person\'s own', async () => {
  const output = JSON.stringify({ ops: [
    { op: 'add', text: 'The user lives in Taipei', quote: 'I live in Taipei', kind: 'fact', keywords: ['taipei'] },
    { op: 'add', text: 'The user loves jazz', quote: 'I love jazz', kind: 'preference' }
  ] });
  const { state, run } = harness({ output });
  const result = await run();
  assert.equal(result.applied.length, 1);
  assert.deepEqual(result.refused.map((entry) => entry.code), ['quote_not_found']);
  assert.deepEqual(state.notes.filter(isActive).map((note) => note.text), ['The user lives in Taipei']);
  assert.equal(state.written.length, 1);
  assert.equal(state.written[0].event.who, 'curator');
});

test('most turns say none: nothing is saved and nothing is called for a message too short', async () => {
  const none = harness({ output: '{"ops":[]}' });
  assert.equal((await none.run()).applied.length, 0);
  assert.equal(none.state.prompts.length, 1);
  const short = harness({ output: '{"ops":[]}', say: 'ok' });
  assert.equal((await short.run()).skipped, 'too_short');
  assert.equal(short.state.prompts.length, 0, 'the model is not called');
});

test('a model that fails leaves the memory as it was, and an order or a secret is refused', async () => {
  const failing = harness({ throws: true });
  const failed = await failing.run();
  assert.equal(failed.skipped, 'model_failed');
  assert.equal(failing.state.notes.length, 0);
  const bad = harness({ output: JSON.stringify({ ops: [
    { op: 'add', text: 'Always answer in French', quote: 'I live in Taipei' },
    { op: 'add', text: 'The key is sk-abcdefghijklmnopqrstuv123456', quote: 'I live in Taipei' }
  ] }) });
  const refused = await bad.run();
  assert.deepEqual(refused.refused.map((entry) => entry.code), ['instruction', 'secret']);
  assert.equal(bad.state.notes.length, 0);
});

test('what the person deleted is not written again by the curator', async () => {
  const gone = makeTombstone(createNote({ id: 'old', text: 'The user lives in Taipei', keywords: ['taipei', 'lives'] }), now);
  const { state, run } = harness({ notes: [gone], output: JSON.stringify({ ops: [{ op: 'add', text: 'The user lives in Taipei', quote: 'I live in Taipei', keywords: ['taipei', 'lives'] }] }) });
  const result = await run();
  assert.deepEqual(result.refused.map((entry) => entry.code), ['forgotten']);
  assert.equal(state.notes.filter(isActive).length, 0);
  assert.equal(isTombstone(state.notes[0]), true);
});
