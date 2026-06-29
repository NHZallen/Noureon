import {
  appendSvgElement, createSvgElement, describeArcSegment, formatChartNumber
} from './chart-utils.js';

const GAUGE = Object.freeze({ centerX: 210, centerY: 190, outerRadius: 126, innerRadius: 101 });

export function renderGaugeChart(document, chart, options = {}) {
  const svg = createSvgElement(document, 'svg', {
    class: 'ac-chart-svg ac-chart-svg-gauge', viewBox: '0 0 420 270', role: 'img', 'aria-labelledby': options.labelledBy
  });
  const ratio = (chart.value - chart.min) / (chart.max - chart.min);
  appendSvgElement(svg, 'path', {
    class: 'ac-chart-gauge-track',
    d: describeArcSegment({ ...GAUGE, startAngle: -90, endAngle: 90 })
  });
  const progress = appendSvgElement(svg, 'path', {
    class: 'ac-chart-gauge-progress',
    d: describeArcSegment({ ...GAUGE, startAngle: -90, endAngle: -90 + Math.max(0.01, ratio * 180) }),
    tabindex: 0, 'data-chart-interactive': 'true', 'data-chart-index': 0,
    'aria-label': `${chart.label}: ${formatChartNumber(chart.value)}${chart.unit ? ` ${chart.unit}` : ''}`
  });
  progress.appendChild(document.createElementNS(progress.namespaceURI, 'title')).textContent = progress.getAttribute('aria-label');
  appendSvgElement(svg, 'text', { class: 'ac-chart-gauge-value', x: 210, y: 166, 'text-anchor': 'middle' }, `${formatChartNumber(chart.value)}${chart.unit ? ` ${chart.unit}` : ''}`);
  appendSvgElement(svg, 'text', { class: 'ac-chart-gauge-label', x: 210, y: 194, 'text-anchor': 'middle' }, chart.label);
  appendSvgElement(svg, 'text', { class: 'ac-chart-axis-label ac-chart-gauge-min', x: 76, y: 218, 'text-anchor': 'middle' }, formatChartNumber(chart.min));
  appendSvgElement(svg, 'text', { class: 'ac-chart-axis-label ac-chart-gauge-max', x: 344, y: 218, 'text-anchor': 'middle' }, formatChartNumber(chart.max));
  return svg;
}
