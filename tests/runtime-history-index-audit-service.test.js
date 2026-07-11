import assert from 'node:assert/strict';
import test from 'node:test';

import { createHistoryIndexAuditService } from '../src/app/runtime/memory/history-index-audit-service.js';
import { createHistoryIndexStore } from '../src/app/runtime/memory/history-index-store.js';

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
