import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';

import { renderDonutChart } from '../../../src/app/ui/charts/donut-chart.js';

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
