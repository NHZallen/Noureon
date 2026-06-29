import {
  appendSvgElement,
  createAxisTitles,
  createChartSvg,
  createGrid,
  createInteractionOverlay,
  createSmoothPathData,
  createXAxisLabels,
  formatChartNumber,
  getLineValue,
  getNumberRange,
  getPlotBox,
  niceTicks,
  scaleLinear
} from './chart-utils.js';

let areaChartId = 0;

export function renderAreaChart(document, chart, options = {}) {
  const svg = createChartSvg(document, { className: 'ac-chart-svg-area', labelledBy: options.labelledBy });
  const plotBox = getPlotBox();
  const rows = chart.data.map(getLineValue);
  const xRange = getNumberRange(rows.map((row) => row.x));
  const yRange = getNumberRange(rows.map((row) => row.y), { includeZero: true });
  const xScale = (value) => rows.length > 1
    ? scaleLinear(value, [xRange.min, xRange.max], [plotBox.x, plotBox.right])
    : plotBox.x + plotBox.width / 2;
  const yScale = (value) => scaleLinear(value, [yRange.min, yRange.max], [plotBox.bottom, plotBox.y]);
  const points = rows.map((row, index) => ({ x: xScale(row.x), y: yScale(row.y), label: row.label, value: row.y, index }));
  const linePath = createSmoothPathData(points, plotBox);
  const areaPath = points.length
    ? `${linePath} L ${points.at(-1).x} ${plotBox.bottom} L ${points[0].x} ${plotBox.bottom} Z`
    : '';

  createGrid(svg, { yTicks: niceTicks(yRange.min, yRange.max, 4), yScale, plotBox });
  createXAxisLabels(svg, rows.map((row) => row.label), { plotBox, maxLabels: 6 });
  createAxisTitles(svg, chart, { plotBox });
  createInteractionOverlay(svg, { plotBox, className: 'ac-chart-area-hit-area' });

  areaChartId += 1;
  const pastId = `ac-chart-area-past-${areaChartId}`;
  const futureId = `ac-chart-area-future-${areaChartId}`;
  const defs = appendSvgElement(svg, 'defs');
  const past = appendSvgElement(defs, 'clipPath', { id: pastId });
  const future = appendSvgElement(defs, 'clipPath', { id: futureId });
  appendSvgElement(past, 'rect', { class: 'ac-chart-area-past-clip', x: plotBox.x, y: plotBox.y, width: plotBox.width, height: plotBox.height });
  appendSvgElement(future, 'rect', { class: 'ac-chart-area-future-clip', x: plotBox.right, y: plotBox.y, width: 0, height: plotBox.height });

  const layer = appendSvgElement(svg, 'g', { class: 'ac-chart-series ac-chart-area-series' });
  appendSvgElement(layer, 'path', { class: 'ac-chart-area-fill ac-chart-area-past', d: areaPath, 'clip-path': `url(#${pastId})` });
  appendSvgElement(layer, 'path', { class: 'ac-chart-area-fill ac-chart-area-future is-faded', d: areaPath, 'clip-path': `url(#${futureId})` });
  appendSvgElement(layer, 'path', { class: 'ac-chart-line ac-chart-area-line ac-chart-area-past', d: linePath, fill: 'none', 'clip-path': `url(#${pastId})` });
  appendSvgElement(layer, 'path', { class: 'ac-chart-line ac-chart-area-line ac-chart-area-future is-faded', d: linePath, fill: 'none', 'clip-path': `url(#${futureId})` });
  points.forEach((point) => appendSvgElement(layer, 'circle', {
    class: 'ac-chart-point ac-chart-area-point', cx: point.x, cy: point.y, r: 4.6, tabindex: 0,
    'data-chart-interactive': 'true', 'data-chart-index': point.index,
    'aria-label': `${point.label}: ${formatChartNumber(point.value)}${chart.unit ? ` ${chart.unit}` : ''}`
  }));
  return svg;
}
