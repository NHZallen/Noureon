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
    round.during?.();
    if (round.text) onChunk(round.text);
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
