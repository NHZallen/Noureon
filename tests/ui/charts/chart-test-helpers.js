import { Window } from 'happy-dom';

import { mountChartPlaceholder } from '../../../src/app/ui/charts/chart-renderer.js';
import { createChartPlaceholderElement } from '../../../src/app/ui/charts/chart-markdown-placeholders.js';

export const createChartFixture = (chart) => {
  const window = new Window({ url: 'https://example.test/' });
  const document = window.document;
  const placeholder = createChartPlaceholderElement({ document, chart, chartLabel: 'Chart' });
  document.body.appendChild(placeholder);
  mountChartPlaceholder(placeholder, {
    chartLabel: 'Chart',
    messageRole: 'assistant'
  });
  const article = document.querySelector('.ac-chart');
  article.getBoundingClientRect = () => ({ left: 0, top: 0, width: 640, height: 420 });
  const svg = article.querySelector('svg');
  if (svg) svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 640, height: 360 });
  return { window, document, article, svg };
};

export const waitForChartHydration = async (
  fixture,
  {
    selector = 'svg',
    timeoutMs = 750,
    intervalMs = 10
  } = {}
) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const node = fixture.article.querySelector(selector);
    if (node && fixture.article.dataset.chartDeferred !== 'true') {
      if (node.getBoundingClientRect) {
        node.getBoundingClientRect = () => ({ left: 0, top: 0, width: 640, height: 360 });
      }
      return node;
    }
    await new Promise((resolve) => fixture.window.setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for chart hydration: ${selector}`);
};

export const createChartFixtureAsync = async (chart, options = {}) => {
  const fixture = createChartFixture(chart);
  const svg = await waitForChartHydration(fixture, options);
  return { ...fixture, svg };
};

export const dispatchChartPointer = (window, target, type, { x = 0, y = 0, pointerType = '' } = {}) => {
  const event = new window.Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clientX', { value: x });
  Object.defineProperty(event, 'clientY', { value: y });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  target.dispatchEvent(event);
};
