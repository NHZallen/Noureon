import { renderBarChart } from './bar-chart.js';
import { renderDonutChart } from './donut-chart.js';
import { renderLineChart } from './line-chart.js';
import { renderScatterChart } from './scatter-chart.js';
import { renderStackedBarChart } from './stacked-bar-chart.js';
import { renderAreaChart } from './area-chart.js';
import { renderBubbleChart } from './bubble-chart.js';
import { renderHistogramChart } from './histogram-chart.js';
import { renderKpiCard } from './kpi-card.js';
import { renderGaugeChart } from './gauge-chart.js';
import { renderHeatmapChart } from './heatmap-chart.js';
import { renderTreemapChart } from './treemap-chart.js';
import { renderRadarChart } from './radar-chart.js';
import { renderFunnelChart } from './funnel-chart.js';
import { renderWaterfallChart } from './waterfall-chart.js';
import { attachChartInteractions } from './chart-interactions.js';
import { getPrimaryColor } from './chart-utils.js';
import { getRuntimeText } from '../../runtime/i18n/runtime-texts.js';

const COMPLEX_RENDERER_LOADERS = Object.freeze({
  sankey: () => import('./sankey-chart.js').then((module) => module.renderSankeyChart),
  boxplot: () => import('./boxplot-chart.js').then((module) => module.renderBoxplotChart),
  gantt: () => import('./gantt-chart.js').then((module) => module.renderGanttChart)
});

function renderDeferredComplexChart(document, chart, options = {}) {
  const placeholder = options.placeholder || document.createElement('div');
  if (!options.placeholder) {
    placeholder.className = 'ac-chart-deferred';
    placeholder.dataset.chartDeferred = 'true';
    placeholder.setAttribute('aria-hidden', 'true');
  }
  if (placeholder.acChartLoading) return placeholder;
  placeholder.acChartLoading = true;
  Promise.resolve().then(async () => {
    try {
      const renderer = await COMPLEX_RENDERER_LOADERS[chart.type]?.();
      const article = placeholder.closest?.('.ac-chart');
      if (!renderer || !article || !placeholder.isConnected) return;
      placeholder.replaceWith(renderer(document, chart, options));
      attachChartInteractions(article, chart);
      article.dataset.chartDeferred = 'false';
    } catch {
      if (!placeholder.isConnected) return;
      placeholder.removeAttribute('aria-hidden');
      placeholder.textContent = getRuntimeText(options.uiLanguage, 'unableToRenderChart');
    }
  });
  return placeholder;
}

const RENDERERS = Object.freeze({
  scatter: renderScatterChart,
  bar: renderBarChart,
  line: renderLineChart,
  donut: renderDonutChart,
  stackedBar: renderStackedBarChart,
  area: renderAreaChart,
  bubble: renderBubbleChart,
  histogram: renderHistogramChart,
  kpi: renderKpiCard,
  gauge: renderGaugeChart,
  heatmap: renderHeatmapChart,
  treemap: renderTreemapChart,
  radar: renderRadarChart,
  funnel: renderFunnelChart,
  waterfall: renderWaterfallChart,
  sankey: renderDeferredComplexChart,
  boxplot: renderDeferredComplexChart,
  gantt: renderDeferredComplexChart
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
  const renderedChart = renderer(document, chart, { labelledBy: titleId });
  body.appendChild(renderedChart);
  article.append(caption, body);
  if (renderedChart.dataset?.chartDeferred === 'true') {
    article.dataset.chartDeferred = 'true';
  } else {
    attachChartInteractions(article, chart);
  }
  return article;
}

export function hydrateChartArticle(article) {
  const chart = decodeChartPayload(article?.dataset?.chartPayload);
  const isUserMessage = Boolean(article?.closest?.('.user-message'));
  if (!chart?.type || isUserMessage) return false;
  const placeholder = article.querySelector?.('.ac-chart-deferred');
  if (placeholder) {
    renderDeferredComplexChart(placeholder.ownerDocument, chart, {
      labelledBy: article.querySelector?.('.ac-chart-title')?.id,
      placeholder
    });
    return true;
  }
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
