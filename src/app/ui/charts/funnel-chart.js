import {
  appendSvgElement, createChartSvg, formatChartNumber, getPrimaryColor
} from './chart-utils.js';

export function renderFunnelChart(document, chart, options = {}) {
  const svg = createChartSvg(document, { className: 'ac-chart-svg-funnel', labelledBy: options.labelledBy });
  const max = Math.max(...chart.data.map((row) => row.value), 1);
  const centerX = 320;
  const top = 24;
  const availableHeight = 308;
  const stageHeight = availableHeight / chart.data.length;
  const maxWidth = 520;
  const widthFor = (value) => Math.max(0.24, value / max) * maxWidth;
  const layer = appendSvgElement(svg, 'g', { class: 'ac-chart-series ac-chart-funnel-series' });

  chart.data.forEach((row, index) => {
    const y = top + index * stageHeight;
    const topWidth = widthFor(row.value);
    const bottomWidth = widthFor(chart.data[index + 1]?.value ?? row.value * 0.82);
    const points = [
      `${centerX - topWidth / 2},${y + 2}`,
      `${centerX + topWidth / 2},${y + 2}`,
      `${centerX + bottomWidth / 2},${y + stageHeight - 2}`,
      `${centerX - bottomWidth / 2},${y + stageHeight - 2}`
    ].join(' ');
    appendSvgElement(layer, 'polygon', {
      class: 'ac-chart-funnel-stage', points, fill: getPrimaryColor(chart),
      'fill-opacity': Math.max(0.34, 0.84 - index * 0.09), tabindex: 0,
      'data-chart-interactive': 'true', 'data-chart-index': index,
      'aria-label': `${row.label}: ${formatChartNumber(row.value)}${chart.unit ? ` ${chart.unit}` : ''}`
    });
    if (Math.min(topWidth, bottomWidth) >= 118 && stageHeight >= 36) appendSvgElement(layer, 'text', {
      class: 'ac-chart-funnel-label', x: centerX, y: y + stageHeight / 2 + 4,
      'text-anchor': 'middle'
    }, `${row.label}  ${formatChartNumber(row.value)}`);
  });
  return svg;
}
