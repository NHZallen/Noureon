import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';

import {
  SUPPORTED_RENDERED_CHART_TYPES,
  mountChartPlaceholders,
  mountChartPlaceholder
} from '../../../src/app/ui/charts/chart-renderer.js';
import { createChartPlaceholderElement } from '../../../src/app/ui/charts/chart-markdown-placeholders.js';

const createDocument = () => {
  const window = new Window({ url: 'https://example.test/' });
  const document = window.document;
  return { document, window };
};

test('mounts a valid placeholder into a static SVG chart', () => {
  const { document, window } = createDocument();

  try {
    const placeholder = createChartPlaceholderElement({
      document,
      chart: {
        type: 'bar',
        title: 'Sales',
        data: [{ label: 'A', value: 120 }]
      },
      chartLabel: 'Chart'
    });
    document.body.appendChild(placeholder);

    assert.equal(mountChartPlaceholder(placeholder, { chartLabel: 'Chart' }), true);
    assert.equal(document.querySelector('.ac-chart-placeholder'), null);
    assert.ok(document.querySelector('.ac-chart.ac-chart-bar'));
    assert.ok(document.querySelector('svg.ac-chart-svg-bar'));
    assert.equal(document.querySelector('.ac-chart-title').textContent, 'Sales');
    assert.equal(document.querySelector('.ac-chart').dataset.chartInteractions, 'true');
    assert.ok(document.querySelector('.ac-chart-tooltip'));
  } finally {
    window.close();
  }
});

test('mountChartPlaceholders reports mounted and skipped placeholders', () => {
  const { document, window } = createDocument();

  try {
    document.body.appendChild(createChartPlaceholderElement({
      document,
      chart: {
        type: 'scatter',
        title: 'Points',
        data: [{ label: 'A', x: 1, y: 2 }]
      }
    }));
    const broken = document.createElement('div');
    broken.className = 'ac-chart-placeholder';
    broken.dataset.chartPayload = '%7Bbad';
    document.body.appendChild(broken);

    assert.deepEqual(mountChartPlaceholders({ root: document.body, chartLabel: 'Chart' }), {
      mounted: 1,
      skipped: 1
    });
    assert.ok(document.querySelector('.ac-chart-scatter'));
    assert.ok(document.querySelector('.ac-chart-placeholder'));
  } finally {
    window.close();
  }
});

test('renderer exposes the four supported chart types', () => {
  assert.deepEqual(SUPPORTED_RENDERED_CHART_TYPES, ['scatter', 'bar', 'line', 'donut']);
});
