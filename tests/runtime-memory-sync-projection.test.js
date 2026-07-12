import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mergeSyncedMemoryState,
  projectMemoryStateForSync
} from '../src/app/runtime/memory/memory-sync-projection.js';

test('sync projection includes unresolved candidates while excluding capsules and recent state', () => {
  const projection = projectMemoryStateForSync({
    profileEntries: [
      { id: 'confirmed', confirmedByUser: true },
      { id: 'candidate', confirmedByUser: false }
    ],
    suppressionRules: [{ type: 'do-not-mention', target: 'profile-name' }],
    longTermTopicSummaries: [{ id: 'topic-1', summary: 'A durable topic' }],
    profileCandidates: [{ id: 'review', content: 'Keep' }, { id: 'dismissed', content: 'Drop' }],
    resolvedProfileCandidateIds: ['dismissed'],
    conversationCapsules: [{ id: 'capsule' }],
    recentConversationStates: [{ conversationId: 'chat' }]
  });

  assert.deepEqual(projection, {
    version: 1,
    profileEntries: [{ id: 'confirmed', confirmedByUser: true }],
    profileCandidates: [{ id: 'review', content: 'Keep' }],
    resolvedProfileCandidateIds: ['dismissed'],
    suppressionRules: [{ type: 'do-not-mention', target: 'profile-name' }],
    longTermTopicSummaries: [{ id: 'topic-1', summary: 'A durable topic' }]
  });
});

test('merges confirmed preferences and candidates without replacing local-only index inputs', () => {
  const merged = mergeSyncedMemoryState({
    profileEntries: [{ id: 'language', confirmedByUser: true, content: 'English', updatedAt: '2026-01-01' }],
    conversationCapsules: [{ id: 'local-capsule' }],
    profileCandidates: [{ id: 'local-review' }, { id: 'resolved-remote' }],
    resolvedProfileCandidateIds: []
  }, {
    version: 1,
    profileEntries: [{ id: 'language', confirmedByUser: true, content: 'Traditional Chinese', updatedAt: '2026-07-11' }],
    profileCandidates: [{ id: 'remote-review' }],
    resolvedProfileCandidateIds: ['resolved-remote'],
    suppressionRules: [],
    longTermTopicSummaries: []
  });

  assert.equal(merged.profileEntries[0].content, 'Traditional Chinese');
  assert.deepEqual(merged.conversationCapsules, [{ id: 'local-capsule' }]);
  assert.deepEqual(merged.profileCandidates, [{ id: 'local-review' }, { id: 'remote-review' }]);
  assert.deepEqual(merged.resolvedProfileCandidateIds, ['resolved-remote']);
});
