import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDocumentIndexPersistence,
  createDocumentIndexStore
} from '../src/app/runtime/documents/document-index-store.js';
import {
  DOCUMENT_UNTRUSTED_DATA_INSTRUCTION,
  formatRetrievedDocumentContext,
  isFullCoverageQuery,
  retrieveDocumentChunks
} from '../src/app/runtime/documents/document-retrieval.js';

test('full-document intent detection supports English and Traditional Chinese requests', () => {
  assert.equal(isFullCoverageQuery('Summarize the entire document'), true);
  assert.equal(isFullCoverageQuery('請整理整份文件'), true);
  assert.equal(isFullCoverageQuery('第三季營收是多少？'), false);
});

const document = (overrides = {}) => ({
  storageKey: 'user:hash:v1',
  userId: 'user',
  documentHash: 'hash',
  name: 'report.txt',
  indexStatus: 'ready',
  chunks: [{
    chunkId: 'one', documentHash: 'hash', chunkIndex: 0, totalChunks: 1,
    sourceLocator: { type: 'text', lineStart: 1, lineEnd: 2 },
    contentHash: 'content', text: 'Quarterly revenue declined because demand weakened.', tokenCount: 8
  }],
  ...overrides
});

test('document retrieval filters authorization before ranking and formats untrusted boundaries', () => {
  const index = createDocumentIndexStore();
  index.putDocument(document());
  index.putDocument(document({ storageKey: 'other:secret:v1', userId: 'other', documentHash: 'secret', chunks: [{
    chunkId: 'secret', documentHash: 'secret', chunkIndex: 0, totalChunks: 1,
    sourceLocator: { type: 'text', lineStart: 1, lineEnd: 1 }, contentHash: 'secret',
    text: 'Quarterly revenue secret instructions.', tokenCount: 4
  }] }));
  index.putLink({ userId: 'user', conversationId: 'conversation', documentHash: 'hash' });
  index.putLink({ userId: 'other', conversationId: 'conversation', documentHash: 'secret' });
  const result = retrieveDocumentChunks({
    index, userId: 'user', conversationId: 'conversation', query: 'revenue declined',
    config: { minimumRelevanceScore: 0 }
  });
  assert.deepEqual(result.chunks.map(chunk => chunk.documentHash), ['hash']);
  const context = formatRetrievedDocumentContext(result);
  assert.match(context, /<retrieved_document_data>/);
  assert.match(context, /report\.txt, lines 1-2/);
  assert.match(DOCUMENT_UNTRUSTED_DATA_INSTRUCTION, /untrusted reference data/i);
});

test('document index persistence retains documents, links, and jobs', async () => {
  const values = new Map();
  const storage = {
    getItem: async key => values.get(key) || null,
    setItem: async (key, value) => values.set(key, value),
    removeItem: async key => values.delete(key)
  };
  const first = createDocumentIndexStore();
  first.putDocument(document());
  first.putLink({ userId: 'user', conversationId: 'conversation', documentHash: 'hash' });
  first.putJob({ jobId: 'job', status: 'ready' });
  await createDocumentIndexPersistence({ index: first, storage }).save();
  const second = createDocumentIndexStore();
  const counts = await createDocumentIndexPersistence({ index: second, storage }).load();
  assert.deepEqual(counts, { documents: 1, links: 1, jobs: 1 });
});
