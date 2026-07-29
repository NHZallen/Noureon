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
  assert.deepEqual(removedKeys, [
    'noureon:history-index:v1',
    'noureon:history-index:v1:recovery'
  ]);
});

test('loads after the user is known and migrates the legacy anonymous index', async () => {
  const values = new Map([['noureon:history-index:v1:anonymous', {
    schemaVersion: 1,
    records: [{ recordId: 'capsule:chat', conversationId: 'chat', vector: [1, 0] }]
  }]]);
  let username = 'alice';
  const index = createHistoryIndexStore();
  const persistence = createHistoryIndexPersistence({
    index,
    storage: {
      getItem: async key => values.get(key) ?? null,
      setItem: async (key, value) => values.set(key, value),
      removeItem: async key => values.delete(key)
    },
    storageKey: () => `noureon:history-index:v1:${username}`,
    fallbackStorageKeys: () => ['noureon:history-index:v1:anonymous']
  });

  assert.equal(await persistence.load(), 1);
  assert.equal(values.has('noureon:history-index:v1:alice'), true);
  assert.equal(values.has('noureon:history-index:v1:anonymous'), false);
  assert.equal(index.getAll()[0].recordId, 'capsule:chat');
});

test('pins the owner namespace so an auth hand-off cannot save an empty index elsewhere', async () => {
  const values = new Map([['noureon:history-index:v1:alice', {
    schemaVersion: 1,
    records: [{ recordId: 'capsule:chat', conversationId: 'chat', vector: [1, 0] }]
  }]]);
  let username = 'alice';
  const index = createHistoryIndexStore();
  const persistence = createHistoryIndexPersistence({
    index,
    storage: {
      getItem: async key => values.get(key) ?? null,
      setItem: async (key, value) => values.set(key, value),
      removeItem: async key => values.delete(key)
    },
    storageKey: () => `noureon:history-index:v1:${username}`
  });

  assert.equal(await persistence.load(), 1);
  username = 'supabase:next-session';
  index.clear();
  await persistence.save();

  assert.equal(values.has('noureon:history-index:v1:supabase:next-session'), false);
  assert.equal(values.get('noureon:history-index:v1:alice').records.length, 1);
});

test('recovers a non-empty fallback when a legacy primary key was left empty', async () => {
  const values = new Map([
    ['noureon:history-index:v1:alice', { schemaVersion: 1, records: [] }],
    ['noureon:history-index:v1:anonymous', {
      schemaVersion: 1,
      records: [{ recordId: 'capsule:chat', conversationId: 'chat', vector: [1, 0] }]
    }]
  ]);
  const index = createHistoryIndexStore();
  const persistence = createHistoryIndexPersistence({
    index,
    storage: {
      getItem: async key => values.get(key) ?? null,
      setItem: async (key, value) => values.set(key, value),
      removeItem: async key => values.delete(key)
    },
    storageKey: 'noureon:history-index:v1:alice',
    fallbackStorageKeys: ['noureon:history-index:v1:anonymous']
  });

  assert.equal(await persistence.load(), 1);
  assert.equal(index.getAll()[0].recordId, 'capsule:chat');
  assert.equal(values.get('noureon:history-index:v1:alice').records.length, 1);
  assert.equal(values.has('noureon:history-index:v1:anonymous'), false);
});

test('restores a legacy empty primary from the newest complete recovery copy', async () => {
  const values = new Map([
    ['noureon:history-index:v1:alice', { schemaVersion: 1, records: [] }],
    ['noureon:history-index:v1:alice:recovery', {
      schemaVersion: 1,
      revision: 7,
      savedAt: 700,
      records: [{ recordId: 'capsule:chat', conversationId: 'chat', vector: [1, 0] }]
    }]
  ]);
  const storage = {
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => values.set(key, value),
    removeItem: async key => values.delete(key),
    setItemsAtomic: async entries => entries.forEach(({ key, value }) => values.set(key, value))
  };
  const index = createHistoryIndexStore();
  const persistence = createHistoryIndexPersistence({
    index,
    storage,
    storageKey: 'noureon:history-index:v1:alice'
  });

  assert.equal(await persistence.load(), 1);
  assert.deepEqual(index.getAll().map(record => record.recordId), ['capsule:chat']);
  assert.equal(values.get('noureon:history-index:v1:alice').revision, 7);
  assert.equal(values.get('noureon:history-index:v1:alice').records.length, 1);
  assert.deepEqual(persistence.getDiagnostics(), {
    source: 'recovery',
    count: 1,
    recovered: true
  });
});

test('an explicit final deletion wins over an older non-empty recovery copy', async () => {
  const values = new Map([
    ['noureon:history-index:v1:alice', {
      schemaVersion: 1,
      revision: 4,
      savedAt: 400,
      records: [{ recordId: 'capsule:old', conversationId: 'old', vector: [1, 0] }]
    }],
    ['noureon:history-index:v1:alice:recovery', {
      schemaVersion: 1,
      revision: 4,
      savedAt: 400,
      records: [{ recordId: 'capsule:old', conversationId: 'old', vector: [1, 0] }]
    }]
  ]);
  const storage = {
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => values.set(key, value),
    removeItem: async key => values.delete(key),
    setItemsAtomic: async entries => entries.forEach(({ key, value }) => values.set(key, value))
  };
  const index = createHistoryIndexStore();
  const persistence = createHistoryIndexPersistence({
    index,
    storage,
    storageKey: 'noureon:history-index:v1:alice'
  });

  await persistence.load();
  index.clear();
  await persistence.save({ allowEmpty: true });

  const primary = values.get('noureon:history-index:v1:alice');
  const recovery = values.get('noureon:history-index:v1:alice:recovery');
  assert.equal(primary.records.length, 0);
  assert.equal(recovery.records.length, 0);
  assert.ok(primary.revision > 4);

  const reloaded = createHistoryIndexStore();
  const nextPersistence = createHistoryIndexPersistence({
    index: reloaded,
    storage,
    storageKey: 'noureon:history-index:v1:alice'
  });
  assert.equal(await nextPersistence.load(), 0);
  assert.deepEqual(reloaded.getAll(), []);
});
