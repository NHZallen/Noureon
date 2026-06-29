import {
  appendSvgElement, createAxisTitles, createChartSvg, formatChartNumber, getPlotBox,
  scaleLinear
} from './chart-utils.js';

export function renderHeatmapChart(document, chart, options = {}) {
  const svg = createChartSvg(document, { className: 'ac-chart-svg-heatmap', labelledBy: options.labelledBy });
  const plotBox = { ...getPlotBox(), x: 112, width: 500, right: 612 };
  const xValues = [...new Set(chart.data.map((row) => row.x))];
  const yValues = [...new Set(chart.data.map((row) => row.y))];
  const values = chart.data.map((row) => row.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const gap = Math.min(6, Math.max(2, 18 / Math.max(xValues.length, yValues.length)));
  const cellWidth = plotBox.width / xValues.length;
  const cellHeight = plotBox.height / yValues.length;
  const series = appendSvgElement(svg, 'g', { class: 'ac-chart-series ac-chart-heatmap-series' });

  chart.data.forEach((row, index) => {
    const xIndex = xValues.indexOf(row.x);
    const yIndex = yValues.indexOf(row.y);
    const opacity = min === max ? 0.58 : scaleLinear(row.value, [min, max], [0.16, 0.82]);
    appendSvgElement(series, 'rect', {
      class: 'ac-chart-heatmap-cell',
      x: plotBox.x + xIndex * cellWidth + gap / 2,
      y: plotBox.y + yIndex * cellHeight + gap / 2,
      width: Math.max(1, cellWidth - gap),
      height: Math.max(1, cellHeight - gap),
      rx: Math.min(6, cellWidth / 8, cellHeight / 8),
      fill: 'var(--button-primary-bg, #60A5FA)',
      'fill-opacity': opacity,
      tabindex: 0,
      'data-chart-interactive': 'true',
      'data-chart-index': index,
      'data-chart-x-index': xIndex,
      'data-chart-y-index': yIndex,
      'aria-label': `${row.y}, ${row.x}: ${formatChartNumber(row.value)}${chart.unit ? ` ${chart.unit}` : ''}`
    });
  });

  xValues.forEach((label, index) => appendSvgElement(svg, 'text', {
    class: 'ac-chart-axis-label ac-chart-heatmap-x-label',
    x: plotBox.x + (index + 0.5) * cellWidth,
    y: plotBox.bottom + 24,
    'text-anchor': 'middle'
  }, label));
  yValues.forEach((label, index) => appendSvgElement(svg, 'text', {
    class: 'ac-chart-axis-label ac-chart-heatmap-y-label',
    x: plotBox.x - 12,
    y: plotBox.y + (index + 0.5) * cellHeight + 4,
    'text-anchor': 'end'
  }, label));
  createAxisTitles(svg, chart, { plotBox });
  return svg;
}
