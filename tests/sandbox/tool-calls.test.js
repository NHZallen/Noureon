import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyGeminiTools,
  applyOpenAiTools,
  createGeminiCollector,
  createOpenAiCollector
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
