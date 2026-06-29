import {
  appendSvgElement, createChartSvg, createGrid, createXAxisLabels, formatChartNumber,
  getNumberRange, getPlotBox, niceTicks, scaleLinear
} from './chart-utils.js';

export function calculateWaterfall(chart) {
  let cumulative = 0;
  return chart.data.map((row) => {
    let start;
    let end;
    if (row.kind === 'start') {
      start = 0;
      end = row.value;
    } else if (row.kind === 'end') {
      start = 0;
      end = row.value;
    } else {
      start = cumulative;
      end = cumulative + row.value;
    }
    cumulative = end;
    return { ...row, start, end, cumulative };
  });
}

export function renderWaterfallChart(document, chart, options = {}) {
  const svg = createChartSvg(document, { className: 'ac-chart-svg-waterfall', labelledBy: options.labelledBy });
  const plotBox = getPlotBox();
  const values = calculateWaterfall(chart);
  const range = getNumberRange(values.flatMap((row) => [row.start, row.end]), { includeZero: true });
  const padding = (range.max - range.min || 1) * 0.12;
  const domain = [range.min - padding, range.max + padding];
  const yScale = (value) => scaleLinear(value, domain, [plotBox.bottom, plotBox.y]);
  const slotWidth = plotBox.width / values.length;
  const barWidth = Math.min(82, slotWidth * 0.58);
  createGrid(svg, { yTicks: niceTicks(domain[0], domain[1], 5), yScale, plotBox });
  createXAxisLabels(svg, values.map((row) => row.label), { plotBox, maxLabels: 7 });
  const connectors = appendSvgElement(svg, 'g', { class: 'ac-chart-waterfall-connectors' });
  const layer = appendSvgElement(svg, 'g', { class: 'ac-chart-series ac-chart-waterfall-series' });

  values.forEach((row, index) => {
    const x = plotBox.x + index * slotWidth + (slotWidth - barWidth) / 2;
    const top = yScale(Math.max(row.start, row.end));
    const bottom = yScale(Math.min(row.start, row.end));
    const total = row.kind === 'start' || row.kind === 'end';
    const semantic = total ? 'is-total' : row.value >= 0 ? 'is-positive' : 'is-negative';
    appendSvgElement(layer, 'rect', {
      class: `ac-chart-waterfall-bar ${semantic}`,
      x, y: top, width: barWidth, height: Math.max(2, bottom - top), rx: 5,
      tabindex: 0, 'data-chart-interactive': 'true', 'data-chart-index': index,
      'data-chart-start': row.start, 'data-chart-end': row.end,
      'data-chart-cumulative': row.cumulative,
      'aria-label': `${row.label}: ${formatChartNumber(row.value)}${chart.unit ? ` ${chart.unit}` : ''}`
    });
    const labelY = Math.min(plotBox.bottom - 6, Math.max(plotBox.y + 13, top - 7));
    appendSvgElement(layer, 'text', {
      class: 'ac-chart-value-label ac-chart-waterfall-value',
      x: x + barWidth / 2, y: labelY, 'text-anchor': 'middle',
      'data-chart-within-bounds': 'true'
    }, `${row.value > 0 && !total ? '+' : ''}${formatChartNumber(row.value)}`);
    if (index < values.length - 1) {
      const nextX = plotBox.x + (index + 1) * slotWidth + (slotWidth - barWidth) / 2;
      appendSvgElement(connectors, 'line', {
        class: 'ac-chart-waterfall-connector',
        x1: x + barWidth, x2: nextX, y1: yScale(row.end), y2: yScale(row.end)
      });
    }
  });
  return svg;
}
