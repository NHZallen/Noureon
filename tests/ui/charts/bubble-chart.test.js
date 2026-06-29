import assert from 'node:assert/strict';
import test from 'node:test';
import { createChartFixture, dispatchChartPointer } from './chart-test-helpers.js';

test('bubble chart scales radii and activates nearest bubble with both guides', () => {
  const { window, article } = createChartFixture({
    type: 'bubble', xLabel: 'Price', yLabel: 'Sales', sizeLabel: 'Revenue',
    data: [{ label: 'A', x: 10, y: 20, size: 100 }, { label: 'B', x: 20, y: 30, size: 900 }]
  });
  try {
    const bubbles = [...article.querySelectorAll('.ac-chart-bubble-point')];
    assert.ok(Number(bubbles[1].getAttribute('r')) > Number(bubbles[0].getAttribute('r')));
    dispatchChartPointer(window, article.querySelector('.ac-chart-bubble-hit-area'), 'pointermove', {
      x: Number(bubbles[1].getAttribute('cx')), y: Number(bubbles[1].getAttribute('cy'))
    });
    assert.equal(bubbles[1].classList.contains('is-active'), true);
    assert.equal(article.querySelector('.ac-chart-guide-x').classList.contains('is-hidden'), false);
    assert.equal(article.querySelector('.ac-chart-guide-y').classList.contains('is-hidden'), false);
    assert.match(article.querySelector('.ac-chart-tooltip').textContent, /Revenue/);
  } finally { window.close(); }
});
