import assert from 'node:assert/strict';
import test from 'node:test';

import { activeMemoryRecordIds } from '../src/app/runtime/memory/history-index-records.js';

test('keeps only active conversation capsule, fragment, and media index records during rebuild cleanup', () => {
  const ids = activeMemoryRecordIds({
    conversationIds: new Set(['active']),
    memoryState: {
      conversationCapsules: [{ conversationId: 'active' }, { conversationId: 'deleted' }],
      mediaMemories: [{ conversationId: 'active', sourceHash: 'media' }, { conversationId: 'deleted', sourceHash: 'old' }]
    },
    records: [
      { recordId: 'fragment:active:0', recordType: 'conversation-fragment', conversationId: 'active' },
      { recordId: 'fragment:deleted:0', recordType: 'conversation-fragment', conversationId: 'deleted' }
    ]
  });

  assert.deepEqual(ids, new Set(['capsule:active', 'fragment:active:0', 'media:active:media']));
});
