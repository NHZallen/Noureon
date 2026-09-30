import assert from 'node:assert/strict';
import test from 'node:test';

import { briefingPart, needsSearchBriefing, runSearchBriefing } from '../../src/app/runtime/sandbox/search-briefing.js';

test('only Gemini with web search wanted has to search first', () => {
  const gemini = { provider: 'gemini' };
  assert.equal(needsSearchBriefing({ modelInfo: gemini, webSearchEnabled: true, conversation: {} }), true, 'asked for this reply');
  assert.equal(needsSearchBriefing({ modelInfo: gemini, webSearchEnabled: false, conversation: { isWebSearchEnabled: true } }), true, 'switched on for the chat');
  assert.equal(needsSearchBriefing({ modelInfo: gemini, webSearchEnabled: false, conversation: { isWebSearchEnabled: false } }), false);
  assert.equal(needsSearchBriefing({ modelInfo: { provider: 'openrouter' }, webSearchEnabled: true, conversation: {} }), false, 'other providers keep their own way');
  assert.equal(needsSearchBriefing({ modelInfo: null, webSearchEnabled: true }), false);
});

test('the briefing is one Gemini call with web search and without the Python tool', async () => {
  const seen = [];
  const streamApiCall = async (parts, onChunk, signal, forced, options) => {
    seen.push({ parts, options });
    options.onSources([{ title: 'mozilla.org', url: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/x' }]);
    return '  Key finding: X (source: MDN).  ';
  };
  const requestParts = [{ text: 'What changed in CSS this year?' }];
  const briefing = await runSearchBriefing({
    streamApiCall,
    requestParts,
    requestOptions: {
      conversation: { isWebSearchEnabled: false },
      webSearchEnabled: false,
      ignoreConversationWebSearch: true,
      tools: [{ name: 'run_python' }],
      toolTurns: [{ assistant: {}, results: [] }],
      onReasoning: () => {},
      additionalSystemInstruction: 'Be brief.'
    }
  });
  const { parts, options } = seen[0];
  assert.equal(parts, requestParts, 'the request itself, unchanged');
  assert.equal(options.webSearchEnabled, true);
  assert.equal(options.ignoreConversationWebSearch, false);
  assert.deepEqual(options.tools, [], 'no tool: Gemini refuses search and a function tool together');
  assert.deepEqual(options.toolTurns, []);
  assert.equal(options.onReasoning, undefined, 'the briefing\'s thinking is not shown as the reply\'s');
  assert.match(options.additionalSystemInstruction, /^Be brief\.\n\nSearch the web/);
  assert.equal(briefing.text, 'Key finding: X (source: MDN).');
  assert.equal(briefing.sources.length, 1);
});

test('a long briefing is cut, and no briefing means no extra part', () => {
  const part = briefingPart({ text: 'Findings.' }, 'Gemini Flash');
  assert.match(part.text, /^# System-generated supporting context/);
  assert.match(part.text, /# Web search packet\nThis briefing was written from Gemini's web search for Gemini Flash\./);
  assert.match(part.text, /Findings\.\n\n# User request follows$/);
  assert.equal(briefingPart({ text: '' }), null);
  assert.equal(briefingPart(null), null);
});

test('the briefing is kept to a size that does not swamp the request', async () => {
  const streamApiCall = async () => 'x'.repeat(20_000);
  const briefing = await runSearchBriefing({ streamApiCall, requestParts: [{ text: 'q' }] });
  assert.equal(briefing.text.length, 7000);
  assert.deepEqual(briefing.sources, []);
});
