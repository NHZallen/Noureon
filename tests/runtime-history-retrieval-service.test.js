import assert from 'node:assert/strict';
import test from 'node:test';

import { createHistoryIndexStore } from '../src/app/runtime/memory/history-index-store.js';
import { createHistoryRetrievalService } from '../src/app/runtime/memory/history-retrieval-service.js';

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
        { id: 'old', summary: 'The old memory design decision.', sourceRefs: [{ messageId: 'old-message' }] },
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
    getMemoryState: () => ({ mediaMemories: [{ id: 'cat', messageId: 'photo-message', kind: 'image', name: 'cat.jpg', summary: 'A black cat on a sofa.' }] })
  });

  const results = await service.retrieve({
    currentMessage: { parts: [{ text: 'find the cat photo' }] },
    conversation: { id: 'current-chat' }
  });

  assert.equal(results[0].summary, 'image (cat.jpg): A black cat on a sofa.');
  assert.deepEqual(results[0].sourceIds, ['photo-message']);
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
