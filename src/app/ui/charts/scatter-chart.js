import {
  createAxisTitles,
  createChartSvg,
  createGrid,
  createInteractionOverlay,
  createXAxisLabels,
  formatChartNumber,
  getNumberRange,
  getPlotBox,
  niceTicks,
  scaleLinear,
  appendSvgElement
} from './chart-utils.js';

export function renderScatterChart(document, chart, options = {}) {
  const svg = createChartSvg(document, {
    className: 'ac-chart-svg-scatter',
    labelledBy: options.labelledBy
  });
  const plotBox = getPlotBox();
  const xRange = getNumberRange(chart.data.map((row) => row.x));
  const yRange = getNumberRange(chart.data.map((row) => row.y));
  const xScale = (value) => scaleLinear(value, [xRange.min, xRange.max], [plotBox.x, plotBox.right]);
  const yScale = (value) => scaleLinear(value, [yRange.min, yRange.max], [plotBox.bottom, plotBox.y]);
  const yTicks = niceTicks(yRange.min, yRange.max, 4);
  const xTicks = niceTicks(xRange.min, xRange.max, Math.min(5, chart.data.length || 5));

  createGrid(svg, { yTicks, yScale, plotBox });
  createXAxisLabels(svg, xTicks.map(formatChartNumber), { plotBox, maxLabels: 5 });
  createAxisTitles(svg, chart, { plotBox });
  createInteractionOverlay(svg, { plotBox, className: 'ac-chart-scatter-hit-area' });

  const layer = appendSvgElement(svg, 'g', { class: 'ac-chart-series ac-chart-scatter-series' });
  chart.data.forEach((row, index) => {
    const point = appendSvgElement(layer, 'circle', {
      class: 'ac-chart-point ac-chart-scatter-point',
      cx: xScale(row.x),
      cy: yScale(row.y),
      r: 6.5,
      tabindex: 0,
      'data-chart-interactive': 'true',
      'aria-label': `${row.label}: ${formatChartNumber(row.x)}, ${formatChartNumber(row.y)}${chart.unit ? ` ${chart.unit}` : ''}`,
      'data-chart-index': index,
      'data-chart-label': row.label,
      'data-chart-x': row.x,
      'data-chart-y': row.y
    });
    point.appendChild(document.createElementNS(point.namespaceURI, 'title')).textContent =
      `${row.label}: ${formatChartNumber(row.x)}, ${formatChartNumber(row.y)}${chart.unit ? ` ${chart.unit}` : ''}`;
  });

  return svg;
}
