export const SVG_NS = 'http://www.w3.org/2000/svg';

export const CHART_VIEWBOX = Object.freeze({
  width: 640,
  height: 360,
  plot: Object.freeze({
    left: 82,
    right: 28,
    top: 28,
    bottom: 72
  })
});

export const DONUT_VIEWBOX = Object.freeze({
  width: 420,
  height: 320,
  centerX: 210,
  centerY: 156,
  outerRadius: 118,
  innerRadius: 64
});

export const DEFAULT_DONUT_PALETTE = Object.freeze([
  '#60A5FA',
  '#34D399',
  '#FBBF24',
  '#FB923C',
  '#A78BFA',
  '#F472B6'
]);

export function createSvgElement(document, tagName, attributes = {}) {
  const element = document.createElementNS(SVG_NS, tagName);
  Object.entries(attributes).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      element.setAttribute(key, String(value));
    }
  });
  return element;
}

export function appendSvgElement(parent, tagName, attributes = {}, text) {
  const element = createSvgElement(parent.ownerDocument, tagName, attributes);
  if (text !== undefined) element.textContent = String(text);
  parent.appendChild(element);
  return element;
}

export function createChartSvg(document, { className = '', labelledBy } = {}) {
  return createSvgElement(document, 'svg', {
    class: `ac-chart-svg ${className}`.trim(),
    viewBox: `0 0 ${CHART_VIEWBOX.width} ${CHART_VIEWBOX.height}`,
    role: 'img',
    'aria-labelledby': labelledBy
  });
}

export function createInteractionOverlay(svg, { plotBox = getPlotBox(), className = '' } = {}) {
  return appendSvgElement(svg, 'rect', {
    class: `ac-chart-interaction-overlay ${className}`.trim(),
    x: plotBox.x,
    y: plotBox.y,
    width: plotBox.width,
    height: plotBox.height,
    fill: 'transparent',
    stroke: 'none',
    'pointer-events': 'all',
    'aria-hidden': 'true',
    'data-chart-hit-area': 'plot'
  });
}

export function getPlotBox() {
  const { width, height, plot } = CHART_VIEWBOX;
  return {
    x: plot.left,
    y: plot.top,
    width: width - plot.left - plot.right,
    height: height - plot.top - plot.bottom,
    bottom: height - plot.bottom,
    right: width - plot.right
  };
}

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export function createSmoothPathData(points, bounds = getPlotBox()) {
  const safePoints = Array.from(points || []).filter((point) =>
    Number.isFinite(point?.x) && Number.isFinite(point?.y)
  );
  if (!safePoints.length) return '';
  if (safePoints.length === 1) return `M ${safePoints[0].x} ${safePoints[0].y}`;

  const minX = bounds.x;
  const maxX = bounds.right ?? bounds.x + bounds.width;
  const minY = bounds.y;
  const maxY = bounds.bottom ?? bounds.y + bounds.height;
  const commands = [`M ${safePoints[0].x} ${safePoints[0].y}`];

  for (let index = 0; index < safePoints.length - 1; index += 1) {
    const previous = safePoints[index - 1] || safePoints[index];
    const current = safePoints[index];
    const next = safePoints[index + 1];
    const following = safePoints[index + 2] || next;
    const control1 = {
      x: clamp(current.x + (next.x - previous.x) / 6, minX, maxX),
      y: clamp(current.y + (next.y - previous.y) / 6, minY, maxY)
    };
    const control2 = {
      x: clamp(next.x - (following.x - current.x) / 6, minX, maxX),
      y: clamp(next.y - (following.y - current.y) / 6, minY, maxY)
    };
    commands.push(`C ${control1.x} ${control1.y} ${control2.x} ${control2.y} ${next.x} ${next.y}`);
  }

  return commands.join(' ');
}

export function getNumberRange(values, { includeZero = false } = {}) {
  const finiteValues = values.filter(Number.isFinite);
  let min = finiteValues.length ? Math.min(...finiteValues) : 0;
  let max = finiteValues.length ? Math.max(...finiteValues) : 1;
  if (includeZero) {
    min = Math.min(min, 0);
    max = Math.max(max, 0);
  }
  if (min === max) {
    const offset = Math.abs(min || 1) * 0.1;
    min -= offset;
    max += offset;
  }
  return { min, max };
}

export function niceTicks(min, max, count = 4) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || count < 2) return [0, 1];
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, index) => min + step * index);
}

export function scaleLinear(value, domain, range) {
  const [domainMin, domainMax] = domain;
  const [rangeMin, rangeMax] = range;
  if (domainMin === domainMax) return (rangeMin + rangeMax) / 2;
  return rangeMin + ((value - domainMin) / (domainMax - domainMin)) * (rangeMax - rangeMin);
}

export function formatChartNumber(value) {
  if (!Number.isFinite(value)) return '';
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(2))).replace(/\.0+$/, '');
}

export function getLineValue(row, index) {
  return {
    x: row.x ?? index,
    y: row.y ?? row.value,
    label: row.label
  };
}

export function getPrimaryColor(chart) {
  return chart.colors?.primary || 'var(--button-primary-bg, #60A5FA)';
}

export function getDonutPalette(chart) {
  const palette = chart.colors?.palette?.length ? chart.colors.palette : DEFAULT_DONUT_PALETTE;
  return chart.data.map((_row, index) => palette[index % palette.length]);
}

export function createGrid(svg, { yTicks, yScale, plotBox = getPlotBox() }) {
  yTicks.forEach((tick) => {
    const y = yScale(tick);
    appendSvgElement(svg, 'line', {
      class: 'ac-chart-grid-line',
      x1: plotBox.x,
      x2: plotBox.right,
      y1: y,
      y2: y
    });
    appendSvgElement(svg, 'text', {
      class: 'ac-chart-axis-label ac-chart-y-tick',
      x: plotBox.x - 14,
      y: y + 4,
      'text-anchor': 'end'
    }, formatChartNumber(tick));
  });
}

export function createXAxisLabels(svg, labels, { plotBox = getPlotBox(), maxLabels = 6 } = {}) {
  if (!labels.length) return;
  const step = labels.length > 1 ? plotBox.width / (labels.length - 1) : 0;
  const stride = Math.max(1, Math.ceil(labels.length / maxLabels));
  labels.forEach((label, index) => {
    if (index % stride !== 0 && index !== labels.length - 1) return;
    appendSvgElement(svg, 'text', {
      class: 'ac-chart-axis-label ac-chart-x-tick',
      x: labels.length > 1 ? plotBox.x + step * index : plotBox.x + plotBox.width / 2,
      y: plotBox.bottom + 25,
      'text-anchor': 'middle'
    }, label);
  });
}

export function createAxisTitles(svg, chart, { plotBox = getPlotBox() } = {}) {
  if (chart.xLabel) {
    appendSvgElement(svg, 'text', {
      class: 'ac-chart-axis-title ac-chart-x-title',
      x: plotBox.x + plotBox.width / 2,
      y: CHART_VIEWBOX.height - 8,
      'text-anchor': 'middle'
    }, chart.xLabel);
  }
  if (chart.yLabel) {
    const label = appendSvgElement(svg, 'text', {
      class: 'ac-chart-axis-title ac-chart-y-title',
      x: 20,
      y: plotBox.y + plotBox.height / 2,
      'text-anchor': 'middle'
    }, chart.yLabel);
    label.setAttribute('transform', `rotate(-90 20 ${plotBox.y + plotBox.height / 2})`);
  }
}

export function polarToCartesian(centerX, centerY, radius, angleInDegrees) {
  const angleInRadians = (angleInDegrees - 90) * Math.PI / 180;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians)
  };
}

export function describeArcSegment({ centerX, centerY, outerRadius, innerRadius, startAngle, endAngle }) {
  const outerStart = polarToCartesian(centerX, centerY, outerRadius, endAngle);
  const outerEnd = polarToCartesian(centerX, centerY, outerRadius, startAngle);
  const innerStart = polarToCartesian(centerX, centerY, innerRadius, startAngle);
  const innerEnd = polarToCartesian(centerX, centerY, innerRadius, endAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 0 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerStart.x} ${innerStart.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 1 ${innerEnd.x} ${innerEnd.y}`,
    'Z'
  ].join(' ');
}
