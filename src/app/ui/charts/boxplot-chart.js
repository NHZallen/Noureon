import {
  appendSvgElement, createAxisTitles, createChartSvg, createGrid, createXAxisLabels,
  formatChartNumber, getNumberRange, getPlotBox, niceTicks, scaleLinear
} from './chart-utils.js';

export function getBoxplotRange(chart) {
  return getNumberRange(chart.data.flatMap((row) => [
    row.min,
    row.max,
    ...(row.outliers || [])
  ]));
}

export function renderBoxplotChart(document, chart, options = {}) {
  const svg = createChartSvg(document, { className: 'ac-chart-svg-boxplot', labelledBy: options.labelledBy });
  const plotBox = getPlotBox();
  const range = getBoxplotRange(chart);
  const padding = (range.max - range.min || 1) * 0.1;
  const domain = [range.min - padding, range.max + padding];
  const yScale = (value) => scaleLinear(value, domain, [plotBox.bottom, plotBox.y]);
  const slotWidth = plotBox.width / chart.data.length;
  const boxWidth = Math.min(62, Math.max(28, slotWidth * 0.42));

  createGrid(svg, { yTicks: niceTicks(domain[0], domain[1], 5), yScale, plotBox });
  createXAxisLabels(svg, chart.data.map((row) => row.label), { plotBox, maxLabels: 7 });
  createAxisTitles(svg, chart, { plotBox });

  const layer = appendSvgElement(svg, 'g', { class: 'ac-chart-series ac-chart-boxplot-series' });
  chart.data.forEach((row, index) => {
    const cx = plotBox.x + slotWidth * index + slotWidth / 2;
    const q1Y = yScale(row.q1);
    const q3Y = yScale(row.q3);
    const medianY = yScale(row.median);
    const minY = yScale(row.min);
    const maxY = yScale(row.max);
    const group = appendSvgElement(layer, 'g', {
      class: 'ac-chart-boxplot-group',
      tabindex: 0,
      'data-chart-interactive': 'true',
      'data-chart-index': index,
      'aria-label': `${row.label}: median ${formatChartNumber(row.median)}${chart.unit ? ` ${chart.unit}` : ''}`
    });

    appendSvgElement(group, 'line', {
      class: 'ac-chart-boxplot-whisker',
      x1: cx,
      x2: cx,
      y1: maxY,
      y2: minY
    });
    appendSvgElement(group, 'line', {
      class: 'ac-chart-boxplot-cap',
      x1: cx - boxWidth * 0.33,
      x2: cx + boxWidth * 0.33,
      y1: maxY,
      y2: maxY
    });
    appendSvgElement(group, 'line', {
      class: 'ac-chart-boxplot-cap',
      x1: cx - boxWidth * 0.33,
      x2: cx + boxWidth * 0.33,
      y1: minY,
      y2: minY
    });
    appendSvgElement(group, 'rect', {
      class: 'ac-chart-boxplot-box',
      x: cx - boxWidth / 2,
      y: q3Y,
      width: boxWidth,
      height: Math.max(2, q1Y - q3Y),
      rx: 5
    });
    appendSvgElement(group, 'line', {
      class: 'ac-chart-boxplot-median',
      x1: cx - boxWidth / 2,
      x2: cx + boxWidth / 2,
      y1: medianY,
      y2: medianY
    });

    (row.outliers || []).forEach((outlier, outlierIndex) => {
      appendSvgElement(group, 'circle', {
        class: 'ac-chart-boxplot-outlier',
        cx: cx + (outlierIndex % 2 === 0 ? -5 : 5),
        cy: yScale(outlier),
        r: 4,
        tabindex: 0,
        'data-chart-interactive': 'true',
        'data-chart-index': index,
        'data-chart-outlier': outlier,
        'aria-label': `${row.label} outlier: ${formatChartNumber(outlier)}${chart.unit ? ` ${chart.unit}` : ''}`
      });
    });
  });

  return svg;
}
