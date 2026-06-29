import assert from 'node:assert/strict';
import test from 'node:test';
import { createChartFixture, dispatchChartPointer } from './chart-test-helpers.js';

const chart = {
  type: 'treemap', unit: 'USD',
  data: [
    { label: 'Product A', value: 700, group: 'Core' },
    { label: 'Product B', value: 250, group: 'Core' },
    { label: 'Very small product with a long label', value: 1, group: 'Growth' }
  ]
};

test('treemap renders proportional rectangles and omits labels that cannot fit', () => {
  const { window, article } = createChartFixture(chart);
  try {
    const nodes = [...article.querySelectorAll('.ac-chart-treemap-node')];
    const area = (node) => Number(node.getAttribute('width')) * Number(node.getAttribute('height'));
    assert.equal(nodes.length, 3);
    assert.ok(area(nodes[0]) > area(nodes[2]));
    assert.ok(article.querySelectorAll('.ac-chart-treemap-label').length < nodes.length);
    assert.equal(article.querySelector('.ac-chart-treemap-label')?.dataset.chartLabelFits, 'true');
  } finally { window.close(); }
});

test('treemap nodes use shared active state and percentage tooltip', () => {
  const { window, article } = createChartFixture(chart);
  try {
    const node = article.querySelector('.ac-chart-treemap-node[data-chart-index="1"]');
    dispatchChartPointer(window, node, 'pointermove', { x: 300, y: 140 });
    assert.equal(node.classList.contains('is-active'), true);
    assert.equal(article.querySelector('.ac-chart-treemap-node[data-chart-index="0"]').classList.contains('is-faded'), true);
    assert.match(article.querySelector('.ac-chart-tooltip').textContent, /Core/);
    assert.match(article.querySelector('.ac-chart-tooltip').textContent, /share/);
  } finally { window.close(); }
});
