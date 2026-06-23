import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { buildTimeDistributionChartData } from '../src/app/legacy-runtime/features/time-distribution-chart-data.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

const text = {
  yearSuffix: 'Y',
  monthSuffix: 'M',
  daySuffix: 'D',
  hourlyMessageCount: 'hourly count',
  dailyMessageCount: 'daily count',
  monthlyMessageCount: 'monthly count',
  yearlyMessageCount: 'yearly count',
  months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
};

const messages = [
  { createdAt: '2024-12-31T23:00:00' },
  { createdAt: '2025-01-02T03:10:00' },
  { createdAt: '2025-01-02T03:50:00' },
  { createdAt: '2025-01-02T14:00:00' },
  { createdAt: '2025-02-10T08:00:00' },
  { createdAt: '2026-03-01T09:00:00' }
];

test('builds empty yearly data for empty messages', () => {
  assert.deepEqual(buildTimeDistributionChartData({ messages: [], text }), {
    chartType: 'bar',
    label: 'yearly count',
    labels: [],
    data: []
  });
});

test('builds yearly mode labels and counts', () => {
  assert.deepEqual(buildTimeDistributionChartData({ messages, text }), {
    chartType: 'bar',
    label: 'yearly count',
    labels: ['2024', '2025', '2026'],
    data: [1, 4, 1]
  });
});

test('builds monthly mode for a selected year', () => {
  const result = buildTimeDistributionChartData({ messages, year: 2025, text });

  assert.equal(result.chartType, 'line');
  assert.equal(result.label, '2025Y monthly count');
  assert.deepEqual(result.labels, text.months);
  assert.deepEqual(result.data, [3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
});

test('builds daily mode for a selected year and month', () => {
  const result = buildTimeDistributionChartData({ messages, year: 2025, month: 1, text });

  assert.equal(result.chartType, 'bar');
  assert.equal(result.label, '2025Y1M daily count');
  assert.equal(result.labels.length, 31);
  assert.deepEqual(result.labels.slice(0, 3), ['1D', '2D', '3D']);
  assert.equal(result.data[0], 0);
  assert.equal(result.data[1], 3);
  assert.equal(result.data[30], 0);
});

test('builds hourly mode for a selected year, month, and day', () => {
  const result = buildTimeDistributionChartData({ messages, year: 2025, month: 1, day: 2, text });

  assert.equal(result.chartType, 'line');
  assert.equal(result.label, '2025Y1M2D hourly count');
  assert.equal(result.labels.length, 24);
  assert.deepEqual(result.labels.slice(0, 5), ['0:00', '1:00', '2:00', '3:00', '4:00']);
  assert.equal(result.data[3], 2);
  assert.equal(result.data[14], 1);
});

test('uses local Date semantics for date filtering', () => {
  const localYear = new Date('2025-01-01T00:30:00').getFullYear();
  const result = buildTimeDistributionChartData({
    messages: [{ createdAt: '2025-01-01T00:30:00' }],
    year: localYear,
    text
  });

  assert.equal(result.data.reduce((sum, count) => sum + count, 0), 1);
});

test('time distribution chart data helper has no runtime side-effect tokens', () => {
  const source = readSource('src/app/legacy-runtime/features/time-distribution-chart-data.js');
  const sourceWithoutExportName = source.replaceAll('buildTimeDistributionChartData', '');
  const forbiddenTokens = [
    'document',
    'window',
    'globalThis',
    'localStorage',
    'sessionStorage',
    'indexedDB',
    'fetch',
    'addEventListener',
    'removeEventListener',
    'querySelector',
    'getElementById',
    'innerHTML',
    'classList',
    'Chart',
    'canvas',
    'getContext'
  ];

  for (const token of forbiddenTokens) {
    assert.equal(sourceWithoutExportName.includes(token), false, `helper source should not include ${token}`);
  }
});
