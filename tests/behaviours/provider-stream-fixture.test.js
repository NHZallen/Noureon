import assert from 'node:assert/strict';
import test from 'node:test';

const createTextChunkStream = (chunks) => {
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

const consumeTextStream = async (stream, onChunk) => {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let finalText = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    finalText += chunk;
    onChunk?.(chunk);
  }

  const tail = decoder.decode();
  if (tail) {
    finalText += tail;
    onChunk?.(tail);
  }

  return finalText;
};

test('provider stream fixture accumulates decoded chunks in order', async () => {
  // Harness-level stream fixture proof:
  // this establishes the provider stream fixture / accumulation test pattern.
  // It is not a production stream parser test. The production stream parser
  // and renderer still live in the legacy runtime closure. Future
  // slices can add SSE, Gemini JSON, abort/error, and incremental DOM fixtures.
  const receivedChunks = [];
  const stream = createTextChunkStream(['Hello', ' ', 'Astra']);

  const finalText = await consumeTextStream(stream, (chunk) => {
    receivedChunks.push(chunk);
  });

  assert.deepEqual(receivedChunks, ['Hello', ' ', 'Astra']);
  assert.equal(finalText, 'Hello Astra');
});

test('provider stream fixture preserves multibyte Unicode chunks', async () => {
  const receivedChunks = [];
  const stream = createTextChunkStream(['你好', '，', 'Astra', ' ✨']);

  const finalText = await consumeTextStream(stream, (chunk) => {
    receivedChunks.push(chunk);
  });

  assert.deepEqual(receivedChunks, ['你好', '，', 'Astra', ' ✨']);
  assert.equal(finalText, '你好，Astra ✨');
});

test('provider stream fixture returns an empty string for an empty stream', async () => {
  const receivedChunks = [];
  const stream = createTextChunkStream([]);

  const finalText = await consumeTextStream(stream, (chunk) => {
    receivedChunks.push(chunk);
  });

  assert.deepEqual(receivedChunks, []);
  assert.equal(finalText, '');
});
