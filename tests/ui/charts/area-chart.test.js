import assert from 'node:assert/strict';
import test from 'node:test';
import { createChartFixture, dispatchChartPointer } from './chart-test-helpers.js';

test('area chart renders smooth line and filled area with nearest-point interaction', () => {
  const { window, article } = createChartFixture({
    type: 'area', unit: 'k', data: [{ label: 'Jan', value: 10 }, { label: 'Feb', value: 14 }, { label: 'Mar', value: 12 }]
  });
  try {
    assert.match(article.querySelector('.ac-chart-area-fill').getAttribute('d'), / C /);
    assert.match(article.querySelector('.ac-chart-area-fill').getAttribute('d'), / Z$/);
    const point = article.querySelector('.ac-chart-area-point[data-chart-index="1"]');
    dispatchChartPointer(window, article.querySelector('.ac-chart-area-hit-area'), 'pointermove', {
      x: Number(point.getAttribute('cx')), y: Number(point.getAttribute('cy'))
    });
    assert.equal(article.dataset.chartActiveIndex, '1');
    assert.equal(article.querySelector('.ac-chart-guide-x').classList.contains('is-hidden'), false);
    assert.ok(Number(article.querySelector('.ac-chart-area-future-clip').getAttribute('width')) > 0);
  } finally { window.close(); }
});
