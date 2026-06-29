import assert from 'node:assert/strict';
import test from 'node:test';
import { createChartFixture, dispatchChartPointer } from './chart-test-helpers.js';

const chart = {
  type: 'stackedBar', unit: 'items',
  series: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }],
  data: [{ label: 'Jan', a: 10, b: 20 }, { label: 'Feb', a: 12, b: 18 }]
};

test('stacked bar renders segments and synchronized legend', () => {
  const { window, article } = createChartFixture(chart);
  try {
    assert.equal(article.querySelectorAll('.ac-chart-stacked-segment').length, 4);
    assert.equal(article.querySelectorAll('.ac-chart-stacked-legend-item').length, 2);
  } finally { window.close(); }
});

test('stacked bar segment and legend active states fade peers', () => {
  const { window, article } = createChartFixture(chart);
  try {
    const segment = article.querySelector('.ac-chart-stacked-segment[data-chart-index="1"]');
    dispatchChartPointer(window, segment, 'pointermove', { x: 200, y: 150 });
    assert.equal(segment.classList.contains('is-active'), true);
    assert.equal(article.querySelector('.ac-chart-stacked-segment[data-chart-index="0"]').classList.contains('is-faded'), true);
    assert.match(article.querySelector('.ac-chart-tooltip').textContent, /Jan/);
    assert.match(article.querySelector('.ac-chart-tooltip').textContent, /30/);
    const legend = article.querySelector('.ac-chart-stacked-legend-item[data-chart-series-index="0"]');
    dispatchChartPointer(window, legend, 'pointermove', { x: 100, y: 380 });
    assert.equal(article.querySelectorAll('.ac-chart-stacked-segment[data-chart-series-index="0"].is-active').length, 2);
  } finally { window.close(); }
});
