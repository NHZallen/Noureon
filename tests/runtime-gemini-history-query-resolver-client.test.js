import assert from 'node:assert/strict';
import test from 'node:test';

import { createGeminiHistoryQueryResolverClient } from '../src/app/runtime/memory/gemini-history-query-resolver-client.js';

test('resolves an ambiguous history query with Gemini Flash Lite using a header API key', async () => {
  const requests = [];
  const client = createGeminiHistoryQueryResolverClient({
    getApiKey: () => 'secret-key',
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"resolvedQuery":"compare two memory options","confidence":0.8,"shouldRetrieve":true}' }] } }] }) };
    }
  });

  const result = await client.resolve({ queryText: 'what?', conversationContext: { currentTopic: 'Memory', recentMessages: ['option one', 'option two'] } });

  assert.deepEqual(result, { resolvedQuery: 'compare two memory options', confidence: 0.8, shouldRetrieve: true });
  assert.equal(requests[0].options.headers['x-goog-api-key'], 'secret-key');
  assert.doesNotMatch(requests[0].url, /secret-key/);
});
