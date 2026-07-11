import assert from 'node:assert/strict';
import test from 'node:test';

import { createHistoryIndexStore } from '../src/app/runtime/memory/history-index-store.js';
import { createHistoryIndexPersistence } from '../src/app/runtime/memory/history-index-persistence.js';

test('hydrates and persists the local history index without involving cloud sync', async () => {
  const values = new Map([['noureon:history-index:v1', {
    schemaVersion: 1,
    records: [{
      recordId: 'existing',
      conversationId: 'chat-1',
      vector: [1, 0],
      normalizedKeywords: ['gemini'],
      entities: ['Gemini']
    }]
  }]]);
  const storage = {
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => values.set(key, value),
    removeItem: async key => values.delete(key)
  };
  const index = createHistoryIndexStore();
  const persistence = createHistoryIndexPersistence({ index, storage });

  assert.equal(await persistence.load(), 1);
  assert.equal(index.getAll()[0].recordId, 'existing');

  index.put({ recordId: 'new', conversationId: 'chat-2', vector: [0, 1] });
  await persistence.save();

  assert.deepEqual(values.get('noureon:history-index:v1').records.map(record => record.recordId), ['existing', 'new']);
});

test('clearing a local index removes its persisted copy only', async () => {
  const removedKeys = [];
  const index = createHistoryIndexStore();
  index.put({ recordId: 'existing', conversationId: 'chat-1', vector: [1, 0] });
  const persistence = createHistoryIndexPersistence({
    index,
    storage: {
      getItem: async () => null,
      setItem: async () => {},
      removeItem: async key => removedKeys.push(key)
    }
  });

  await persistence.clear();

  assert.deepEqual(index.getAll(), []);
  assert.deepEqual(removedKeys, ['noureon:history-index:v1']);
});
