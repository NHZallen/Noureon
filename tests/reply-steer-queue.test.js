import assert from 'node:assert/strict';
import test from 'node:test';

import { MAX_STEERS, MAX_STEER_CHARS, createSteerQueue, steerNote, steerTurnFields } from '../src/app/runtime/reply/steer-queue.js';
import { applyGeminiTools, applyOpenAiTools, applyResponsesTools } from '../src/app/runtime/features/tool-call-formats.js';
import { applyAnthropicTools } from '../src/app/runtime/reply/anthropic-messages-format.js';
import { runSkillsReply } from '../src/app/runtime/reply/skills-reply.js';
import { createSkillLoader } from '../src/data/skill-tool.js';

test('the queue keeps what is added in order, takes it once, remembers what was taken, and has a limit', () => {
  const told = [];
  const queue = createSteerQueue({ onTaken: (item) => told.push(item.text), now: () => 7 });
  assert.equal(queue.push('  use a table  '), true);
  assert.equal(queue.push(''), false);
  assert.equal(queue.push('   '), false);
  assert.equal(queue.push('shorter'), true);
  assert.equal(queue.has(), true);
  assert.deepEqual(queue.take(), ['use a table', 'shorter']);
  assert.equal(queue.has(), false);
  assert.deepEqual(queue.take(), []);
  assert.deepEqual(queue.taken(), [{ text: 'use a table', at: 7 }, { text: 'shorter', at: 7 }]);
  assert.deepEqual(told, ['use a table', 'shorter']);
  queue.push('late one');
  assert.deepEqual(queue.left(), [{ text: 'late one', at: 7 }]);
  assert.equal(queue.push('x'.repeat(MAX_STEER_CHARS + 50)), true);
  assert.equal(queue.left()[1].text.length, MAX_STEER_CHARS, 'a long message is cut');
  const full = createSteerQueue();
  for (let index = 0; index < MAX_STEERS; index += 1) assert.equal(full.push(`m${index}`), true);
  assert.equal(full.push('one more'), false);
});

test('the fields of a round carry what was added, and nothing when nothing was', () => {
  const queue = createSteerQueue();
  assert.deepEqual(steerTurnFields(queue), {});
  assert.deepEqual(steerTurnFields(null), {});
  queue.push('go on in French');
  assert.deepEqual(steerTurnFields(queue), { steer: ['go on in French'] });
  assert.deepEqual(steerTurnFields(queue), {});
  assert.match(steerNote(['a']), /^The user added this message while you were working\./);
  assert.match(steerNote(['a', 'b']), /these messages[\s\S]*- a\n- b$/);
});

const turn = { assistant: { text: '', toolCalls: [{ id: 'c1', name: 'load_skill', args: { name: 's' }, arguments: '{"name":"s"}' }] }, results: [{ id: 'c1', name: 'load_skill', content: 'the skill', geminiId: undefined }], steer: ['answer in French'] };
const note = steerNote(['answer in French']);

test('every form of request puts what the person added after the answers of the tools, as their own words', () => {
  const gemini = applyGeminiTools({ contents: [] }, { toolTurns: [turn] });
  const last = gemini.contents.at(-1);
  assert.equal(last.role, 'user');
  assert.deepEqual(last.parts.at(-1), { text: note });
  assert.ok(last.parts[0].functionResponse, 'the answer of the tool comes first');

  const chat = applyOpenAiTools({ messages: [] }, { toolTurns: [turn] });
  assert.deepEqual(chat.messages.slice(-2).map((message) => message.role), ['tool', 'user']);
  assert.equal(chat.messages.at(-1).content, note);

  const responses = applyResponsesTools({ input: [] }, { toolTurns: [turn] });
  assert.equal(responses.input.at(-2).type, 'function_call_output');
  assert.deepEqual(responses.input.at(-1), { role: 'user', content: [{ type: 'input_text', text: note }] });

  const anthropic = applyAnthropicTools({ messages: [] }, { toolTurns: [turn] });
  const user = anthropic.messages.at(-1);
  assert.equal(user.role, 'user');
  assert.equal(user.content[0].type, 'tool_result');
  assert.deepEqual(user.content.at(-1), { type: 'text', text: note });

  // A round with nothing added is as it was.
  const plain = { ...turn };
  delete plain.steer;
  assert.equal(applyOpenAiTools({ messages: [] }, { toolTurns: [plain] }).messages.at(-1).role, 'tool');
  assert.equal(applyAnthropicTools({ messages: [] }, { toolTurns: [plain] }).messages.at(-1).content.length, 1);
});

test('in the loop of a reply a message added during a round is taken after the answers of its tools, once; one added after the last round is left', async () => {
  const requests = [];
  const queue = createSteerQueue();
  const rounds = [
    { calls: [{ id: 'c1', name: 'load_skill', args: { name: 'notes' } }], during: () => queue.push('make it short') },
    { text: 'Short answer.', during: () => queue.push('too late') }
  ];
  const streamApiCall = async (parts, onChunk, signal, forced, options) => {
    requests.push({ steer: options.toolTurns.map((entry) => entry.steer) });
    const round = rounds[requests.length - 1];
    // (A message added once the answer is being written is too late for it: it is left.)
    if (round.text) { onChunk(round.text); round.during?.(); } else round.during?.();
    options.onResponseComplete({ text: round.text || '', toolCalls: round.calls || [] });
  };
  const result = await runSkillsReply({
    streamApiCall,
    requestParts: [{ text: 'hello' }],
    loader: createSkillLoader({ available: [{ name: 'notes', description: 'Notes.' }], lookup: async (name) => ({ name, body: 'Notes text.' }) }),
    steer: queue
  });
  assert.equal(result.text, 'Short answer.');
  assert.deepEqual(requests, [{ steer: [] }, { steer: [['make it short']] }]);
  assert.deepEqual(queue.taken().map((item) => item.text), ['make it short']);
  assert.deepEqual(queue.left().map((item) => item.text), ['too late']);
});

test('the messages one boundary takes are told once, together, with what the loop gave, and each keeps the id the page made for it', () => {
  const told = [];
  const queue = createSteerQueue({});
  queue.setBatchHandler((items, context) => told.push([items.map((item) => [item.text, item.id]), context]));
  queue.push('one', 'id-1');
  queue.push('two');
  assert.deepEqual(queue.take({ steps: ['a'] }), ['one', 'two']);
  assert.deepEqual(told, [[[['one', 'id-1'], ['two', undefined]], { steps: ['a'] }]]);
  assert.deepEqual(queue.take(), [], 'nothing waiting: nothing told');
  assert.equal(told.length, 1);
  queue.push('three', 'id-3');
  assert.deepEqual(queue.left().map((item) => item.id), ['id-3']);
});

test('a message added while the model is still working out its next step does not wait for that step: the round is given up, nothing it asked for is run, and the message goes after the answers before', async () => {
  const requests = [];
  const ran = [];
  const queue = createSteerQueue();
  const loader = createSkillLoader({ available: [{ name: 'notes', description: 'Notes.' }], lookup: async (name) => { ran.push(name); return { name, body: 'Notes text.' }; } });
  const rounds = [
    { calls: [{ id: 'c1', name: 'load_skill', args: { name: 'notes' } }] },
    // The model is slow: while it works on its second step the person writes; the step it would have ended with must not run.
    { wait: true, calls: [{ id: 'c2', name: 'load_skill', args: { name: 'other' } }] },
    { text: 'Done in French.' }
  ];
  const streamApiCall = async (parts, onChunk, signal, forced, options) => {
    requests.push(options.toolTurns.map((entry) => entry.steer));
    const round = rounds[requests.length - 1];
    if (round.wait) {
      queue.push('use French');
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    }
    if (round.text) onChunk(round.text);
    options.onResponseComplete({ text: round.text || '', toolCalls: round.calls || [] });
  };
  const result = await runSkillsReply({ streamApiCall, requestParts: [{ text: 'hello' }], loader, steer: queue });
  assert.equal(result.text, 'Done in French.');
  assert.deepEqual(ran, ['notes'], 'the call of the round that was given up was not run');
  assert.deepEqual(requests, [[], [undefined], [['use French']]], 'the message is put after the answers of the first round when the third request is made');
  assert.deepEqual(queue.taken().map((item) => item.text), ['use French']);
});

test('a message is not allowed to cut the first round (nothing to put it after), a round that already writes the answer, or a stop of the person', async () => {
  const queue = createSteerQueue();
  const loader = createSkillLoader({ available: [{ name: 'notes', description: 'Notes.' }], lookup: async (name) => ({ name, body: 'x' }) });
  let seen = 0;
  const first = await runSkillsReply({
    streamApiCall: async (parts, onChunk, signal, forced, options) => {
      seen += 1;
      queue.push('early');
      assert.equal(signal.aborted, false, 'the first round goes on');
      onChunk('Answer.');
      options.onResponseComplete({ text: 'Answer.', toolCalls: [] });
    },
    requestParts: [{ text: 'hello' }],
    loader,
    steer: queue
  });
  assert.equal(first.text, 'Answer.');
  assert.equal(seen, 1);
  assert.deepEqual(queue.left().map((item) => item.text), ['early']);
});
