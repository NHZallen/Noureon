import { parseAndNormalizeChartSchema } from './chart-schema.js';
import { parseAndNormalizeEChartsOption } from './echarts-option-adapter.js';

const CHART_CODE_CLASS_PATTERN = /(?:^|\s)language-(chart|json|javascript|js)(?:\s|$)/;

const getCodeBlockLanguage = (codeElement) => {
  const className = codeElement?.getAttribute?.('class') || '';
  const match = CHART_CODE_CLASS_PATTERN.exec(className);
  return match?.[1] || '';
};

const encodeChartPayload = (chart) => encodeURIComponent(JSON.stringify(chart));
const toSafeAccessibleText = (value) => String(value || '')
  .replace(/[<>"']/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export function createChartPlaceholderElement({
  document,
  chart,
  chartLabel = 'Chart'
}) {
  const placeholder = document.createElement('div');
  const label = document.createElement('span');
  const title = chart.title || chart.type;

  placeholder.className = 'ac-chart-placeholder';
  placeholder.setAttribute('role', 'group');
  placeholder.setAttribute('aria-label', `${chartLabel}: ${toSafeAccessibleText(title)}`);
  placeholder.dataset.chartType = chart.type;
  placeholder.dataset.chartPayload = encodeChartPayload(chart);
  label.className = 'ac-chart-placeholder-label';
  label.textContent = `${chartLabel}: ${title}`;
  placeholder.appendChild(label);

  return placeholder;
}

export function applyChartMarkdownPlaceholders({
  document,
  root,
  chartLabel = 'Chart',
  messageRole,
  normalizeChart = parseAndNormalizeChartSchema
} = {}) {
  if (!document || !root?.querySelectorAll) return { converted: 0, skipped: 0 };
  if (messageRole !== 'assistant') return { converted: 0, skipped: 0 };

  let converted = 0;
  let skipped = 0;
  const codeBlocks = [...root.querySelectorAll('pre > code')];

  codeBlocks.forEach((codeElement) => {
    if (codeElement.closest?.('.user-message')) return;
    const language = getCodeBlockLanguage(codeElement);
    if (!['chart', 'json', 'javascript', 'js'].includes(language)) return;

    const source = codeElement.textContent || '';
    const result = (language === 'javascript' || language === 'js')
      ? parseAndNormalizeEChartsOption(source)
      : (() => {
        const normalized = normalizeChart(source);
        return normalized.ok ? normalized : parseAndNormalizeEChartsOption(source);
      })();
    if (!result.ok) {
      skipped += 1;
      return;
    }

    const preElement = codeElement.parentElement;
    if (!preElement) {
      skipped += 1;
      return;
    }

    preElement.replaceWith(createChartPlaceholderElement({
      document,
      chart: result.chart,
      chartLabel
    }));
    converted += 1;
  });

  return { converted, skipped };
}
