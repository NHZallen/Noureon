import assert from 'node:assert/strict';
import test from 'node:test';

import {
  reconstructPdfReadingOrder,
  shouldFallbackPdfPageToOcr
} from '../src/app/runtime/documents/pdf-reading-order.js';

const span = (str, x, y, width = 40) => ({ str, width, height: 10, transform: [1, 0, 0, 10, x, y] });

test('PDF reading order keeps each detected column together', () => {
  const result = reconstructPdfReadingOrder([
    span('Left 1', 40, 700), span('Right 1', 340, 700),
    span('Left 2', 40, 680), span('Right 2', 340, 680)
  ]);
  assert.equal(result.columnsDetected, true);
  assert.equal(result.text, 'Left 1\nLeft 2\nRight 1\nRight 2');
});

test('PDF page OCR fallback recognizes short and corrupted text', () => {
  assert.equal(shouldFallbackPdfPageToOcr('short'), true);
  assert.equal(shouldFallbackPdfPageToOcr('A readable sentence with enough normal text to extract.'), false);
  assert.equal(shouldFallbackPdfPageToOcr(`Readable text ${'�'.repeat(8)} with corruption`), true);
});
