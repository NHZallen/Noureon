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
