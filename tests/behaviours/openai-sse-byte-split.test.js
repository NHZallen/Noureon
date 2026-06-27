import assert from 'node:assert/strict';
import test from 'node:test';

const createByteStream = (byteChunks) => new ReadableStream({
  start(controller) {
    byteChunks.forEach((chunk) => {
      controller.enqueue(chunk);
    });
    controller.close();
  }
});

const findByteSequence = (source, needle) => {
  for (let index = 0; index <= source.length - needle.length; index += 1) {
    const matches = needle.every((byte, offset) => source[index + offset] === byte);
    if (matches) return index;
  }
  return -1;
};

const createSplitMultibyteSseStream = (content) => {
  const encoder = new TextEncoder();
  const source = `data: {"choices":[{"delta":{"content":"${content}"}}]}\n\n` +
    'data: [DONE]\n\n';
  const sourceBytes = encoder.encode(source);
  const characterBytes = encoder.encode(content);
  const characterByteStart = findByteSequence(sourceBytes, characterBytes);

  assert.notEqual(characterByteStart, -1);
  assert.equal(characterBytes.length > 1, true);

  const splitOffset = characterByteStart + 1;
  const characterByteEnd = characterByteStart + characterBytes.length;
  const stream = createByteStream([
    sourceBytes.slice(0, splitOffset),
    sourceBytes.slice(splitOffset)
  ]);

  return {
    stream,
    splitOffset,
    characterByteStart,
    characterByteEnd
  };
};

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

test('OpenAI-compatible SSE fixture preserves a multibyte character split across byte chunks', async () => {
  // Harness-level OpenAI-compatible SSE byte-level multibyte split
  // fixture proof. This establishes the UTF-8 decoder boundary test pattern.
  // It is not a production streamApiCall parser test; production SSE parsing
  // still lives in the legacy runtime closure. The shared createSseStream helper
  // intentionally remains string-oriented. Gemini JSON, partial [DONE],
  // abort/error, and incremental DOM render are left for later small slices.
  const receivedChunks = [];
  const { stream, splitOffset, characterByteStart, characterByteEnd } = createSplitMultibyteSseStream('你');

  const finalText = await consumeOpenAiCompatibleSse(stream, (chunk) => {
    receivedChunks.push(chunk);
  });

  assert.equal(splitOffset > characterByteStart, true);
  assert.equal(splitOffset < characterByteEnd, true);
  assert.deepEqual(receivedChunks, ['你']);
  assert.equal(finalText, '你');
  assert.equal(finalText.includes('�'), false);
});
