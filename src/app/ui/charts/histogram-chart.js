import {
  appendSvgElement, createAxisTitles, createChartSvg, createGrid, createInteractionOverlay,
  createTopRoundedRectPath, createXAxisLabels, formatChartNumber, getNumberRange, getPlotBox,
  niceTicks, scaleLinear
} from './chart-utils.js';

export function renderHistogramChart(document, chart, options = {}) {
  const svg = createChartSvg(document, { className: 'ac-chart-svg-histogram', labelledBy: options.labelledBy });
  const plotBox = getPlotBox();
  const values = chart.data.map((row) => row.count);
  const valueRange = getNumberRange(values, { includeZero: true });
  const yMax = valueRange.max + (valueRange.max - valueRange.min || 1) * 0.15;
  const yScale = (value) => scaleLinear(value, [0, yMax], [plotBox.bottom, plotBox.y]);
  const slotWidth = plotBox.width / chart.data.length;
  const barWidth = Math.max(2, slotWidth - Math.min(8, slotWidth * 0.14));
  createGrid(svg, { yTicks: niceTicks(0, yMax, 4), yScale, plotBox });
  createXAxisLabels(svg, chart.data.map((row) => row.label), { plotBox, maxLabels: 7 });
  createAxisTitles(svg, chart, { plotBox });
  createInteractionOverlay(svg, { plotBox, className: 'ac-chart-histogram-hit-area' });
  const layer = appendSvgElement(svg, 'g', { class: 'ac-chart-series ac-chart-histogram-series' });
  chart.data.forEach((row, index) => {
    const x = plotBox.x + slotWidth * index + (slotWidth - barWidth) / 2;
    const y = yScale(row.count);
    const height = Math.max(2, plotBox.bottom - y);
    appendSvgElement(layer, 'path', {
      class: 'ac-chart-bar ac-chart-histogram-bar', d: createTopRoundedRectPath({ x, y, width: barWidth, height, radius: Math.min(6, barWidth / 2) }),
      tabindex: 0, 'data-chart-interactive': 'true', 'data-chart-index': index,
      'aria-label': `${row.label}: ${formatChartNumber(row.count)}${chart.unit ? ` ${chart.unit}` : ''}`
    });
    const labelY = Math.max(plotBox.y + 14, Math.min(plotBox.bottom - 8, y - 9));
    appendSvgElement(layer, 'text', {
      class: 'ac-chart-value-label ac-chart-histogram-value', x: Math.min(plotBox.right - 4, Math.max(plotBox.x + 4, x + barWidth / 2)),
      y: labelY, 'text-anchor': 'middle', 'data-chart-safe-min-y': plotBox.y, 'data-chart-safe-max-y': plotBox.bottom
    }, formatChartNumber(row.count));
  });
  return svg;
}
