import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';

import { renderScatterChart } from '../../../src/app/ui/charts/scatter-chart.js';
import { getPlotBox } from '../../../src/app/ui/charts/chart-utils.js';
import { createChartFixture, dispatchChartPointer } from './chart-test-helpers.js';

test('renders scatter chart with grid, axis labels, and points', () => {
  const window = new Window({ url: 'https://example.test/' });

  try {
    const svg = renderScatterChart(window.document, {
      type: 'scatter',
      title: 'Height and weight',
      xLabel: 'Height',
      yLabel: 'Weight',
      unit: 'kg',
      data: [
        { label: 'A', x: 160, y: 52 },
        { label: 'B', x: 170, y: 65 }
      ]
    }, { labelledBy: 'chart-title' });

    assert.equal(svg.tagName.toLowerCase(), 'svg');
    assert.equal(svg.getAttribute('aria-labelledby'), 'chart-title');
    assert.equal(svg.querySelectorAll('.ac-chart-grid-line').length, 4);
    assert.equal(svg.querySelectorAll('.ac-chart-scatter-point').length, 2);
    assert.ok(svg.querySelector('.ac-chart-scatter-hit-area[data-chart-hit-area="plot"]'));
    assert.match(svg.textContent, /Height/);
    assert.match(svg.querySelector('.ac-chart-scatter-point').getAttribute('aria-label'), /A: 160, 52 kg/);
  } finally {
    window.close();
  }
});

test('scatter pointer movement selects nearest point, fades peers, and shows guides', () => {
  const { window, article, svg } = createChartFixture({
    type: 'scatter',
    title: 'Height and weight',
    xLabel: 'Height',
    yLabel: 'Weight',
    unit: 'kg',
    data: [
      { label: 'A', x: 160, y: 52 },
      { label: 'B', x: 170, y: 65 },
      { label: 'C', x: 180, y: 80 }
    ]
  });

  try {
    const plotBox = getPlotBox();
    const point = article.querySelector('.ac-chart-scatter-point[data-chart-index="1"]');
    const peer = article.querySelector('.ac-chart-scatter-point[data-chart-index="0"]');
    const overlay = article.querySelector('.ac-chart-scatter-hit-area');
    dispatchChartPointer(window, overlay, 'pointermove', {
      x: Number(point.getAttribute('cx')),
      y: Number(point.getAttribute('cy'))
    });

    assert.equal(point.classList.contains('is-active'), true);
    assert.equal(peer.classList.contains('is-faded'), true);
    assert.equal(article.querySelector('.ac-chart-guide-x').classList.contains('is-hidden'), false);
    assert.equal(article.querySelector('.ac-chart-guide-y').classList.contains('is-hidden'), false);
    assert.equal(article.querySelector('.ac-chart-guide-x').getAttribute('y1'), String(plotBox.y));
    assert.equal(article.querySelector('.ac-chart-guide-x').getAttribute('y2'), String(plotBox.bottom));
    assert.equal(article.querySelector('.ac-chart-guide-y').getAttribute('x1'), String(plotBox.x));
    assert.equal(article.querySelector('.ac-chart-guide-y').getAttribute('x2'), String(plotBox.right));
    assert.equal(article.dataset.chartActiveIndex, '1');
    assert.equal(svg.dataset.chartActiveIndex, '1');
    assert.equal(point.dataset.chartActive, 'true');
    assert.equal(peer.dataset.chartActive, 'false');
    assert.match(article.querySelector('.ac-chart-tooltip').textContent, /B/);
    assert.match(article.querySelector('.ac-chart-tooltip').textContent, /170 kg/);
    assert.match(article.querySelector('.ac-chart-tooltip').textContent, /65 kg/);
  } finally {
    window.close();
  }
});
