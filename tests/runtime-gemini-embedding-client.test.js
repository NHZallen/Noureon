import assert from 'node:assert/strict';
import test from 'node:test';

import { createGeminiEmbeddingClient } from '../src/app/runtime/memory/gemini-embedding-client.js';
import { GEMINI_FILE_INLINE_LIMIT_BYTES } from '../src/app/runtime/memory/gemini-file-api-client.js';

test('embeds a history query with Gemini Embedding 2 without exposing the key in the URL', async () => {
  const calls = [];
  const client = createGeminiEmbeddingClient({
    getApiKey: () => 'gemini-secret',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        async json() {
          return { embedding: { values: [0.1, 0.2] } };
        }
      };
    }
  });

  const vector = await client.embedHistoryQuery('這跟 2 有什麼差');

  assert.deepEqual(vector, [0.1, 0.2]);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /gemini-embedding-2:embedContent$/);
  assert.doesNotMatch(calls[0].url, /gemini-secret/);
  assert.equal(calls[0].options.headers['x-goog-api-key'], 'gemini-secret');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    content: { parts: [{ text: 'task: search result | query: 這跟 2 有什麼差' }] },
    output_dimensionality: 768
  });
});

test('rejects embedding requests when no Gemini key is configured', async () => {
  const client = createGeminiEmbeddingClient({ getApiKey: () => '' });

  await assert.rejects(
    () => client.embedHistoryDocument({ title: 'none', text: '記憶功能討論' }),
    /Gemini API 金鑰/
  );
});

test('uses a temporary Gemini File reference for large multimodal embeddings and deletes it after success', async () => {
  const uploads = [];
  const removals = [];
  const calls = [];
  const client = createGeminiEmbeddingClient({
    getApiKey: () => 'gemini-secret',
    fileApiClient: {
      upload: async input => {
        uploads.push(input);
        return { name: 'files/large-video', uri: 'https://files.example/large-video' };
      },
      remove: async input => removals.push(input)
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, async json() { return { embedding: { values: [0.3, 0.4] } }; } };
    }
  });

  const vector = await client.embedMedia({
    mimeType: 'video/mp4',
    name: 'clip.mp4',
    data: 'YQ==',
    size: GEMINI_FILE_INLINE_LIMIT_BYTES + 1
  });

  assert.deepEqual(vector, [0.3, 0.4]);
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].attachment.name, 'clip.mp4');
  assert.deepEqual(JSON.parse(calls[0].options.body).content.parts, [{
    file_data: { mime_type: 'video/mp4', file_uri: 'https://files.example/large-video' }
  }]);
  assert.deepEqual(removals, [{ apiKey: 'gemini-secret', fileName: 'files/large-video' }]);
});
