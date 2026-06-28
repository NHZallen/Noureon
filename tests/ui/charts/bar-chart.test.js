import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';

import { renderBarChart } from '../../../src/app/ui/charts/bar-chart.js';
import { createChartFixture, dispatchChartPointer } from './chart-test-helpers.js';

test('renders bar chart with rounded bars and value labels', () => {
  const window = new Window({ url: 'https://example.test/' });

  try {
    const svg = renderBarChart(window.document, {
      type: 'bar',
      title: 'Sales',
      unit: 'items',
      data: [
        { label: 'A', value: 120 },
        { label: 'B', value: 95 }
      ]
    });

    const bars = svg.querySelectorAll('.ac-chart-bar');
    const overlay = svg.querySelector('.ac-chart-bar-hit-area[data-chart-hit-area="plot"]');
    assert.ok(overlay);
    assert.equal(bars.length, 2);
    assert.equal(bars[0].getAttribute('rx'), '12');
    assert.match(bars[0].getAttribute('aria-label'), /A: 120 items/);
    const labels = [...svg.querySelectorAll('.ac-chart-bar-value')];
    assert.deepEqual(labels.map((node) => node.textContent), ['120', '95']);
    labels.forEach((label) => {
      assert.equal(label.dataset.chartLabelPlacement, 'outside');
      assert.ok(Number(label.getAttribute('x')) >= Number(label.dataset.chartSafeMinX));
      assert.ok(Number(label.getAttribute('x')) <= Number(label.dataset.chartSafeMaxX));
      assert.ok(Number(label.getAttribute('y')) < Number(label.dataset.chartBarTop));
      assert.ok(Number(label.getAttribute('y')) >= 42);
    });
    assert.ok(Number(svg.querySelector('.ac-chart-x-title')?.getAttribute('y') || 352) - Number(svg.querySelector('.ac-chart-x-tick').getAttribute('y')) >= 30);
  } finally {
    window.close();
  }
});

test('bar labels constrain long values and short bars keep a natural radius', () => {
  const window = new Window({ url: 'https://example.test/' });

  try {
    const svg = renderBarChart(window.document, {
      type: 'bar',
      data: [
        { label: 'Tiny', value: 1 },
        { label: 'Large', value: 123456789012 }
      ]
    });
    const tinyBar = svg.querySelector('.ac-chart-bar[data-chart-index="0"]');
    const longLabel = svg.querySelector('.ac-chart-bar-value[data-chart-label-placement="outside"]:last-of-type');

    assert.ok(Number(tinyBar.getAttribute('rx')) <= Number(tinyBar.getAttribute('height')) / 2);
    assert.ok(Number(longLabel.getAttribute('textLength')) <= 72);
    assert.equal(longLabel.getAttribute('lengthAdjust'), 'spacingAndGlyphs');
  } finally {
    window.close();
  }
});

test('bar pointer state activates one bar and fades the rest', () => {
  const { window, article } = createChartFixture({
    type: 'bar',
    title: 'Sales',
    unit: 'items',
    data: [
      { label: 'A', value: 120 },
      { label: 'B', value: 95 },
      { label: 'C', value: 150 }
    ]
  });

  try {
    const active = article.querySelector('.ac-chart-bar[data-chart-index="2"]');
    const faded = article.querySelector('.ac-chart-bar[data-chart-index="0"]');
    dispatchChartPointer(window, active, 'pointermove', { x: 420, y: 160 });

    assert.equal(active.classList.contains('is-active'), true);
    assert.equal(faded.classList.contains('is-faded'), true);
    assert.match(article.querySelector('.ac-chart-tooltip').textContent, /C/);
    assert.match(article.querySelector('.ac-chart-tooltip').textContent, /150 items/);
    assert.deepEqual([...article.querySelectorAll('.ac-chart-bar-value')].map((node) => node.textContent), ['120', '95', '150']);
  } finally {
    window.close();
  }
});
