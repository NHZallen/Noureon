import assert from 'node:assert/strict';
import test from 'node:test';

import { createHistoryIndexAuditService } from '../src/app/runtime/memory/history-index-audit-service.js';
import { createHistoryIndexStore } from '../src/app/runtime/memory/history-index-store.js';
import { createHistoryIndexPersistence } from '../src/app/runtime/memory/history-index-persistence.js';
import { createDeviceDerivedMemoryPersistence } from '../src/app/runtime/memory/device-derived-memory-persistence.js';

test('audits healthy, missing, outdated, and extra records without calling models', async () => {
  const index = createHistoryIndexStore();
  index.put({ recordId: 'capsule:healthy', recordType: 'conversation-capsule', conversationId: 'healthy', sourceHash: 'hash:healthy' });
  index.put({ recordId: 'capsule:orphan', recordType: 'conversation-capsule', conversationId: 'orphan', sourceHash: 'old' });
  const service = createHistoryIndexAuditService({
    getConversations: () => [
      { id: 'healthy', messages: [{ id: 'h', role: 'user', parts: [{ text: 'healthy' }] }] },
      { id: 'missing', messages: [{ id: 'm', role: 'user', parts: [{ text: 'missing' }] }] }
    ],
    getMemoryState: () => ({
      recentConversationStates: [{ conversationId: 'healthy', sourceHash: 'hash:healthy' }],
      conversationCapsules: [{ id: 'cap-h', conversationId: 'healthy', summary: 'Healthy' }]
    }),
    index,
    hashString: async value => value.includes('healthy') ? 'hash:healthy' : 'hash:missing'
  });

  const report = await service.audit();

  assert.equal(report.healthy, 1);
  assert.equal(report.missing, 1);
  assert.equal(report.extra, 1);
  assert.equal(report.repairable, 2);
});

test('optimization removes only extras and repairs only reported tasks', async () => {
  const index = createHistoryIndexStore();
  index.put({ recordId: 'capsule:extra', recordType: 'conversation-capsule', conversationId: 'extra' });
  const calls = [];
  const service = createHistoryIndexAuditService({
    getConversations: () => [],
    getMemoryState: () => ({}),
    index,
    hashString: async () => 'hash',
    captureCompletedTurn: async task => calls.push(['capture', task.conversationId]),
    indexCapsule: async task => calls.push(['capsule', task.capsule.conversationId]),
    indexMediaMemory: async task => calls.push(['media', task.mediaMemory.id]),
    persistMemoryState: async () => calls.push(['persist'])
  });

  const result = await service.optimize({
    healthy: 5,
    extraRecordIds: ['capsule:extra'],
    tasks: [
      { type: 'capture', conversationId: 'changed', sourceHash: 'new', turns: [] },
      { type: 'capsule', capsule: { conversationId: 'missing' }, sourceHash: 'same' }
    ]
  });

  assert.deepEqual(calls, [['capture', 'changed'], ['capsule', 'missing'], ['persist']]);
  assert.deepEqual(result, { repaired: 2, removed: 1, failed: 0, unchanged: 5 });
  assert.equal(index.getAll().length, 0);
});

test('classifies persisted vectors without derived metadata as orphan records', async () => {
  const index = createHistoryIndexStore();
  index.put({ recordId: 'capsule:chat', conversationId: 'chat', sourceHash: 'hash:chat' });
  const service = createHistoryIndexAuditService({
    getConversations: () => [{ id: 'chat', messages: [{ id: 'm', role: 'user', parts: [{ text: 'hello' }] }] }],
    getMemoryState: () => ({ recentConversationStates: [], conversationCapsules: [] }),
    index,
    hashString: async () => 'hash:chat'
  });

  const report = await service.audit();

  assert.equal(report.missing, 0);
  assert.equal(report.extra, 1);
  assert.deepEqual(report.extraRecordIds, ['capsule:chat']);
  assert.equal(report.tasks[0].type, 'capture');
});

test('a completed index remains healthy after simulated page reload', async () => {
  const values = new Map();
  const storage = {
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => values.set(key, value),
    removeItem: async key => values.delete(key)
  };
  const conversation = { id: 'chat', messages: [{ id: 'm', role: 'user', parts: [{ text: 'hello' }] }] };
  let memoryState = {
    recentConversationStates: [{ conversationId: 'chat', sourceHash: 'hash:chat' }],
    conversationCapsules: [{ id: 'capsule', conversationId: 'chat', summary: 'Greeting' }],
    mediaMemories: []
  };
  const firstIndex = createHistoryIndexStore();
  firstIndex.put({ recordId: 'capsule:chat', conversationId: 'chat', capsuleId: 'capsule', sourceHash: 'hash:chat', vector: [1, 0] });
  await Promise.all([
    createHistoryIndexPersistence({ index: firstIndex, storage, storageKey: 'index:alice' }).save(),
    createDeviceDerivedMemoryPersistence({
      storage,
      storageKey: 'derived:alice',
      getMemoryState: () => memoryState,
      replaceMemoryState: next => { memoryState = next; }
    }).save()
  ]);

  const reloadedIndex = createHistoryIndexStore();
  memoryState = { recentConversationStates: [], conversationCapsules: [], mediaMemories: [] };
  await Promise.all([
    createHistoryIndexPersistence({ index: reloadedIndex, storage, storageKey: 'index:alice' }).load(),
    createDeviceDerivedMemoryPersistence({
      storage,
      storageKey: 'derived:alice',
      getMemoryState: () => memoryState,
      replaceMemoryState: next => { memoryState = next; }
    }).load()
  ]);
  const report = await createHistoryIndexAuditService({
    getConversations: () => [conversation],
    getMemoryState: () => memoryState,
    index: reloadedIndex,
    hashString: async () => 'hash:chat'
  }).audit();

  assert.equal(report.healthy, 1);
  assert.equal(report.missing, 0);
  assert.equal(report.extra, 0);
});
