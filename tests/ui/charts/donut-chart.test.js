import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';

import { renderDonutChart } from '../../../src/app/ui/charts/donut-chart.js';
import { createChartFixture, dispatchChartPointer } from './chart-test-helpers.js';

test('renders donut chart with segments and legend percentages', () => {
  const window = new Window({ url: 'https://example.test/' });

  try {
    const element = renderDonutChart(window.document, {
      type: 'donut',
      title: 'Share',
      data: [
        { label: 'A', value: 40 },
        { label: 'B', value: 30 },
        { label: 'C', value: 20 },
        { label: 'D', value: 10 }
      ]
    });

    assert.ok(element.querySelector('.ac-chart-svg-donut'));
    assert.ok(element.querySelector('.ac-chart-donut-hit-area[data-chart-hit-area="plot"]'));
    assert.equal(element.querySelectorAll('.ac-chart-donut-segment').length, 4);
    assert.equal(element.querySelectorAll('.ac-chart-legend-item').length, 4);
    assert.deepEqual([...element.querySelectorAll('.ac-chart-legend-value')].map((node) => node.textContent), [
      '40%',
      '30%',
      '20%',
      '10%'
    ]);
    assert.match(element.querySelector('.ac-chart-donut-segment').getAttribute('d'), /^M /);
  } finally {
    window.close();
  }
});

test('donut segment state syncs active and faded legend items', () => {
  const { window, article } = createChartFixture({
    type: 'donut',
    title: 'Share',
    data: [
      { label: 'A', value: 40 },
      { label: 'B', value: 30 },
      { label: 'C', value: 20 },
      { label: 'D', value: 10 }
    ]
  });

  try {
    const segment = article.querySelector('.ac-chart-donut-segment[data-chart-index="1"]');
    const legend = article.querySelector('.ac-chart-legend-item[data-chart-index="1"]');
    const fadedLegend = article.querySelector('.ac-chart-legend-item[data-chart-index="0"]');
    dispatchChartPointer(window, segment, 'click', { x: 280, y: 150 });

    assert.equal(segment.classList.contains('is-active'), true);
    assert.equal(legend.classList.contains('is-active'), true);
    assert.equal(fadedLegend.classList.contains('is-faded'), true);
    assert.equal(segment.dataset.chartActive, 'true');
    assert.equal(legend.dataset.chartActive, 'true');
    assert.equal(article.dataset.chartActiveIndex, '1');
    assert.equal(article.querySelector('svg').dataset.chartActiveIndex, '1');
    assert.equal(fadedLegend.dataset.chartActive, 'false');
    assert.equal(legend.getAttribute('aria-pressed'), 'true');
    assert.match(article.querySelector('.ac-chart-tooltip').textContent, /B/);
    assert.match(article.querySelector('.ac-chart-tooltip').textContent, /30%/);
    assert.equal(article.querySelectorAll('.ac-chart-tooltip-row').length, 2);
  } finally {
    window.close();
  }
});

test('donut segment and legend clicks pin and switch the same selected state', () => {
  const { window, article, svg } = createChartFixture({
    type: 'donut',
    title: 'Share',
    data: [
      { label: 'A', value: 40 },
      { label: 'B', value: 30 },
      { label: 'C', value: 20 }
    ]
  });

  try {
    const segment = article.querySelector('.ac-chart-donut-segment[data-chart-index="1"]');
    const legend = article.querySelector('.ac-chart-legend-item[data-chart-index="2"]');
    dispatchChartPointer(window, segment, 'pointerdown', { x: 260, y: 150, pointerType: 'mouse' });
    dispatchChartPointer(window, segment, 'click', { x: 260, y: 150, pointerType: 'mouse' });
    dispatchChartPointer(window, article, 'pointerleave', { pointerType: 'mouse' });
    assert.equal(article.dataset.chartActiveIndex, '1');

    dispatchChartPointer(window, legend, 'pointerdown', { x: 180, y: 340, pointerType: 'mouse' });
    dispatchChartPointer(window, legend, 'click', { x: 180, y: 340, pointerType: 'mouse' });
    assert.equal(article.dataset.chartActiveIndex, '2');
    assert.equal(legend.classList.contains('is-selected'), true);
    assert.equal(article.querySelector('.ac-chart-donut-segment[data-chart-index="2"]').classList.contains('is-active'), true);

    dispatchChartPointer(window, svg, 'pointerdown', { x: 4, y: 4, pointerType: 'mouse' });
    dispatchChartPointer(window, svg, 'click', { x: 4, y: 4, pointerType: 'mouse' });
    assert.equal(article.dataset.chartActiveIndex, '');
  } finally {
    window.close();
  }
});

test('donut legend state syncs back to its segment', () => {
  const { window, article } = createChartFixture({
    type: 'donut',
    title: 'Share',
    data: [
      { label: 'A', value: 40 },
      { label: 'B', value: 30 },
      { label: 'C', value: 20 },
      { label: 'D', value: 10 }
    ]
  });

  try {
    const legend = article.querySelector('.ac-chart-legend-item[data-chart-index="2"]');
    const segment = article.querySelector('.ac-chart-donut-segment[data-chart-index="2"]');
    const fadedSegment = article.querySelector('.ac-chart-donut-segment[data-chart-index="0"]');
    dispatchChartPointer(window, legend, 'click', { x: 180, y: 340 });

    assert.equal(legend.classList.contains('is-active'), true);
    assert.equal(segment.classList.contains('is-active'), true);
    assert.equal(fadedSegment.classList.contains('is-faded'), true);
    assert.equal(fadedSegment.dataset.chartActive, 'false');
    assert.equal(article.dataset.chartActiveIndex, '2');
    assert.equal(legend.classList.contains('is-selected'), true);
    assert.equal(legend.getAttribute('aria-pressed'), 'true');
  } finally {
    window.close();
  }
});
