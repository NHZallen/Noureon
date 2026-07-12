import assert from 'node:assert/strict';
import test from 'node:test';

import { createHistoryIndexStore } from '../src/app/runtime/memory/history-index-store.js';
import {
  consolidateOverlappingTopicSummaries,
  createTopicSummaryService
} from '../src/app/runtime/memory/topic-summaries.js';

test('creates a derived topic summary only for strongly related capsules', async () => {
  let memoryState = {
    conversationCapsules: [
      { id: 'current', summary: 'Current discussion', sourceRefs: [{ messageId: 'new-user', role: 'user' }] },
      { id: 'related', summary: 'Related discussion', sourceRefs: [{ messageId: 'old-user', role: 'user' }] }
    ],
    longTermTopicSummaries: []
  };
  const index = createHistoryIndexStore();
  index.put({ recordId: 'current', capsuleId: 'current', vector: [1, 0] });
  index.put({ recordId: 'related', capsuleId: 'related', vector: [0.99, 0.01] });
  const clientCalls = [];
  const service = createTopicSummaryService({
    index,
    topicClient: { summarize: async input => { clientCalls.push(input); return { topic: 'Memory design', summary: 'A shared design thread.' }; } },
    getMemoryState: () => memoryState,
    replaceMemoryState: next => { memoryState = next; },
    createId: () => 'topic-1',
    now: () => '2026-07-11T00:00:00.000Z'
  });

  const result = await service.updateForCapsule({ capsule: { id: 'current', topic: 'Memory', summary: 'Current discussion', sourceRefs: [{ messageId: 'new-user', role: 'user' }] } });

  assert.deepEqual(result, { updated: true, topicSummaryId: 'topic-1' });
  assert.equal(clientCalls.length, 1);
  assert.deepEqual(memoryState.longTermTopicSummaries, [{
    id: 'topic-1',
    topic: 'Memory design',
    summary: 'A shared design thread.',
    sourceCapsuleIds: ['current', 'related'],
    sourceRefs: [{ messageId: 'new-user', role: 'user' }, { messageId: 'old-user', role: 'user' }],
    claimType: 'derived-summary',
    updatedAt: '2026-07-11T00:00:00.000Z'
  }]);
});

test('does not call the topic model when no related capsule meets the threshold', async () => {
  const index = createHistoryIndexStore();
  index.put({ recordId: 'current', capsuleId: 'current', vector: [1, 0] });
  index.put({ recordId: 'unrelated', capsuleId: 'unrelated', vector: [0, 1] });
  const service = createTopicSummaryService({
    index,
    topicClient: { summarize: async () => { throw new Error('should not run'); } },
    getMemoryState: () => ({ conversationCapsules: [], longTermTopicSummaries: [] }),
    replaceMemoryState: () => {}
  });

  const result = await service.updateForCapsule({ capsule: { id: 'current', summary: 'Current' } });

  assert.deepEqual(result, { updated: false, reason: 'no-related-capsules' });
});

test('updates an overlapping topic instead of creating a synonymous duplicate', async () => {
  let memoryState = {
    conversationCapsules: [
      { id: 'a', topic: 'Identity', summary: 'User stated a name.' },
      { id: 'b', topic: 'Identity', summary: 'User discussed how names should be used.' },
      { id: 'c', topic: 'Identity', summary: 'User clarified naming preferences.' }
    ],
    longTermTopicSummaries: [{
      id: 'identity-topic',
      topic: 'User identity verification',
      summary: 'The user confirmed a name.',
      sourceCapsuleIds: ['a', 'b'],
      sourceRefs: [],
      updatedAt: '2026-07-11T00:00:00.000Z'
    }]
  };
  const index = createHistoryIndexStore();
  index.put({ recordId: 'c', capsuleId: 'c', vector: [1, 0] });
  index.put({ recordId: 'b', capsuleId: 'b', vector: [0.99, 0.01] });
  const calls = [];
  const service = createTopicSummaryService({
    index,
    topicClient: { summarize: async input => {
      calls.push(input);
      return { topic: 'User identity and naming preference', summary: 'The user confirmed a name and its appropriate use.' };
    } },
    getMemoryState: () => memoryState,
    replaceMemoryState: next => { memoryState = next; },
    createId: () => 'should-not-be-created',
    now: () => '2026-07-12T00:00:00.000Z'
  });

  await service.updateForCapsule({ capsule: memoryState.conversationCapsules[2] });

  assert.equal(memoryState.longTermTopicSummaries.length, 1);
  assert.equal(memoryState.longTermTopicSummaries[0].id, 'identity-topic');
  assert.deepEqual(memoryState.longTermTopicSummaries[0].sourceCapsuleIds, ['a', 'b', 'c']);
  assert.equal(calls[0].existingSummary, 'The user confirmed a name.');
});

test('consolidates existing overlapping summaries and tombstones the duplicate id', () => {
  const result = consolidateOverlappingTopicSummaries({
    longTermTopicSummaries: [
      { id: 'old', topic: 'User identity', summary: 'Old summary', sourceCapsuleIds: ['a', 'b'], updatedAt: '2026-07-11' },
      { id: 'new', topic: 'Identity and naming', summary: 'New summary', sourceCapsuleIds: ['b', 'c'], updatedAt: '2026-07-12' }
    ]
  });

  assert.equal(result.longTermTopicSummaries.length, 1);
  assert.equal(result.longTermTopicSummaries[0].id, 'new');
  assert.deepEqual(result.longTermTopicSummaries[0].sourceCapsuleIds, ['a', 'b', 'c']);
  assert.deepEqual(result.resolvedTopicSummaryIds, ['old']);
});
