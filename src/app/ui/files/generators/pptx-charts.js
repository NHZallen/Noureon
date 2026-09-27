// Maps the chat's chart schema onto native PowerPoint charts (pptxgenjs), so
// charts stay editable in PowerPoint. Types PowerPoint has no chart for
// (heatmap, treemap, sankey, box plot, Gantt, gauge, KPI cards) return null
// and are placed as an image of the chat's own rendering instead.

const hex = (color) => String(color || '#000000').replace('#', '').toUpperCase();

export const NATIVE_CHART_TYPES = Object.freeze(['bar', 'histogram', 'funnel', 'stackedBar', 'line', 'area', 'donut', 'scatter', 'bubble', 'radar', 'waterfall']);

function numberFormat(chart, language) {
  // French writes a no-break space before the percent sign.
  if (chart.unit === '%') return language === 'fr' ? '0.0" %"' : '0.0"%"';
  const values = (chart.data || []).map((row) => row.value).filter((value) => typeof value === 'number');
  const fractional = values.some((value) => !Number.isInteger(value));
  return fractional ? '#,##0.0' : '#,##0';
}

/** Point colours for single-series bars in the design's chart style. */
function pointColors(style, values, colors) {
  if (style === 'duo') {
    const best = Math.max(...values);
    return values.map((value) => (value === best ? colors.series[0] : colors.series[1]));
  }
  if (style === 'categorical') return values.map((_, index) => colors.series[index % colors.series.length]);
  return values.map(() => colors.series[0]);
}

function groupByCategory(rows) {
  const labels = [];
  const groups = new Map();
  rows.forEach((row) => {
    if (!labels.includes(row.label)) labels.push(row.label);
    const key = row.category || '';
    if (!groups.has(key)) groups.set(key, new Map());
    groups.get(key).set(row.label, row.value ?? row.y);
  });
  return { labels, series: [...groups.entries()].map(([name, values]) => ({ name: name || ' ', labels, values: labels.map((label) => values.get(label) ?? null) })) };
}

/**
 * Returns { type, data, options } for pptxgenjs addChart, or null.
 * `fontFace` is the typeface marker the writer resolves afterwards.
 */
export function nativeChart(element, { fontFace }) {
  const { chart, colors, style } = element;
  const size = element.font?.size || 12;
  const text = hex(colors.text);
  const muted = hex(colors.muted);
  const base = {
    catAxisLabelColor: text,
    catAxisLabelFontFace: fontFace,
    catAxisLabelFontSize: size,
    catAxisLineShow: true,
    catAxisLineColor: hex(colors.line),
    catAxisMajorTickMark: 'none',
    valAxisLabelColor: muted,
    valAxisLabelFontFace: fontFace,
    valAxisLabelFontSize: size - 1,
    valAxisLineShow: false,
    valAxisMajorTickMark: 'none',
    valGridLine: { color: hex(colors.line), size: 0.75, style: 'dash' },
    catGridLine: { style: 'none' },
    dataLabelFontFace: fontFace,
    dataLabelFontSize: size,
    dataLabelColor: text,
    legendFontFace: fontFace,
    legendFontSize: size,
    legendColor: text,
    showTitle: false,
    showLegend: false
  };
  const format = numberFormat(chart, element.language);
  const seriesColors = colors.series.map(hex);

  switch (chart.type) {
    case 'bar':
    case 'histogram':
    case 'funnel': {
      const rows = chart.data;
      const values = rows.map((row) => row.value);
      const hasCategories = chart.type === 'bar' && rows.some((row) => row.category);
      if (hasCategories) {
        const grouped = groupByCategory(rows);
        return { type: 'bar', data: grouped.series, options: { ...base, barDir: 'col', barGapWidthPct: 60, chartColors: seriesColors, showValue: false, showLegend: true, legendPos: 'b', valAxisLabelFormatCode: format } };
      }
      return {
        type: 'bar',
        data: [{ name: chart.title || ' ', labels: rows.map((row) => row.label), values }],
        options: {
          ...base,
          barDir: chart.type === 'funnel' ? 'bar' : 'col',
          barGapWidthPct: chart.type === 'histogram' ? 8 : 60,
          chartColors: pointColors(style, values, colors).map(hex),
          invertedColors: pointColors(style, values, colors).map(hex),
          showValue: true,
          dataLabelPosition: 'outEnd',
          dataLabelFormatCode: format,
          valAxisLabelFormatCode: format,
          catAxisOrientation: chart.type === 'funnel' ? 'maxMin' : 'minMax'
        }
      };
    }
    case 'stackedBar': {
      const labels = chart.data.map((row) => row.label);
      const data = chart.series.map((series) => ({ name: series.label, labels, values: chart.data.map((row) => row[series.key]) }));
      return { type: 'bar', data, options: { ...base, barDir: 'col', barGrouping: 'stacked', barGapWidthPct: 60, chartColors: seriesColors, showLegend: true, legendPos: 'b', valAxisLabelFormatCode: format } };
    }
    case 'line':
    case 'area': {
      const rows = chart.data.map((row) => ({ ...row, label: row.label ?? String(row.x), value: row.value ?? row.y }));
      const grouped = groupByCategory(rows);
      return {
        type: chart.type,
        data: grouped.series,
        options: {
          ...base,
          chartColors: seriesColors,
          lineSize: 2.5,
          lineDataSymbol: chart.type === 'line' ? 'circle' : 'none',
          lineDataSymbolSize: 7,
          showLegend: grouped.series.length > 1,
          legendPos: 'b',
          valAxisLabelFormatCode: format,
          ...(chart.type === 'area' ? { chartColorsOpacity: 70 } : {})
        }
      };
    }
    case 'donut':
      return {
        type: 'doughnut',
        data: [{ name: chart.title || ' ', labels: chart.data.map((row) => row.label), values: chart.data.map((row) => row.value) }],
        options: {
          ...base,
          holeSize: 62,
          chartColors: chart.data.map((_, index) => seriesColors[index % seriesColors.length]),
          showPercent: true,
          showValue: false,
          dataLabelColor: 'FFFFFF',
          showLegend: true,
          legendPos: 'r'
        }
      };
    case 'scatter':
    case 'bubble': {
      const xValues = chart.data.map((row) => row.x);
      const data = [{ name: chart.xLabel || 'X', values: xValues }, { name: chart.yLabel || 'Y', values: chart.data.map((row) => row.y), ...(chart.type === 'bubble' ? { sizes: chart.data.map((row) => row.size) } : {}) }];
      return { type: chart.type, data, options: { ...base, chartColors: seriesColors, lineSize: 0, lineDataSymbolSize: 9, showCatAxisTitle: Boolean(chart.xLabel), catAxisTitle: chart.xLabel, showValAxisTitle: Boolean(chart.yLabel), valAxisTitle: chart.yLabel, catAxisTitleColor: muted, valAxisTitleColor: muted, valGridLine: base.valGridLine } };
    }
    case 'radar': {
      const labels = chart.data.map((row) => row.label);
      const series = chart.series || [{ key: 'value', label: chart.title || ' ' }];
      const data = series.map((item) => ({ name: item.label, labels, values: chart.data.map((row) => row[item.key] ?? row.value) }));
      return { type: 'radar', data, options: { ...base, chartColors: seriesColors, radarStyle: 'marker', lineSize: 2, showLegend: data.length > 1, legendPos: 'b' } };
    }
    case 'waterfall': {
      // A stacked column with an invisible base series: the classic native
      // waterfall that every PowerPoint version can open.
      let running = 0;
      const labels = [];
      const baseValues = [];
      const up = [];
      const down = [];
      chart.data.forEach((row) => {
        labels.push(row.label);
        if (row.kind === 'start' || row.kind === 'end') {
          running = row.kind === 'start' ? row.value : running;
          baseValues.push(0);
          up.push(row.kind === 'start' ? row.value : running);
          down.push(0);
          return;
        }
        const next = running + row.value;
        baseValues.push(Math.min(running, next));
        up.push(row.value >= 0 ? row.value : 0);
        down.push(row.value < 0 ? -row.value : 0);
        running = next;
      });
      return {
        type: 'bar',
        data: [{ name: ' ', labels, values: baseValues }, { name: '+', labels, values: up }, { name: '−', labels, values: down }],
        options: { ...base, barDir: 'col', barGrouping: 'stacked', barGapWidthPct: 50, chartColors: [hex(colors.background), seriesColors[0], seriesColors[1]], valAxisLabelFormatCode: format }
      };
    }
    default:
      return null;
  }
}
