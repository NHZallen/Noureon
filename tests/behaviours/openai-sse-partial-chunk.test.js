import assert from 'node:assert/strict';
import test from 'node:test';

import { createSseStream } from './helpers/openai-sse-fixtures.js';

const consumeOpenAiCompatibleSse = async (stream, onChunk, options = {}) => {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalText = '';
  let doneReceived = false;

  while (!doneReceived) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.substring(6);
      if (data.trim() === '[DONE]') {
        doneReceived = true;
        break;
      }
      const parsed = JSON.parse(data);
      const chunk = parsed.choices[0]?.delta?.content || '';
      if (!chunk) continue;
      finalText += chunk;
      onChunk?.(chunk);
    }

    options.onAfterRead?.();
  }

  return finalText;
};

test('OpenAI-compatible SSE fixture buffers partial lines until newline completion', async () => {
  // V3 Phase 5 harness-level OpenAI-compatible SSE partial-line fixture proof:
  // this establishes the partial-line buffering test pattern. It is not a
  // production streamApiCall parser test; production SSE parsing still lives
  // in the legacy runtime closure. Malformed JSON, byte-level multibyte split,
  // Gemini JSON, abort/error, and incremental DOM render are later slices.
  const receivedChunks = [];
  const readSnapshots = [];
  const stream = createSseStream([
    'data: {',
    '"choices":[{"delta":{"content":"Hel"}}]}',
    '\n\n',
    'data: {"choices":[{"delta":{"content":"lo"}}]}',
    '\n\n',
    'data: {"choices":[{"delta":{"content":" Astra"}}]}\n\n',
    'data: [DONE]\n\n'
  ]);

  const finalText = await consumeOpenAiCompatibleSse(stream, (chunk) => {
    receivedChunks.push(chunk);
  }, {
    onAfterRead: () => {
      readSnapshots.push([...receivedChunks]);
    }
  });

  assert.deepEqual(readSnapshots[0], []);
  assert.deepEqual(readSnapshots[1], []);
  assert.deepEqual(readSnapshots[2], ['Hel']);
  assert.deepEqual(readSnapshots[4], ['Hel', 'lo']);
  assert.deepEqual(receivedChunks, ['Hel', 'lo', ' Astra']);
  assert.equal(finalText, 'Hello Astra');
});
