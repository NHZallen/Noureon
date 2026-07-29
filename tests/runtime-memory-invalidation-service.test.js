import assert from 'node:assert/strict';
import test from 'node:test';

import { createHistoryIndexStore } from '../src/app/runtime/memory/history-index-store.js';
import { createMemoryInvalidationService } from '../src/app/runtime/memory/memory-invalidation-service.js';

test('editing or deleting a source conversation removes every derived local record', async () => {
  let memoryState = {
    profileEntries: [{ id: 'confirmed', confirmedByUser: true, content: 'Keep concise' }],
    suppressionRules: [{ type: 'do-not-mention', target: 'profile-name' }],
    recentConversationStates: [{ conversationId: 'changed-chat', sourceHash: 'old' }],
    conversationCapsules: [{
      id: 'changed-capsule',
      conversationId: 'changed-chat',
      sourceRefs: [{ messageId: 'edited-message' }]
    }],
    profileCandidates: [{ id: 'candidate', sourceRefs: [{ messageId: 'edited-message' }] }],
    longTermTopicSummaries: [{ id: 'topic', sourceCapsuleIds: ['changed-capsule'] }],
  };
  const index = createHistoryIndexStore();
  index.put({ recordId: 'changed', conversationId: 'changed-chat', vector: [1] });
  index.put({ recordId: 'other', conversationId: 'other-chat', vector: [1] });
  let saves = 0;
  const service = createMemoryInvalidationService({
    index,
    persistence: { save: async () => { saves += 1; } },
    getMemoryState: () => memoryState,
    replaceMemoryState: next => { memoryState = next; }
  });

  const result = await service.invalidateSource({ conversationId: 'changed-chat', messageId: 'edited-message' });

  assert.deepEqual(result, { invalidatedCapsuleCount: 1 });
  assert.equal(saves, 1);
  assert.deepEqual(index.getAll().map(record => record.recordId), ['other']);
  assert.deepEqual(memoryState.profileEntries, [{ id: 'confirmed', confirmedByUser: true, content: 'Keep concise' }]);
  assert.deepEqual(memoryState.suppressionRules, [{ type: 'do-not-mention', target: 'profile-name' }]);
  assert.deepEqual(memoryState.recentConversationStates, []);
  assert.deepEqual(memoryState.conversationCapsules, []);
  assert.deepEqual(memoryState.profileCandidates, []);
  assert.deepEqual(memoryState.longTermTopicSummaries, []);
});

test('permanent source deletion clears the visible overview and leaves an explicit refresh available', async () => {
  let memoryState = {
    memoryEvidence: [{ conversationId: 'deleted-chat', messageId: 'message-1', content: 'Use a NUC.' }],
    memorySummary: {
      overview: 'Complete memory.',
      sections: [{ id: 'automatic', key: 'deployment', title: 'Deployment', content: 'Use a NUC.', sourceConversationIds: ['deleted-chat'], sourceMessageIds: ['message-1'] }]
    },
    memoryOverview: {
      overview: 'Visible deployment summary.',
      sections: [{ id: 'display', key: 'deployment', title: 'Deployment', content: 'Use a NUC.' }]
    }
  };
  const index = createHistoryIndexStore();
  const service = createMemoryInvalidationService({
    index,
    getMemoryState: () => memoryState,
    replaceMemoryState: next => { memoryState = next; }
  });

  await service.invalidateConversation({ conversationId: 'deleted-chat' });

  assert.equal(memoryState.memoryOverview.overview, '');
  assert.equal(memoryState.memoryOverview.needsRefresh, true);
  assert.equal(memoryState.memoryOverview.status, 'idle');
});
