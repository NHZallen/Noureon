import assert from 'node:assert/strict';
import test from 'node:test';
import { createChartFixture, dispatchChartPointer } from './chart-test-helpers.js';

const chart = {
  type: 'radar', unit: 'points', min: 0, max: 100,
  series: [{ key: 'a', label: 'Product A' }, { key: 'b', label: 'Product B' }],
  data: [
    { label: 'Speed', a: 82, b: 76 },
    { label: 'Stability', a: 74, b: 88 },
    { label: 'Usability', a: 90, b: 80 },
    { label: 'Cost', a: 68, b: 79 },
    { label: 'Scale', a: 76, b: 84 }
  ]
};

test('radar renders axes, grid, polygons, and axis points', () => {
  const { window, article } = createChartFixture(chart);
  try {
    assert.equal(article.querySelectorAll('.ac-chart-radar-axis').length, 5);
    assert.equal(article.querySelectorAll('.ac-chart-radar-grid').length, 4);
    assert.equal(article.querySelectorAll('.ac-chart-radar-polygon').length, 2);
    assert.equal(article.querySelectorAll('.ac-chart-radar-point').length, 10);
  } finally { window.close(); }
});

test('radar point and legend synchronize shared active state', () => {
  const { window, article } = createChartFixture(chart);
  try {
    const point = article.querySelector('.ac-chart-radar-point[data-chart-axis-index="1"][data-chart-series-index="0"]');
    dispatchChartPointer(window, point, 'pointermove', { x: 250, y: 140 });
    assert.equal(point.classList.contains('is-active'), true);
    assert.match(article.querySelector('.ac-chart-tooltip').textContent, /Stability/);
    const legend = article.querySelector('.ac-chart-radar-legend-item[data-chart-series-index="1"]');
    dispatchChartPointer(window, legend, 'pointermove', { x: 220, y: 390 });
    assert.equal(article.querySelectorAll('.ac-chart-radar-point[data-chart-series-index="1"].is-active').length, 5);
    assert.equal(article.querySelector('.ac-chart-radar-polygon[data-chart-series-index="1"]').classList.contains('is-active'), true);
  } finally { window.close(); }
});
