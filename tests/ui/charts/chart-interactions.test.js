import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { Window } from 'happy-dom';

import {
  findNearestPoint,
  getBoundedTooltipPosition,
  getSvgPointerPoint
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
    left: 172,
    top: 38
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

test('SVG pointer coordinates account for preserveAspectRatio letterboxing', () => {
  const window = new Window({ url: 'https://example.test/' });

  try {
    const svg = window.document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 640 360');
    svg.getBoundingClientRect = () => ({ left: 10, top: 20, width: 800, height: 360 });

    assert.deepEqual(getSvgPointerPoint(svg, { clientX: 154, clientY: 120 }), {
      x: 64,
      y: 100
    });
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

test('charts css defines separate desktop tablet and mobile sizing', () => {
  const css = readFileSync(join(process.cwd(), 'src/styles/charts.css'), 'utf8');

  assert.match(css, /@media\s*\(min-width:\s*1025px\)[\s\S]*?\.ac-chart-svg\s*\{[\s\S]*?height:\s*23rem;/);
  assert.match(css, /@media\s*\(min-width:\s*641px\)\s*and\s*\(max-width:\s*1024px\)[\s\S]*?\.ac-chart-svg\s*\{[\s\S]*?height:\s*19\.5rem;/);
  assert.match(css, /@media\s*\(max-width:\s*640px\)[\s\S]*?\.ac-chart-svg\s*\{[\s\S]*?height:\s*16\.5rem;/);
  assert.match(css, /@media\s*\(max-width:\s*640px\)[\s\S]*?\.ac-chart-tooltip\s*\{[\s\S]*?max-width:\s*min\(12rem,\s*calc\(100% - 0\.75rem\)\);/);
});

test('charts css keeps donut legend stable as a two-column mobile layout', () => {
  const css = readFileSync(join(process.cwd(), 'src/styles/charts.css'), 'utf8');

  assert.match(css, /\.ac-chart-legend\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/);
  assert.match(css, /@media\s*\(max-width:\s*640px\)[\s\S]*?\.ac-chart-legend\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/);
  assert.match(css, /@media\s*\(max-width:\s*640px\)[\s\S]*?\.ac-chart-legend-item\s*\{[\s\S]*?min-height:\s*2\.55rem;/);
});

test('chart focus and typography avoid black focus frames and heavy inherited SVG text', () => {
  const css = readFileSync(join(process.cwd(), 'src/styles/charts.css'), 'utf8');

  assert.match(css, /\.ac-chart\s+svg,\s*\.model-message \.ac-chart\s+text\s*\{[^}]*font-weight:\s*400;/s);
  assert.match(css, /\.ac-chart-axis-label,[^{]*\.ac-chart-axis-title\s*\{[^}]*font-weight:\s*400;/s);
  assert.match(css, /\.ac-chart-value-label\s*\{[^}]*font-weight:\s*500;/s);
  assert.match(css, /\[data-chart-interactive="true"\]:focus-visible\s*\{[^}]*drop-shadow/s);
  assert.doesNotMatch(css, /outline:\s*[^;]*(?:black|#000|#000000)/i);
});
