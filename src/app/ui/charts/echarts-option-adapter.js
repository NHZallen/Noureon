import { normalizeChartSchema } from './chart-schema.js';

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const asArray = (value) => Array.isArray(value) ? value : (value == null ? [] : [value]);
const first = (value) => asArray(value)[0] || {};
const textOf = (value) => String(value ?? '').trim();
const numberOf = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  const match = String(value ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  const parsed = match ? Number(match[0]) : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
};

const stripLineAndBlockComments = (source) => {
  let output = '';
  let quote = '';
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (quote) {
      output += char;
      if (char === '\\') {
        output += next || '';
        index += 1;
      } else if (char === quote) {
        quote = '';
      }
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      output += char;
      continue;
    }
    if (char === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') index += 1;
      output += '\n';
      continue;
    }
    if (char === '/' && next === '*') {
      index += 2;
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) index += 1;
      index += 1;
      output += ' ';
      continue;
    }
    output += char;
  }
  return output;
};

const skipString = (source, start) => {
  const quote = source[start];
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === '\\') {
      index += 2;
      continue;
    }
    if (source[index] === quote) return index + 1;
    index += 1;
  }
  return source.length;
};

const findMatchingBrace = (source, openIndex) => {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"' || char === "'" || char === '`') {
      index = skipString(source, index) - 1;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
};

const replaceFunctionExpressions = (source) => {
  let output = '';
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"' || char === "'" || char === '`') {
      const end = skipString(source, index);
      output += source.slice(index, end);
      index = end - 1;
      continue;
    }
    const isFunction = source.slice(index, index + 8) === 'function'
      && !/[\w$]/.test(source[index - 1] || '')
      && !/[\w$]/.test(source[index + 8] || '');
    if (isFunction) {
      const bodyStart = source.indexOf('{', index + 8);
      const bodyEnd = bodyStart >= 0 ? findMatchingBrace(source, bodyStart) : -1;
      if (bodyEnd >= 0) {
        output += 'null';
        index = bodyEnd;
        continue;
      }
    }
    output += char;
  }
  return output;
};

const extractObjectLiteral = (source) => {
  const assignmentMatch = /(?:^|[;\s])(?:const|let|var)?\s*option\s*=/.exec(source);
  const searchStart = assignmentMatch ? assignmentMatch.index + assignmentMatch[0].length : 0;
  const objectStart = source.indexOf('{', searchStart);
  if (objectStart < 0) return null;
  const objectEnd = findMatchingBrace(source, objectStart);
  return objectEnd >= 0 ? source.slice(objectStart, objectEnd + 1) : null;
};

const stringifyJsStrings = (source) => {
  let output = '';
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char !== '"' && char !== "'" && char !== '`') {
      output += char;
      continue;
    }
    const quote = char;
    let value = '';
    index += 1;
    while (index < source.length) {
      const current = source[index];
      if (current === '\\') {
        const escaped = source[index + 1] || '';
        value += escaped === 'n' ? '\n' : escaped === 't' ? '\t' : escaped;
        index += 2;
        continue;
      }
      if (current === quote) break;
      value += current;
      index += 1;
    }
    output += JSON.stringify(value);
  }
  return output;
};

export function parseEChartsOption(source) {
  const objectLiteral = extractObjectLiteral(replaceFunctionExpressions(stripLineAndBlockComments(String(source || ''))));
  if (!objectLiteral) return { ok: false, reason: 'missing-option' };
  try {
    const jsonLike = stringifyJsStrings(objectLiteral)
      .replace(/([{,]\s*)([$A-Z_a-z][$\w]*)\s*:/g, '$1"$2":')
      .replace(/,\s*([}\]])/g, '$1');
    return { ok: true, option: JSON.parse(jsonLike) };
  } catch {
    return { ok: false, reason: 'malformed-echarts-option' };
  }
}

const unitFromAxisName = (name) => {
  const text = textOf(name);
  const match = text.match(/[（(]([^）)]+)[）)]/);
  return match?.[1] || undefined;
};

const lineRows = (labels, values) => labels.map((label, index) => ({ label, value: values[index] }));
const tupleRows = (values, { bubble = false } = {}) => values.map((point, index) => ({
  label: `Point ${index + 1}`,
  x: Array.isArray(point) ? point[0] : point?.x,
  y: Array.isArray(point) ? point[1] : point?.y,
  ...(bubble ? { size: Array.isArray(point) ? point[2] : (point?.size ?? point?.r) } : {})
}));

const boxSummary = (values) => {
  const sorted = values.map(numberOf).filter((value) => value !== undefined).sort((a, b) => a - b);
  if (sorted.length < 5) return null;
  const at = (ratio) => sorted[Math.round((sorted.length - 1) * ratio)];
  return { min: sorted[0], q1: at(0.25), median: at(0.5), q3: at(0.75), max: sorted.at(-1) };
};

const dateFromTimestamp = (timestamp) => new Date(timestamp).toISOString().slice(0, 10);
const ganttEndDate = (startDate, durationMs) => {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const duration = Math.max(24 * 60 * 60 * 1000, numberOf(durationMs) || 0);
  return dateFromTimestamp(start + duration - 24 * 60 * 60 * 1000);
};

const convertGraphicToKpi = (option) => {
  const groups = asArray(option.graphic).filter((item) => item?.type === 'group');
  if (!groups.length) return null;
  const data = groups.map((group, index) => {
    const textChildren = asArray(group.children).filter((child) => child?.type === 'text');
    const label = textOf(textChildren[0]?.style?.text || `KPI ${index + 1}`);
    const valueText = textOf(textChildren[1]?.style?.text);
    const deltaText = textOf(textChildren[2]?.style?.text);
    const value = numberOf(valueText);
    const unit = valueText.replace(/[-\d.,/\s]/g, '').replace(/[↑↓+-]/g, '') || undefined;
    const delta = numberOf(deltaText);
    return {
      label,
      value,
      ...(unit ? { unit } : {}),
      ...(delta !== undefined ? { delta } : {}),
      ...(deltaText.includes('↓') || deltaText.includes('-') ? { trend: 'down' } : deltaText ? { trend: 'up' } : {})
    };
  }).filter((row) => row.value !== undefined);
  return data.length ? { type: 'kpi', title: option.title?.text, data } : null;
};

export function convertEChartsOptionToChartSchema(option) {
  if (!isRecord(option)) return null;
  const graphicChart = convertGraphicToKpi(option);
  if (graphicChart) return graphicChart;

  const series = asArray(option.series).filter(isRecord);
  const primarySeries = series[0] || {};
  const type = primarySeries.type;
  const xAxis = first(option.xAxis);
  const yAxis = first(option.yAxis);
  const labels = asArray(xAxis.data).map(textOf);
  const title = option.title?.text;
  const unit = unitFromAxisName(yAxis.name);
  const base = { title, xLabel: xAxis.name, yLabel: yAxis.name, unit };

  if (type === 'gauge') {
    const item = first(primarySeries.data);
    return { type: 'gauge', title, label: item.name || primarySeries.name || title, value: item.value, min: 0, max: 100, unit: '%' };
  }
  if (type === 'sankey') {
    const nodes = asArray(primarySeries.data).map((node) => ({ id: textOf(node.name), label: textOf(node.name) }));
    return {
      type: 'sankey',
      title,
      nodes,
      links: asArray(primarySeries.links).map((link) => ({ source: link.source, target: link.target, value: link.value }))
    };
  }
  if (type === 'radar') {
    const indicators = asArray(option.radar?.indicator);
    const radarData = asArray(primarySeries.data).filter(isRecord);
    return {
      type: 'radar',
      title,
      min: 0,
      max: Math.max(100, ...indicators.map((item) => numberOf(item.max) || 0)),
      series: radarData.map((item, index) => ({ key: `series${index + 1}`, label: item.name || `Series ${index + 1}` })),
      data: indicators.map((indicator, axisIndex) => {
        const row = { label: indicator.name };
        radarData.forEach((item, seriesIndex) => { row[`series${seriesIndex + 1}`] = asArray(item.value)[axisIndex]; });
        return row;
      })
    };
  }
  if (type === 'funnel') {
    return { type: 'funnel', title, unit: '人', data: asArray(primarySeries.data).map((item) => ({ label: item.name, value: item.value })) };
  }
  if (type === 'treemap') {
    const rows = [];
    const visit = (item, group) => {
      if (Array.isArray(item.children) && item.children.length) {
        item.children.forEach((child) => visit(child, item.name));
      } else {
        rows.push({ label: item.name, value: item.value, ...(group ? { group } : {}) });
      }
    };
    asArray(primarySeries.data).forEach((item) => visit(item));
    return { type: 'treemap', title, unit: '萬元', data: rows };
  }
  if (type === 'pie') {
    return { type: 'donut', title, unit: '萬元', data: asArray(primarySeries.data).map((item) => ({ label: item.name, value: item.value })) };
  }
  if (type === 'heatmap') {
    return {
      type: 'heatmap',
      title,
      data: asArray(primarySeries.data).map((row) => ({ x: row[0], y: row[1], value: row[2] }))
    };
  }
  if (type === 'boxplot') {
    return {
      ...base,
      type: 'boxplot',
      data: asArray(primarySeries.data).map((row, index) => ({ label: labels[index] || `Group ${index + 1}`, ...boxSummary(row) }))
    };
  }
  if (type === 'bar' && xAxis.type === 'time') {
    return {
      type: 'gantt',
      title,
      data: asArray(primarySeries.data).map((item, index) => {
        const start = Array.isArray(item.value) ? item.value[0] : item.start;
        const duration = Array.isArray(item.value) ? item.value[1] : item.duration;
        return { label: item.name || asArray(yAxis.data)[index] || `Task ${index + 1}`, start, end: ganttEndDate(start, duration), progress: 100 };
      })
    };
  }
  if (type === 'bar' && series.some((item) => item.stack)) {
    const chartSeries = series.map((item, index) => ({ key: `series${index + 1}`, label: item.name || `Series ${index + 1}` }));
    return {
      ...base,
      type: 'stackedBar',
      data: labels.map((label, labelIndex) => {
        const row = { label };
        series.forEach((item, seriesIndex) => { row[`series${seriesIndex + 1}`] = asArray(item.data)[labelIndex]; });
        return row;
      }),
      series: chartSeries
    };
  }
  if (type === 'bar' && labels.length) {
    const data = asArray(primarySeries.data);
    const looksLikeWaterfall = data.some((item) => numberOf(isRecord(item) ? item.value : item) < 0);
    const rows = labels.map((label, index) => ({ label, value: isRecord(data[index]) ? data[index].value : data[index] }));
    if (looksLikeWaterfall) {
      return { ...base, type: 'waterfall', data: rows.map((row, index) => ({ ...row, kind: index === 0 ? 'start' : index === rows.length - 1 ? 'end' : 'delta' })) };
    }
    if (labels.some((label) => /\d/.test(label) && /歲|age|年齡/i.test(label))) {
      return {
        ...base,
        type: 'histogram',
        bins: rows.map((row, index) => {
          const nums = [...String(row.label).matchAll(/\d+/g)].map((match) => Number(match[0]));
          const min = nums[0] ?? index;
          const max = nums[1] ?? min + 1;
          return { label: row.label, min, max: max > min ? max : min + 1, count: row.value };
        })
      };
    }
    return { ...base, type: 'bar', data: rows };
  }
  if (type === 'scatter') {
    const values = asArray(primarySeries.data);
    const isBubble = values.some((point) => Array.isArray(point) && point.length >= 3);
    return { ...base, type: isBubble ? 'bubble' : 'scatter', data: tupleRows(values, { bubble: isBubble }) };
  }
  if (type === 'line') {
    const areaSeries = series.filter((item) => item.areaStyle != null || item.stack);
    if (areaSeries.length > 1) {
      return {
        ...base,
        type: 'area',
        data: labels.map((label, index) => ({
          label,
          value: areaSeries.reduce((sum, item) => sum + (numberOf(asArray(item.data)[index]) || 0), 0)
        }))
      };
    }
    return { ...base, type: areaSeries.length ? 'area' : 'line', data: lineRows(labels, asArray(primarySeries.data)) };
  }

  return null;
}

export function parseAndNormalizeEChartsOption(source, options = {}) {
  const parsed = parseEChartsOption(source);
  if (!parsed.ok) return parsed;
  const chart = convertEChartsOptionToChartSchema(parsed.option);
  if (!chart) return { ok: false, reason: 'unsupported-echarts-option' };
  return normalizeChartSchema(chart, options);
}
