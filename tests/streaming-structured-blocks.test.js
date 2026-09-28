import assert from 'node:assert/strict';
import test from 'node:test';

import {
  findTrailingStreamingChart,
  findTrailingStreamingTable
} from '../src/app/legacy-runtime/features/streaming-structured-blocks.js';

test('detects an unfinished chart fence without exposing its source range', () => {
  const partialOpening = findTrailingStreamingChart('Before\n```cha');
  assert.equal(partialOpening?.prefix, 'Before\n');
  assert.equal(partialOpening?.partialOpening, true);

  const chart = findTrailingStreamingChart([
    'Before',
    '```chart',
    '{',
    '  "type": "bar",',
    '  "data": [{ "label": "A", "value": 1 }]'
  ].join('\n'));
  assert.equal(chart?.complete, false);
  assert.match(chart?.source || '', /"type": "bar"/);
  assert.equal(chart?.prefix, 'Before\n');
});

test('keeps a just-completed chart active until ordinary prose resumes', () => {
  const chartText = [
    'Before',
    '```chart',
    '{ "type": "bar", "data": [{ "label": "A", "value": 1 }] }',
    '```',
    ''
  ].join('\n');
  assert.equal(findTrailingStreamingChart(chartText)?.complete, true);
  assert.equal(findTrailingStreamingChart(`${chartText}After`), null);
});

test('a reply that ends with the closing fence of a file or code block has no chart', () => {
  const fence = '`'.repeat(4);
  const file = ['Here is the workbook.', '', `${fence}file budget.json`, '{', '  "sheets": []', '}', fence].join('\n');
  assert.equal(findTrailingStreamingChart(file), null);
  assert.equal(findTrailingStreamingChart(`${file}\n`), null);
  assert.equal(findTrailingStreamingChart('Code:\n```python\nprint(1)\n```'), null);

  // A chart fence inside a file is the file's content.
  const nested = ['Here:', `${fence}file notes.md`, '```chart', '{ "type": "bar", "data": [] }', '```', fence].join('\n');
  assert.equal(findTrailingStreamingChart(nested), null);

  // A bare fence that opens nothing is still a chart being typed.
  assert.equal(findTrailingStreamingChart('Before\n```')?.partialOpening, true);
});

test('detects an actively growing GFM table and releases it after a blank line', () => {
  const active = [
    'Before',
    '| A | B |',
    '| --- | --- |',
    '| 1 | 2 |',
    ''
  ].join('\n');
  const table = findTrailingStreamingTable(active);
  assert.equal(table?.prefix, 'Before\n');
  assert.match(table?.source || '', /\| 1 \| 2 \|/);
  assert.equal(findTrailingStreamingTable(`${active}\nAfter`), null);
});
