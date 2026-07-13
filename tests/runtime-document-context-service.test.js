import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';

import { createDocumentContextService } from '../src/app/runtime/documents/document-context-service.js';
import { createDocumentIndexStore } from '../src/app/runtime/documents/document-index-store.js';

const attachment = (text, name = 'report.txt') => ({
  mimeType: 'text/plain',
  name,
  data: Buffer.from(text, 'utf8').toString('base64')
});

test('document context service indexes once, persists links, and reuses documents across conversation turns', async () => {
  const index = createDocumentIndexStore();
  let saves = 0;
  const service = createDocumentContextService({
    index,
    persistence: { load: async () => ({}), save: async () => { saves += 1; }, clear: async () => {} },
    getUserId: () => 'user',
    cryptoProvider: webcrypto
  });
  const first = await service.buildContext({
    parts: [{ inlineData: attachment('Revenue declined because demand weakened.') }],
    query: 'Why did revenue decline?',
    conversationId: 'conversation',
    messageId: 'message-1'
  });
  assert.match(first.text, /demand weakened/);
  assert.equal(index.getDocuments().length, 1);
  assert.equal(index.getLinks().length, 1);

  const followUp = await service.buildContext({
    parts: [],
    query: 'revenue demand',
    conversationId: 'conversation',
    messageId: 'message-2'
  });
  assert.match(followUp.text, /report\.txt/);
  assert.equal(index.getDocuments().length, 1);
  assert.ok(saves >= 1);
});

test('document context deletion keeps shared content until its final conversation link is removed', async () => {
  const index = createDocumentIndexStore();
  const service = createDocumentContextService({
    index,
    persistence: { load: async () => ({}), save: async () => {}, clear: async () => {} },
    getUserId: () => 'user',
    cryptoProvider: webcrypto
  });
  const inlineData = attachment('Shared document text.');
  await service.indexAttachment({ inlineData, conversationId: 'one', messageId: 'm1' });
  await service.indexAttachment({ inlineData, conversationId: 'two', messageId: 'm2' });
  assert.equal(index.getDocuments().length, 1);
  assert.equal(index.countReferences({ userId: 'user', documentHash: index.getDocuments()[0].documentHash }), 2);
  await service.removeLinks({ conversationId: 'one' });
  assert.equal(index.getDocuments().length, 1);
  await service.removeLinks({ conversationId: 'two' });
  assert.equal(index.getDocuments().length, 0);
});

test('document context service deduplicates concurrent indexing jobs', async () => {
  const index = createDocumentIndexStore();
  const service = createDocumentContextService({
    index,
    persistence: { load: async () => ({}), save: async () => {}, clear: async () => {} },
    getUserId: () => 'user',
    cryptoProvider: webcrypto
  });
  const inlineData = attachment('Concurrent document indexing.');
  const [left, right] = await Promise.all([
    service.indexAttachment({ inlineData, conversationId: 'one', messageId: 'm1' }),
    service.indexAttachment({ inlineData, conversationId: 'one', messageId: 'm1' })
  ]);
  assert.equal(left.document?.documentHash || left.documentHash, right.document?.documentHash || right.documentHash);
  assert.equal(index.getDocuments().length, 1);
});

test('model transcriptions are chunked, persisted, and retrieved without a character hard limit', async () => {
  const index = createDocumentIndexStore();
  const service = createDocumentContextService({
    index,
    persistence: { load: async () => ({}), save: async () => {}, clear: async () => {} },
    getUserId: () => 'user',
    cryptoProvider: webcrypto,
    maximumChunkTokens: 20,
    retrievalConfig: { maximumContextTokens: 2000 }
  });
  const inlineData = { ...attachment('binary placeholder', 'legacy.bin'), mimeType: 'application/octet-stream' };
  const transcription = Array.from({ length: 100 }, (_, indexValue) => `Line ${indexValue + 1}: preserved document value.`).join('\n\n');
  await service.indexTranscription({ inlineData, text: transcription, conversationId: 'conversation', messageId: 'm1' });
  const stored = index.getDocuments()[0];
  assert.equal(stored.extractionMethod, 'model-transcription');
  assert.ok(stored.chunkCount > 1);
  const context = await service.buildContext({ parts: [], query: '完整文件摘要', conversationId: 'conversation' });
  assert.equal(context.fullCoverage, true);
  assert.equal([context.text, ...(context.coverageBatchTexts || [])].join('\n').includes('Line 100'), true);
});

test('an in-flight semantic indexing job can be cancelled and resumed without duplicate chunks', async () => {
  const index = createDocumentIndexStore();
  let calls = 0;
  let markEmbeddingStarted;
  const embeddingStarted = new Promise(resolve => { markEmbeddingStarted = resolve; });
  const embeddingClient = {
    embedDocumentChunk: ({ signal }) => {
      calls += 1;
      markEmbeddingStarted();
      if (calls > 1) return Promise.resolve([1, 0]);
      return new Promise((resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      });
    }
  };
  const service = createDocumentContextService({
    index,
    persistence: { load: async () => ({}), save: async () => {}, clear: async () => {} },
    embeddingClient,
    getUserId: () => 'user',
    cryptoProvider: webcrypto
  });
  const inlineData = attachment('Cancelable semantic indexing content.');
  const firstRun = service.indexAttachment({ inlineData, conversationId: 'conversation', messageId: 'm1' });
  await embeddingStarted;
  const jobId = index.getJobs()[0].jobId;
  assert.equal(await service.cancelJob(jobId), true);
  await assert.rejects(firstRun, error => error?.name === 'AbortError');
  assert.equal(index.getJob(jobId).lastError, 'cancelled');
  const resumed = await service.indexAttachment({ inlineData, conversationId: 'conversation', messageId: 'm1' });
  assert.equal(resumed.indexed, true);
  assert.equal(index.getDocuments().length, 1);
  assert.equal(new Set(index.getDocuments()[0].chunks.map(chunk => chunk.chunkId)).size, index.getDocuments()[0].chunkCount);
});

test('storage quota failure never exposes a partially persisted ready document', async () => {
  const index = createDocumentIndexStore();
  const quotaError = new DOMException('IndexedDB quota is full.', 'QuotaExceededError');
  const service = createDocumentContextService({
    index,
    persistence: { load: async () => ({}), save: async () => { throw quotaError; }, clear: async () => {} },
    getUserId: () => 'user',
    cryptoProvider: webcrypto,
    logger: { warn: () => {} }
  });
  const result = await service.indexAttachment({
    inlineData: attachment('Text that cannot be persisted.'),
    conversationId: 'conversation',
    messageId: 'm1'
  });
  assert.equal(result.reason, 'storage-quota-exceeded');
  assert.equal(index.getDocuments().length, 0);
  assert.equal(index.getJobs()[0].indexStatus, undefined);
  assert.equal(index.getJobs()[0].lastError, 'storage-quota-exceeded');
});
