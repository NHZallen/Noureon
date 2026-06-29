import {
  DEFAULT_DONUT_PALETTE, appendSvgElement, createChartSvg, formatChartNumber,
  polarToCartesian, scaleLinear
} from './chart-utils.js';

const pointsAttribute = (points) => points.map((point) => `${point.x},${point.y}`).join(' ');

export function renderRadarChart(document, chart, options = {}) {
  const container = document.createElement('div');
  const svg = createChartSvg(document, { className: 'ac-chart-svg-radar', labelledBy: options.labelledBy });
  const legend = document.createElement('div');
  const centerX = 320;
  const centerY = 174;
  const radius = 116;
  const palette = chart.colors?.palette?.length ? chart.colors.palette : DEFAULT_DONUT_PALETTE;
  const series = chart.series || [{ key: 'value', label: chart.title || 'Value' }];
  const axes = chart.data.map((row, index) => ({
    ...polarToCartesian(centerX, centerY, radius, index * 360 / chart.data.length),
    label: row.label
  }));

  container.className = 'ac-chart-radar-layout';
  legend.className = 'ac-chart-legend ac-chart-radar-legend';
  [0.25, 0.5, 0.75, 1].forEach((level) => {
    const ring = chart.data.map((_row, index) => polarToCartesian(
      centerX, centerY, radius * level, index * 360 / chart.data.length
    ));
    appendSvgElement(svg, 'polygon', { class: 'ac-chart-radar-grid', points: pointsAttribute(ring) });
  });
  axes.forEach((axis, index) => {
    appendSvgElement(svg, 'line', {
      class: 'ac-chart-radar-axis', x1: centerX, y1: centerY, x2: axis.x, y2: axis.y
    });
    const labelPoint = polarToCartesian(centerX, centerY, radius + 25, index * 360 / chart.data.length);
    appendSvgElement(svg, 'text', {
      class: 'ac-chart-axis-label ac-chart-radar-axis-label',
      x: labelPoint.x,
      y: labelPoint.y + 4,
      'text-anchor': Math.abs(labelPoint.x - centerX) < 8 ? 'middle' : labelPoint.x < centerX ? 'end' : 'start'
    }, axis.label.length > 14 ? `${axis.label.slice(0, 12)}…` : axis.label);
  });

  const layer = appendSvgElement(svg, 'g', { class: 'ac-chart-series ac-chart-radar-series' });
  series.forEach((item, seriesIndex) => {
    const points = chart.data.map((row, axisIndex) => {
      const valueRadius = scaleLinear(row[item.key], [chart.min, chart.max], [0, radius]);
      return polarToCartesian(centerX, centerY, valueRadius, axisIndex * 360 / chart.data.length);
    });
    appendSvgElement(layer, 'polygon', {
      class: 'ac-chart-radar-polygon', points: pointsAttribute(points),
      fill: palette[seriesIndex % palette.length], stroke: palette[seriesIndex % palette.length],
      'data-chart-series-index': seriesIndex
    });
    points.forEach((point, axisIndex) => {
      const value = chart.data[axisIndex][item.key];
      appendSvgElement(layer, 'circle', {
        class: 'ac-chart-radar-point', cx: point.x, cy: point.y, r: 5,
        fill: palette[seriesIndex % palette.length], tabindex: 0,
        'data-chart-interactive': 'true',
        'data-chart-index': axisIndex * series.length + seriesIndex,
        'data-chart-axis-index': axisIndex,
        'data-chart-series-index': seriesIndex,
        'aria-label': `${chart.data[axisIndex].label}, ${item.label}: ${formatChartNumber(value)}${chart.unit ? ` ${chart.unit}` : ''}`
      });
    });
  });

  if (series.length > 1) series.forEach((item, seriesIndex) => {
    const legendItem = document.createElement('div');
    const swatch = document.createElement('span');
    const label = document.createElement('span');
    legendItem.className = 'ac-chart-legend-item ac-chart-radar-legend-item';
    legendItem.dataset.chartIndex = String(seriesIndex);
    legendItem.dataset.chartSeriesIndex = String(seriesIndex);
    legendItem.dataset.chartInteractive = 'true';
    legendItem.tabIndex = 0;
    legendItem.setAttribute('role', 'button');
    legendItem.setAttribute('aria-label', item.label);
    swatch.className = 'ac-chart-legend-swatch';
    swatch.style.backgroundColor = palette[seriesIndex % palette.length];
    label.className = 'ac-chart-legend-label';
    label.textContent = item.label;
    legendItem.append(swatch, label);
    legend.appendChild(legendItem);
  });
  container.append(svg);
  if (series.length > 1) container.append(legend);
  return container;
}
