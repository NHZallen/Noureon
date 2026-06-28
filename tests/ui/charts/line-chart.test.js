import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';

import { renderLineChart } from '../../../src/app/ui/charts/line-chart.js';

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
    assert.equal(svg.querySelectorAll('.ac-chart-line-point').length, 3);
    assert.match(svg.querySelector('.ac-chart-line-point').getAttribute('aria-label'), /Jan: 12 k/);
    assert.match(svg.querySelector('.ac-chart-line-past').getAttribute('d'), /^M /);
  } finally {
    window.close();
  }
});
