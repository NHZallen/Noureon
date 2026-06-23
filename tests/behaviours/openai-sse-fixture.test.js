import assert from 'node:assert/strict';
import test from 'node:test';

import { createSseStream } from './helpers/openai-sse-fixtures.js';

const consumeOpenAiCompatibleSse = async (stream, onChunk) => {
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
  }

  return finalText;
};

test('OpenAI-compatible SSE fixture emits delta content in order', async () => {
  // V3 Phase 5 harness-level OpenAI-compatible SSE fixture proof:
  // this establishes the SSE fixture / consumer test pattern. It is not a
  // production streamApiCall parser test; production SSE parsing still lives
  // in the legacy runtime closure. Malformed JSON, partial chunks, Gemini JSON,
  // abort/error, and incremental DOM render are left for later small slices.
  const receivedChunks = [];
  const stream = createSseStream([
    'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
    '\n',
    'data: {"choices":[{"delta":{"content":" "}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"Astra"}}]}\n\n',
    'data: [DONE]\n\n'
  ]);

  const finalText = await consumeOpenAiCompatibleSse(stream, (chunk) => {
    receivedChunks.push(chunk);
  });

  assert.deepEqual(receivedChunks, ['Hello', ' ', 'Astra']);
  assert.equal(finalText, 'Hello Astra');
});
