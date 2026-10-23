import assert from 'node:assert/strict';
import test from 'node:test';

import { createAnthropicCollector } from '../src/app/runtime/reply/anthropic-messages-format.js';
import { runSandboxReply } from '../src/app/runtime/sandbox/sandbox-reply.js';
import { ask, buildProbeRequest, line, probe, verdict } from '../scripts/opencode-claude-probe.mjs';

const KEY = 'oc_sk_secret_key';
const sse = (events) => events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('');
const reply = (events, status = 200) => new Response(sse(events), { status, headers: { 'content-type': 'text/event-stream' } });

const thinkingThenCall = (code = 'print(1)') => [
  { type: 'message_start', message: { usage: { input_tokens: 900 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'Let me plan the deck. ' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig-abc' } },
  { type: 'content_block_stop', index: 0 },
  { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'toolu_1', name: 'run_python', input: {} } },
  { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: `{"title":"Deck","code":${JSON.stringify(code).slice(0, 5)}` } },
  { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: `${JSON.stringify(code).slice(5)}}` } },
  { type: 'content_block_stop', index: 1 },
  { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 240 } }
];
// A model that thinks until the limit and is cut: no text, no call.
const cutInThinking = [
  { type: 'message_start', message: { usage: { input_tokens: 900 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'x'.repeat(5000) } },
  { type: 'message_delta', delta: { stop_reason: 'max_tokens' }, usage: { output_tokens: 16384 } }
];

test('the request of the probe is the request of the app: adaptive thinking with the depth, the limit of the app, the tool and the guidance of Advanced mode', () => {
  const plain = buildProbeRequest({ effort: 'max', maxTokens: null, prompt: 'Hi' });
  assert.equal(plain.max_tokens, 65536, 'what the app sends for Claude Haiku 5.5 when nothing says otherwise: its thinking, which is not shown, counts (the probe of 2026-10-23: up to 47320 tokens at the deepest depth)');
  assert.equal(buildProbeRequest({ model: 'minimax-m3', prompt: 'Hi' }).max_tokens, 16384, 'the default of the app for the models that were not probed');
  assert.deepEqual(plain.thinking, { type: 'adaptive' });
  assert.deepEqual(plain.output_config, { effort: 'max' });
  assert.equal(plain.tools, undefined);
  const withTools = buildProbeRequest({ effort: 'high', maxTokens: 65536, prompt: 'Make a deck', tools: true });
  assert.equal(withTools.max_tokens, 65536);
  assert.equal(withTools.tools[0].name, 'run_python');
  assert.deepEqual(withTools.tool_choice, { type: 'auto' });
  assert.match(withTools.system, /Advanced mode: Python on the server/);
  assert.deepEqual(withTools.messages.map((message) => message.role), ['user']);
});

test('a round with a tool call is read: thinking with its signature, the arguments in pieces, the way it ended, and sent back as the app sends it', async () => {
  const run = await ask({ fetchImpl: async () => reply(thinkingThenCall()), key: KEY, payload: {} });
  assert.equal(run.ok, true);
  assert.equal(run.stopReason, 'tool_use');
  assert.equal(run.outputTokens, 240);
  assert.equal(run.thinkingChars, 'Let me plan the deck. '.length);
  assert.deepEqual(run.calls, [{ name: 'run_python', argumentsReadable: true, argumentChars: 34 }]);
  assert.deepEqual(run.collected.contentBlocks[0], { type: 'thinking', thinking: 'Let me plan the deck. ', signature: 'sig-abc' });

  const next = buildProbeRequest({ effort: 'high', maxTokens: null, prompt: 'Make a deck', tools: true, toolTurns: [{ assistant: run.collected, results: [{ id: 'toolu_1', name: 'run_python', content: '{"ok":true}' }] }] });
  assert.deepEqual(next.messages.map((message) => message.role), ['user', 'assistant', 'user'], 'the roles alternate');
  assert.deepEqual(next.messages[1].content.map((block) => block.type), ['thinking', 'tool_use'], 'the thinking block comes back with the call');
  assert.equal(next.messages[1].content[0].signature, 'sig-abc');
  assert.deepEqual(next.messages[2].content, [{ type: 'tool_result', tool_use_id: 'toolu_1', content: '{"ok":true}' }]);
});

test('a round cut at the limit while it thinks has no call and no text, and the loop of Advanced mode says so', async () => {
  const run = await ask({ fetchImpl: async () => reply(cutInThinking), key: KEY, payload: {} });
  assert.equal(run.stopReason, 'max_tokens');
  assert.deepEqual(run.calls, []);
  assert.equal(run.textChars, 0);

  // The same stream through the loop of the app (what a reply of this model does when it is cut): no step, no answer, the reply "done".
  const collector = createAnthropicCollector();
  for (const event of cutInThinking) collector.add(event);
  await assert.rejects(runSandboxReply({
    streamApiCall: async (parts, onChunk, signal, forced, options) => { options.onResponseComplete(collector.result()); return ''; },
    requestParts: [{ text: 'Make a deck' }],
    getSandbox: () => { throw new Error('the sandbox is not needed'); },
    language: 'en'
  }), /output limit/, 'it is said that the model ran out of its output limit (it used to end as a reply with no answer)');
});

test('the probe tells the service refusing a limit, a call cut, and a request that ended at the limit, and never the key', async () => {
  const answers = [
    () => reply([{ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 4 } }]),            // 16384
    () => reply([{ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 4 } }]),            // 32768
    () => reply([{ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 4 } }]),            // 65536
    () => new Response(`{"error":"max_tokens: 131072 > 64000 for key ${KEY}"}`, { status: 400 }),                           // 131072
    () => reply(cutInThinking),                                                                                            // tools medium
    () => reply(thinkingThenCall()),                                                                                       // tools high
    () => reply([{ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 7 } }])                // loop of high
  ];
  const shown = [];
  const results = await probe({ key: KEY, efforts: ['medium', 'high'], limits: [16384], fetchImpl: async () => answers.shift()(), log: (text) => shown.push(text) });
  const text = shown.join('\n');
  assert.equal(text.includes(KEY), false, 'the key is never shown');
  assert.equal(JSON.stringify(results).includes(KEY), false, 'nor kept');
  assert.equal(results.limits.filter((run) => !run.ok).length, 1);
  assert.equal(results.limits[3].status, 400);
  const notes = results.verdict.join('\n');
  assert.match(notes, /1 of 2 requests for a file ended at max_tokens \(medium@16384\)/);
  assert.match(notes, /refused these limits: 131072 \(HTTP 400/);
  assert.match(line('x', results.tools[0]), /max_tokens +out +16384 tok/);
  assert.deepEqual(verdict({ limits: [], tools: [], loop: [] }), ['Nothing wrong was found in this run: every request ended normally and every call of the tool was readable.']);
});
