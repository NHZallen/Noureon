import assert from 'node:assert/strict';
import test from 'node:test';
import { createChartFixture, dispatchChartPointer } from './chart-test-helpers.js';

test('KPI renders lightweight interactive metric cards', () => {
  const { window, article } = createChartFixture({
    type: 'kpi', data: [
      { label: 'Revenue', value: 1280, unit: 'USD', delta: 12.5, trend: 'up' },
      { label: 'Conversion', value: 7.8, unit: '%', delta: -0.4, trend: 'down' }
    ]
  });
  try {
    const items = article.querySelectorAll('.ac-chart-kpi-item');
    assert.equal(items.length, 2);
    assert.equal(article.querySelector('svg'), null);
    dispatchChartPointer(window, items[0], 'pointermove', { x: 80, y: 100 });
    assert.equal(items[0].classList.contains('is-active'), true);
    assert.match(article.querySelector('.ac-chart-tooltip').textContent, /Revenue/);
  } finally { window.close(); }
});
