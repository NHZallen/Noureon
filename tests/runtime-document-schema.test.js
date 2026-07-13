import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';

import {
  canonicalJSONStringify,
  createStableChunkId,
  formatSourceLocator
} from '../src/app/runtime/documents/document-schema.js';

test('document schema canonicalizes source locators for stable chunk IDs', async () => {
  assert.equal(
    canonicalJSONStringify({ page: 12, type: 'pdf' }),
    canonicalJSONStringify({ type: 'pdf', page: 12 })
  );
  const first = await createStableChunkId({
    documentHash: 'document',
    extractionVersion: 1,
    sourceLocator: { page: 12, type: 'pdf' },
    contentHash: 'content'
  }, webcrypto);
  const second = await createStableChunkId({
    documentHash: 'document',
    extractionVersion: 1,
    sourceLocator: { type: 'pdf', page: 12 },
    contentHash: 'content'
  }, webcrypto);
  assert.equal(first, second);
});
test('document schema formats type-specific source locators', () => {
  assert.equal(formatSourceLocator('report.pdf', { type: 'pdf', page: 12 }), 'report.pdf, page 12');
  assert.equal(
    formatSourceLocator('sales.csv', { type: 'csv', rowStart: 120, rowEnd: 145, columns: ['date', 'amount'] }),
    'sales.csv, rows 120-145, columns: date, amount'
  );
  assert.equal(
    formatSourceLocator('budget.xlsx', { type: 'xlsx', sheet: '2026', range: 'B12:F18' }),
    'budget.xlsx, 2026!B12:F18'
  );
});
