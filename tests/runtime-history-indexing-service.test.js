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

  assert.deepEqual(first, { indexed: true, recordId: 'capsule:chat-1' });
  assert.deepEqual(second, { indexed: false, reason: 'unchanged-source' });
  assert.equal(documents.length, 1);
  assert.match(documents[0].text, /名字不可主動稱呼/);
  assert.equal(saves, 1);
  assert.deepEqual(index.getAll()[0], {
    recordId: 'capsule:chat-1',
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

test('uses a multimodal embedding for supported media and a textual fallback otherwise', async () => {
  const index = createHistoryIndexStore();
  const calls = [];
  const service = createHistoryIndexingService({
    index,
    embeddingClient: {
      embedHistoryDocument: async input => { calls.push(['text', input]); return [0, 1]; },
      embedMedia: async input => { calls.push(['media', input]); return [1, 0]; }
    }
  });
  const image = { id: 'image-1', conversationId: 'chat-1', sourceHash: 'image-hash', name: 'cat.jpg', mimeType: 'image/jpeg', summary: 'A black cat.', keyFacts: [], createdAt: 'now' };
  const document = { id: 'doc-1', conversationId: 'chat-1', sourceHash: 'doc-hash', name: 'notes.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', summary: 'Project notes.', keyFacts: [] };

  const direct = await service.indexMediaMemory({ mediaMemory: image, attachment: { mimeType: 'image/jpeg', data: 'YQ==' } });
  const fallback = await service.indexMediaMemory({ mediaMemory: document, attachment: { mimeType: document.mimeType, data: 'YQ==' } });

  assert.deepEqual(direct, { indexed: true, recordId: 'media:chat-1:image-hash', embeddingMode: 'multimodal' });
  assert.deepEqual(fallback, { indexed: true, recordId: 'media:chat-1:doc-hash', embeddingMode: 'text-fallback' });
  assert.deepEqual(calls.map(call => call[0]), ['media', 'text']);
  assert.equal(index.getAll().find(record => record.recordId === 'media:chat-1:image-hash').embeddingMode, 'multimodal');
});

test('replaces legacy random capsule records with one stable conversation record', async () => {
  const index = createHistoryIndexStore();
  index.put({ recordId: 'capsule:old-random-1', recordType: 'conversation-capsule', conversationId: 'chat-1', sourceHash: 'old-1' });
  index.put({ recordId: 'capsule:old-random-2', recordType: 'conversation-capsule', conversationId: 'chat-1', sourceHash: 'old-2' });
  const service = createHistoryIndexingService({
    index,
    embeddingClient: { embedHistoryDocument: async () => [1, 0] }
  });

  await service.indexCapsule({
    capsule: { id: 'new-random', conversationId: 'chat-1', summary: 'Current summary.' },
    sourceHash: 'current'
  });

  assert.deepEqual(index.getAll().map(record => record.recordId), ['capsule:chat-1']);
});
