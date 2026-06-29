const CHART_TYPES = new Set([
  'scatter', 'bar', 'line', 'donut',
  'stackedBar', 'area', 'bubble', 'histogram', 'kpi', 'gauge',
  'heatmap', 'treemap', 'radar', 'funnel', 'waterfall',
  'sankey', 'boxplot', 'gantt'
]);
const DEFAULT_MAX_DATA_POINTS = 200;
const TEXT_LIMITS = Object.freeze({
  title: 120,
  description: 500,
  xLabel: 80,
  yLabel: 80,
  sizeLabel: 80,
  unit: 40,
  label: 120,
  category: 120,
  key: 80
});
const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeString = (value, { required = false, maxLength = 120 } = {}) => {
  if (value == null) return required ? { ok: false } : { ok: true, value: undefined };
  const text = String(value).trim();
  if ((required && !text) || text.length > maxLength) return { ok: false };
  return { ok: true, value: text };
};

const normalizeNumber = (value, { required = false } = {}) => {
  if (value == null || (typeof value === 'string' && value.trim() === '')) {
    return required ? { ok: false } : { ok: true, value: undefined };
  }
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) ? { ok: true, value: numberValue } : { ok: false };
};

const normalizePositiveNumber = (value, { required = false } = {}) => {
  const number = normalizeNumber(value, { required });
  if (!number.ok) return number;
  if (number.value !== undefined && number.value <= 0) return { ok: false };
  return number;
};

const fail = (reason, details = {}) => ({ ok: false, reason, ...details });

const normalizeColors = (colors) => {
  if (!isRecord(colors)) return undefined;
  const normalized = {};
  if (typeof colors.primary === 'string' && HEX_COLOR_PATTERN.test(colors.primary.trim())) {
    normalized.primary = colors.primary.trim();
  }
  if (Array.isArray(colors.palette)) {
    const palette = colors.palette
      .filter((color) => typeof color === 'string')
      .map((color) => color.trim())
      .filter((color) => HEX_COLOR_PATTERN.test(color))
      .slice(0, 12);
    if (palette.length) normalized.palette = palette;
  }
  return Object.keys(normalized).length ? normalized : undefined;
};

const normalizeCategory = (row) => {
  if (!hasOwn(row, 'category')) return { ok: true, value: undefined };
  return normalizeString(row.category, { maxLength: TEXT_LIMITS.category });
};

const normalizeBarRow = (row) => {
  const label = normalizeString(row.label, { required: true, maxLength: TEXT_LIMITS.label });
  const value = normalizeNumber(row.value, { required: true });
  const category = normalizeCategory(row);
  if (!label.ok) return fail('invalid-label');
  if (!value.ok) return fail('invalid-value');
  if (!category.ok) return fail('invalid-category');
  return { ok: true, value: { label: label.value, value: value.value, ...(category.value ? { category: category.value } : {}) } };
};

const normalizeDonutRow = (row, index) => {
  const value = normalizeNumber(row.value, { required: true });
  const label = normalizeString(row.label ?? row.category ?? `Segment ${index + 1}`, { required: true, maxLength: TEXT_LIMITS.label });
  const category = normalizeCategory(row);
  if (!value.ok) return fail('invalid-value');
  if (!label.ok) return fail('invalid-label');
  if (!category.ok) return fail('invalid-category');
  return { ok: true, value: { label: label.value, value: value.value, ...(category.value ? { category: category.value } : {}) } };
};

const normalizeScatterRow = (row, index, { bubble = false } = {}) => {
  const x = normalizeNumber(row.x, { required: true });
  const y = normalizeNumber(row.y, { required: true });
  const label = normalizeString(row.label ?? `Point ${index + 1}`, { required: true, maxLength: TEXT_LIMITS.label });
  if (!x.ok) return fail('invalid-x');
  if (!y.ok) return fail('invalid-y');
  if (!label.ok) return fail('invalid-label');
  const normalized = { label: label.value, x: x.value, y: y.value };
  if (bubble) {
    const size = normalizeNumber(row.size ?? row.r, { required: true });
    if (!size.ok || size.value < 0) return fail('invalid-size');
    normalized.size = size.value;
  } else if (hasOwn(row, 'value')) {
    const value = normalizeNumber(row.value, { required: true });
    if (!value.ok) return fail('invalid-value');
    normalized.value = value.value;
  }
  const category = normalizeCategory(row);
  if (!category.ok) return fail('invalid-category');
  if (category.value) normalized.category = category.value;
  return { ok: true, value: normalized };
};

const normalizeLineRow = (row) => {
  const hasLabelValue = hasOwn(row, 'label') && hasOwn(row, 'value');
  const hasXY = hasOwn(row, 'x') && hasOwn(row, 'y');
  if (!hasLabelValue && !hasXY) return fail('missing-line-coordinates');
  if (hasLabelValue) return normalizeBarRow(row);
  const x = normalizeNumber(row.x, { required: true });
  const y = normalizeNumber(row.y, { required: true });
  const label = normalizeString(row.label ?? String(row.x), { required: true, maxLength: TEXT_LIMITS.label });
  if (!x.ok) return fail('invalid-x');
  if (!y.ok) return fail('invalid-y');
  if (!label.ok) return fail('invalid-label');
  const category = normalizeCategory(row);
  if (!category.ok) return fail('invalid-category');
  return { ok: true, value: { label: label.value, x: x.value, y: y.value, ...(category.value ? { category: category.value } : {}) } };
};

const normalizeSeries = (series) => {
  if (!Array.isArray(series) || !series.length || series.length > 12) return fail('invalid-series');
  const seen = new Set();
  const normalized = [];
  for (const item of series) {
    if (!isRecord(item)) return fail('invalid-series');
    const key = normalizeString(item.key, { required: true, maxLength: TEXT_LIMITS.key });
    const label = normalizeString(item.label ?? item.key, { required: true, maxLength: TEXT_LIMITS.label });
    if (!key.ok || !label.ok || seen.has(key.value)) return fail('invalid-series');
    seen.add(key.value);
    normalized.push({ key: key.value, label: label.value });
  }
  return { ok: true, value: normalized };
};

const normalizeStackedRows = (rows, series) => {
  const normalized = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!isRecord(row)) return fail('invalid-row', { rowIndex: index });
    const label = normalizeString(row.label, { required: true, maxLength: TEXT_LIMITS.label });
    if (!label.ok) return fail('invalid-label', { rowIndex: index });
    const next = { label: label.value };
    for (const item of series) {
      const value = normalizeNumber(row[item.key], { required: true });
      if (!value.ok || value.value < 0) return fail('invalid-value', { rowIndex: index, seriesKey: item.key });
      next[item.key] = value.value;
    }
    normalized.push(next);
  }
  return { ok: true, value: normalized };
};

const normalizeHistogramBin = (row, index) => {
  if (!isRecord(row)) return fail('invalid-row');
  const min = normalizeNumber(row.min, { required: true });
  const max = normalizeNumber(row.max, { required: true });
  const count = normalizeNumber(row.count, { required: true });
  if (!min.ok || !max.ok || max.value <= min.value) return fail('invalid-range');
  if (!count.ok || count.value < 0) return fail('invalid-count');
  const label = normalizeString(row.label ?? `${min.value}–${max.value}`, { required: true, maxLength: TEXT_LIMITS.label });
  if (!label.ok) return fail('invalid-label');
  return { ok: true, value: { label: label.value, min: min.value, max: max.value, count: count.value, value: count.value, index } };
};

const createHistogramBins = (values) => {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const binCount = Math.max(1, Math.min(12, Math.ceil(Math.sqrt(values.length))));
  const width = max === min ? 1 : (max - min) / binCount;
  const bins = Array.from({ length: binCount }, (_, index) => {
    const binMin = min + width * index;
    const binMax = index === binCount - 1 ? max : min + width * (index + 1);
    return { label: `${Number(binMin.toFixed(2))}–${Number(binMax.toFixed(2))}`, min: binMin, max: binMax, count: 0, value: 0, index };
  });
  values.forEach((value) => {
    const index = max === min ? 0 : Math.min(binCount - 1, Math.floor((value - min) / width));
    bins[index].count += 1;
    bins[index].value += 1;
  });
  return bins;
};

const normalizeKpiRow = (row, index, defaultUnit) => {
  if (!isRecord(row)) return fail('invalid-row');
  const label = normalizeString(row.label ?? `KPI ${index + 1}`, { required: true, maxLength: TEXT_LIMITS.label });
  const value = normalizeNumber(row.value, { required: true });
  const unit = normalizeString(row.unit ?? defaultUnit, { maxLength: TEXT_LIMITS.unit });
  const delta = normalizeNumber(row.delta);
  const trend = row.trend == null ? undefined : String(row.trend).trim().toLowerCase();
  if (!label.ok) return fail('invalid-label');
  if (!value.ok) return fail('invalid-value');
  if (!unit.ok) return fail('invalid-unit');
  if (!delta.ok) return fail('invalid-delta');
  if (trend && !['up', 'down', 'flat'].includes(trend)) return fail('invalid-trend');
  return { ok: true, value: { label: label.value, value: value.value, ...(unit.value ? { unit: unit.value } : {}), ...(delta.value !== undefined ? { delta: delta.value } : {}), ...(trend ? { trend } : {}) } };
};

const normalizeHeatmapRow = (row) => {
  const x = normalizeString(row.x, { required: true, maxLength: TEXT_LIMITS.label });
  const y = normalizeString(row.y, { required: true, maxLength: TEXT_LIMITS.label });
  const value = normalizeNumber(row.value, { required: true });
  if (!x.ok) return fail('invalid-x');
  if (!y.ok) return fail('invalid-y');
  if (!value.ok) return fail('invalid-value');
  return { ok: true, value: { x: x.value, y: y.value, value: value.value, label: `${y.value} / ${x.value}` } };
};

const normalizeTreemapRow = (row) => {
  const base = normalizeBarRow(row);
  if (!base.ok || base.value.value < 0) return base.ok ? fail('invalid-value') : base;
  const group = normalizeString(row.group, { maxLength: TEXT_LIMITS.category });
  if (!group.ok) return fail('invalid-group');
  return { ok: true, value: { ...base.value, ...(group.value ? { group: group.value } : {}) } };
};

const normalizeWaterfallRow = (row) => {
  const base = normalizeBarRow(row);
  if (!base.ok) return base;
  const kind = row.kind == null ? 'delta' : String(row.kind).trim().toLowerCase();
  if (!['start', 'delta', 'end'].includes(kind)) return fail('invalid-kind');
  return { ok: true, value: { ...base.value, kind } };
};

const normalizeSankey = (input, maxDataPoints) => {
  if (!Array.isArray(input.nodes) || !Array.isArray(input.links)) return fail('invalid-data');
  if (!input.nodes.length || !input.links.length) return fail('empty-data');
  if (input.nodes.length + input.links.length > maxDataPoints) return fail('too-many-data-points', { maxDataPoints });
  const nodeIds = new Set();
  const nodes = [];
  for (let index = 0; index < input.nodes.length; index += 1) {
    const node = input.nodes[index];
    if (!isRecord(node)) return fail('invalid-node', { rowIndex: index });
    const id = normalizeString(node.id, { required: true, maxLength: TEXT_LIMITS.key });
    const label = normalizeString(node.label ?? node.id, { required: true, maxLength: TEXT_LIMITS.label });
    if (!id.ok || !label.ok || nodeIds.has(id.value)) return fail('invalid-node', { rowIndex: index });
    nodeIds.add(id.value);
    nodes.push({ id: id.value, label: label.value });
  }
  const links = [];
  for (let index = 0; index < input.links.length; index += 1) {
    const link = input.links[index];
    if (!isRecord(link)) return fail('invalid-link', { rowIndex: index });
    const source = normalizeString(link.source, { required: true, maxLength: TEXT_LIMITS.key });
    const target = normalizeString(link.target, { required: true, maxLength: TEXT_LIMITS.key });
    const value = normalizePositiveNumber(link.value, { required: true });
    if (!source.ok || !target.ok || !value.ok || !nodeIds.has(source.value) || !nodeIds.has(target.value)) {
      return fail('invalid-link', { rowIndex: index });
    }
    links.push({ source: source.value, target: target.value, value: value.value });
  }
  return { ok: true, value: { nodes, links } };
};

const normalizeBoxplotRow = (row, index) => {
  if (!isRecord(row)) return fail('invalid-row');
  const label = normalizeString(row.label ?? `Group ${index + 1}`, { required: true, maxLength: TEXT_LIMITS.label });
  if (!label.ok) return fail('invalid-label');
  const min = normalizeNumber(row.min, { required: true });
  const q1 = normalizeNumber(row.q1, { required: true });
  const median = normalizeNumber(row.median, { required: true });
  const q3 = normalizeNumber(row.q3, { required: true });
  const max = normalizeNumber(row.max, { required: true });
  if (!min.ok || !q1.ok || !median.ok || !q3.ok || !max.ok) return fail('invalid-summary');
  const summary = { min: min.value, q1: q1.value, median: median.value, q3: q3.value, max: max.value };
  if (!(summary.min <= summary.q1 && summary.q1 <= summary.median && summary.median <= summary.q3 && summary.q3 <= summary.max)) {
    return fail('invalid-summary-order');
  }
  const outliers = Array.isArray(row.outliers)
    ? row.outliers.map((value) => normalizeNumber(value, { required: true }))
    : [];
  if (outliers.some((value) => !value.ok)) return fail('invalid-outliers');
  return { ok: true, value: { label: label.value, ...summary, outliers: outliers.map((value) => value.value) } };
};

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const normalizeDateString = (value, { required = false } = {}) => {
  const text = normalizeString(value, { required, maxLength: 20 });
  if (!text.ok || text.value === undefined) return text;
  if (!ISO_DATE_PATTERN.test(text.value)) return { ok: false };
  if (!Number.isFinite(Date.parse(`${text.value}T00:00:00Z`))) return { ok: false };
  return { ok: true, value: text.value };
};

const normalizeGanttRow = (row, index) => {
  if (!isRecord(row)) return fail('invalid-row');
  const label = normalizeString(row.label ?? `Task ${index + 1}`, { required: true, maxLength: TEXT_LIMITS.label });
  if (!label.ok) return fail('invalid-label');
  const kind = row.kind == null ? 'task' : String(row.kind).trim().toLowerCase();
  if (kind === 'milestone') {
    const date = normalizeDateString(row.date, { required: true });
    if (!date.ok) return fail('invalid-date');
    return { ok: true, value: { label: label.value, kind: 'milestone', date: date.value } };
  }
  if (kind !== 'task') return fail('invalid-kind');
  const start = normalizeDateString(row.start, { required: true });
  const end = normalizeDateString(row.end, { required: true });
  const progress = normalizeNumber(row.progress ?? 0, { required: true });
  const group = normalizeString(row.group, { maxLength: TEXT_LIMITS.category });
  if (!start.ok || !end.ok) return fail('invalid-date');
  if (Date.parse(`${end.value}T00:00:00Z`) < Date.parse(`${start.value}T00:00:00Z`)) return fail('invalid-date-range');
  if (!progress.ok || progress.value < 0 || progress.value > 100) return fail('invalid-progress');
  if (!group.ok) return fail('invalid-group');
  return {
    ok: true,
    value: {
      label: label.value,
      kind: 'task',
      start: start.value,
      end: end.value,
      progress: progress.value,
      ...(group.value ? { group: group.value } : {})
    }
  };
};

const normalizeRadarRows = (rows, series, min, max) => {
  const normalized = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!isRecord(row)) return fail('invalid-row', { rowIndex: index });
    const label = normalizeString(row.label, { required: true, maxLength: TEXT_LIMITS.label });
    if (!label.ok) return fail('invalid-label', { rowIndex: index });
    const next = { label: label.value };
    if (series) {
      for (const item of series) {
        const value = normalizeNumber(row[item.key], { required: true });
        if (!value.ok) return fail('invalid-value', { rowIndex: index, seriesKey: item.key });
        next[item.key] = Math.min(max, Math.max(min, value.value));
      }
    } else {
      const value = normalizeNumber(row.value, { required: true });
      if (!value.ok) return fail('invalid-value', { rowIndex: index });
      next.value = Math.min(max, Math.max(min, value.value));
    }
    normalized.push(next);
  }
  return { ok: true, value: normalized };
};

const copyTextFields = (input, normalized, keys) => {
  for (const key of keys) {
    const field = normalizeString(input[key], { maxLength: TEXT_LIMITS[key] || 120 });
    if (!field.ok) return fail(`invalid-${key}`);
    if (field.value) normalized[key] = field.value;
  }
  return { ok: true };
};

const legacySeriesKey = (index) => `series${index + 1}`;

const legacyLabelValueRows = (labels, values) => {
  if (!Array.isArray(labels) || !Array.isArray(values) || labels.length !== values.length) return null;
  return labels.map((label, index) => ({ label, value: values[index] }));
};

// Models commonly know the Chart.js-shaped `data.labels/datasets` format. The
// message chart API intentionally uses a smaller schema, so translate only
// recognized legacy shapes before applying the normal strict validation.
const adaptLegacyNestedSchema = (input) => {
  if (!isRecord(input) || !isRecord(input.data)) return input;
  const payload = input.data;
  const datasets = Array.isArray(payload.datasets) ? payload.datasets.filter(isRecord) : [];
  const firstDataset = datasets[0];
  const labels = Array.isArray(payload.labels) ? payload.labels : null;
  const adapted = { ...input };

  if (['bar', 'line', 'area', 'donut'].includes(input.type)) {
    const rows = legacyLabelValueRows(labels, firstDataset?.data);
    if (rows) adapted.data = rows;
  } else if (input.type === 'stackedBar' && labels && datasets.length) {
    adapted.series = datasets.map((dataset, index) => ({
      key: legacySeriesKey(index),
      label: dataset.label ?? `Series ${index + 1}`
    }));
    adapted.data = labels.map((label, labelIndex) => {
      const row = { label };
      datasets.forEach((dataset, datasetIndex) => {
        row[legacySeriesKey(datasetIndex)] = Array.isArray(dataset.data) ? dataset.data[labelIndex] : undefined;
      });
      return row;
    });
  } else if (['scatter', 'bubble'].includes(input.type) && datasets.length) {
    adapted.data = datasets.flatMap((dataset, datasetIndex) => (
      Array.isArray(dataset.data)
        ? dataset.data.map((point, pointIndex) => ({
          ...(isRecord(point) ? point : {}),
          label: isRecord(point) && point.label != null
            ? point.label
            : `${dataset.label ?? `Series ${datasetIndex + 1}`} ${pointIndex + 1}`,
          ...(input.type === 'bubble' && isRecord(point) && point.size == null && point.r != null ? { size: point.r } : {})
        }))
        : []
    ));
  } else if (input.type === 'histogram' && Array.isArray(payload.bins) && Array.isArray(firstDataset?.data)) {
    if (payload.bins.length === firstDataset.data.length + 1) {
      adapted.bins = firstDataset.data.map((count, index) => ({
        label: `${payload.bins[index]}–${payload.bins[index + 1]}`,
        min: payload.bins[index],
        max: payload.bins[index + 1],
        count
      }));
    }
  } else if (input.type === 'boxplot' && labels && Array.isArray(firstDataset?.data)) {
    adapted.data = firstDataset.data.map((summary, index) => ({
      ...(isRecord(summary) ? summary : {}),
      label: labels[index] ?? `Group ${index + 1}`
    }));
  } else if (input.type === 'heatmap' && Array.isArray(payload.xLabels) && Array.isArray(payload.yLabels)) {
    const matrix = firstDataset?.data;
    if (Array.isArray(matrix)) {
      adapted.data = payload.yLabels.flatMap((y, yIndex) => (
        Array.isArray(matrix[yIndex])
          ? payload.xLabels.map((x, xIndex) => ({ x, y, value: matrix[yIndex][xIndex] }))
          : []
      ));
    }
  } else if (input.type === 'radar' && labels && datasets.length) {
    if (datasets.length === 1) {
      adapted.data = legacyLabelValueRows(labels, firstDataset.data) ?? payload;
    } else {
      adapted.series = datasets.map((dataset, index) => ({
        key: legacySeriesKey(index),
        label: dataset.label ?? `Series ${index + 1}`
      }));
      adapted.data = labels.map((label, labelIndex) => {
        const row = { label };
        datasets.forEach((dataset, datasetIndex) => {
          row[legacySeriesKey(datasetIndex)] = Array.isArray(dataset.data) ? dataset.data[labelIndex] : undefined;
        });
        return row;
      });
    }
  } else if (input.type === 'funnel' && Array.isArray(payload.stages)) {
    const rows = legacyLabelValueRows(payload.stages, firstDataset?.data);
    if (rows) adapted.data = rows;
  } else if (input.type === 'waterfall' && labels && Array.isArray(firstDataset?.data)) {
    const rows = legacyLabelValueRows(labels, firstDataset.data);
    if (rows) adapted.data = rows.map((row, index) => ({
      ...row,
      kind: index === 0 ? 'start' : (index === rows.length - 1 ? 'end' : 'delta')
    }));
  } else if (input.type === 'sankey' && Array.isArray(payload.nodes) && Array.isArray(payload.links)) {
    adapted.nodes = payload.nodes;
    adapted.links = payload.links;
  } else if (input.type === 'gantt' && Array.isArray(payload.tasks)) {
    adapted.data = payload.tasks.map((task) => ({
      ...(isRecord(task) ? task : {}),
      label: isRecord(task) ? (task.label ?? task.name) : undefined
    }));
  } else if (input.type === 'kpi' && Array.isArray(payload.indicators)) {
    adapted.data = payload.indicators.map((indicator) => ({
      ...(isRecord(indicator) ? indicator : {}),
      ...(isRecord(indicator) && indicator.delta == null && indicator.change != null ? { delta: indicator.change } : {})
    }));
  } else if (input.type === 'gauge') {
    Object.assign(adapted, payload);
  }

  return adapted;
};

export function normalizeChartSchema(input, options = {}) {
  input = adaptLegacyNestedSchema(input);
  if (!isRecord(input)) return fail('invalid-chart');
  const type = normalizeString(input.type, { required: true, maxLength: 20 });
  if (!type.ok || !CHART_TYPES.has(type.value)) return fail('invalid-type');
  const normalized = { type: type.value };
  const copied = copyTextFields(input, normalized, ['title', 'description', 'xLabel', 'yLabel', 'sizeLabel', 'unit']);
  if (!copied.ok) return copied;
  const maxDataPoints = options.maxDataPoints || DEFAULT_MAX_DATA_POINTS;

  if (type.value === 'sankey') {
    const result = normalizeSankey(input, maxDataPoints);
    if (!result.ok) return result;
    normalized.nodes = result.value.nodes;
    normalized.links = result.value.links;
  } else if (type.value === 'gauge') {
    const label = normalizeString(input.label ?? input.title ?? 'Value', { required: true, maxLength: TEXT_LIMITS.label });
    const value = normalizeNumber(input.value, { required: true });
    const min = normalizeNumber(input.min ?? 0, { required: true });
    const max = normalizeNumber(input.max ?? 100, { required: true });
    if (!label.ok) return fail('invalid-label');
    if (!value.ok) return fail('invalid-value');
    if (!min.ok || !max.ok || max.value <= min.value) return fail('invalid-range');
    normalized.label = label.value;
    normalized.min = min.value;
    normalized.max = max.value;
    normalized.value = Math.min(max.value, Math.max(min.value, value.value));
  } else if (type.value === 'histogram') {
    const sourceBins = Array.isArray(input.bins) ? input.bins : null;
    if (sourceBins) {
      if (!sourceBins.length) return fail('empty-data');
      if (sourceBins.length > maxDataPoints) return fail('too-many-data-points', { maxDataPoints });
      normalized.data = [];
      for (let index = 0; index < sourceBins.length; index += 1) {
        const bin = normalizeHistogramBin(sourceBins[index], index);
        if (!bin.ok) return fail(bin.reason, { rowIndex: index });
        normalized.data.push(bin.value);
      }
    } else {
      if (!Array.isArray(input.data) || !input.data.length) return fail(Array.isArray(input.data) ? 'empty-data' : 'invalid-data');
      if (input.data.length > maxDataPoints) return fail('too-many-data-points', { maxDataPoints });
      const values = input.data.map((item) => normalizeNumber(isRecord(item) ? item.value : item, { required: true }));
      const invalidIndex = values.findIndex((item) => !item.ok);
      if (invalidIndex >= 0) return fail('invalid-value', { rowIndex: invalidIndex });
      normalized.data = createHistogramBins(values.map((item) => item.value));
    }
    normalized.bins = normalized.data.map(({ index, value, ...bin }) => bin);
  } else {
    if (!Array.isArray(input.data)) return fail('invalid-data');
    if (!input.data.length) return fail('empty-data');
    if (input.data.length > maxDataPoints) return fail('too-many-data-points', { maxDataPoints });
      if (type.value === 'radar') {
      const min = normalizeNumber(input.min ?? 0, { required: true });
      const max = normalizeNumber(input.max ?? 100, { required: true });
      if (!min.ok || !max.ok || max.value <= min.value) return fail('invalid-range');
      const series = input.series == null ? null : normalizeSeries(input.series);
      if (series && !series.ok) return series;
      const rows = normalizeRadarRows(input.data, series?.value, min.value, max.value);
      if (!rows.ok) return rows;
      normalized.min = min.value;
      normalized.max = max.value;
      if (series) normalized.series = series.value;
      normalized.data = rows.value;
      } else if (type.value === 'stackedBar') {
      const series = normalizeSeries(input.series);
      if (!series.ok) return series;
      const rows = normalizeStackedRows(input.data, series.value);
      if (!rows.ok) return rows;
      normalized.series = series.value;
      normalized.data = rows.value;
      } else if (type.value === 'boxplot') {
        normalized.data = [];
        for (let index = 0; index < input.data.length; index += 1) {
          const row = normalizeBoxplotRow(input.data[index], index);
          if (!row.ok) return fail(row.reason, { rowIndex: index });
          normalized.data.push(row.value);
        }
      } else if (type.value === 'gantt') {
        normalized.data = [];
        for (let index = 0; index < input.data.length; index += 1) {
          const row = normalizeGanttRow(input.data[index], index);
          if (!row.ok) return fail(row.reason, { rowIndex: index });
          normalized.data.push(row.value);
        }
      } else {
      normalized.data = [];
      for (let index = 0; index < input.data.length; index += 1) {
        const source = input.data[index];
        if (!isRecord(source)) return fail('invalid-row', { rowIndex: index });
        for (const key of type.value === 'heatmap' ? ['value'] : ['value', 'x', 'y']) {
          if (hasOwn(source, key) && !normalizeNumber(source[key], { required: true }).ok) {
            return fail(`invalid-${key}`, { rowIndex: index });
          }
        }
        let row;
        if (type.value === 'bar') row = normalizeBarRow(source);
        else if (type.value === 'donut') row = normalizeDonutRow(source, index);
        else if (type.value === 'scatter') row = normalizeScatterRow(source, index);
        else if (type.value === 'bubble') row = normalizeScatterRow(source, index, { bubble: true });
        else if (type.value === 'kpi') row = normalizeKpiRow(source, index, normalized.unit);
        else if (type.value === 'heatmap') row = normalizeHeatmapRow(source);
        else if (type.value === 'treemap') row = normalizeTreemapRow(source);
        else if (type.value === 'funnel') {
          row = normalizeBarRow(source);
          if (row.ok && row.value.value < 0) row = fail('invalid-value');
        }
        else if (type.value === 'waterfall') row = normalizeWaterfallRow(source);
        else row = normalizeLineRow(source);
        if (!row.ok) return fail(row.reason, { rowIndex: index });
        normalized.data.push(row.value);
      }
      if (type.value === 'kpi' && normalized.data.length > 4) return fail('too-many-kpis', { maxDataPoints: 4 });
    }
  }

  const colors = normalizeColors(input.colors);
  if (colors) normalized.colors = colors;
  return { ok: true, chart: normalized };
}

export function parseAndNormalizeChartSchema(source, options = {}) {
  try {
    return normalizeChartSchema(JSON.parse(String(source || '')), options);
  } catch {
    return fail('malformed-json');
  }
}

export const SUPPORTED_CHART_TYPES = Object.freeze([...CHART_TYPES]);
