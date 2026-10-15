import assert from 'node:assert/strict';
import test from 'node:test';

import { markNumericColumns } from '../src/app/ui/markdown/table-columns.js';
import { createDom } from './behaviours/helpers/create-dom.js';

const tableOf = (html) => {
  const dom = createDom(`<table>${html}</table>`);
  return { dom, table: dom.document.querySelector('table') };
};

test('a column of only numbers is lined up at the right, with its head', () => {
  const { dom, table } = tableOf(`
    <thead><tr><th>Item</th><th>Price</th><th>Share</th></tr></thead>
    <tbody>
      <tr><td>Mouse</td><td>1,290</td><td>12.5%</td></tr>
      <tr><td>Kettle</td><td>NT$ 680</td><td>8%</td></tr>
    </tbody>`);
  try {
    markNumericColumns(table);
    const marked = [...table.rows].map((row) => [...row.cells].map((cell) => cell.classList.contains('ac-table-number')));
    assert.deepEqual(marked, [[false, true, true], [false, true, true], [false, true, true]]);
  } finally {
    dom.cleanup();
  }
});

test('a column with some other text, or aligned by hand, is left alone', () => {
  const { dom, table } = tableOf(`
    <thead><tr><th>Code</th><th>Count</th></tr></thead>
    <tbody>
      <tr><td>A-4821</td><td align="center">12</td></tr>
      <tr><td>B-1097</td><td align="center">8</td></tr>
    </tbody>`);
  try {
    markNumericColumns(table);
    assert.equal(table.querySelectorAll('.ac-table-number').length, 0);
  } finally {
    dom.cleanup();
  }
});
