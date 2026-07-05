import assert from 'node:assert/strict';
import test from 'node:test';

import { selectActiveConversationId } from '../src/app/runtime/kernel/active-conversation-reconciliation.js';

test('keeps a visible active conversation', () => {
  assert.equal(selectActiveConversationId({
    currentId: 'c1',
    conversations: [{ id: 'c1', archived: false, deletedAt: null }]
  }), 'c1');
});

test('selects the newest visible conversation when the active id is missing', () => {
  assert.equal(selectActiveConversationId({
    currentId: null,
    conversations: [
      { id: 'older', archived: false, lastUpdatedAt: '2026-07-05T10:00:00Z' },
      { id: 'newer', archived: false, lastUpdatedAt: '2026-07-05T11:00:00Z' },
      { id: 'deleted', deletedAt: '2026-07-05T12:00:00Z' }
    ]
  }), 'newer');
});

test('returns null when no visible conversation exists', () => {
  assert.equal(selectActiveConversationId({ currentId: 'gone', conversations: [] }), null);
});

