import {
  CHART_VIEWBOX,
  formatChartNumber,
  getPlotBox
} from './chart-utils.js';

const INTERACTIVE_SELECTORS = Object.freeze({
  scatter: '.ac-chart-scatter-point',
  bar: '.ac-chart-bar',
  line: '.ac-chart-line-point',
  donut: '.ac-chart-donut-segment, .ac-chart-legend-item',
  stackedBar: '.ac-chart-stacked-segment, .ac-chart-stacked-legend-item',
  area: '.ac-chart-area-point',
  bubble: '.ac-chart-bubble-point',
  histogram: '.ac-chart-histogram-bar',
  kpi: '.ac-chart-kpi-item',
  gauge: '.ac-chart-gauge-progress',
  heatmap: '.ac-chart-heatmap-cell',
  treemap: '.ac-chart-treemap-node',
  radar: '.ac-chart-radar-point, .ac-chart-radar-legend-item',
  funnel: '.ac-chart-funnel-stage',
  waterfall: '.ac-chart-waterfall-bar',
  sankey: '.ac-chart-sankey-node, .ac-chart-sankey-link',
  boxplot: '.ac-chart-boxplot-group, .ac-chart-boxplot-outlier',
  gantt: '.ac-chart-gantt-item'
});

const INTERACTIVE_CLASSES = Object.freeze({
  scatter: ['ac-chart-scatter-point'],
  bar: ['ac-chart-bar'],
  line: ['ac-chart-line-point'],
  donut: ['ac-chart-donut-segment', 'ac-chart-legend-item'],
  stackedBar: ['ac-chart-stacked-segment', 'ac-chart-stacked-legend-item'],
  area: ['ac-chart-area-point'],
  bubble: ['ac-chart-bubble-point'],
  histogram: ['ac-chart-histogram-bar'],
  kpi: ['ac-chart-kpi-item'],
  gauge: ['ac-chart-gauge-progress'],
  heatmap: ['ac-chart-heatmap-cell'],
  treemap: ['ac-chart-treemap-node'],
  radar: ['ac-chart-radar-point', 'ac-chart-radar-legend-item'],
  funnel: ['ac-chart-funnel-stage'],
  waterfall: ['ac-chart-waterfall-bar'],
  sankey: ['ac-chart-sankey-node', 'ac-chart-sankey-link'],
  boxplot: ['ac-chart-boxplot-group', 'ac-chart-boxplot-outlier'],
  gantt: ['ac-chart-gantt-item']
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
  if (type === 'stackedBar') {
    return [
      ...article.querySelectorAll('.ac-chart-stacked-segment'),
      ...article.querySelectorAll('.ac-chart-stacked-legend-item')
    ];
  }
  if (type === 'radar') {
    return [
      ...article.querySelectorAll('.ac-chart-radar-polygon'),
      ...article.querySelectorAll('.ac-chart-radar-point'),
      ...article.querySelectorAll('.ac-chart-radar-legend-item')
    ];
  }
  return [...article.querySelectorAll(getTypeSelector(type))];
};

const getPrimaryElementsForType = (article, type) => {
  if (type === 'donut') return [...article.querySelectorAll('.ac-chart-donut-segment')];
  if (type === 'stackedBar') return [...article.querySelectorAll('.ac-chart-stacked-segment')];
  if (type === 'radar') return [...article.querySelectorAll('.ac-chart-radar-point')];
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
  if (type === 'bubble') {
    return [
      ['', label, true],
      [chart.xLabel || 'x', formatChartNumber(datum.x)],
      [chart.yLabel || 'y', formatChartNumber(datum.y)],
      [chart.sizeLabel || 'size', `${formatChartNumber(datum.size)}${unit}`]
    ];
  }
  if (type === 'stackedBar') {
    return [
      ['', datum.categoryLabel || label, true],
      [datum.seriesLabel || 'series', `${formatChartNumber(datum.value)}${unit}`],
      ['total', `${formatChartNumber(datum.total)}${unit}`]
    ];
  }
  if (type === 'histogram') {
    return [
      ['', datum.label, true],
      [chart.yLabel || 'count', `${formatChartNumber(datum.count)}${unit}`]
    ];
  }
  if (type === 'kpi') {
    const rowUnit = datum.unit ? ` ${datum.unit}` : unit;
    const rows = [['', datum.label, true], ['', `${formatChartNumber(datum.value)}${rowUnit}`]];
    if (datum.delta !== undefined) rows.push(['delta', `${datum.delta > 0 ? '+' : ''}${formatChartNumber(datum.delta)}%`]);
    return rows;
  }
  if (type === 'gauge') {
    return [
      ['', datum.label, true],
      ['', `${formatChartNumber(datum.value)}${unit}`],
      ['range', `${formatChartNumber(datum.min)}–${formatChartNumber(datum.max)}`]
    ];
  }
  if (type === 'heatmap') {
    return [
      [chart.yLabel || 'y', datum.y, true],
      [chart.xLabel || 'x', datum.x],
      ['', `${formatChartNumber(datum.value)}${unit}`]
    ];
  }
  if (type === 'treemap') {
    const rows = [['', datum.label, true]];
    if (datum.group) rows.push(['group', datum.group]);
    rows.push(['value', `${formatChartNumber(datum.value)}${unit}`]);
    rows.push(['share', `${formatChartNumber(datum.percentage)}%`]);
    return rows;
  }
  if (type === 'radar') {
    const rows = [['', datum.axisLabel || datum.seriesLabel, true]];
    if (datum.axisLabel && datum.seriesLabel) rows.push(['series', datum.seriesLabel]);
    rows.push([datum.axisLabel ? 'value' : 'average', `${formatChartNumber(datum.value)}${unit}`]);
    return rows;
  }
  if (type === 'funnel') {
    return [
      ['', datum.label, true],
      ['value', `${formatChartNumber(datum.value)}${unit}`],
      ['conversion', `${formatChartNumber(datum.conversion)}%`],
      ['drop-off', `${formatChartNumber(datum.dropOff)}%`]
    ];
  }
  if (type === 'waterfall') {
    return [
      ['', datum.label, true],
      ['value', `${datum.value > 0 && datum.kind === 'delta' ? '+' : ''}${formatChartNumber(datum.value)}${unit}`],
      ['cumulative', `${formatChartNumber(datum.cumulative)}${unit}`]
    ];
  }
  if (type === 'sankey') {
    if (datum.sourceLabel && datum.targetLabel) {
      return [
        ['source', datum.sourceLabel, true],
        ['target', datum.targetLabel],
        ['value', `${formatChartNumber(datum.value)}${unit}`]
      ];
    }
    return [
      ['', datum.label, true],
      ['flow', `${formatChartNumber(datum.value)}${unit}`]
    ];
  }
  if (type === 'boxplot') {
    if (datum.outlier !== undefined) {
      return [
        ['', datum.label, true],
        ['outlier', `${formatChartNumber(datum.outlier)}${unit}`]
      ];
    }
    return [
      ['', datum.label, true],
      ['min', `${formatChartNumber(datum.min)}${unit}`],
      ['q1', `${formatChartNumber(datum.q1)}${unit}`],
      ['median', `${formatChartNumber(datum.median)}${unit}`],
      ['q3', `${formatChartNumber(datum.q3)}${unit}`],
      ['max', `${formatChartNumber(datum.max)}${unit}`]
    ];
  }
  if (type === 'gantt') {
    if (datum.kind === 'milestone') {
      return [
        ['', datum.label, true],
        ['date', datum.date]
      ];
    }
    const rows = [
      ['', datum.label, true],
      ['start', datum.start],
      ['end', datum.end],
      ['duration', `${datum.duration} days`],
      ['progress', `${formatChartNumber(datum.progress)}%`]
    ];
    if (datum.group) rows.push(['group', datum.group]);
    return rows;
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

const getChartDatum = (chart, index, type, sourceElement) => {
  if (type === 'gauge') return { label: chart.label, value: chart.value, min: chart.min, max: chart.max };
  if (type === 'stackedBar') {
    const seriesIndex = Number(sourceElement?.dataset?.chartSeriesIndex);
    const categoryIndex = Number(sourceElement?.dataset?.chartCategoryIndex);
    const series = chart.series[seriesIndex];
    if (!series) return null;
    if (!Number.isFinite(categoryIndex)) {
      return {
        label: series.label,
        categoryLabel: series.label,
        seriesLabel: series.label,
        value: chart.data.reduce((sum, row) => sum + row[series.key], 0),
        total: chart.data.reduce((sum, row) => sum + row[series.key], 0)
      };
    }
    const row = chart.data[categoryIndex];
    if (!row) return null;
    return {
      label: row.label,
      categoryLabel: row.label,
      seriesLabel: series.label,
      value: row[series.key],
      total: chart.series.reduce((sum, item) => sum + row[item.key], 0)
    };
  }
  if (type === 'radar') {
    const seriesIndex = Number(sourceElement?.dataset?.chartSeriesIndex);
    const axisIndex = Number(sourceElement?.dataset?.chartAxisIndex);
    const series = chart.series?.[seriesIndex] || { key: 'value', label: chart.title || 'Value' };
    if (!series) return null;
    if (!Number.isFinite(axisIndex)) {
      const values = chart.data.map((row) => row[series.key]);
      return {
        seriesLabel: series.label,
        value: values.reduce((sum, value) => sum + value, 0) / values.length
      };
    }
    const row = chart.data[axisIndex];
    if (!row) return null;
    return { axisLabel: row.label, seriesLabel: series.label, value: row[series.key] };
  }
  if (type === 'sankey') {
    if (sourceElement?.classList?.contains('ac-chart-sankey-link')) {
      const link = chart.links[index];
      if (!link) return null;
      const source = chart.nodes.find((node) => node.id === link.source);
      const target = chart.nodes.find((node) => node.id === link.target);
      return { ...link, sourceLabel: source?.label || link.source, targetLabel: target?.label || link.target };
    }
    const nodeId = sourceElement?.dataset?.chartNodeId;
    const node = chart.nodes.find((item) => item.id === nodeId) || chart.nodes[index];
    if (!node) return null;
    const value = chart.links
      .filter((link) => link.source === node.id || link.target === node.id)
      .reduce((sum, link) => sum + link.value, 0);
    return { ...node, value };
  }
  const row = chart.data[index];
  if (!row) return null;
  if (type === 'donut') {
    const total = chart.data.reduce((sum, item) => sum + Math.max(0, item.value), 0) || 1;
    return {
      ...row,
      percentage: Math.max(0, row.value) / total * 100
    };
  }
  if (type === 'treemap') {
    const total = chart.data.reduce((sum, item) => sum + Math.max(0, item.value), 0) || 1;
    return { ...row, percentage: Math.max(0, row.value) / total * 100 };
  }
  if (type === 'funnel') {
    const previous = index > 0 ? chart.data[index - 1].value : row.value;
    return {
      ...row,
      conversion: chart.data[0].value ? row.value / chart.data[0].value * 100 : 0,
      dropOff: previous ? Math.max(0, (previous - row.value) / previous * 100) : 0
    };
  }
  if (type === 'waterfall') {
    let cumulative = 0;
    let datum = null;
    chart.data.forEach((item, itemIndex) => {
      cumulative = item.kind === 'start' || item.kind === 'end' ? item.value : cumulative + item.value;
      if (itemIndex === index) datum = { ...item, cumulative };
    });
    return datum;
  }
  if (type === 'boxplot') {
    if (sourceElement?.dataset?.chartOutlier !== undefined) {
      return { ...row, outlier: Number(sourceElement.dataset.chartOutlier) };
    }
    return row;
  }
  if (type === 'gantt') {
    if (row.kind === 'milestone') return row;
    return { ...row, duration: Number(sourceElement?.dataset?.chartDuration) || 1 };
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
  if (type === 'scatter' || type === 'bubble') {
    return {
      x: article.querySelector('.ac-chart-guide-x') || createSvgLine(svg, 'ac-chart-guide-x'),
      y: article.querySelector('.ac-chart-guide-y') || createSvgLine(svg, 'ac-chart-guide-y')
    };
  }
  if (type === 'line' || type === 'area') {
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
  if (type === 'scatter' || type === 'bubble') {
    setGuideLine(guides.x, { x1: cx, x2: cx, y1: plotBox.y, y2: plotBox.bottom });
    setGuideLine(guides.y, { x1: plotBox.x, x2: plotBox.right, y1: cy, y2: cy });
  }
  if (type === 'line' || type === 'area') {
    setGuideLine(guides.x, { x1: cx, x2: cx, y1: plotBox.y, y2: plotBox.bottom });
  }
};

const updateContinuousSegments = (article, type, activeIndex) => {
  const prefix = type === 'area' ? 'area' : 'line';
  const points = [...article.querySelectorAll(`.ac-chart-${prefix}-point`)].map((point) => ({
    x: Number(point.getAttribute('cx')),
    y: Number(point.getAttribute('cy'))
  }));
  const pastClip = article.querySelector(`.ac-chart-${prefix}-past-clip`);
  const futureClip = article.querySelector(`.ac-chart-${prefix}-future-clip`);
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
  if (chart.type === 'line' || chart.type === 'area') updateContinuousSegments(article, chart.type, null);
};

const setActiveIndex = ({ article, chart, tooltip, type, index, sourceElement, event }) => {
  const datum = getChartDatum(chart, index, type, sourceElement);
  if (!datum || !sourceElement) return;
  article.dataset.chartActiveIndex = String(index);
  const svg = article.querySelector('svg');
  if (svg) svg.dataset.chartActiveIndex = String(index);
  article.classList.add('has-active');
  const elements = getElementsForType(article, type);
  const sourceSeriesIndex = Number(sourceElement?.dataset?.chartSeriesIndex);
  const sourceIsLegend = sourceElement?.classList?.contains('ac-chart-stacked-legend-item') ||
    sourceElement?.classList?.contains('ac-chart-radar-legend-item');
  elements.forEach((element) => {
    let isMatch = (type === 'stackedBar' || type === 'radar') && sourceIsLegend
      ? Number(element.dataset.chartSeriesIndex) === sourceSeriesIndex
      : getElementIndex(element) === index;
    if (type === 'sankey') {
      const nodeId = sourceElement.dataset.chartNodeId;
      if (nodeId) {
        isMatch = element === sourceElement ||
          element.dataset.chartSource === nodeId ||
          element.dataset.chartTarget === nodeId;
      } else {
        isMatch = element === sourceElement;
      }
    }
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
  if (type === 'line' || type === 'area') updateContinuousSegments(article, type, index);
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
  const nearest = findNearestPoint(elements, point, { axis: type === 'line' || type === 'area' ? 'x' : 'xy' });
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
  const nearestTypes = ['scatter', 'line', 'area', 'bubble'];
  const pinnableTypes = ['donut', 'stackedBar', 'radar'];
  const moveTarget = nearestTypes.includes(type) ? svg : article;
  BOUND_CHARTS.add(article);
  article.dataset.chartInteractions = 'true';
  let ignoreNextClick = false;
  let lastPointerType = '';
  let pinnedIndex = null;

  const activateFromEvent = (event) => {
    if (nearestTypes.includes(type)) {
      return handleNearestActive({ article, chart, tooltip, type, event });
    }
    if (pinnableTypes.includes(type) && event.type === 'pointermove' && pinnedIndex !== null) return true;
    return handleDirectActive({ article, chart, tooltip, type, event });
  };

  moveTarget?.addEventListener('pointermove', activateFromEvent);
  article.addEventListener('pointerdown', (event) => {
    lastPointerType = event.pointerType || '';
    ignoreNextClick = activateFromEvent(event);
    if (pinnableTypes.includes(type)) {
      const target = getTargetElement(article, type, event.target);
      pinnedIndex = target ? getElementIndex(target) : null;
    }
    if (!ignoreNextClick) {
      clearActiveState(article, chart);
      clearTooltip(tooltip);
    }
  });
  article.addEventListener('click', (event) => {
    if (pinnableTypes.includes(type)) {
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
    if (pinnableTypes.includes(type) && pinnedIndex !== null) return;
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
    if (pinnableTypes.includes(type) && pinnedIndex !== null) return;
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
