import assert from 'node:assert/strict';
import test from 'node:test';

import { createHistoryIndexStore } from '../src/app/runtime/memory/history-index-store.js';
import { createHistoryIndexingService } from '../src/app/runtime/memory/history-indexing-service.js';

test('indexes a changed conversation capsule once and persists the local index', async () => {
  const documents = [];
  let saves = 0;
  const index = createHistoryIndexStore();
  const service = createHistoryIndexingService({
    index,
    embeddingClient: {
      embedHistoryDocument: async document => {
        documents.push(document);
        return [0.1, 0.2];
      }
    },
    persistence: { save: async () => { saves += 1; } }
  });
  const capsule = {
    id: 'capsule-1',
    conversationId: 'chat-1',
    topic: '記憶系統重作',
    summary: '使用者要降低不相關記憶干擾。',
    confirmedDecisions: ['名字不可主動稱呼'],
    openQuestions: []
  };

  const first = await service.indexCapsule({ capsule, sourceHash: 'source-1' });
  const second = await service.indexCapsule({ capsule, sourceHash: 'source-1' });

  assert.deepEqual(first, { indexed: true, recordId: 'capsule:capsule-1' });
  assert.deepEqual(second, { indexed: false, reason: 'unchanged-source' });
  assert.equal(documents.length, 1);
  assert.match(documents[0].text, /名字不可主動稱呼/);
  assert.equal(saves, 1);
  assert.deepEqual(index.getAll()[0], {
    recordId: 'capsule:capsule-1',
    recordType: 'conversation-capsule',
    conversationId: 'chat-1',
    capsuleId: 'capsule-1',
    sourceHash: 'source-1',
    vector: [0.1, 0.2],
    normalizedKeywords: ['記憶系統重作', '使用者要降低不相關記憶干擾', '名字不可主動稱呼'],
    entities: [],
    updatedAt: null
  });
});
