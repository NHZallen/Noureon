import {
  DEFAULT_DONUT_PALETTE, appendSvgElement, createAxisTitles, createChartSvg, createGrid,
  createInteractionOverlay, createXAxisLabels, formatChartNumber, getNumberRange, getPlotBox,
  niceTicks, scaleLinear
} from './chart-utils.js';

const getPalette = (chart) => chart.colors?.palette?.length ? chart.colors.palette : DEFAULT_DONUT_PALETTE;

export function renderStackedBarChart(document, chart, options = {}) {
  const container = document.createElement('div');
  const svg = createChartSvg(document, { className: 'ac-chart-svg-stacked-bar', labelledBy: options.labelledBy });
  const legend = document.createElement('div');
  const plotBox = getPlotBox();
  const totals = chart.data.map((row) => chart.series.reduce((sum, series) => sum + row[series.key], 0));
  const range = getNumberRange(totals, { includeZero: true });
  const yMax = range.max + (range.max - range.min || 1) * 0.12;
  const yScale = (value) => scaleLinear(value, [0, yMax], [plotBox.bottom, plotBox.y]);
  const slotWidth = plotBox.width / chart.data.length;
  const barWidth = Math.min(108, slotWidth * 0.62);
  const palette = getPalette(chart);
  container.className = 'ac-chart-stacked-layout';
  legend.className = 'ac-chart-legend ac-chart-stacked-legend';
  createGrid(svg, { yTicks: niceTicks(0, yMax, 4), yScale, plotBox });
  createXAxisLabels(svg, chart.data.map((row) => row.label), { plotBox, maxLabels: 8 });
  createAxisTitles(svg, chart, { plotBox });
  createInteractionOverlay(svg, { plotBox, className: 'ac-chart-stacked-bar-hit-area' });
  const layer = appendSvgElement(svg, 'g', { class: 'ac-chart-series ac-chart-stacked-bar-series' });

  chart.data.forEach((row, categoryIndex) => {
    const x = plotBox.x + slotWidth * categoryIndex + (slotWidth - barWidth) / 2;
    let cumulative = 0;
    chart.series.forEach((series, seriesIndex) => {
      const value = row[series.key];
      const startY = yScale(cumulative);
      cumulative += value;
      const endY = yScale(cumulative);
      const index = categoryIndex * chart.series.length + seriesIndex;
      appendSvgElement(layer, 'rect', {
        class: 'ac-chart-bar ac-chart-stacked-segment', x, y: endY, width: barWidth,
        height: Math.max(1.5, startY - endY), rx: seriesIndex === chart.series.length - 1 ? Math.min(8, barWidth / 2) : 0,
        fill: palette[seriesIndex % palette.length], tabindex: 0,
        'data-chart-interactive': 'true', 'data-chart-index': index,
        'data-chart-category-index': categoryIndex, 'data-chart-series-index': seriesIndex,
        'aria-label': `${row.label}, ${series.label}: ${formatChartNumber(value)}${chart.unit ? ` ${chart.unit}` : ''}`
      });
    });
  });

  chart.series.forEach((series, seriesIndex) => {
    const item = document.createElement('div');
    const swatch = document.createElement('span');
    const label = document.createElement('span');
    const total = chart.data.reduce((sum, row) => sum + row[series.key], 0);
    item.className = 'ac-chart-legend-item ac-chart-stacked-legend-item';
    item.dataset.chartIndex = String(seriesIndex);
    item.dataset.chartSeriesIndex = String(seriesIndex);
    item.dataset.chartInteractive = 'true';
    item.tabIndex = 0;
    item.setAttribute('role', 'button');
    item.setAttribute('aria-label', `${series.label}: ${formatChartNumber(total)}${chart.unit ? ` ${chart.unit}` : ''}`);
    swatch.className = 'ac-chart-legend-swatch';
    swatch.style.backgroundColor = palette[seriesIndex % palette.length];
    label.className = 'ac-chart-legend-label';
    label.textContent = series.label;
    item.append(swatch, label);
    legend.appendChild(item);
  });
  container.append(svg, legend);
  return container;
}
