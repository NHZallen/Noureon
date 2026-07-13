import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';

import { createDocumentChunks } from '../src/app/runtime/documents/document-chunker.js';

test('document chunking creates stable linked chunks with content hashes', async () => {
  const input = {
    documentHash: 'abc',
    maximumTokens: 8,
    overlapTokens: 1,
    cryptoProvider: webcrypto,
    sections: [{
      chunkType: 'prose',
      sourceLocator: { type: 'text', lineStart: 1, lineEnd: 3 },
      text: 'First paragraph is here.\n\nSecond paragraph is also here.\n\nThird paragraph ends it.'
    }]
  };
  const first = await createDocumentChunks(input);
  const second = await createDocumentChunks(input);
  assert.ok(first.length > 1);
  assert.deepEqual(first.map(chunk => chunk.chunkId), second.map(chunk => chunk.chunkId));
  assert.equal(first[0].nextChunkId, first[1].chunkId);
  assert.equal(first[1].previousChunkId, first[0].chunkId);
  assert.equal(first.every(chunk => chunk.contentHash && chunk.totalChunks === first.length), true);
});

test('table chunking repeats headers and preserves row ranges', async () => {
  const chunks = await createDocumentChunks({
    documentHash: 'table',
    maximumTokens: 10,
    cryptoProvider: webcrypto,
    sections: [{
      chunkType: 'table',
      headers: ['name', 'amount'],
      rows: [['A', '10'], ['B', '20'], ['C', '30']],
      sourceLocator: { type: 'csv', rowStart: 2, rowEnd: 4, columns: ['name', 'amount'] }
    }]
  });
  assert.ok(chunks.length >= 2);
  assert.equal(chunks.every(chunk => chunk.text.startsWith('Columns: name | amount')), true);
  assert.equal(chunks[0].sourceLocator.rowStart, 2);
  assert.equal(chunks.at(-1).sourceLocator.rowEnd, 4);
});

test('prose chunks stay within token budget and reconstruct normalized text after overlap removal', async () => {
  const text = `${'word '.repeat(120).trim()}\n\n${'第二段'.repeat(80)}`;
  const chunks = await createDocumentChunks({
    documentHash: 'long-prose',
    maximumTokens: 30,
    overlapTokens: 4,
    cryptoProvider: webcrypto,
    sections: [{ chunkType: 'prose', text, sourceLocator: { type: 'text', lineStart: 1, lineEnd: 3 } }]
  });
  assert.equal(chunks.every(chunk => chunk.tokenCount <= 30), true);
  const reconstructed = chunks.map(chunk => chunk.text.slice(chunk.overlapCharacterCount || 0)).join('');
  assert.equal(reconstructed, text);
  assert.equal(chunks.every(chunk => Number.isInteger(chunk.characterStart) && Number.isInteger(chunk.characterEnd)), true);
});
