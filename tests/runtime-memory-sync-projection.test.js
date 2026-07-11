import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mergeSyncedMemoryState,
  projectMemoryStateForSync
} from '../src/app/runtime/memory/memory-sync-projection.js';

test('sync projection excludes candidates, capsules, recent state, and local usage records', () => {
  const projection = projectMemoryStateForSync({
    profileEntries: [
      { id: 'confirmed', confirmedByUser: true },
      { id: 'candidate', confirmedByUser: false }
    ],
    suppressionRules: [{ type: 'do-not-mention', target: 'profile-name' }],
    longTermTopicSummaries: [{ id: 'topic-1', summary: 'A durable topic' }],
    profileCandidates: [{ id: 'review' }],
    conversationCapsules: [{ id: 'capsule' }],
    recentConversationStates: [{ conversationId: 'chat' }],
    memoryUsageRecords: [{ id: 'usage' }]
  });

  assert.deepEqual(projection, {
    version: 1,
    profileEntries: [{ id: 'confirmed', confirmedByUser: true }],
    suppressionRules: [{ type: 'do-not-mention', target: 'profile-name' }],
    longTermTopicSummaries: [{ id: 'topic-1', summary: 'A durable topic' }]
  });
});

test('merges a synced confirmed preference without replacing local-only index inputs', () => {
  const merged = mergeSyncedMemoryState({
    profileEntries: [{ id: 'language', confirmedByUser: true, content: 'English', updatedAt: '2026-01-01' }],
    conversationCapsules: [{ id: 'local-capsule' }],
    profileCandidates: [{ id: 'local-review' }]
  }, {
    version: 1,
    profileEntries: [{ id: 'language', confirmedByUser: true, content: 'Traditional Chinese', updatedAt: '2026-07-11' }],
    suppressionRules: [],
    longTermTopicSummaries: []
  });

  assert.equal(merged.profileEntries[0].content, 'Traditional Chinese');
  assert.deepEqual(merged.conversationCapsules, [{ id: 'local-capsule' }]);
  assert.deepEqual(merged.profileCandidates, [{ id: 'local-review' }]);
});
