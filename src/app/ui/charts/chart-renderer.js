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

export function mountChartPlaceholder(placeholder, options = {}) {
  const document = placeholder?.ownerDocument;
  const chart = decodeChartPayload(placeholder?.dataset?.chartPayload);
  const renderer = chart?.type ? RENDERERS[chart.type] : null;
  if (!document || !renderer) return false;

  placeholder.replaceWith(createChartArticle(document, chart, options));
  return true;
}

export function mountChartPlaceholders({ root, chartLabel = 'Chart' } = {}) {
  if (!root?.querySelectorAll) return { mounted: 0, skipped: 0 };
  let mounted = 0;
  let skipped = 0;
  [...root.querySelectorAll('.ac-chart-placeholder')].forEach((placeholder) => {
    if (mountChartPlaceholder(placeholder, { chartLabel })) mounted += 1;
    else skipped += 1;
  });
  return { mounted, skipped };
}

export const SUPPORTED_RENDERED_CHART_TYPES = Object.freeze(Object.keys(RENDERERS));
