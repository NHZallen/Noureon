import { CHART_VIEWBOX, formatChartNumber } from './chart-utils.js';

const INTERACTIVE_SELECTORS = Object.freeze({
  scatter: '.ac-chart-scatter-point',
  bar: '.ac-chart-bar',
  line: '.ac-chart-line-point',
  donut: '.ac-chart-donut-segment, .ac-chart-legend-item'
});

const INTERACTIVE_CLASSES = Object.freeze({
  scatter: ['ac-chart-scatter-point'],
  bar: ['ac-chart-bar'],
  line: ['ac-chart-line-point'],
  donut: ['ac-chart-donut-segment', 'ac-chart-legend-item']
});

const parseViewBox = (svg) => {
  const values = String(svg?.getAttribute?.('viewBox') || '')
    .split(/\s+/)
    .map(Number);
  if (values.length === 4 && values.every(Number.isFinite)) {
    return { x: values[0], y: values[1], width: values[2], height: values[3] };
  }
  return { x: 0, y: 0, width: CHART_VIEWBOX.width, height: CHART_VIEWBOX.height };
};

const getClientPointFromEvent = (event) => {
  const touch = event?.touches?.[0] || event?.changedTouches?.[0];
  return {
    x: Number.isFinite(event?.clientX) ? event.clientX : touch?.clientX,
    y: Number.isFinite(event?.clientY) ? event.clientY : touch?.clientY
  };
};

export function getSvgPointerPoint(svg, event) {
  const rect = svg.getBoundingClientRect?.() || { left: 0, top: 0, width: 0, height: 0 };
  const viewBox = parseViewBox(svg);
  const client = getClientPointFromEvent(event);
  const width = rect.width || viewBox.width || 1;
  const height = rect.height || viewBox.height || 1;
  const left = rect.left || 0;
  const top = rect.top || 0;
  return {
    x: viewBox.x + ((client.x ?? 0) - left) / width * viewBox.width,
    y: viewBox.y + ((client.y ?? 0) - top) / height * viewBox.height
  };
}

export function getDatumPoint(element) {
  const x = Number(element?.getAttribute?.('cx') ?? element?.dataset?.chartSvgX);
  const y = Number(element?.getAttribute?.('cy') ?? element?.dataset?.chartSvgY);
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0
  };
}

export function findNearestPoint(elements, point, { axis = 'xy' } = {}) {
  const list = Array.from(elements || []);
  if (!list.length) return null;
  return list.reduce((nearest, element) => {
    const candidate = getDatumPoint(element);
    const dx = candidate.x - point.x;
    const dy = candidate.y - point.y;
    const distance = axis === 'x' ? Math.abs(dx) : Math.hypot(dx, dy);
    if (!nearest || distance < nearest.distance) {
      return { element, index: Number(element.dataset.chartIndex), distance };
    }
    return nearest;
  }, null);
}

export function getBoundedTooltipPosition({
  anchorX,
  anchorY,
  tooltipWidth,
  tooltipHeight,
  containerWidth,
  containerHeight,
  offset = 18
}) {
  const width = Math.max(0, Number(containerWidth) || 0);
  const height = Math.max(0, Number(containerHeight) || 0);
  const tipWidth = Math.max(0, Number(tooltipWidth) || 0);
  const tipHeight = Math.max(0, Number(tooltipHeight) || 0);
  const maxLeft = Math.max(0, width - tipWidth);
  const maxTop = Math.max(0, height - tipHeight);
  let left = (Number(anchorX) || 0) + offset;
  let top = (Number(anchorY) || 0) - tipHeight - offset;

  if (left > maxLeft) left = (Number(anchorX) || 0) - tipWidth - offset;
  if (top < 0) top = (Number(anchorY) || 0) + offset;

  return {
    left: Math.min(Math.max(0, left), maxLeft),
    top: Math.min(Math.max(0, top), maxTop)
  };
}

const getElementIndex = (element) => Number(element?.dataset?.chartIndex);

const getTypeSelector = (type) => INTERACTIVE_SELECTORS[type] || '';

const setClassFlag = (element, className, enabled) => {
  const classes = new Set(String(element.getAttribute('class') || '').split(/\s+/).filter(Boolean));
  if (enabled) classes.add(className);
  else classes.delete(className);
  element.setAttribute('class', [...classes].join(' '));
};

const removeStateClasses = (element) => {
  setClassFlag(element, 'is-active', false);
  setClassFlag(element, 'is-selected', false);
  setClassFlag(element, 'is-faded', false);
};

const getElementsForType = (article, type) => {
  if (!type) return [];
  if (type === 'donut') {
    return [
      ...article.querySelectorAll('.ac-chart-donut-segment'),
      ...article.querySelectorAll('.ac-chart-legend-item')
    ];
  }
  return [...article.querySelectorAll(getTypeSelector(type))];
};

const getPrimaryElementsForType = (article, type) => {
  if (type === 'donut') return [...article.querySelectorAll('.ac-chart-donut-segment')];
  return getElementsForType(article, type);
};

const createTooltip = (article) => {
  const document = article.ownerDocument;
  const tooltip = document.createElement('div');
  tooltip.className = 'ac-chart-tooltip';
  tooltip.setAttribute('role', 'status');
  tooltip.setAttribute('aria-live', 'polite');
  tooltip.hidden = true;
  article.appendChild(tooltip);
  return tooltip;
};

const clearTooltip = (tooltip) => {
  if (!tooltip) return;
  tooltip.classList.remove('is-visible');
  tooltip.hidden = true;
  tooltip.replaceChildren();
};

const appendTooltipRow = (document, tooltip, label, value, { strong = false } = {}) => {
  const row = document.createElement('div');
  const valueNode = document.createElement(strong ? 'strong' : 'span');
  row.className = 'ac-chart-tooltip-row';
  valueNode.className = 'ac-chart-tooltip-value';
  if (label) {
    const labelNode = document.createElement('span');
    labelNode.className = 'ac-chart-tooltip-label';
    labelNode.textContent = label;
    row.appendChild(labelNode);
  }
  valueNode.textContent = value;
  row.appendChild(valueNode);
  tooltip.appendChild(row);
};

const getTooltipRows = (chart, datum, type) => {
  const label = datum?.label || datum?.category || '';
  const unit = chart.unit ? ` ${chart.unit}` : '';
  if (type === 'scatter') {
    return [
      ['', label, true],
      [chart.xLabel || 'x', `${formatChartNumber(datum.x)}${unit}`],
      [chart.yLabel || 'y', `${formatChartNumber(datum.y)}${unit}`]
    ];
  }
  if (type === 'donut') {
    return [
      ['', label, true],
      ['', `${formatChartNumber(datum.value)}${unit}`],
      ['', `${formatChartNumber(datum.percentage)}%`]
    ];
  }
  return [
    ['', label, true],
    ['', `${formatChartNumber(datum.value ?? datum.y)}${unit}`]
  ];
};

const showTooltip = ({ article, tooltip, chart, datum, type, anchor }) => {
  if (!tooltip || !datum) return;
  const document = article.ownerDocument;
  tooltip.replaceChildren();
  getTooltipRows(chart, datum, type).forEach(([label, value, strong]) => {
    appendTooltipRow(document, tooltip, label, value, { strong });
  });
  tooltip.hidden = false;

  const containerRect = article.getBoundingClientRect?.() || { width: article.offsetWidth || 320, height: article.offsetHeight || 240 };
  const tipRect = tooltip.getBoundingClientRect?.() || { width: tooltip.offsetWidth || 160, height: tooltip.offsetHeight || 72 };
  const width = tipRect.width || tooltip.offsetWidth || 168;
  const height = tipRect.height || tooltip.offsetHeight || 78;
  const position = getBoundedTooltipPosition({
    anchorX: anchor.x,
    anchorY: anchor.y,
    tooltipWidth: width,
    tooltipHeight: height,
    containerWidth: containerRect.width || article.offsetWidth || 320,
    containerHeight: containerRect.height || article.offsetHeight || 260
  });

  tooltip.style.left = `${position.left}px`;
  tooltip.style.top = `${position.top}px`;
  tooltip.classList.add('is-visible');
};

const getChartDatum = (chart, index, type) => {
  const row = chart.data[index];
  if (!row) return null;
  if (type === 'donut') {
    const total = chart.data.reduce((sum, item) => sum + Math.max(0, item.value), 0) || 1;
    return {
      ...row,
      percentage: Math.max(0, row.value) / total * 100
    };
  }
  return row;
};

const getElementAnchor = (article, element, event) => {
  const articleRect = article.getBoundingClientRect?.() || { left: 0, top: 0 };
  const eventPoint = getClientPointFromEvent(event);
  if (Number.isFinite(eventPoint.x) && Number.isFinite(eventPoint.y)) {
    return {
      x: eventPoint.x - (articleRect.left || 0),
      y: eventPoint.y - (articleRect.top || 0)
    };
  }
  const rect = element.getBoundingClientRect?.() || { left: 0, top: 0, width: 0, height: 0 };
  return {
    x: rect.left - (articleRect.left || 0) + rect.width / 2,
    y: rect.top - (articleRect.top || 0) + rect.height / 2
  };
};

const setGuideLine = (line, attributes) => {
  if (!line) return;
  Object.entries(attributes).forEach(([key, value]) => line.setAttribute(key, String(value)));
  line.classList.remove('is-hidden');
};

const clearGuides = (article) => {
  article.querySelectorAll('.ac-chart-guide-line').forEach((line) => line.classList.add('is-hidden'));
};

const createSvgLine = (svg, className) => {
  const line = svg.ownerDocument.createElementNS(svg.namespaceURI, 'line');
  line.setAttribute('class', `ac-chart-guide-line ${className} is-hidden`);
  const series = svg.querySelector('.ac-chart-series');
  svg.insertBefore(line, series || null);
  return line;
};

const ensureGuides = (article, type) => {
  const svg = article.querySelector('svg');
  if (!svg) return {};
  if (type === 'scatter') {
    return {
      x: article.querySelector('.ac-chart-guide-x') || createSvgLine(svg, 'ac-chart-guide-x'),
      y: article.querySelector('.ac-chart-guide-y') || createSvgLine(svg, 'ac-chart-guide-y')
    };
  }
  if (type === 'line') {
    return {
      x: article.querySelector('.ac-chart-guide-x') || createSvgLine(svg, 'ac-chart-guide-x')
    };
  }
  return {};
};

const updateGuides = (article, type, element) => {
  const svg = article.querySelector('svg');
  if (!svg || !element) return;
  const viewBox = parseViewBox(svg);
  const cx = Number(element.getAttribute('cx'));
  const cy = Number(element.getAttribute('cy'));
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;
  const guides = ensureGuides(article, type);
  if (type === 'scatter') {
    setGuideLine(guides.x, { x1: cx, x2: cx, y1: viewBox.y + 28, y2: viewBox.height - 54 });
    setGuideLine(guides.y, { x1: 64, x2: viewBox.width - 28, y1: cy, y2: cy });
  }
  if (type === 'line') {
    setGuideLine(guides.x, { x1: cx, x2: cx, y1: viewBox.y + 28, y2: viewBox.height - 54 });
  }
};

const createPathData = (points) => points
  .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
  .join(' ');

const updateLineSegments = (article, activeIndex) => {
  const points = [...article.querySelectorAll('.ac-chart-line-point')].map((point) => ({
    x: Number(point.getAttribute('cx')),
    y: Number(point.getAttribute('cy'))
  }));
  const past = article.querySelector('.ac-chart-line-past');
  const future = article.querySelector('.ac-chart-line-future');
  if (!past || !future || !points.length) return;
  if (!Number.isFinite(activeIndex)) {
    past.setAttribute('d', createPathData(points));
    future.setAttribute('d', createPathData(points));
    future.classList.add('is-faded');
    return;
  }
  const boundedIndex = Math.min(Math.max(0, activeIndex), points.length - 1);
  past.setAttribute('d', createPathData(points.slice(0, boundedIndex + 1)));
  future.setAttribute('d', createPathData(points.slice(boundedIndex)));
  future.classList.add('is-faded');
};

const clearActiveState = (article, chart) => {
  article.dataset.chartActiveIndex = '';
  article.classList.remove('has-active');
  getElementsForType(article, chart.type).forEach((element) => {
    removeStateClasses(element);
  });
  clearGuides(article);
  if (chart.type === 'line') updateLineSegments(article, null);
};

const applyActiveState = ({ article, chart, tooltip, type, index, sourceElement, event }) => {
  const datum = getChartDatum(chart, index, type);
  if (!datum || !sourceElement) return;
  article.dataset.chartActiveIndex = String(index);
  article.classList.add('has-active');
  const elements = getElementsForType(article, type);
  elements.forEach((element) => {
    const isMatch = getElementIndex(element) === index;
    setClassFlag(element, 'is-active', isMatch);
    setClassFlag(element, 'is-selected', isMatch);
    setClassFlag(element, 'is-faded', !isMatch);
  });
  updateGuides(article, type, sourceElement.matches?.('.ac-chart-legend-item')
    ? article.querySelector(`.ac-chart-donut-segment[data-chart-index="${index}"]`) || sourceElement
    : sourceElement);
  if (type === 'line') updateLineSegments(article, index);
  showTooltip({
    article,
    tooltip,
    chart,
    datum,
    type,
    anchor: getElementAnchor(article, sourceElement, event)
  });
};

const getTargetElement = (article, type, target) => {
  const classes = INTERACTIVE_CLASSES[type] || [];
  let current = target;
  while (current && current !== article.parentNode) {
    const tokens = String(current.getAttribute?.('class') || '').split(/\s+/);
    if (classes.some((className) => tokens.includes(className))) {
      return current.dataset?.chartIndex !== undefined ? current : null;
    }
    if (current === article) return null;
    current = current.parentNode;
  }
  return null;
};

const handleDirectActive = ({ article, chart, tooltip, type, event }) => {
  const target = getTargetElement(article, type, event.target);
  if (!target) return false;
  const index = getElementIndex(target);
  const sourceElement = type === 'donut' && target.classList.contains('ac-chart-legend-item')
    ? article.querySelector(`.ac-chart-donut-segment[data-chart-index="${index}"]`) || target
    : target;
  applyActiveState({ article, chart, tooltip, type, index, sourceElement, event });
  return true;
};

const handleNearestActive = ({ article, chart, tooltip, type, event }) => {
  const svg = article.querySelector('svg');
  if (!svg) return false;
  const point = getSvgPointerPoint(svg, event);
  const elements = getPrimaryElementsForType(article, type);
  const nearest = findNearestPoint(elements, point, { axis: type === 'line' ? 'x' : 'xy' });
  if (!nearest?.element) return false;
  applyActiveState({
    article,
    chart,
    tooltip,
    type,
    index: nearest.index,
    sourceElement: nearest.element,
    event
  });
  return true;
};

export function attachChartInteractions(article, chart) {
  if (!article?.querySelector || !chart?.type || article.dataset.chartInteractions === 'true') {
    return false;
  }
  const type = chart.type;
  const tooltip = article.querySelector('.ac-chart-tooltip') || createTooltip(article);
  article.dataset.chartInteractions = 'true';

  const activateFromEvent = (event) => {
    if (type === 'scatter' || type === 'line') {
      return handleNearestActive({ article, chart, tooltip, type, event });
    }
    return handleDirectActive({ article, chart, tooltip, type, event });
  };

  article.addEventListener('pointermove', activateFromEvent);
  article.addEventListener('pointerdown', (event) => {
    if (!activateFromEvent(event)) {
      clearActiveState(article, chart);
      clearTooltip(tooltip);
    }
  });
  article.addEventListener('click', (event) => {
    if (!handleDirectActive({ article, chart, tooltip, type, event })) {
      clearActiveState(article, chart);
      clearTooltip(tooltip);
    }
  });
  article.addEventListener('pointerleave', () => {
    clearActiveState(article, chart);
    clearTooltip(tooltip);
  });
  article.addEventListener('focusin', (event) => {
    if (handleDirectActive({ article, chart, tooltip, type, event })) return;
    const target = getTargetElement(article, type, event.target);
    if (target) handleDirectActive({ article, chart, tooltip, type, event });
  });
  article.addEventListener('focusout', () => {
    clearActiveState(article, chart);
    clearTooltip(tooltip);
  });
  article.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      clearActiveState(article, chart);
      clearTooltip(tooltip);
    }
  });

  return true;
}
