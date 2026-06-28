import {
  createAxisTitles,
  createChartSvg,
  createGrid,
  createXAxisLabels,
  formatChartNumber,
  getLineValue,
  getNumberRange,
  getPlotBox,
  niceTicks,
  scaleLinear,
  appendSvgElement
} from './chart-utils.js';

const createPathData = (points) => points
  .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
  .join(' ');

export function renderLineChart(document, chart, options = {}) {
  const svg = createChartSvg(document, {
    className: 'ac-chart-svg-line',
    labelledBy: options.labelledBy
  });
  const plotBox = getPlotBox();
  const rows = chart.data.map(getLineValue);
  const xRange = getNumberRange(rows.map((row) => row.x));
  const yRange = getNumberRange(rows.map((row) => row.y));
  const xScale = (value) => rows.length > 1
    ? scaleLinear(value, [xRange.min, xRange.max], [plotBox.x, plotBox.right])
    : plotBox.x + plotBox.width / 2;
  const yScale = (value) => scaleLinear(value, [yRange.min, yRange.max], [plotBox.bottom, plotBox.y]);
  const points = rows.map((row, index) => ({
    x: xScale(row.x),
    y: yScale(row.y),
    label: row.label,
    value: row.y,
    index
  }));

  createGrid(svg, { yTicks: niceTicks(yRange.min, yRange.max, 4), yScale, plotBox });
  createXAxisLabels(svg, rows.map((row) => row.label), { plotBox, maxLabels: 6 });
  createAxisTitles(svg, chart, { plotBox });

  const layer = appendSvgElement(svg, 'g', { class: 'ac-chart-series ac-chart-line-series' });
  appendSvgElement(layer, 'path', {
    class: 'ac-chart-line ac-chart-line-past',
    d: createPathData(points),
    fill: 'none'
  });
  appendSvgElement(layer, 'path', {
    class: 'ac-chart-line ac-chart-line-future is-faded',
    d: createPathData(points),
    fill: 'none'
  });
  points.forEach((point) => {
    appendSvgElement(layer, 'circle', {
      class: 'ac-chart-point ac-chart-line-point',
      cx: point.x,
      cy: point.y,
      r: 5,
      tabindex: 0,
      'aria-label': `${point.label}: ${formatChartNumber(point.value)}${chart.unit ? ` ${chart.unit}` : ''}`,
      'data-chart-index': point.index,
      'data-chart-label': point.label,
      'data-chart-value': point.value,
      'data-chart-x': rows[point.index]?.x ?? point.index
    });
  });

  return svg;
}
