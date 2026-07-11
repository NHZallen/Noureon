import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveHistoryQuery } from '../src/app/runtime/memory/history-query-resolver.js';

test('expands a numbered reference using the current conversation context', () => {
  const result = resolveHistoryQuery({
    queryText: '這跟 2 有啥差？',
    conversationContext: {
      numberedReferences: [
        { number: 1, text: '近期對話摘要' },
        { number: 2, text: '個人脈絡搜尋' }
      ],
      currentTopic: '比較近期對話摘要與個人脈絡搜尋的差異'
    }
  });

  assert.deepEqual(result, {
    originalQuery: '這跟 2 有啥差？',
    resolvedQuery: '比較「目前問題」與「個人脈絡搜尋」的差異：比較近期對話摘要與個人脈絡搜尋的差異',
    resolutionMethod: 'deterministic-numbered-reference',
    confidence: 1,
    shouldRetrieve: true
  });
});

test('does not retrieve history for an ambiguous fragment without usable context', () => {
  const result = resolveHistoryQuery({ queryText: '這個呢？' });

  assert.equal(result.resolutionMethod, 'unresolved');
  assert.equal(result.confidence, 0);
  assert.equal(result.shouldRetrieve, false);
});

test('keeps a complete query intact without invoking model resolution', () => {
  const result = resolveHistoryQuery({
    queryText: '找我以前討論過 Gemini Embedding 2 成本控制的內容',
    allowModelResolution: false
  });

  assert.deepEqual(result, {
    originalQuery: '找我以前討論過 Gemini Embedding 2 成本控制的內容',
    resolvedQuery: '找我以前討論過 Gemini Embedding 2 成本控制的內容',
    resolutionMethod: 'direct',
    confidence: 1,
    shouldRetrieve: true
  });
});
