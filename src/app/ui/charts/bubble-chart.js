import {
  appendSvgElement, createAxisTitles, createChartSvg, createGrid, createInteractionOverlay,
  createXAxisLabels, formatChartNumber, getNumberRange, getPlotBox, niceTicks, scaleLinear
} from './chart-utils.js';

export function renderBubbleChart(document, chart, options = {}) {
  const svg = createChartSvg(document, { className: 'ac-chart-svg-bubble', labelledBy: options.labelledBy });
  const plotBox = getPlotBox();
  const xRange = getNumberRange(chart.data.map((row) => row.x));
  const yRange = getNumberRange(chart.data.map((row) => row.y));
  const sizeRange = getNumberRange(chart.data.map((row) => row.size), { includeZero: true });
  const xScale = (value) => scaleLinear(value, [xRange.min, xRange.max], [plotBox.x + 18, plotBox.right - 18]);
  const yScale = (value) => scaleLinear(value, [yRange.min, yRange.max], [plotBox.bottom - 18, plotBox.y + 18]);
  const radiusScale = (value) => scaleLinear(Math.sqrt(Math.max(0, value)), [Math.sqrt(Math.max(0, sizeRange.min)), Math.sqrt(sizeRange.max)], [7, 25]);
  const yTicks = niceTicks(yRange.min, yRange.max, 4);
  const xTicks = niceTicks(xRange.min, xRange.max, Math.min(5, chart.data.length || 5));
  createGrid(svg, { yTicks, yScale, plotBox });
  createXAxisLabels(svg, xTicks.map(formatChartNumber), { plotBox, maxLabels: 5 });
  createAxisTitles(svg, chart, { plotBox });
  createInteractionOverlay(svg, { plotBox, className: 'ac-chart-bubble-hit-area' });
  const layer = appendSvgElement(svg, 'g', { class: 'ac-chart-series ac-chart-bubble-series' });
  chart.data.forEach((row, index) => {
    const r = radiusScale(row.size);
    appendSvgElement(layer, 'circle', {
      class: 'ac-chart-point ac-chart-bubble-point', cx: xScale(row.x), cy: yScale(row.y), r,
      tabindex: 0, 'data-chart-interactive': 'true', 'data-chart-index': index,
      'data-chart-size': row.size,
      'aria-label': `${row.label}: ${formatChartNumber(row.x)}, ${formatChartNumber(row.y)}, ${formatChartNumber(row.size)}`
    });
  });
  return svg;
}
