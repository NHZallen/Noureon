import assert from 'node:assert/strict';
import test from 'node:test';

import { createHistoryIndexStore } from '../src/app/runtime/memory/history-index-store.js';
import {
  createHistoryRetrievalService,
  getExactHistoryRecallRequest
} from '../src/app/runtime/memory/history-retrieval-service.js';

test('retrieves only relevant capsules outside the current conversation', async () => {
  const index = createHistoryIndexStore();
  index.put({
    recordId: 'capsule:old',
    capsuleId: 'old',
    conversationId: 'old-chat',
    vector: [1, 0],
    normalizedKeywords: ['memory system'],
    entities: ['Noureon']
  });
  index.put({
    recordId: 'capsule:current',
    capsuleId: 'current',
    conversationId: 'current-chat',
    vector: [1, 0],
    normalizedKeywords: ['memory system'],
    entities: ['Noureon']
  });
  index.put({
    recordId: 'capsule:unrelated',
    capsuleId: 'unrelated',
    conversationId: 'css-chat',
    vector: [0, 1],
    normalizedKeywords: ['css'],
    entities: []
  });
  const service = createHistoryRetrievalService({
    index,
    embeddingClient: { embedHistoryQuery: async () => [1, 0] },
    getMemoryState: () => ({
      conversationCapsules: [
        { id: 'old', conversationId: 'old-chat', summary: 'The old memory design decision.', sourceRefs: [{ messageId: 'old-message' }] },
        { id: 'current', summary: 'Current chat should never be recalled.', sourceRefs: [] },
        { id: 'unrelated', summary: 'A CSS issue.', sourceRefs: [] }
      ]
    })
  });

  const results = await service.retrieve({
    currentMessage: { parts: [{ text: 'Noureon memory system' }] },
    conversation: { id: 'current-chat', title: 'Current memory work' }
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].recordId, 'capsule:old');
  assert.equal(results[0].conversationId, 'old-chat');
  assert.equal(results[0].summary, 'The old memory design decision.');
  assert.deepEqual(results[0].sourceIds, ['old-message']);
  assert.ok(results[0].score >= 0.8);
});

test('does not embed an ambiguous short fragment', async () => {
  let embeds = 0;
  const service = createHistoryRetrievalService({
    index: createHistoryIndexStore(),
    embeddingClient: { embedHistoryQuery: async () => { embeds += 1; return [1, 0]; } },
    getMemoryState: () => ({})
  });

  const results = await service.retrieve({
    currentMessage: { parts: [{ text: 'what?' }] },
    conversation: { id: 'current-chat' }
  });

  assert.deepEqual(results, []);
  assert.equal(embeds, 0);
});

test('returns a matching media description as model-readable historical context', async () => {
  const index = createHistoryIndexStore();
  index.put({ recordId: 'media:cat', recordType: 'media-memory', mediaMemoryId: 'cat', conversationId: 'old-chat', vector: [1, 0] });
  const service = createHistoryRetrievalService({
    index,
    embeddingClient: { embedHistoryQuery: async () => [1, 0] },
    getMemoryState: () => ({ mediaMemories: [{ id: 'cat', conversationId: 'old-chat', messageId: 'photo-message', kind: 'image', name: 'cat.jpg', summary: 'A black cat on a sofa.' }] })
  });

  const results = await service.retrieve({
    currentMessage: { parts: [{ text: 'find the cat photo' }] },
    conversation: { id: 'current-chat' }
  });

  assert.equal(results[0].summary, 'image (cat.jpg): A black cat on a sofa.');
  assert.equal(results[0].conversationId, 'old-chat');
  assert.deepEqual(results[0].sourceIds, ['photo-message']);
});

test('returns an indexed conversation detail fragment instead of reducing it to the chat capsule', async () => {
  const index = createHistoryIndexStore();
  index.put({
    recordId: 'fragment:old-chat:0',
    recordType: 'conversation-fragment',
    conversationId: 'old-chat',
    sourceHash: 'old-hash',
    vector: [1, 0],
    normalizedKeywords: ['openclaw vps nuc'],
    snippet: 'User: I plan to deploy OpenClaw on a VPS.\nAssistant: A small VPS is not suitable; use the NUC for the local workload.',
    sourceIds: ['old-user', 'old-assistant']
  });
  const service = createHistoryRetrievalService({
    index,
    embeddingClient: { embedHistoryQuery: async () => [1, 0] },
    getMemoryState: () => ({})
  });

  const results = await service.retrieve({
    currentMessage: { parts: [{ text: 'Is that OpenClaw CLI still suitable for a VPS?' }] },
    conversation: { id: 'current-chat' }
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].summary, 'User: I plan to deploy OpenClaw on a VPS.\nAssistant: A small VPS is not suitable; use the NUC for the local workload.');
  assert.deepEqual(results[0].sourceIds, ['old-user', 'old-assistant']);
});

test('explicit same-as-before requests recover the complete matching conversation in order', async () => {
  const index = createHistoryIndexStore();
  index.put({
    recordId: 'fragment:recipe-chat:0', recordType: 'conversation-fragment', conversationId: 'recipe-chat', fragmentIndex: 0,
    vector: [0, 1], updatedAt: '2026-07-29T10:00:00.000Z',
    snippet: 'User: 給我巧克力派食譜。\nAssistant: ## Chocolate pie\n- 200g dark chocolate\n- 120ml cream',
    sourceIds: ['recipe-user', 'recipe-answer']
  });
  index.put({
    recordId: 'fragment:recipe-chat:1', recordType: 'conversation-fragment', conversationId: 'recipe-chat', fragmentIndex: 1,
    vector: [0, 1], updatedAt: '2026-07-29T10:00:00.000Z',
    snippet: 'Assistant: 1. Melt the chocolate.\n2. Chill for four hours.',
    sourceIds: ['recipe-answer']
  });
  index.put({
    recordId: 'fragment:other-chat:0', recordType: 'conversation-fragment', conversationId: 'other-chat', fragmentIndex: 0,
    vector: [1, 0], updatedAt: '2026-07-30T10:00:00.000Z',
    snippet: 'Assistant: A new pie recipe with different quantities.',
    sourceIds: ['other-answer']
  });
  const embeddedQueries = [];
  const service = createHistoryRetrievalService({
    index,
    embeddingClient: { embedHistoryQuery: async query => { embeddedQueries.push(query); return [1, 0]; } },
    getMemoryState: () => ({})
  });

  const results = await service.retrieve({
    currentMessage: { parts: [{ text: '給我之前巧克力派的完整食譜，一定要跟上次的一樣。' }] },
    conversation: { id: 'current-chat' }
  });

  assert.deepEqual(getExactHistoryRecallRequest('給我之前巧克力派的完整食譜，一定要跟上次的一樣。'), {
    exact: true,
    subject: '巧克力派'
  });
  assert.deepEqual(embeddedQueries, ['巧克力派']);
  assert.deepEqual(results.map(result => result.recordId), [
    'fragment:recipe-chat:0',
    'fragment:recipe-chat:1'
  ]);
  assert.ok(results.every(result => result.matchMode === 'exact'));
  assert.match(results.map(result => result.summary).join('\n'), /200g dark chocolate/);
  assert.match(results.map(result => result.summary).join('\n'), /Chill for four hours/);
});

test('exact requests use the original local conversation before any semantic index lookup', async () => {
  let embedded = 0;
  let indexed = 0;
  const service = createHistoryRetrievalService({
    index: { queryHybrid: () => { indexed += 1; return []; } },
    embeddingClient: { embedHistoryQuery: async () => { embedded += 1; return [1, 0]; } },
    getMemoryState: () => ({}),
    getConversations: () => [{
      id: 'recipe-chat',
      title: '甜點',
      lastUpdatedAt: '2026-07-29T10:00:00.000Z',
      messages: [
        { id: 'recipe-user', role: 'user', parts: [{ text: '給我巧克力派食譜。' }] },
        { id: 'recipe-answer', role: 'model', parts: [{ text: '200g 黑巧克力\n120ml 鮮奶油\n冷藏四小時。' }] }
      ]
    }]
  });

  const results = await service.retrieve({
    currentMessage: { parts: [{ text: '給我之前巧克力派的完整食譜，一定要跟上次的一樣。' }] },
    conversation: { id: 'current-chat' }
  });

  assert.equal(embedded, 0);
  assert.equal(indexed, 0);
  assert.deepEqual(results.map(result => result.summary), [
    'User: 給我巧克力派食譜。',
    'Assistant: 200g 黑巧克力\n120ml 鮮奶油\n冷藏四小時。'
  ]);
  assert.ok(results.every(result => result.matchMode === 'exact'));
});

test('uses the model resolver only for unresolved fragments and requires high confidence', async () => {
  const index = createHistoryIndexStore();
  index.put({ recordId: 'capsule:old', capsuleId: 'old', conversationId: 'old-chat', vector: [1, 0] });
  const calls = [];
  const service = createHistoryRetrievalService({
    index,
    embeddingClient: { embedHistoryQuery: async query => { calls.push(['embed', query]); return [1, 0]; } },
    modelQueryResolver: { resolve: async input => { calls.push(['resolve', input]); return { resolvedQuery: 'compare memory capture and history recall', confidence: 0.9, shouldRetrieve: true }; } },
    getMemoryState: () => ({ conversationCapsules: [{ id: 'old', summary: 'Previous memory design.' }] })
  });

  const results = await service.retrieve({
    currentMessage: { parts: [{ text: 'what?' }] },
    conversation: { id: 'current-chat', title: 'Memory design', messages: [] }
  });

  assert.equal(calls[0][0], 'resolve');
  assert.match(calls[1][1], /compare memory capture/);
  assert.equal(results.length, 1);
});
