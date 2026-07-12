import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendMemoryUsageRecord,
  removeMemoryUsageRecords,
  snapshotMemoryContextUsage
} from '../src/app/runtime/memory/memory-usage-recording.js';

test('records only the context selected for a completed response and retains historical source ids', () => {
  const sources = snapshotMemoryContextUsage({
    currentChatSummary: 'Discussing memory settings.',
    profileEntries: [{ id: 'language', content: 'Use Traditional Chinese.' }],
    historyResults: [{ recordId: 'capsule:old', sourceIds: ['old-capsule'], summary: 'Earlier memory architecture decision.' }]
  });
  const next = appendMemoryUsageRecord({}, {
    id: 'usage-1',
    conversationId: 'current-chat',
    responseMessageId: 'assistant-1',
    sources,
    now: '2026-07-11T13:00:00.000Z'
  });

  assert.deepEqual(next.memoryUsageRecords[0].sourceIds, ['old-capsule']);
  assert.deepEqual(next.memoryUsageRecords[0].sources.map(source => source.type), [
    'current-conversation-state',
    'profile-entry',
    'history-result'
  ]);
  assert.equal(appendMemoryUsageRecord(next, {
    id: 'usage-2',
    conversationId: 'current-chat',
    responseMessageId: 'assistant-1',
    sources: [{ type: 'profile-entry', id: 'tone', label: 'Be direct.' }]
  }).memoryUsageRecords.length, 1);
  assert.deepEqual(removeMemoryUsageRecords(next, { conversationId: 'current-chat' }).memoryUsageRecords, []);
});
