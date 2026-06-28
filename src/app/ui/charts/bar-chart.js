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

export function renderBarChart(document, chart, options = {}) {
  const svg = createChartSvg(document, {
    className: 'ac-chart-svg-bar',
    labelledBy: options.labelledBy
  });
  const plotBox = getPlotBox();
  const values = chart.data.map((row) => row.value);
  const valueRange = getNumberRange(values, { includeZero: true });
  const rangeSpan = valueRange.max - valueRange.min || 1;
  const yRange = {
    min: valueRange.min,
    max: valueRange.max + rangeSpan * 0.12
  };
  const yScale = (value) => scaleLinear(value, [yRange.min, yRange.max], [plotBox.bottom, plotBox.y]);
  const yTicks = niceTicks(yRange.min, yRange.max, 4);
  const slotWidth = plotBox.width / chart.data.length;
  const barWidth = Math.min(112, slotWidth * 0.62);

  createGrid(svg, { yTicks, yScale, plotBox });
  createXAxisLabels(svg, chart.data.map((row) => row.label), { plotBox, maxLabels: 8 });
  createAxisTitles(svg, chart, { plotBox });
  createInteractionOverlay(svg, { plotBox, className: 'ac-chart-bar-hit-area' });

  const layer = appendSvgElement(svg, 'g', { class: 'ac-chart-series ac-chart-bar-series' });
  chart.data.forEach((row, index) => {
    const x = plotBox.x + slotWidth * index + (slotWidth - barWidth) / 2;
    const y = yScale(Math.max(row.value, 0));
    const baseY = yScale(0);
    const height = Math.max(2, baseY - y);
    const radius = Math.min(12, barWidth / 2, height / 2);
    const valueText = formatChartNumber(row.value);
    const estimatedTextWidth = Math.max(8, valueText.length * 8);
    const maxTextWidth = Math.max(12, Math.min(slotWidth - 8, 72));
    const labelHalfWidth = Math.min(estimatedTextWidth, maxTextWidth) / 2;
    const labelX = Math.min(
      Math.max(x + barWidth / 2, plotBox.x + labelHalfWidth),
      plotBox.right - labelHalfWidth
    );
    const labelY = Math.min(plotBox.bottom - 8, Math.max(plotBox.y + 14, y - 10));
    appendSvgElement(layer, 'rect', {
      class: 'ac-chart-bar',
      x,
      y,
      width: barWidth,
      height,
      rx: radius,
      ry: radius,
      tabindex: 0,
      'data-chart-interactive': 'true',
      'aria-label': `${row.label}: ${formatChartNumber(row.value)}${chart.unit ? ` ${chart.unit}` : ''}`,
      'data-chart-index': index,
      'data-chart-label': row.label,
      'data-chart-value': row.value
    });
    const label = appendSvgElement(layer, 'text', {
      class: 'ac-chart-value-label ac-chart-bar-value',
      x: labelX,
      y: labelY,
      'text-anchor': 'middle',
      'data-chart-label-placement': 'outside',
      'data-chart-safe-min-x': plotBox.x,
      'data-chart-safe-max-x': plotBox.right,
      'data-chart-bar-top': y
    }, valueText);
    if (estimatedTextWidth > maxTextWidth) {
      label.setAttribute('textLength', String(maxTextWidth));
      label.setAttribute('lengthAdjust', 'spacingAndGlyphs');
    }
  });

  return svg;
}
