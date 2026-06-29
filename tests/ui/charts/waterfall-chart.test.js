import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateWaterfall } from '../../../src/app/ui/charts/waterfall-chart.js';
import { createChartFixture, dispatchChartPointer } from './chart-test-helpers.js';

const chart = {
  type: 'waterfall', unit: 'USD',
  data: [
    { label: 'Revenue', value: 120, kind: 'start' },
    { label: 'Cost', value: -40, kind: 'delta' },
    { label: 'Growth', value: 20, kind: 'delta' },
    { label: 'Profit', value: 100, kind: 'end' }
  ]
};

test('waterfall calculates start, deltas, and authoritative end cumulatives', () => {
  assert.deepEqual(calculateWaterfall(chart).map(({ start, end, cumulative }) => ({ start, end, cumulative })), [
    { start: 0, end: 120, cumulative: 120 },
    { start: 120, end: 80, cumulative: 80 },
    { start: 80, end: 100, cumulative: 100 },
    { start: 0, end: 100, cumulative: 100 }
  ]);
});

test('waterfall renders semantic bars, subtle connectors, and bounded labels', () => {
  const { window, article } = createChartFixture(chart);
  try {
    assert.equal(article.querySelectorAll('.ac-chart-waterfall-bar').length, 4);
    assert.equal(article.querySelectorAll('.ac-chart-waterfall-connector').length, 3);
    assert.equal(article.querySelectorAll('.ac-chart-waterfall-value[data-chart-within-bounds="true"]').length, 4);
    assert.ok(article.querySelector('.ac-chart-waterfall-bar.is-negative'));
    assert.equal(article.querySelector('.ac-chart-waterfall-bar[data-chart-index="2"]').dataset.chartCumulative, '100');
  } finally { window.close(); }
});

test('waterfall bar interaction exposes value and cumulative total', () => {
  const { window, article } = createChartFixture(chart);
  try {
    const bar = article.querySelector('.ac-chart-waterfall-bar[data-chart-index="1"]');
    dispatchChartPointer(window, bar, 'pointermove', { x: 250, y: 150 });
    assert.equal(bar.classList.contains('is-active'), true);
    assert.match(article.querySelector('.ac-chart-tooltip').textContent, /cumulative80 USD/);
  } finally { window.close(); }
});
