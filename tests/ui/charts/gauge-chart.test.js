import assert from 'node:assert/strict';
import test from 'node:test';
import { createChartFixture, dispatchChartPointer } from './chart-test-helpers.js';

test('gauge renders clean track, progress arc, and centered value', () => {
  const { window, article } = createChartFixture({ type: 'gauge', label: 'Complete', value: 72, min: 0, max: 100, unit: '%' });
  try {
    assert.ok(article.querySelector('.ac-chart-gauge-track'));
    const progress = article.querySelector('.ac-chart-gauge-progress');
    assert.match(progress.getAttribute('d'), / A /);
    assert.equal(article.querySelector('.ac-chart-gauge-value').textContent, '72 %');
    dispatchChartPointer(window, progress, 'pointermove', { x: 210, y: 120 });
    assert.equal(progress.classList.contains('is-active'), true);
    assert.match(article.querySelector('.ac-chart-tooltip').textContent, /0–100/);
  } finally { window.close(); }
});
