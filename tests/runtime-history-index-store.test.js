import assert from 'node:assert/strict';
import test from 'node:test';

import { createHistoryIndexStore } from '../src/app/runtime/memory/history-index-store.js';

test('ranks hybrid history matches and excludes the current conversation', () => {
  const index = createHistoryIndexStore();
  index.put({
    recordId: 'memory-design',
    conversationId: 'old-memory-chat',
    vector: [1, 0],
    normalizedKeywords: ['memory', 'noureon'],
    entities: ['Noureon']
  });
  index.put({
    recordId: 'css-chat',
    conversationId: 'current-chat',
    vector: [0, 1],
    normalizedKeywords: ['css'],
    entities: []
  });

  const results = index.queryHybrid({
    vector: [0.9, 0.1],
    keywords: ['memory'],
    entities: ['Noureon'],
    excludeConversationId: 'current-chat',
    limit: 3
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].recordId, 'memory-design');
  assert.ok(results[0].score > 0.9);
});

test('removes every index record belonging to a source conversation', () => {
  const index = createHistoryIndexStore();
  index.put({ recordId: 'one', conversationId: 'conversation-1', vector: [1, 0] });
  index.put({ recordId: 'two', conversationId: 'conversation-2', vector: [0, 1] });

  index.removeConversation('conversation-1');

  assert.deepEqual(index.getAll().map(record => record.recordId), ['two']);
});

test('removes a changed source and can clear the whole local index', () => {
  const index = createHistoryIndexStore();
  index.put({
    recordId: 'old-capsule',
    conversationId: 'conversation-1',
    sourceHash: 'before-edit',
    vector: [1, 0]
  });
  index.put({
    recordId: 'current-capsule',
    conversationId: 'conversation-1',
    sourceHash: 'after-edit',
    vector: [0, 1]
  });

  index.removeSource({ conversationId: 'conversation-1', sourceHash: 'before-edit' });

  assert.deepEqual(index.getAll().map(record => record.recordId), ['current-capsule']);

  index.clear();

  assert.deepEqual(index.getAll(), []);
});
