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
      const parsed = JSON.parse(jsonString);
      const textChunk = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (textChunk) {
        finalText += textChunk;
        onChunk?.(textChunk);
      }
    }
  }

  return finalText;
};

test('Gemini JSON fixture preserves balanced braces inside text strings', async () => {
  // V3 Phase 5 harness-level Gemini nested balanced braces fixture proof. This
  // characterizes balanced braces inside JSON string content, such as
  // "Use {x}". It is not a production streamApiCall parser test; production
  // Gemini parsing still lives in the legacy runtime closure. Unbalanced
  // braces, escaped quotes, escaped braces, partial-object mixes, and parser
  // hardening are left for later audit / slices. This slice does not modify
  // the production brace-count parser.
  const receivedChunks = [];
  const stream = createGeminiJsonStream([
    createGeminiJsonObject('Use {x}')
  ]);

  const finalText = await consumeGeminiJsonStream(stream, (chunk) => {
    receivedChunks.push(chunk);
  });

  assert.deepEqual(receivedChunks, ['Use {x}']);
  assert.equal(finalText, 'Use {x}');
});
