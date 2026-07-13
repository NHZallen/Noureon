import assert from 'node:assert/strict';
import test from 'node:test';

import { extractNativeDocument, parseCsv } from '../src/app/runtime/documents/document-extractors.js';

const asBase64 = value => Buffer.from(value, 'utf8').toString('base64');

test('native text extraction preserves normalized text and line locators', async () => {
  const result = await extractNativeDocument({
    mimeType: 'text/plain',
    name: 'notes.txt',
    data: asBase64('first\r\nsecond\rthird')
  });
  assert.equal(result.supported, true);
  assert.equal(result.sections[0].text, 'first\nsecond\nthird');
  assert.deepEqual(result.sections[0].sourceLocator, { type: 'text', lineStart: 1, lineEnd: 3 });
});
test('CSV parsing preserves quoted commas, escaped quotes, rows, and columns', async () => {
  assert.deepEqual(parseCsv('name,note\nAlice,"hello, world"\nBob,"said ""yes"""'), [
    ['name', 'note'],
    ['Alice', 'hello, world'],
    ['Bob', 'said "yes"']
  ]);
  const result = await extractNativeDocument({
    mimeType: 'text/csv',
    name: 'sales.csv',
    data: asBase64('date,amount\n2026-01-01,10\n2026-01-02,20')
  });
  assert.equal(result.sections[0].chunkType, 'table');
  assert.deepEqual(result.sections[0].headers, ['date', 'amount']);
  assert.equal(result.sections[0].sourceLocator.rowEnd, 3);
});
