import assert from 'node:assert/strict';
import test from 'node:test';

import { createHistoryIndexAuditService } from '../src/app/runtime/memory/history-index-audit-service.js';
import { createHistoryIndexStore } from '../src/app/runtime/memory/history-index-store.js';
import { createHistoryIndexPersistence } from '../src/app/runtime/memory/history-index-persistence.js';
import { createDeviceDerivedMemoryPersistence } from '../src/app/runtime/memory/device-derived-memory-persistence.js';

test('audits healthy, missing, outdated, and extra records without calling models', async () => {
  const index = createHistoryIndexStore();
  index.put({ recordId: 'capsule:healthy', recordType: 'conversation-capsule', conversationId: 'healthy', sourceHash: 'hash:healthy' });
  index.put({ recordId: 'fragment:healthy:0', recordType: 'conversation-fragment', conversationId: 'healthy', sourceHash: 'hash:healthy' });
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

  assert.equal(report.healthy, 2);
  assert.equal(report.missing, 1);
  assert.equal(report.extra, 1);
  assert.equal(report.repairable, 1);
});

test('optimization repairs reported tasks but never deletes uncertain extra records', async () => {
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
  assert.deepEqual(result, { repaired: 2, removed: 0, failed: 0, unchanged: 6 });
  assert.equal(index.getAll().length, 1);
});

test('an incomplete audit cannot turn every persisted record into a destructive cleanup task', async () => {
  const index = createHistoryIndexStore();
  index.put({ recordId: 'capsule:historical', conversationId: 'historical', sourceHash: 'hash:historical', vector: [1, 0] });
  const persisted = [];
  const service = createHistoryIndexAuditService({
    getConversations: () => [],
    getMemoryState: () => ({}),
    index,
    hashString: async () => 'hash',
    persistence: { save: async options => persisted.push(options) },
    persistMemoryState: async () => {}
  });

  const report = await service.audit();
  assert.equal(report.extra, 1);
  assert.equal(report.protected, 1);
  assert.equal(report.repairable, 0);

  const result = await service.optimize(report);
  assert.deepEqual(result, { repaired: 0, removed: 0, failed: 0, unchanged: 1 });
  assert.equal(index.getAll().length, 1);
  assert.deepEqual(persisted, [undefined]);
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

test('counts a valid media index record as healthy', async () => {
  const index = createHistoryIndexStore();
  index.put({ recordId: 'capsule:chat', conversationId: 'chat', sourceHash: 'hash:chat' });
  index.put({ recordId: 'fragment:chat:0', recordType: 'conversation-fragment', conversationId: 'chat', sourceHash: 'hash:chat' });
  index.put({ recordId: 'media:chat:media-hash', conversationId: 'chat', sourceHash: 'media-hash' });
  const service = createHistoryIndexAuditService({
    getConversations: () => [{
      id: 'chat',
      messages: [{
        id: 'm',
        role: 'user',
        parts: [{ text: 'hello' }, { inlineData: { data: 'image-data', mimeType: 'image/png' } }]
      }]
    }],
    getMemoryState: () => ({
      recentConversationStates: [{ conversationId: 'chat', sourceHash: 'hash:chat' }],
      conversationCapsules: [{ id: 'capsule', conversationId: 'chat', summary: 'Greeting' }],
      mediaMemories: [{ id: 'media', conversationId: 'chat', messageId: 'm', partIndex: 1, sourceHash: 'media-hash' }]
    }),
    index,
    hashString: async () => 'hash:chat'
  });

  const report = await service.audit();

  assert.equal(report.healthy, 3);
  assert.equal(report.healthyCapsules, 1);
  assert.equal(report.healthyFragments, 1);
  assert.equal(report.healthyMedia, 1);
  assert.equal(report.missing, 0);
  assert.equal(report.outdated, 0);
  assert.equal(report.extra, 0);
});

test('keeps detailed conversation fragments for a live conversation during an audit', async () => {
  const index = createHistoryIndexStore();
  index.put({ recordId: 'capsule:chat', recordType: 'conversation-capsule', conversationId: 'chat', sourceHash: 'hash:chat' });
  index.put({ recordId: 'fragment:chat:0', recordType: 'conversation-fragment', conversationId: 'chat', sourceHash: 'hash:chat' });
  const report = await createHistoryIndexAuditService({
    getConversations: () => [{ id: 'chat', messages: [{ id: 'm', role: 'user', parts: [{ text: 'hello' }] }] }],
    getMemoryState: () => ({
      recentConversationStates: [{ conversationId: 'chat', sourceHash: 'hash:chat' }],
      conversationCapsules: [{ id: 'capsule', conversationId: 'chat', summary: 'Greeting' }]
    }),
    index,
    hashString: async () => 'hash:chat'
  }).audit();

  assert.equal(report.healthy, 2);
  assert.equal(report.healthyCapsules, 1);
  assert.equal(report.healthyFragments, 1);
  assert.equal(report.healthyMedia, 0);
  assert.equal(report.extra, 0);
  assert.deepEqual(report.extraRecordIds, []);
});

test('marks an outdated detailed fragment for repair instead of retaining it as healthy', async () => {
  const index = createHistoryIndexStore();
  index.put({ recordId: 'capsule:chat', recordType: 'conversation-capsule', conversationId: 'chat', sourceHash: 'hash:chat' });
  index.put({ recordId: 'fragment:chat:0', recordType: 'conversation-fragment', conversationId: 'chat', sourceHash: 'old-hash' });
  const report = await createHistoryIndexAuditService({
    getConversations: () => [{ id: 'chat', messages: [{ id: 'm', role: 'user', parts: [{ text: 'hello' }] }] }],
    getMemoryState: () => ({
      recentConversationStates: [{ conversationId: 'chat', sourceHash: 'hash:chat' }],
      conversationCapsules: [{ id: 'capsule', conversationId: 'chat', summary: 'Greeting' }]
    }),
    index,
    hashString: async () => 'hash:chat'
  }).audit();

  assert.equal(report.outdated, 1);
  assert.equal(report.missing, 0);
  assert.equal(report.tasks.length, 1);
  assert.equal(report.tasks[0].type, 'source');
});

test('repairs a capsule-only source without replaying memory capture', async () => {
  const index = createHistoryIndexStore();
  index.put({ recordId: 'capsule:chat', recordType: 'conversation-capsule', conversationId: 'chat', sourceHash: 'hash:chat' });
  let captureCalls = 0;
  let repairCalls = 0;
  const service = createHistoryIndexAuditService({
    getConversations: () => [{ id: 'chat', messages: [{ id: 'm', role: 'user', parts: [{ text: 'hello' }] }] }],
    getMemoryState: () => ({
      recentConversationStates: [{ conversationId: 'chat', sourceHash: 'hash:chat' }],
      conversationCapsules: [{ id: 'capsule', conversationId: 'chat', summary: 'Greeting' }]
    }),
    index,
    hashString: async () => 'hash:chat',
    captureCompletedTurn: async () => { captureCalls += 1; },
    repairIndexedSource: async task => {
      repairCalls += 1;
      index.put({
        recordId: 'fragment:chat:0',
        recordType: 'conversation-fragment',
        conversationId: task.conversationId,
        sourceHash: task.sourceHash
      });
      return { indexed: true };
    }
  });

  const report = await service.audit();
  assert.equal(report.missing, 1);
  assert.equal(report.tasks[0].type, 'source');

  const result = await service.optimize(report);
  assert.equal(result.repaired, 1);
  assert.equal(repairCalls, 1);
  assert.equal(captureCalls, 0);
});

test('does not erase an active orphan vector when its metadata repair fails', async () => {
  const index = createHistoryIndexStore();
  index.put({ recordId: 'capsule:chat', conversationId: 'chat', sourceHash: 'hash:chat', vector: [1, 0] });
  const service = createHistoryIndexAuditService({
    getConversations: () => [{ id: 'chat', messages: [{ id: 'm', role: 'user', parts: [{ text: 'hello' }] }] }],
    getMemoryState: () => ({ recentConversationStates: [], conversationCapsules: [] }),
    index,
    hashString: async () => 'hash:chat',
    captureCompletedTurn: async () => { throw new Error('memory model unavailable'); }
  });
  const report = await service.audit();

  const result = await service.optimize(report);

  assert.deepEqual(result, { repaired: 0, removed: 0, failed: 1, unchanged: 1 });
  assert.equal(index.getAll()[0].recordId, 'capsule:chat');
});

test('does not erase a same-id active vector recreated by a successful repair', async () => {
  const index = createHistoryIndexStore();
  index.put({ recordId: 'capsule:chat', conversationId: 'chat', sourceHash: 'old-hash', vector: [1, 0] });
  const service = createHistoryIndexAuditService({
    getConversations: () => [{ id: 'chat', messages: [{ id: 'm', role: 'user', parts: [{ text: 'hello' }] }] }],
    getMemoryState: () => ({ recentConversationStates: [], conversationCapsules: [] }),
    index,
    hashString: async () => 'hash:chat',
    captureCompletedTurn: async () => {
      index.put({ recordId: 'capsule:chat', conversationId: 'chat', sourceHash: 'hash:chat', vector: [0, 1] });
    }
  });
  const result = await service.optimize(await service.audit());

  assert.deepEqual(result, { repaired: 1, removed: 0, failed: 0, unchanged: 0 });
  assert.equal(index.getAll()[0].sourceHash, 'hash:chat');
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
  firstIndex.put({ recordId: 'fragment:chat:0', recordType: 'conversation-fragment', conversationId: 'chat', sourceHash: 'hash:chat', vector: [0, 1] });
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

  assert.equal(report.healthy, 2);
  assert.equal(report.missing, 0);
  assert.equal(report.extra, 0);
});
