import { renderBarChart } from './bar-chart.js';
import { renderDonutChart } from './donut-chart.js';
import { renderLineChart } from './line-chart.js';
import { renderScatterChart } from './scatter-chart.js';
import { attachChartInteractions } from './chart-interactions.js';
import { getPrimaryColor } from './chart-utils.js';

const RENDERERS = Object.freeze({
  scatter: renderScatterChart,
  bar: renderBarChart,
  line: renderLineChart,
  donut: renderDonutChart
});

const decodeChartPayload = (payload) => {
  try {
    return JSON.parse(decodeURIComponent(String(payload || '')));
  } catch {
    return null;
  }
};

const encodeChartPayload = (chart) => encodeURIComponent(JSON.stringify(chart));
const OBSERVED_ROOTS = new WeakMap();

const createSafeId = (() => {
  let id = 0;
  return () => {
    id += 1;
    return `ac-chart-title-${id}`;
  };
})();

function createChartArticle(document, chart, { chartLabel = 'Chart' } = {}) {
  const article = document.createElement('figure');
  const caption = document.createElement('figcaption');
  const title = document.createElement('div');
  const description = document.createElement('div');
  const body = document.createElement('div');
  const titleId = createSafeId();
  const renderer = RENDERERS[chart.type];

  article.className = `ac-chart ac-chart-${chart.type}`;
  article.dataset.chartType = chart.type;
  article.dataset.chartPayload = encodeChartPayload(chart);
  article.style.setProperty('--ac-chart-primary', getPrimaryColor(chart));
  caption.className = 'ac-chart-caption';
  title.className = 'ac-chart-title';
  title.id = titleId;
  title.textContent = chart.title || `${chartLabel}: ${chart.type}`;
  description.className = 'ac-chart-description';
  description.textContent = chart.description || '';
  body.className = 'ac-chart-body';

  if (chart.description) {
    caption.append(title, description);
  } else {
    caption.appendChild(title);
  }
  body.appendChild(renderer(document, chart, { labelledBy: titleId }));
  article.append(caption, body);
  attachChartInteractions(article, chart);
  return article;
}

export function hydrateChartArticle(article) {
  const chart = decodeChartPayload(article?.dataset?.chartPayload);
  const isUserMessage = Boolean(article?.closest?.('.user-message'));
  if (!chart?.type || isUserMessage) return false;
  return attachChartInteractions(article, chart);
}

const mountAndHydrateCharts = (root, chartLabel) => {
  if (!root?.querySelectorAll) return;
  const closestMessage = root.closest?.('.model-message');
  const scopes = closestMessage ? [closestMessage] : [...root.querySelectorAll('.model-message')];
  scopes.forEach((scope) => {
    mountChartPlaceholders({ root: scope, chartLabel, messageRole: 'assistant' });
    scope.querySelectorAll('.ac-chart[data-chart-payload]').forEach(hydrateChartArticle);
  });
};

export function observeMessageCharts({ root, chartLabel = 'Chart' } = {}) {
  if (!root?.querySelectorAll) return null;
  const existing = OBSERVED_ROOTS.get(root);
  if (existing) return existing;
  const Observer = root.ownerDocument?.defaultView?.MutationObserver || globalThis.MutationObserver;
  if (typeof Observer !== 'function') return null;

  const observer = new Observer((records) => {
    records.forEach((record) => {
      record.addedNodes.forEach((node) => {
        if (node.nodeType === 1) mountAndHydrateCharts(node, chartLabel);
      });
    });
  });
  observer.observe(root, { childList: true, subtree: true });
  OBSERVED_ROOTS.set(root, observer);
  mountAndHydrateCharts(root, chartLabel);
  return observer;
}

export function mountChartPlaceholder(placeholder, options = {}) {
  const document = placeholder?.ownerDocument;
  const chart = decodeChartPayload(placeholder?.dataset?.chartPayload);
  const renderer = chart?.type ? RENDERERS[chart.type] : null;
  const isUserMessage = Boolean(placeholder?.closest?.('.user-message'));
  if (!document || !renderer || isUserMessage || options.messageRole !== 'assistant') return false;

  placeholder.replaceWith(createChartArticle(document, chart, options));
  return true;
}

export function mountChartPlaceholders({ root, chartLabel = 'Chart', messageRole } = {}) {
  if (!root?.querySelectorAll) return { mounted: 0, skipped: 0 };
  let mounted = 0;
  let skipped = 0;
  [...root.querySelectorAll('.ac-chart-placeholder')].forEach((placeholder) => {
    if (mountChartPlaceholder(placeholder, { chartLabel, messageRole })) mounted += 1;
    else skipped += 1;
  });
  return { mounted, skipped };
}

export const SUPPORTED_RENDERED_CHART_TYPES = Object.freeze(Object.keys(RENDERERS));
