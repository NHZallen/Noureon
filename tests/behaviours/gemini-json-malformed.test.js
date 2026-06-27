import assert from 'node:assert/strict';
import test from 'node:test';

const createGeminiJsonStream = (chunks) => {
  const encoder = new TextEncoder();

  return new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => {
        controller.enqueue(encoder.encode(chunk));
      });
      controller.close();
    }
  });
};

const createGeminiJsonObject = (text) => JSON.stringify({
  candidates: [{
    content: {
      parts: [{ text }]
    }
  }]
});

const consumeGeminiJsonStream = async (stream, onChunk) => {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalText = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    while (true) {
      const firstBrace = buffer.indexOf('{');
      if (firstBrace === -1) break;

      let braceCount = 0;
      let endIndex = -1;
      for (let index = firstBrace; index < buffer.length; index += 1) {
        if (buffer[index] === '{') {
          braceCount += 1;
        } else if (buffer[index] === '}') {
          braceCount -= 1;
        }

        if (braceCount === 0) {
          endIndex = index;
          break;
        }
      }

      if (endIndex === -1) break;

      const jsonString = buffer.substring(firstBrace, endIndex + 1);
      buffer = buffer.substring(endIndex + 1);

      try {
        const parsed = JSON.parse(jsonString);
        const textChunk = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (textChunk) {
          finalText += textChunk;
          onChunk?.(textChunk);
        }
      } catch (error) {
        console.warn('Gemini JSON fixture parse warning:', error, 'chunk:', jsonString);
      }
    }
  }

  return finalText;
};

test('Gemini JSON fixture warns, skips, and continues after malformed complete objects', async () => {
  // Harness-level Gemini malformed JSON fixture proof. This
  // establishes the malformed complete object warn / skip / continue test
  // pattern. It is not a production streamApiCall parser test; production
  // Gemini parsing still lives in the legacy runtime closure. Nested braces
  // inside JSON strings, malformed partial objects, byte-level split,
  // abort/error, and incremental DOM render are left for later small slices.
  const receivedChunks = [];
  const warnCalls = [];
  const originalWarn = console.warn;
  const stream = createGeminiJsonStream([
    createGeminiJsonObject('Hello'),
    '{"candidates":[}',
    createGeminiJsonObject('Astra')
  ]);

  console.warn = (...args) => {
    warnCalls.push(args);
  };

  try {
    const finalText = await consumeGeminiJsonStream(stream, (chunk) => {
      receivedChunks.push(chunk);
    });

    assert.deepEqual(receivedChunks, ['Hello', 'Astra']);
    assert.equal(finalText, 'HelloAstra');
    assert.equal(warnCalls.length, 1);
    assert.equal(warnCalls[0].at(-1), '{"candidates":[}');
  } finally {
    console.warn = originalWarn;
  }
});
