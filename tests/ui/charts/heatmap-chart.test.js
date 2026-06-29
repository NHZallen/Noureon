import assert from 'node:assert/strict';
import test from 'node:test';
import { createChartFixture, dispatchChartPointer } from './chart-test-helpers.js';

const chart = {
  type: 'heatmap', xLabel: 'Time', yLabel: 'Day', unit: 'events',
  data: [
    { x: 'Morning', y: 'Monday', value: 12, label: 'Monday / Morning' },
    { x: 'Evening', y: 'Monday', value: 48, label: 'Monday / Evening' },
    { x: 'Morning', y: 'Tuesday', value: 30, label: 'Tuesday / Morning' },
    { x: 'Evening', y: 'Tuesday', value: 64, label: 'Tuesday / Evening' }
  ]
};

test('heatmap renders categorical grid cells with a restrained color scale', () => {
  const { window, article } = createChartFixture(chart);
  try {
    const cells = [...article.querySelectorAll('.ac-chart-heatmap-cell')];
    assert.equal(cells.length, 4);
    assert.equal(article.querySelectorAll('.ac-chart-heatmap-x-label').length, 2);
    assert.equal(article.querySelectorAll('.ac-chart-heatmap-y-label').length, 2);
    assert.ok(Number(cells[0].getAttribute('fill-opacity')) < Number(cells[3].getAttribute('fill-opacity')));
  } finally { window.close(); }
});

test('heatmap cell interaction exposes dimensions and fades peers', () => {
  const { window, article } = createChartFixture(chart);
  try {
    const cell = article.querySelector('.ac-chart-heatmap-cell[data-chart-index="1"]');
    dispatchChartPointer(window, cell, 'pointermove', { x: 220, y: 120 });
    assert.equal(cell.classList.contains('is-active'), true);
    assert.equal(article.querySelector('.ac-chart-heatmap-cell[data-chart-index="0"]').classList.contains('is-faded'), true);
    assert.match(article.querySelector('.ac-chart-tooltip').textContent, /Monday/);
    assert.match(article.querySelector('.ac-chart-tooltip').textContent, /Evening/);
    assert.match(article.querySelector('.ac-chart-tooltip').textContent, /48 events/);
  } finally { window.close(); }
});
