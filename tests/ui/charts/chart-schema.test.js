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
    type: 'candlestick',
    data: [{ label: 'A', value: 1 }]
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'invalid-type');
  assert.deepEqual(SUPPORTED_CHART_TYPES, [
    'scatter', 'bar', 'line', 'donut',
    'stackedBar', 'area', 'bubble', 'histogram', 'kpi', 'gauge',
    'heatmap', 'treemap', 'radar', 'funnel', 'waterfall',
    'sankey', 'boxplot', 'gantt'
  ]);
});

test('complex chart schemas normalize safely', () => {
  const sankey = normalizeChartSchema({
    type: 'sankey',
    nodes: [
      { id: 'search', label: 'Search' },
      { id: 'signup', label: 'Signup' }
    ],
    links: [{ source: 'search', target: 'signup', value: '120' }]
  });
  const boxplot = normalizeChartSchema({
    type: 'boxplot',
    data: [{ label: 'A', min: 1, q1: 2, median: 3, q3: 4, max: 5, outliers: ['9'] }]
  });
  const gantt = normalizeChartSchema({
    type: 'gantt',
    data: [
      { label: 'Build', start: '2026-07-01', end: '2026-07-05', progress: '75', group: 'Dev' },
      { label: 'Launch', date: '2026-07-08', kind: 'milestone' }
    ]
  });

  assert.deepEqual([sankey.ok, boxplot.ok, gantt.ok], [true, true, true]);
  assert.equal(sankey.chart.links[0].value, 120);
  assert.equal(boxplot.chart.data[0].outliers[0], 9);
  assert.equal(gantt.chart.data[0].progress, 75);
  assert.equal(gantt.chart.data[1].kind, 'milestone');
});

test('invalid complex schemas fall back safely', () => {
  assert.equal(normalizeChartSchema({ type: 'sankey', nodes: [{ id: 'a', label: 'A' }], links: [{ source: 'a', target: 'b', value: 1 }] }).ok, false);
  assert.equal(normalizeChartSchema({ type: 'boxplot', data: [{ label: 'A', min: 1, q1: 4, median: 3, q3: 5, max: 6 }] }).ok, false);
  assert.equal(normalizeChartSchema({ type: 'boxplot', data: [{ label: 'A', values: [1, 2, 3, 4] }] }).ok, false);
  assert.equal(normalizeChartSchema({ type: 'gantt', data: [{ label: 'A', start: '2026-07-05', end: '2026-07-01' }] }).ok, false);
  assert.equal(normalizeChartSchema({ type: 'gantt', data: [{ label: 'A', date: '2026-99-01', kind: 'milestone' }] }).ok, false);
});

test('sankey cycles normalize without crashing so the renderer can safely cap layout depth', () => {
  const result = normalizeChartSchema({
    type: 'sankey',
    nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
    links: [{ source: 'a', target: 'b', value: 1 }, { source: 'b', target: 'a', value: 1 }]
  });
  assert.equal(result.ok, true);
});

test('analytical chart schemas normalize safely', () => {
  const samples = [
    { type: 'heatmap', data: [{ x: 'Morning', y: 'Monday', value: '24' }] },
    { type: 'treemap', data: [{ label: 'A', value: '52', group: 'Core' }] },
    { type: 'radar', min: 0, max: 100, data: [{ label: 'Speed', value: '82' }] },
    { type: 'radar', min: 0, max: 100, series: [{ key: 'a', label: 'A' }], data: [{ label: 'Speed', a: '82' }] },
    { type: 'funnel', data: [{ label: 'Visit', value: '100' }] },
    { type: 'waterfall', data: [{ label: 'Revenue', value: '120', kind: 'start' }, { label: 'Cost', value: '-20' }] }
  ];
  const results = samples.map((sample) => normalizeChartSchema(sample));
  assert.deepEqual(results.map((result) => result.ok), Array(6).fill(true));
  assert.deepEqual(results[0].chart.data[0], { x: 'Morning', y: 'Monday', value: 24, label: 'Monday / Morning' });
  assert.equal(results[1].chart.data[0].group, 'Core');
  assert.equal(results[3].chart.data[0].a, 82);
  assert.equal(results[5].chart.data[1].kind, 'delta');
});

test('invalid analytical schemas fall back safely', () => {
  assert.equal(normalizeChartSchema({ type: 'heatmap', data: [{ x: '', y: 'Monday', value: 1 }] }).ok, false);
  assert.equal(normalizeChartSchema({ type: 'treemap', data: [{ label: 'A', value: -1 }] }).ok, false);
  assert.equal(normalizeChartSchema({ type: 'radar', min: 5, max: 5, data: [{ label: 'A', value: 5 }] }).ok, false);
  assert.equal(normalizeChartSchema({ type: 'funnel', data: [{ label: 'A', value: -1 }] }).ok, false);
  assert.equal(normalizeChartSchema({ type: 'waterfall', data: [{ label: 'A', value: 1, kind: 'subtotal' }] }).ok, false);
});

test('extended chart schemas normalize safely', () => {
  const samples = [
    { type: 'stackedBar', series: [{ key: 'a', label: 'A' }], data: [{ label: 'Jan', a: '4' }] },
    { type: 'area', data: [{ label: 'Jan', value: '12' }] },
    { type: 'bubble', data: [{ label: 'A', x: '1', y: '2', size: '30' }] },
    { type: 'histogram', bins: [{ label: '0–10', min: 0, max: 10, count: '3' }] },
    { type: 'kpi', data: [{ label: 'Revenue', value: '12', delta: '-2', trend: 'down' }] },
    { type: 'gauge', label: 'Done', value: '72', min: 0, max: 100 }
  ];
  assert.deepEqual(samples.map((sample) => normalizeChartSchema(sample).ok), Array(6).fill(true));
  assert.equal(normalizeChartSchema(samples[0]).chart.data[0].a, 4);
  assert.equal(normalizeChartSchema(samples[2]).chart.data[0].size, 30);
  assert.equal(normalizeChartSchema(samples[3]).chart.data[0].count, 3);
  assert.equal(normalizeChartSchema(samples[5]).chart.value, 72);
});

test('histogram raw values are normalized into bins', () => {
  const result = normalizeChartSchema({ type: 'histogram', data: [1, 2, 2, 8, 9] });
  assert.equal(result.ok, true);
  assert.ok(result.chart.data.length >= 2);
  assert.equal(result.chart.data.reduce((sum, bin) => sum + bin.count, 0), 5);
});

test('invalid extended schemas fall back safely', () => {
  assert.equal(normalizeChartSchema({ type: 'stackedBar', series: [], data: [{ label: 'A' }] }).ok, false);
  assert.equal(normalizeChartSchema({ type: 'bubble', data: [{ x: 1, y: 2, size: -1 }] }).ok, false);
  assert.equal(normalizeChartSchema({ type: 'histogram', bins: [{ min: 10, max: 0, count: 2 }] }).ok, false);
  assert.equal(normalizeChartSchema({ type: 'kpi', data: Array.from({ length: 5 }, (_, i) => ({ label: i, value: i })) }).ok, false);
  assert.equal(normalizeChartSchema({ type: 'gauge', value: 2, min: 5, max: 5 }).ok, false);
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

test('common Chart.js-shaped model output is adapted for all supported chart types', () => {
  const samples = [
    { type: 'line', data: { labels: ['Jan', 'Feb'], datasets: [{ label: 'Sales', data: [12, 19] }] } },
    { type: 'area', data: { labels: ['Jan', 'Feb'], datasets: [{ data: [5, 7] }] } },
    { type: 'bar', data: { labels: ['A', 'B'], datasets: [{ data: [10, 20] }] } },
    { type: 'stackedBar', data: { labels: ['Q1'], datasets: [{ label: 'Online', data: [12] }, { label: 'Store', data: [8] }] } },
    { type: 'donut', data: { labels: ['Direct', 'Search'], datasets: [{ data: [30, 50] }] } },
    { type: 'treemap', data: [{ label: 'A', value: 40 }] },
    { type: 'scatter', data: { datasets: [{ label: 'Points', data: [{ x: 10, y: 20 }] }] } },
    { type: 'bubble', data: { datasets: [{ label: 'Markets', data: [{ x: 20, y: 30, r: 10 }] }] } },
    { type: 'histogram', data: { bins: [0, 10, 20], datasets: [{ data: [5, 15] }] } },
    { type: 'boxplot', data: { labels: ['A'], datasets: [{ data: [{ min: 10, q1: 20, median: 30, q3: 40, max: 50 }] }] } },
    { type: 'heatmap', data: { xLabels: ['Mon', 'Tue'], yLabels: ['AM'], datasets: [{ data: [[10, 20]] }] } },
    { type: 'radar', data: { labels: ['Speed', 'Power'], datasets: [{ label: 'A', data: [80, 70] }, { label: 'B', data: [70, 85] }] } },
    { type: 'funnel', data: { stages: ['Visit', 'Buy'], datasets: [{ data: [1000, 100] }] } },
    { type: 'waterfall', data: { labels: ['Start', 'Gain', 'End'], datasets: [{ data: [100, 50, 150] }] } },
    { type: 'sankey', data: { nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], links: [{ source: 'a', target: 'b', value: 10 }] } },
    { type: 'gantt', data: { tasks: [{ name: 'Plan', start: '2026-07-01', end: '2026-07-05' }] } },
    { type: 'kpi', data: { indicators: [{ label: 'Revenue', value: 125, change: 12.5 }] } },
    { type: 'gauge', data: { value: 75, min: 0, max: 100, label: 'Done' } }
  ];

  const results = samples.map((sample) => normalizeChartSchema(sample));
  assert.deepEqual(results.map((result) => result.ok), Array(18).fill(true));
  assert.deepEqual(results[0].chart.data[0], { label: 'Jan', value: 12 });
  assert.equal(results[3].chart.series.length, 2);
  assert.equal(results[7].chart.data[0].size, 10);
  assert.equal(results[8].chart.data[1].count, 15);
  assert.equal(results[11].chart.series.length, 2);
  assert.equal(results[13].chart.data[2].kind, 'end');
  assert.equal(results[14].chart.links[0].target, 'b');
  assert.equal(results[15].chart.data[0].label, 'Plan');
  assert.equal(results[16].chart.data[0].delta, 12.5);
  assert.equal(results[17].chart.value, 75);
});
