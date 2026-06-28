import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';

import { renderBarChart } from '../../../src/app/ui/charts/bar-chart.js';

test('renders bar chart with rounded bars and value labels', () => {
  const window = new Window({ url: 'https://example.test/' });

  try {
    const svg = renderBarChart(window.document, {
      type: 'bar',
      title: 'Sales',
      unit: 'items',
      data: [
        { label: 'A', value: 120 },
        { label: 'B', value: 95 }
      ]
    });

    const bars = svg.querySelectorAll('.ac-chart-bar');
    assert.equal(bars.length, 2);
    assert.equal(bars[0].getAttribute('rx'), '12');
    assert.match(bars[0].getAttribute('aria-label'), /A: 120 items/);
    assert.deepEqual([...svg.querySelectorAll('.ac-chart-bar-value')].map((node) => node.textContent), ['120', '95']);
  } finally {
    window.close();
  }
});
