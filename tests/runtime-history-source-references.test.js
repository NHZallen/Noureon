import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collectHistorySourceConversationIds,
  normalizeHistorySourceConversationIds
} from '../src/app/runtime/memory/history-source-references.js';

test('history source helpers deduplicate and cap source conversation references', () => {
  const first = '11111111-1111-4111-8111-111111111111';
  const second = '22222222-2222-4222-8222-222222222222';
  const third = '33333333-3333-4333-8333-333333333333';
  const fourth = '44444444-4444-4444-8444-444444444444';

  assert.deepEqual(collectHistorySourceConversationIds({
    historyResults: [
      { conversationId: first },
      { conversationId: second },
      { conversationId: first },
      { conversationId: third },
      { conversationId: fourth }
    ]
  }), [first, second, third, fourth]);
  assert.deepEqual(normalizeHistorySourceConversationIds([first, '', first, second, third, fourth]), [
    first, second, third, fourth
  ]);
});
