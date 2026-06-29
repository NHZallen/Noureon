import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';

import { renderLineChart } from '../../../src/app/ui/charts/line-chart.js';
import { getPlotBox } from '../../../src/app/ui/charts/chart-utils.js';
import { createChartFixture, dispatchChartPointer } from './chart-test-helpers.js';

test('renders line chart with line paths, point hooks, and faded future hook', () => {
  const window = new Window({ url: 'https://example.test/' });

  try {
    const svg = renderLineChart(window.document, {
      type: 'line',
      title: 'Revenue',
      unit: 'k',
      data: [
        { label: 'Jan', value: 12 },
        { label: 'Feb', value: 13.5 },
        { label: 'Mar', value: 12.8 }
      ]
    });

    assert.ok(svg.querySelector('.ac-chart-line-past'));
    assert.ok(svg.querySelector('.ac-chart-line-future.is-faded'));
    assert.ok(svg.querySelector('.ac-chart-line-past-clip'));
    assert.ok(svg.querySelector('.ac-chart-line-future-clip'));
    assert.ok(svg.querySelector('.ac-chart-line-hit-area[data-chart-hit-area="plot"]'));
    assert.equal(svg.querySelectorAll('.ac-chart-line-point').length, 3);
    assert.match(svg.querySelector('.ac-chart-line-point').getAttribute('aria-label'), /Jan: 12 k/);
    const path = svg.querySelector('.ac-chart-line-past').getAttribute('d');
    assert.match(path, /^M /);
    assert.match(path, / C /);
    assert.doesNotMatch(path, / L /);
  } finally {
    window.close();
  }
});

test('line pointer movement snaps to nearest point and shows active guide', () => {
  const { window, article, svg } = createChartFixture({
    type: 'line',
    title: 'Revenue',
    unit: 'k',
    data: [
      { label: 'Jan', value: 12 },
      { label: 'Feb', value: 13.5 },
      { label: 'Mar', value: 12.8 },
      { label: 'Apr', value: 15 }
    ]
  });

  try {
    const plotBox = getPlotBox();
    const point = article.querySelector('.ac-chart-line-point[data-chart-index="2"]');
    const peer = article.querySelector('.ac-chart-line-point[data-chart-index="0"]');
    const fullPath = article.querySelector('.ac-chart-line-past').getAttribute('d');
    const overlay = article.querySelector('.ac-chart-line-hit-area');
    dispatchChartPointer(window, overlay, 'pointermove', {
      x: Number(point.getAttribute('cx')) + 6,
      y: 40
    });

    assert.equal(point.classList.contains('is-active'), true);
    assert.equal(peer.classList.contains('is-faded'), true);
    assert.equal(article.classList.contains('has-active'), true);
    assert.equal(article.dataset.chartActiveIndex, '2');
    assert.equal(svg.dataset.chartActiveIndex, '2');
    assert.equal(article.querySelector('.ac-chart-guide-x').classList.contains('is-hidden'), false);
    assert.equal(article.querySelector('.ac-chart-guide-x').getAttribute('y1'), String(plotBox.y));
    assert.equal(article.querySelector('.ac-chart-guide-x').getAttribute('y2'), String(plotBox.bottom));
    assert.equal(article.querySelector('.ac-chart-guide-x').dataset.chartActive, 'true');
    assert.equal(article.querySelector('.ac-chart-guide-x').nextElementSibling.classList.contains('ac-chart-series'), true);
    assert.equal(point.dataset.chartActive, 'true');
    assert.equal(peer.dataset.chartActive, 'false');
    assert.equal(article.querySelector('.ac-chart-line-past').getAttribute('d'), fullPath);
    assert.equal(article.querySelector('.ac-chart-line-future').getAttribute('d'), fullPath);
    assert.ok(Number(article.querySelector('.ac-chart-line-past-clip').getAttribute('width')) > 0);
    assert.ok(Number(article.querySelector('.ac-chart-line-future-clip').getAttribute('width')) > 0);
    assert.match(article.querySelector('.ac-chart-line-future').getAttribute('d'), / C /);
    assert.equal(article.querySelector('.ac-chart-line-future').classList.contains('is-faded'), true);
    assert.match(article.querySelector('.ac-chart-tooltip').textContent, /Mar/);
    assert.match(article.querySelector('.ac-chart-tooltip').textContent, /12.8 k/);

    const lastPoint = article.querySelector('.ac-chart-line-point[data-chart-index="3"]');
    dispatchChartPointer(window, overlay, 'pointermove', {
      x: Number(lastPoint.getAttribute('cx')),
      y: 40
    });
    assert.equal(article.querySelector('.ac-chart-line-past').getAttribute('d'), fullPath);
    assert.equal(article.querySelector('.ac-chart-line-future').getAttribute('d'), fullPath);
  } finally {
    window.close();
  }
});
