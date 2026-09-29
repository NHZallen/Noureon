import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyGeminiTools,
  applyOpenAiTools,
  createGeminiCollector,
  createOpenAiCollector,
  modelStreamsRawThinking,
  partialJsonString
} from '../../src/app/legacy-runtime/features/tool-call-formats.js';
import { RUN_PYTHON_TOOL } from '../../src/app/runtime/sandbox/sandbox-guidance.js';

test('Gemini: tools are declared, and earlier rounds go back with the model parts unchanged', () => {
  const signedPart = { functionCall: { name: 'run_python', args: { code: 'print(1)' } }, thoughtSignature: 'sig-1' };
  const payload = { contents: [{ role: 'user', parts: [{ text: 'hi' }] }], tools: [{ googleSearch: {} }] };
  applyGeminiTools(payload, {
    tools: [RUN_PYTHON_TOOL],
    toolTurns: [{
      assistant: { text: '', parts: [{ text: 'Let me check.', thoughtSignature: 'sig-0' }, signedPart], toolCalls: [] },
      results: [{ id: 'gemini-call-1', geminiId: '', name: 'run_python', content: '{"ok":true}' }]
    }]
  });
  assert.deepEqual(payload.tools[0], { googleSearch: {} }, 'web search stays');
  assert.equal(payload.tools[1].functionDeclarations[0].name, 'run_python');
  assert.deepEqual(payload.toolConfig, { functionCallingConfig: { mode: 'AUTO' } });
  assert.equal(payload.contents[1].role, 'model');
  assert.equal(payload.contents[1].parts[1], signedPart, 'the signed part is sent back as is');
  assert.deepEqual(payload.contents[2], {
    role: 'user',
    parts: [{ functionResponse: { name: 'run_python', response: { result: '{"ok":true}' } } }]
  });
});

test('Gemini stream: text is shown, thoughts are not, calls are collected with their parts', () => {
  const collector = createGeminiCollector();
  assert.equal(collector.add({ candidates: [{ content: { parts: [{ text: 'thinking', thought: true }, { text: 'Hello ' }] } }] }), 'Hello ');
  assert.equal(collector.add({ candidates: [{ content: { parts: [{ functionCall: { id: 'x1', name: 'run_python', args: { code: 'print(2)', title: 'T' } }, thoughtSignature: 's' }] } }] }), '');
  const result = collector.result();
  assert.equal(result.text, 'Hello ');
  assert.equal(result.parts.length, 3);
  assert.deepEqual(result.toolCalls, [{ id: 'x1', geminiId: 'x1', name: 'run_python', arguments: '{"code":"print(2)","title":"T"}', args: { code: 'print(2)', title: 'T' } }]);
});

test('OpenAI-compatible: tools, the assistant tool_calls message and one tool message per result', () => {
  const payload = { messages: [{ role: 'user', content: 'hi' }] };
  applyOpenAiTools(payload, {
    tools: [RUN_PYTHON_TOOL],
    toolTurns: [{
      assistant: {
        text: 'Checking.',
        toolCalls: [{ id: 'call_a', name: 'run_python', arguments: '{"code":"print(1)"}' }],
        reasoningDetails: [{ type: 'reasoning.encrypted', data: 'x' }]
      },
      results: [{ id: 'call_a', name: 'run_python', content: '{"ok":true}' }]
    }]
  });
  assert.deepEqual(payload.tools, [{ type: 'function', function: { name: 'run_python', description: RUN_PYTHON_TOOL.description, parameters: RUN_PYTHON_TOOL.parameters } }]);
  assert.equal(payload.tool_choice, 'auto');
  assert.deepEqual(payload.messages[1], {
    role: 'assistant',
    content: 'Checking.',
    tool_calls: [{ id: 'call_a', type: 'function', function: { name: 'run_python', arguments: '{"code":"print(1)"}' } }],
    reasoning_details: [{ type: 'reasoning.encrypted', data: 'x' }]
  });
  assert.deepEqual(payload.messages[2], { role: 'tool', tool_call_id: 'call_a', content: '{"ok":true}' });
});

test('OpenAI-compatible stream: argument pieces are joined per call index', () => {
  const collector = createOpenAiCollector();
  collector.add({ choices: [{ delta: { content: 'Sure. ' } }] });
  collector.add({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'run_python', arguments: '{"co' } }] } }] });
  collector.add({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'de":"print(3)"}' } }] } }] });
  collector.add({ choices: [{ delta: { tool_calls: [{ index: 1, id: 'call_2', function: { name: 'run_python', arguments: 'not json' } }] } }] });
  collector.add({ choices: [{ delta: { reasoning_details: [{ type: 'reasoning.text', text: 'r' }] }, finish_reason: 'tool_calls' }] });
  assert.equal(collector.add({}), '', 'a chunk without choices is ignored');
  const result = collector.result();
  assert.equal(result.text, 'Sure. ');
  assert.equal(result.finishReason, 'tool_calls');
  assert.deepEqual(result.toolCalls.map((call) => [call.id, call.name, call.args]), [
    ['call_1', 'run_python', { code: 'print(3)' }],
    ['call_2', 'run_python', null]
  ]);
  assert.equal(result.reasoningDetails.length, 1);
});

test('the code a model is writing can be read while its arguments still stream in', () => {
  assert.equal(partialJsonString('{"title":"t","code":"print(1)\\nx = \\"a\\"', 'code'), 'print(1)\nx = "a"');
  assert.equal(partialJsonString('{"code":"', 'code'), '');
  assert.equal(partialJsonString('{"tit', 'code'), '');
  assert.equal(partialJsonString('{"code":"a\\u4e2d\\u6', 'code'), 'a中', 'a half-written escape waits');
  assert.equal(partialJsonString('{"code":"done","title":"x"}', 'code'), 'done');
});

test('the thinking and the code being written are reported as they stream, whichever the provider', () => {
  const thoughts = [];
  const calls = [];
  const gemini = createGeminiCollector({ onReasoning: (text) => thoughts.push(text), onToolArguments: (call) => calls.push(call) });
  const visible = gemini.add({ candidates: [{ content: { parts: [{ text: '先想一下', thought: true }, { text: '答案' }, { functionCall: { name: 'run_python', args: { code: 'x' } } }] } }] });
  assert.equal(visible, '答案', 'thoughts are not part of the answer');
  assert.deepEqual(thoughts, ['先想一下']);
  assert.deepEqual(calls, [{ name: 'run_python', arguments: '{"code":"x"}' }]);

  const heard = [];
  const args = [];
  const open = createOpenAiCollector({ onReasoning: (text) => heard.push(text), onToolArguments: (call) => args.push(call.arguments) });
  open.add({ choices: [{ delta: { reasoning: '想', reasoning_details: [{ type: 'reasoning.text', text: '想' }] } }] });
  open.add({ choices: [{ delta: { reasoning_content: '再想' } }] });
  open.add({ choices: [{ delta: { reasoning_details: [{ type: 'reasoning.text', text: '只有細節' }] } }] });
  open.add({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'c', function: { name: 'run_python', arguments: '{"code":"pri' } }] } }] });
  open.add({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'nt(1)"}' } }] } }] });
  assert.deepEqual(heard, ['想', '再想', '只有細節'], 'one copy of each piece, from whichever field carries it');
  assert.deepEqual(args, ['{"code":"pri', '{"code":"print(1)"}']);
});

test('only models that stream their own thinking show it', () => {
  assert.equal(modelStreamsRawThinking('openrouter', 'deepseek/deepseek-v4.1-flash'), true);
  assert.equal(modelStreamsRawThinking('openrouter', 'z-ai/glm-5.3'), true);
  assert.equal(modelStreamsRawThinking('openrouter', 'moonshotai/kimi-k3'), true);
  assert.equal(modelStreamsRawThinking('openrouter', 'minimax/minimax-m3'), true);
  assert.equal(modelStreamsRawThinking('nvidia', 'moonshotai/kimi-k3'), true);
  for (const id of ['anthropic/claude-opus-5.5', 'openai/gpt-6-luna', 'google/gemini-3.1-flash-image', 'x-ai/grok-4.6']) assert.equal(modelStreamsRawThinking('openrouter', id), false, id);
  assert.equal(modelStreamsRawThinking('gemini', 'gemini-3.8-flash'), false);
});
