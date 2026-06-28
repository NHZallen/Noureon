import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { Window } from 'happy-dom';

import {
  findNearestPoint,
  getBoundedTooltipPosition
} from '../../../src/app/ui/charts/chart-interactions.js';
import { createChartFixture, dispatchChartPointer } from './chart-test-helpers.js';

test('tooltip boundary helper keeps tooltip inside chart bounds', () => {
  assert.deepEqual(getBoundedTooltipPosition({
    anchorX: 310,
    anchorY: 20,
    tooltipWidth: 120,
    tooltipHeight: 64,
    containerWidth: 320,
    containerHeight: 240
  }), {
    left: 176,
    top: 34
  });
});

test('nearest-point helper supports xy and x-axis snapping', () => {
  const window = new Window({ url: 'https://example.test/' });

  try {
    const a = window.document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    const b = window.document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    a.setAttribute('cx', '10');
    a.setAttribute('cy', '200');
    a.dataset.chartIndex = '0';
    b.setAttribute('cx', '80');
    b.setAttribute('cy', '20');
    b.dataset.chartIndex = '1';

    assert.equal(findNearestPoint([a, b], { x: 76, y: 190 }, { axis: 'x' }).index, 1);
    assert.equal(findNearestPoint([a, b], { x: 12, y: 198 }).index, 0);
  } finally {
    window.close();
  }
});

test('pointerleave and empty click clear active state and tooltip', () => {
  const { window, article, svg } = createChartFixture({
    type: 'bar',
    title: 'Sales',
    unit: 'items',
    data: [
      { label: 'A', value: 120 },
      { label: 'B', value: 95 }
    ]
  });

  try {
    const bar = article.querySelector('.ac-chart-bar[data-chart-index="0"]');
    dispatchChartPointer(window, bar, 'pointermove', { x: 120, y: 160 });
    assert.equal(bar.classList.contains('is-active'), true);
    assert.equal(article.querySelector('.ac-chart-tooltip').hidden, false);

    dispatchChartPointer(window, article, 'pointerleave');
    assert.equal(bar.classList.contains('is-active'), false);
    assert.equal(article.querySelector('.ac-chart-tooltip').hidden, true);

    dispatchChartPointer(window, bar, 'pointermove', { x: 120, y: 160 });
    dispatchChartPointer(window, svg, 'click', { x: 12, y: 12 });
    assert.equal(bar.classList.contains('is-active'), false);
  } finally {
    window.close();
  }
});

test('charts css keeps interaction styles free of important and dark selectors', () => {
  const css = readFileSync(join(process.cwd(), 'src/styles/charts.css'), 'utf8');
  assert.doesNotMatch(css, /!important\b/);
  assert.doesNotMatch(css, /\.dark\b|data-theme=['"]dark|prefers-color-scheme:\s*dark/i);
});
