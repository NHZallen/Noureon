import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SUPPORTED_CHART_TYPES,
  normalizeChartSchema,
  parseAndNormalizeChartSchema
} from '../../../src/app/ui/charts/chart-schema.js';

test('valid bar chart schema passes and normalizes', () => {
  const result = normalizeChartSchema({
    type: 'bar',
    title: 'Sales',
    description: 'Product sales',
    xLabel: 'Product',
    yLabel: 'Units',
    unit: 'items',
    data: [
      { label: 'A', value: '120', category: 'Hardware' },
      { label: 42, value: 95 }
    ],
    colors: {
      primary: '#60A5FA',
      palette: ['#34D399', 'javascript:alert(1)', '#FBBF24']
    }
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.chart, {
    type: 'bar',
    data: [
      { label: 'A', value: 120, category: 'Hardware' },
      { label: '42', value: 95 }
    ],
    title: 'Sales',
    description: 'Product sales',
    xLabel: 'Product',
    yLabel: 'Units',
    unit: 'items',
    colors: {
      primary: '#60A5FA',
      palette: ['#34D399', '#FBBF24']
    }
  });
});

test('valid line chart schema passes and normalizes label/value rows', () => {
  const result = normalizeChartSchema({
    type: 'line',
    data: [
      { label: 'Jan', value: '12.5' },
      { label: 'Feb', value: 18 }
    ]
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.chart.data, [
    { label: 'Jan', value: 12.5 },
    { label: 'Feb', value: 18 }
  ]);
});

test('valid line chart schema passes and normalizes x/y rows', () => {
  const result = normalizeChartSchema({
    type: 'line',
    data: [
      { x: '1', y: '3' },
      { label: 'Two', x: 2, y: 5 }
    ]
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.chart.data, [
    { label: '1', x: 1, y: 3 },
    { label: 'Two', x: 2, y: 5 }
  ]);
});

test('valid scatter chart schema passes and normalizes', () => {
  const result = normalizeChartSchema({
    type: 'scatter',
    data: [
      { label: 'A', x: '160', y: '52', value: '120' },
      { x: 170, y: 61 }
    ]
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.chart.data, [
    { label: 'A', x: 160, y: 52, value: 120 },
    { label: 'Point 2', x: 170, y: 61 }
  ]);
});

test('valid donut chart schema passes and normalizes', () => {
  const result = normalizeChartSchema({
    type: 'donut',
    data: [
      { label: 'A', value: '30' },
      { category: 'B', value: 70 }
    ]
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.chart.data, [
    { label: 'A', value: 30 },
    { label: 'B', value: 70, category: 'B' }
  ]);
});

test('invalid type fails gracefully', () => {
  const result = normalizeChartSchema({
    type: 'area',
    data: [{ label: 'A', value: 1 }]
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'invalid-type');
  assert.deepEqual(SUPPORTED_CHART_TYPES, ['scatter', 'bar', 'line', 'donut']);
});

test('empty data fails gracefully', () => {
  const result = normalizeChartSchema({ type: 'bar', data: [] });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'empty-data');
});

test('required numeric fields reject non-numeric values', () => {
  assert.deepEqual(
    normalizeChartSchema({ type: 'bar', data: [{ label: 'A', value: 'many' }] }),
    { ok: false, reason: 'invalid-value', rowIndex: 0 }
  );
  assert.deepEqual(
    normalizeChartSchema({ type: 'scatter', data: [{ label: 'A', x: 1, y: 'nope' }] }),
    { ok: false, reason: 'invalid-y', rowIndex: 0 }
  );
});

test('present numeric fields are validated even when optional for a chart type', () => {
  const result = normalizeChartSchema({
    type: 'bar',
    data: [{ label: 'A', value: 1, x: 'not-a-number' }]
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'invalid-x');
  assert.equal(result.rowIndex, 0);
});

test('data length has a bounded limit', () => {
  const result = normalizeChartSchema({
    type: 'bar',
    data: Array.from({ length: 3 }, (_, index) => ({ label: index, value: index }))
  }, { maxDataPoints: 2 });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'too-many-data-points');
  assert.equal(result.maxDataPoints, 2);
});

test('malformed JSON fails without throwing', () => {
  const result = parseAndNormalizeChartSchema('{ bad json');

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'malformed-json');
});
