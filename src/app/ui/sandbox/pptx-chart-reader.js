// Reads a DrawingML chart (ppt/charts/chartN.xml) into the { type, data,
// options } form the slide and sheet previews draw (drawChart in
// slide-chart-preview.js): bars, columns, lines, areas, pies, doughnuts,
// scatter plots and radar charts, with the values PowerPoint stored in the
// chart's cache. Returns null for chart types the preview cannot draw.

const children = (node, name) => [...(node?.children || [])].filter((item) => item.localName === name);
const child = (node, name) => children(node, name)[0] || null;
const attribute = (node, name = 'val') => node?.getAttribute?.(name) ?? null;

const CHART_KINDS = Object.freeze({
  barChart: 'bar', bar3DChart: 'bar', lineChart: 'line', line3DChart: 'line', areaChart: 'area', area3DChart: 'area',
  pieChart: 'pie', pie3DChart: 'pie', doughnutChart: 'doughnut', scatterChart: 'scatter', radarChart: 'radar'
});
const FALLBACK_ACCENTS = Object.freeze(['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6']);
const hex = (color) => String(color || '#000000').replace('#', '').toUpperCase();

// The cached points of a reference or literal: an array indexed by point.
function cachePoints(node) {
  const cache = node && [...node.getElementsByTagName('*')].find((item) => ['strCache', 'numCache', 'strLit', 'numLit'].includes(item.localName));
  if (!cache) return [];
  const count = Number(attribute(child(cache, 'ptCount')) || 0);
  const points = Array.from({ length: count }, () => null);
  for (const point of children(cache, 'pt')) {
    const index = Number(point.getAttribute('idx'));
    const text = child(point, 'v')?.textContent ?? '';
    if (Number.isInteger(index) && index >= 0) points[index] = text;
  }
  return points;
}

const numbers = (node) => cachePoints(node).map((value) => (value === null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value)));
const textOf = (node) => [...(node?.getElementsByTagName?.('t') || [])].map((item) => item.textContent).join('');

/**
 * `paint(node)` gives the colour (#RRGGBB) of a shape-properties node or
 * null; `scheme(name)` a theme colour; `scale` the pixels of one point.
 */
export function readChartSpace(root, { paint, scheme, scale = 1 }) {
  const chart = child(root, 'chart');
  const plot = child(chart, 'plotArea');
  const group = [...(plot?.children || [])].find((item) => CHART_KINDS[item.localName]);
  if (!group) return null;
  const kind = CHART_KINDS[group.localName];
  const series = children(group, 'ser');
  if (!series.length) return null;

  const defaultRun = child(child(child(child(root, 'txPr'), 'p'), 'pPr'), 'defRPr');
  const fontSize = ((Number(attribute(defaultRun, 'sz')) || 1000) / 100) * scale;
  const accent = (index) => hex(scheme(FALLBACK_ACCENTS[index % FALLBACK_ACCENTS.length]) || '#4F81BD');
  const seriesColor = (item, index) => hex(paint(child(item, 'spPr')) || paint(child(child(item, 'spPr'), 'ln')) || scheme(FALLBACK_ACCENTS[index % FALLBACK_ACCENTS.length]));
  const pointColors = (item) => {
    const colors = new Map();
    for (const point of children(item, 'dPt')) {
      const color = paint(child(point, 'spPr'));
      if (color) colors.set(Number(attribute(child(point, 'idx'))), hex(color));
    }
    return colors;
  };

  const names = series.map((item, index) => {
    const label = textOf(child(item, 'tx')) || cachePoints(child(item, 'tx'))[0];
    return label || `Series ${index + 1}`;
  });
  const showsValues = [group, ...series].some((node) => attribute(child(child(node, 'dLbls'), 'showVal')) === '1');
  const showsPercent = [group, ...series].some((node) => attribute(child(child(node, 'dLbls'), 'showPercent')) === '1');
  const legend = child(chart, 'legend');
  const legendPosition = attribute(child(legend, 'legendPos'));

  const values = series.flatMap((item) => (kind === 'scatter' ? numbers(child(item, 'yVal')) : numbers(child(item, 'val'))));
  const fractional = values.some((value) => typeof value === 'number' && !Number.isInteger(value));
  const axisFormat = attribute(child(child(plot, 'valAx'), 'numFmt'), 'formatCode');
  const format = axisFormat && axisFormat !== 'General' ? axisFormat : fractional ? '#,##0.0' : '#,##0';

  const options = {
    catAxisLabelColor: '404040',
    catAxisLabelFontSize: fontSize,
    catAxisLineColor: 'BFBFBF',
    valAxisLabelColor: '595959',
    valAxisLabelFontSize: fontSize - 1,
    valGridLine: { color: 'D9D9D9', style: 'solid' },
    dataLabelColor: '404040',
    legendColor: '404040',
    showLegend: Boolean(legend),
    legendPos: legendPosition === 'r' || legendPosition === 'tr' ? 'r' : 'b',
    showValue: showsValues,
    showPercent: showsPercent,
    valAxisLabelFormatCode: format,
    dataLabelFormatCode: format
  };

  const titleNode = child(chart, 'title');
  // PowerPoint titles a single-series chart with the series name unless told not to.
  const title = titleNode ? textOf(titleNode) : series.length === 1 && attribute(child(chart, 'autoTitleDeleted')) !== '1' ? names[0] : '';

  if (kind === 'scatter') {
    const x = numbers(child(series[0], 'xVal'));
    const data = [{ name: 'X', labels: [], values: x.map((value) => value ?? 0) }, ...series.map((item, index) => ({
      name: names[index], labels: [], values: numbers(child(item, 'yVal')), sizes: []
    }))];
    return { type: 'scatter', data, title, options: { ...options, chartColors: series.map((item, index) => seriesColor(item, index)), lineDataSymbolSize: 9 } };
  }

  const categories = cachePoints(child(series[0], 'cat')).map((value) => value ?? '');
  const points = Math.max(categories.length, ...series.map((item) => numbers(child(item, 'val')).length));
  const labels = Array.from({ length: points }, (_, index) => categories[index] ?? String(index + 1));
  const data = series.map((item, index) => ({ name: names[index], labels, values: numbers(child(item, 'val')) }));

  if (kind === 'pie' || kind === 'doughnut') {
    const overrides = pointColors(series[0]);
    return {
      type: 'doughnut',
      data: [data[0]],
      title,
      options: {
        ...options,
        holeSize: kind === 'pie' ? 0 : Number(attribute(child(group, 'holeSize'))) || 50,
        showLegend: Boolean(legend),
        chartColors: labels.map((_, index) => overrides.get(index) || accent(index))
      }
    };
  }

  if (kind === 'radar') return { type: 'radar', data, title, options: { ...options, chartColors: series.map((item, index) => seriesColor(item, index)), lineSize: 2 } };

  const colors = series.map((item, index) => seriesColor(item, index));
  const varyColors = attribute(child(group, 'varyColors')) === '1' && series.length === 1;
  const overrides = pointColors(series[0]);
  const byPoint = kind === 'bar' && series.length === 1;
  const grouping = attribute(child(group, 'grouping'));
  return {
    type: kind,
    data,
    title,
    options: {
      ...options,
      barDir: attribute(child(group, 'barDir')) === 'bar' ? 'bar' : 'col',
      barGrouping: grouping === 'stacked' || grouping === 'percentStacked' ? 'stacked' : 'clustered',
      barGapWidthPct: Number(attribute(child(group, 'gapWidth'))) || 150,
      chartColors: byPoint
        ? labels.map((_, index) => overrides.get(index) || (varyColors ? accent(index) : colors[0]))
        : colors,
      lineSize: 2.25 * scale,
      lineDataSymbol: kind === 'line' && attribute(child(child(series[0], 'marker'), 'symbol')) !== 'none' ? 'circle' : 'none',
      lineDataSymbolSize: 7,
      chartColorsOpacity: kind === 'area' ? 80 : undefined
    }
  };
}
