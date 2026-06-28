import {
  DEFAULT_DONUT_PALETTE,
  DONUT_VIEWBOX,
  createSvgElement,
  describeArcSegment,
  formatChartNumber,
  getDonutPalette,
  appendSvgElement
} from './chart-utils.js';

const formatPercent = (value) => `${formatChartNumber(value)}%`;

export function renderDonutChart(document, chart, options = {}) {
  const container = document.createElement('div');
  const svg = createSvgElement(document, 'svg', {
    class: 'ac-chart-svg ac-chart-svg-donut',
    viewBox: `0 0 ${DONUT_VIEWBOX.width} ${DONUT_VIEWBOX.height}`,
    role: 'img',
    'aria-labelledby': options.labelledBy
  });
  const legend = document.createElement('div');
  const total = chart.data.reduce((sum, row) => sum + Math.max(0, row.value), 0) || 1;
  const palette = getDonutPalette(chart);
  let cursor = 0;

  container.className = 'ac-chart-donut-layout';
  legend.className = 'ac-chart-legend';

  chart.data.forEach((row, index) => {
    const value = Math.max(0, row.value);
    const percent = value / total * 100;
    const startAngle = cursor / total * 360;
    const endAngle = (cursor + value) / total * 360;
    const color = palette[index] || DEFAULT_DONUT_PALETTE[index % DEFAULT_DONUT_PALETTE.length];
    cursor += value;

    const segment = appendSvgElement(svg, 'path', {
      class: 'ac-chart-donut-segment',
      d: describeArcSegment({
        ...DONUT_VIEWBOX,
        startAngle,
        endAngle: endAngle === startAngle ? startAngle + 0.01 : endAngle
      }),
      fill: color,
      tabindex: 0,
      'aria-label': `${row.label}: ${formatPercent(percent)}`,
      'data-chart-index': index,
      'data-chart-label': row.label,
      'data-chart-value': row.value,
      'data-chart-percentage': percent
    });
    segment.appendChild(document.createElementNS(segment.namespaceURI, 'title')).textContent =
      `${row.label}: ${formatPercent(percent)}`;

    const item = document.createElement('div');
    const swatch = document.createElement('span');
    const text = document.createElement('span');
    const label = document.createElement('span');
    const valueText = document.createElement('strong');
    item.className = 'ac-chart-legend-item';
    item.dataset.chartIndex = String(index);
    item.dataset.chartLabel = row.label;
    item.dataset.chartValue = String(row.value);
    item.dataset.chartPercentage = String(percent);
    item.tabIndex = 0;
    item.setAttribute('role', 'button');
    item.setAttribute('aria-label', `${row.label}: ${formatPercent(percent)}`);
    swatch.className = 'ac-chart-legend-swatch';
    swatch.style.backgroundColor = color;
    text.className = 'ac-chart-legend-text';
    label.className = 'ac-chart-legend-label';
    valueText.className = 'ac-chart-legend-value';
    label.textContent = row.label;
    valueText.textContent = formatPercent(percent);
    text.append(label, valueText);
    item.append(swatch, text);
    legend.appendChild(item);
  });

  container.append(svg, legend);
  return container;
}
