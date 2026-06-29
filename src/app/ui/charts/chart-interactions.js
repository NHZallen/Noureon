import {
  CHART_VIEWBOX,
  formatChartNumber,
  getPlotBox
} from './chart-utils.js';

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

const BOUND_CHARTS = new WeakSet();

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
  if (svg?.createSVGPoint && svg?.getScreenCTM) {
    const matrix = svg.getScreenCTM();
    if (matrix?.inverse && Number.isFinite(client.x) && Number.isFinite(client.y)) {
      const svgPoint = svg.createSVGPoint();
      if (typeof svgPoint?.matrixTransform === 'function') {
        svgPoint.x = client.x;
        svgPoint.y = client.y;
        const transformed = svgPoint.matrixTransform(matrix.inverse());
        return { x: transformed.x, y: transformed.y };
      }
    }
  }
  const width = rect.width || viewBox.width || 1;
  const height = rect.height || viewBox.height || 1;
  const left = rect.left || 0;
  const top = rect.top || 0;
  const scale = Math.min(width / viewBox.width, height / viewBox.height) || 1;
  const renderedWidth = viewBox.width * scale;
  const renderedHeight = viewBox.height * scale;
  const offsetX = (width - renderedWidth) / 2;
  const offsetY = (height - renderedHeight) / 2;
  return {
    x: viewBox.x + ((client.x ?? 0) - left - offsetX) / scale,
    y: viewBox.y + ((client.y ?? 0) - top - offsetY) / scale
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
  delete element.dataset.chartActive;
  element.removeAttribute('aria-pressed');
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
  const valueNode = document.createElement('span');
  row.className = 'ac-chart-tooltip-row';
  valueNode.className = `ac-chart-tooltip-value${strong ? ' is-strong' : ''}`;
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
  line.dataset.chartActive = 'true';
};

const clearGuides = (article) => {
  article.querySelectorAll('.ac-chart-guide-line').forEach((line) => {
    line.classList.add('is-hidden');
    line.dataset.chartActive = 'false';
  });
};

const createSvgLine = (svg, className) => {
  const line = svg.ownerDocument.createElementNS(svg.namespaceURI, 'line');
  line.setAttribute('class', `ac-chart-guide-line ${className} is-hidden`);
  line.setAttribute('aria-hidden', 'true');
  line.dataset.chartGuide = className.endsWith('-x') ? 'x' : 'y';
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
  const plotBox = getPlotBox();
  const cx = Number(element.getAttribute('cx'));
  const cy = Number(element.getAttribute('cy'));
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;
  const guides = ensureGuides(article, type);
  if (type === 'scatter') {
    setGuideLine(guides.x, { x1: cx, x2: cx, y1: plotBox.y, y2: plotBox.bottom });
    setGuideLine(guides.y, { x1: plotBox.x, x2: plotBox.right, y1: cy, y2: cy });
  }
  if (type === 'line') {
    setGuideLine(guides.x, { x1: cx, x2: cx, y1: plotBox.y, y2: plotBox.bottom });
  }
};

const updateLineSegments = (article, activeIndex) => {
  const points = [...article.querySelectorAll('.ac-chart-line-point')].map((point) => ({
    x: Number(point.getAttribute('cx')),
    y: Number(point.getAttribute('cy'))
  }));
  const pastClip = article.querySelector('.ac-chart-line-past-clip');
  const futureClip = article.querySelector('.ac-chart-line-future-clip');
  const plotBox = getPlotBox();
  if (!pastClip || !futureClip || !points.length) return;
  if (!Number.isFinite(activeIndex)) {
    pastClip.setAttribute('x', String(plotBox.x));
    pastClip.setAttribute('width', String(plotBox.width));
    futureClip.setAttribute('x', String(plotBox.right));
    futureClip.setAttribute('width', '0');
    return;
  }
  const boundedIndex = Math.min(Math.max(0, activeIndex), points.length - 1);
  const activeX = points[boundedIndex].x;
  const overlap = 1;
  pastClip.setAttribute('x', String(plotBox.x));
  pastClip.setAttribute('width', String(Math.max(0, activeX - plotBox.x + overlap)));
  futureClip.setAttribute('x', String(Math.max(plotBox.x, activeX - overlap)));
  futureClip.setAttribute('width', String(Math.max(0, plotBox.right - activeX + overlap)));
};

const clearActiveState = (article, chart) => {
  article.dataset.chartActiveIndex = '';
  const svg = article.querySelector('svg');
  if (svg) svg.dataset.chartActiveIndex = '';
  article.classList.remove('has-active');
  getElementsForType(article, chart.type).forEach((element) => {
    removeStateClasses(element);
  });
  clearGuides(article);
  if (chart.type === 'line') updateLineSegments(article, null);
};

const setActiveIndex = ({ article, chart, tooltip, type, index, sourceElement, event }) => {
  const datum = getChartDatum(chart, index, type);
  if (!datum || !sourceElement) return;
  article.dataset.chartActiveIndex = String(index);
  const svg = article.querySelector('svg');
  if (svg) svg.dataset.chartActiveIndex = String(index);
  article.classList.add('has-active');
  const elements = getElementsForType(article, type);
  elements.forEach((element) => {
    const isMatch = getElementIndex(element) === index;
    setClassFlag(element, 'is-active', isMatch);
    setClassFlag(element, 'is-selected', isMatch);
    setClassFlag(element, 'is-faded', !isMatch);
    element.dataset.chartActive = isMatch ? 'true' : 'false';
    if (element.getAttribute('role') === 'button') {
      element.setAttribute('aria-pressed', isMatch ? 'true' : 'false');
    }
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
  setActiveIndex({ article, chart, tooltip, type, index, sourceElement, event });
  return true;
};

const handleNearestActive = ({ article, chart, tooltip, type, event }) => {
  const svg = article.querySelector('svg');
  if (!svg) return false;
  const point = getSvgPointerPoint(svg, event);
  const plotBox = getPlotBox();
  if (
    point.x < plotBox.x || point.x > plotBox.right ||
    point.y < plotBox.y || point.y > plotBox.bottom
  ) return false;
  const elements = getPrimaryElementsForType(article, type);
  const nearest = findNearestPoint(elements, point, { axis: type === 'line' ? 'x' : 'xy' });
  if (!nearest?.element) return false;
  setActiveIndex({
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
  if (!article?.querySelector || !chart?.type || BOUND_CHARTS.has(article)) {
    return false;
  }
  const type = chart.type;
  const tooltip = article.querySelector('.ac-chart-tooltip') || createTooltip(article);
  const svg = article.querySelector('svg');
  const moveTarget = type === 'scatter' || type === 'line' ? svg : article;
  BOUND_CHARTS.add(article);
  article.dataset.chartInteractions = 'true';
  let ignoreNextClick = false;
  let lastPointerType = '';
  let pinnedIndex = null;

  const activateFromEvent = (event) => {
    if (type === 'scatter' || type === 'line') {
      return handleNearestActive({ article, chart, tooltip, type, event });
    }
    if (type === 'donut' && event.type === 'pointermove' && pinnedIndex !== null) return true;
    return handleDirectActive({ article, chart, tooltip, type, event });
  };

  moveTarget?.addEventListener('pointermove', activateFromEvent);
  article.addEventListener('pointerdown', (event) => {
    lastPointerType = event.pointerType || '';
    ignoreNextClick = activateFromEvent(event);
    if (type === 'donut') {
      const target = getTargetElement(article, type, event.target);
      pinnedIndex = target ? getElementIndex(target) : null;
    }
    if (!ignoreNextClick) {
      clearActiveState(article, chart);
      clearTooltip(tooltip);
    }
  });
  article.addEventListener('click', (event) => {
    if (type === 'donut') {
      const target = getTargetElement(article, type, event.target);
      if (target) {
        pinnedIndex = getElementIndex(target);
        ignoreNextClick = false;
        handleDirectActive({ article, chart, tooltip, type, event });
        return;
      }
      pinnedIndex = null;
    }
    if (ignoreNextClick) {
      ignoreNextClick = false;
      return;
    }
    if (!handleDirectActive({ article, chart, tooltip, type, event })) {
      clearActiveState(article, chart);
      clearTooltip(tooltip);
    }
  });
  moveTarget?.addEventListener('touchmove', activateFromEvent, { passive: true });
  article.addEventListener('pointerleave', (event) => {
    if (type === 'donut' && pinnedIndex !== null) return;
    if (event.pointerType === 'touch' || lastPointerType === 'touch') return;
    ignoreNextClick = false;
    clearActiveState(article, chart);
    clearTooltip(tooltip);
  });
  article.addEventListener('focusin', (event) => {
    if (handleDirectActive({ article, chart, tooltip, type, event })) return;
    const target = getTargetElement(article, type, event.target);
    if (target) handleDirectActive({ article, chart, tooltip, type, event });
  });
  article.addEventListener('focusout', () => {
    if (type === 'donut' && pinnedIndex !== null) return;
    clearActiveState(article, chart);
    clearTooltip(tooltip);
  });
  article.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      pinnedIndex = null;
      clearActiveState(article, chart);
      clearTooltip(tooltip);
    }
  });

  return true;
}
