import assert from 'node:assert/strict';
import test from 'node:test';

import { createGeminiEmbeddingClient } from '../src/app/runtime/memory/gemini-embedding-client.js';

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
