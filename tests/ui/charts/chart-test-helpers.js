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

export const createChartFixtureAsync = async (chart) => {
  const fixture = createChartFixture(chart);
  await new Promise((resolve) => fixture.window.setTimeout(resolve, 0));
  const svg = fixture.article.querySelector('svg');
  if (svg) svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 640, height: 360 });
  return { ...fixture, svg };
};

export const dispatchChartPointer = (window, target, type, { x = 0, y = 0, pointerType = '' } = {}) => {
  const event = new window.Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clientX', { value: x });
  Object.defineProperty(event, 'clientY', { value: y });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  target.dispatchEvent(event);
};
