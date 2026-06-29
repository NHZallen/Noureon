import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';

import {
  SUPPORTED_RENDERED_CHART_TYPES,
  observeMessageCharts,
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

    assert.equal(mountChartPlaceholder(placeholder, {
      chartLabel: 'Chart',
      messageRole: 'assistant'
    }), true);
    assert.equal(document.querySelector('.ac-chart-placeholder'), null);
    assert.ok(document.querySelector('.ac-chart.ac-chart-bar'));
    assert.ok(document.querySelector('svg.ac-chart-svg-bar'));
    assert.equal(document.querySelector('.ac-chart-title').textContent, 'Sales');
    assert.equal(document.querySelector('.ac-chart').dataset.chartInteractions, 'true');
    assert.ok(document.querySelector('.ac-chart').dataset.chartPayload);
    assert.ok(document.querySelector('.ac-chart-tooltip'));
  } finally {
    window.close();
  }
});

test('message observer rehydrates interactions lost through HTML serialization', async () => {
  const { document, window } = createDocument();
  const messageList = document.createElement('div');
  document.body.appendChild(messageList);
  const observer = observeMessageCharts({ root: messageList, chartLabel: 'Chart' });

  try {
    const source = createChartPlaceholderElement({
      document,
      chart: {
        type: 'line',
        title: 'Trend',
        data: [
          { label: 'Jan', value: 10 },
          { label: 'Feb', value: 20 }
        ]
      }
    });
    document.body.appendChild(source);
    mountChartPlaceholder(source, { messageRole: 'assistant' });
    const serialized = document.querySelector('figure.ac-chart-line').outerHTML;
    document.querySelector('figure.ac-chart-line').remove();

    const message = document.createElement('div');
    message.className = 'model-message';
    message.innerHTML = serialized;
    messageList.appendChild(message);
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    const article = message.querySelector('figure.ac-chart-line');
    const svg = article.querySelector('svg');
    article.getBoundingClientRect = () => ({ left: 0, top: 0, width: 640, height: 420 });
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 640, height: 360 });
    const overlay = article.querySelector('.ac-chart-line-hit-area');
    const point = article.querySelector('.ac-chart-line-point[data-chart-index="1"]');
    const event = new window.Event('pointermove', { bubbles: true });
    Object.defineProperty(event, 'clientX', { value: Number(point.getAttribute('cx')) });
    Object.defineProperty(event, 'clientY', { value: Number(point.getAttribute('cy')) });
    overlay.dispatchEvent(event);

    assert.equal(article.dataset.chartActiveIndex, '1');
    assert.equal(article.querySelector('.ac-chart-guide-x').classList.contains('is-hidden'), false);
  } finally {
    observer?.disconnect();
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

    assert.deepEqual(mountChartPlaceholders({
      root: document.body,
      chartLabel: 'Chart',
      messageRole: 'assistant'
    }), {
      mounted: 1,
      skipped: 1
    });
    assert.ok(document.querySelector('.ac-chart-scatter'));
    assert.ok(document.querySelector('.ac-chart-placeholder'));
  } finally {
    window.close();
  }
});

test('renderer refuses to mount a chart for a user message', () => {
  const { document, window } = createDocument();

  try {
    const placeholder = createChartPlaceholderElement({
      document,
      chart: {
        type: 'bar',
        data: [{ label: 'A', value: 120 }]
      }
    });
    const userMessage = document.createElement('div');
    userMessage.className = 'user-message';
    userMessage.appendChild(placeholder);
    document.body.appendChild(userMessage);

    assert.equal(mountChartPlaceholder(placeholder, { messageRole: 'assistant' }), false);
    assert.ok(document.querySelector('.ac-chart-placeholder'));
    assert.equal(document.querySelector('.ac-chart'), null);
  } finally {
    window.close();
  }
});

test('renderer exposes the four supported chart types', () => {
  assert.deepEqual(SUPPORTED_RENDERED_CHART_TYPES, ['scatter', 'bar', 'line', 'donut']);
});
