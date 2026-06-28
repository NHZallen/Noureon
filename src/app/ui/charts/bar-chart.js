import {
  createAxisTitles,
  createChartSvg,
  createGrid,
  createXAxisLabels,
  formatChartNumber,
  getNumberRange,
  getPlotBox,
  niceTicks,
  scaleLinear,
  appendSvgElement
} from './chart-utils.js';

export function renderBarChart(document, chart, options = {}) {
  const svg = createChartSvg(document, {
    className: 'ac-chart-svg-bar',
    labelledBy: options.labelledBy
  });
  const plotBox = getPlotBox();
  const values = chart.data.map((row) => row.value);
  const yRange = getNumberRange(values, { includeZero: true });
  const yScale = (value) => scaleLinear(value, [yRange.min, yRange.max], [plotBox.bottom, plotBox.y]);
  const yTicks = niceTicks(yRange.min, yRange.max, 4);
  const slotWidth = plotBox.width / chart.data.length;
  const barWidth = Math.min(112, slotWidth * 0.62);

  createGrid(svg, { yTicks, yScale, plotBox });
  createXAxisLabels(svg, chart.data.map((row) => row.label), { plotBox, maxLabels: 8 });
  createAxisTitles(svg, chart, { plotBox });

  const layer = appendSvgElement(svg, 'g', { class: 'ac-chart-series ac-chart-bar-series' });
  chart.data.forEach((row, index) => {
    const x = plotBox.x + slotWidth * index + (slotWidth - barWidth) / 2;
    const y = yScale(Math.max(row.value, 0));
    const baseY = yScale(0);
    const height = Math.max(2, baseY - y);
    appendSvgElement(layer, 'rect', {
      class: 'ac-chart-bar',
      x,
      y,
      width: barWidth,
      height,
      rx: 12,
      ry: 12,
      tabindex: 0,
      'aria-label': `${row.label}: ${formatChartNumber(row.value)}${chart.unit ? ` ${chart.unit}` : ''}`,
      'data-chart-index': index
    });
    appendSvgElement(layer, 'text', {
      class: 'ac-chart-value-label ac-chart-bar-value',
      x: x + barWidth / 2,
      y: Math.max(plotBox.y + 12, y - 14),
      'text-anchor': 'middle'
    }, formatChartNumber(row.value));
  });

  return svg;
}
