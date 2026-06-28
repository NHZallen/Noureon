import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';

import { renderScatterChart } from '../../../src/app/ui/charts/scatter-chart.js';

test('renders scatter chart with grid, axis labels, and points', () => {
  const window = new Window({ url: 'https://example.test/' });

  try {
    const svg = renderScatterChart(window.document, {
      type: 'scatter',
      title: 'Height and weight',
      xLabel: 'Height',
      yLabel: 'Weight',
      unit: 'kg',
      data: [
        { label: 'A', x: 160, y: 52 },
        { label: 'B', x: 170, y: 65 }
      ]
    }, { labelledBy: 'chart-title' });

    assert.equal(svg.tagName.toLowerCase(), 'svg');
    assert.equal(svg.getAttribute('aria-labelledby'), 'chart-title');
    assert.equal(svg.querySelectorAll('.ac-chart-grid-line').length, 4);
    assert.equal(svg.querySelectorAll('.ac-chart-scatter-point').length, 2);
    assert.match(svg.textContent, /Height/);
    assert.match(svg.querySelector('.ac-chart-scatter-point').getAttribute('aria-label'), /A: 160, 52 kg/);
  } finally {
    window.close();
  }
});
