import assert from 'node:assert/strict';
import test from 'node:test';
import { createChartFixture, dispatchChartPointer } from './chart-test-helpers.js';

test('histogram renders spaced bins with bounded value labels and bar interaction', () => {
  const { window, article } = createChartFixture({
    type: 'histogram', unit: 'people',
    data: [{ label: '0–10', min: 0, max: 10, count: 2, value: 2 }, { label: '10–20', min: 10, max: 20, count: 7, value: 7 }]
  });
  try {
    const bars = article.querySelectorAll('.ac-chart-histogram-bar');
    assert.equal(bars.length, 2);
    assert.equal(article.querySelectorAll('[data-chart-safe-min-y]').length, 2);
    dispatchChartPointer(window, bars[1], 'pointermove', { x: 350, y: 140 });
    assert.equal(bars[1].classList.contains('is-active'), true);
    assert.match(article.querySelector('.ac-chart-tooltip').textContent, /10–20/);
  } finally { window.close(); }
});
