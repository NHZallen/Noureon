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

const splitBefore = (text, marker) => {
  const index = text.indexOf(marker);
  assert.notEqual(index, -1);
  return [text.slice(0, index), text.slice(index)];
};

const consumeGeminiJsonStream = async (stream, onChunk, options = {}) => {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalText = '';
  let readCount = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    readCount += 1;
    buffer += decoder.decode(value, { stream: true });
    options.onAfterRead?.({ readCount, buffer, finalText });

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

test('Gemini JSON fixture buffers partial objects until closing braces arrive', async () => {
  // V3 Phase 5 harness-level Gemini partial JSON object fixture proof. This
  // establishes the brace-count buffer / partial object test pattern. It is not
  // a production streamApiCall parser test; production Gemini parsing still
  // lives in the legacy runtime closure. Malformed Gemini JSON, byte-level
  // split, nested string braces, abort/error, and incremental DOM render are
  // left for later small slices.
  const firstObject = createGeminiJsonObject('Hello ');
  const secondObject = createGeminiJsonObject('Astra');
  const firstChunks = splitBefore(firstObject, '"parts"');
  const secondChunks = splitBefore(secondObject, '"text"');
  const receivedChunks = [];
  const snapshots = [];
  const stream = createGeminiJsonStream([
    ...firstChunks,
    ...secondChunks
  ]);

  const finalText = await consumeGeminiJsonStream(
    stream,
    (chunk) => {
      receivedChunks.push(chunk);
    },
    {
      onAfterRead: ({ readCount, buffer, finalText: currentText }) => {
        snapshots.push({
          readCount,
          buffer,
          finalText: currentText,
          receivedCount: receivedChunks.length
        });
      }
    }
  );

  assert.equal(snapshots[0].receivedCount, 0);
  assert.equal(snapshots[0].finalText, '');
  assert.equal(snapshots[0].buffer.includes('"candidates"'), true);
  assert.equal(snapshots[0].buffer.includes('"parts"'), false);
  assert.deepEqual(receivedChunks, ['Hello ', 'Astra']);
  assert.equal(finalText, 'Hello Astra');
});
