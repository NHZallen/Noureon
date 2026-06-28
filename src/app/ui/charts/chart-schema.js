const CHART_TYPES = new Set(['scatter', 'bar', 'line', 'donut']);
const DEFAULT_MAX_DATA_POINTS = 200;
const TEXT_LIMITS = Object.freeze({
  title: 120,
  description: 500,
  xLabel: 80,
  yLabel: 80,
  unit: 40,
  label: 120,
  category: 120
});
const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeString = (value, { required = false, maxLength = 120 } = {}) => {
  if (value == null) {
    return required ? { ok: false, reason: 'missing-string' } : { ok: true, value: undefined };
  }
  const text = String(value).trim();
  if (required && !text) return { ok: false, reason: 'empty-string' };
  if (text.length > maxLength) return { ok: false, reason: 'string-too-long' };
  return { ok: true, value: text };
};

const normalizeOptionalStringField = (source, key) => {
  const result = normalizeString(source[key], {
    required: false,
    maxLength: TEXT_LIMITS[key] || 120
  });
  if (!result.ok) return result;
  return { ok: true, key, value: result.value };
};

const normalizeNumber = (value, { required = false } = {}) => {
  if (value == null || (typeof value === 'string' && value.trim() === '')) {
    return required ? { ok: false, reason: 'missing-number' } : { ok: true, value: undefined };
  }
  const numberValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numberValue)) return { ok: false, reason: 'invalid-number' };
  return { ok: true, value: numberValue };
};

const normalizeOptionalNumberField = (source, key) => {
  if (!hasOwn(source, key)) return { ok: true, value: undefined };
  return normalizeNumber(source[key], { required: true });
};

const normalizeCategory = (row) => {
  if (!hasOwn(row, 'category')) return { ok: true, value: undefined };
  return normalizeString(row.category, {
    required: false,
    maxLength: TEXT_LIMITS.category
  });
};

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
    if (palette.length > 0) normalized.palette = palette;
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
};

const fail = (reason, details = {}) => ({
  ok: false,
  reason,
  ...details
});

const normalizeBarRow = (row) => {
  const label = normalizeString(row.label, { required: true, maxLength: TEXT_LIMITS.label });
  if (!label.ok) return fail('invalid-label');
  const value = normalizeNumber(row.value, { required: true });
  if (!value.ok) return fail('invalid-value');
  const category = normalizeCategory(row);
  if (!category.ok) return fail('invalid-category');
  return {
    ok: true,
    value: {
      label: label.value,
      value: value.value,
      ...(category.value ? { category: category.value } : {})
    }
  };
};

const normalizeDonutRow = (row, index) => {
  const value = normalizeNumber(row.value, { required: true });
  if (!value.ok) return fail('invalid-value');
  const label = normalizeString(row.label ?? row.category ?? `Segment ${index + 1}`, {
    required: true,
    maxLength: TEXT_LIMITS.label
  });
  if (!label.ok) return fail('invalid-label');
  const category = normalizeCategory(row);
  if (!category.ok) return fail('invalid-category');
  return {
    ok: true,
    value: {
      label: label.value,
      value: value.value,
      ...(category.value ? { category: category.value } : {})
    }
  };
};

const normalizeScatterRow = (row, index) => {
  const x = normalizeNumber(row.x, { required: true });
  if (!x.ok) return fail('invalid-x');
  const y = normalizeNumber(row.y, { required: true });
  if (!y.ok) return fail('invalid-y');
  const label = normalizeString(row.label ?? `Point ${index + 1}`, {
    required: true,
    maxLength: TEXT_LIMITS.label
  });
  if (!label.ok) return fail('invalid-label');
  const category = normalizeCategory(row);
  if (!category.ok) return fail('invalid-category');
  const value = normalizeOptionalNumberField(row, 'value');
  if (!value.ok) return fail('invalid-value');
  return {
    ok: true,
    value: {
      label: label.value,
      x: x.value,
      y: y.value,
      ...(value.value !== undefined ? { value: value.value } : {}),
      ...(category.value ? { category: category.value } : {})
    }
  };
};

const normalizeLineRow = (row) => {
  const hasLabelValue = hasOwn(row, 'label') && hasOwn(row, 'value');
  const hasXY = hasOwn(row, 'x') && hasOwn(row, 'y');
  if (!hasLabelValue && !hasXY) return fail('missing-line-coordinates');

  if (hasLabelValue) {
    const label = normalizeString(row.label, { required: true, maxLength: TEXT_LIMITS.label });
    if (!label.ok) return fail('invalid-label');
    const value = normalizeNumber(row.value, { required: true });
    if (!value.ok) return fail('invalid-value');
    const category = normalizeCategory(row);
    if (!category.ok) return fail('invalid-category');
    return {
      ok: true,
      value: {
        label: label.value,
        value: value.value,
        ...(category.value ? { category: category.value } : {})
      }
    };
  }

  const x = normalizeNumber(row.x, { required: true });
  if (!x.ok) return fail('invalid-x');
  const y = normalizeNumber(row.y, { required: true });
  if (!y.ok) return fail('invalid-y');
  const label = normalizeString(row.label ?? String(row.x), {
    required: true,
    maxLength: TEXT_LIMITS.label
  });
  if (!label.ok) return fail('invalid-label');
  const category = normalizeCategory(row);
  if (!category.ok) return fail('invalid-category');
  return {
    ok: true,
    value: {
      label: label.value,
      x: x.value,
      y: y.value,
      ...(category.value ? { category: category.value } : {})
    }
  };
};

const normalizeDataRow = (type, row, index) => {
  if (!isRecord(row)) return fail('invalid-row');
  for (const key of ['value', 'x', 'y']) {
    if (hasOwn(row, key) && !normalizeNumber(row[key], { required: true }).ok) {
      return fail(`invalid-${key}`);
    }
  }
  if (type === 'bar') return normalizeBarRow(row, index);
  if (type === 'donut') return normalizeDonutRow(row, index);
  if (type === 'scatter') return normalizeScatterRow(row, index);
  return normalizeLineRow(row, index);
};

export function normalizeChartSchema(input, options = {}) {
  if (!isRecord(input)) return fail('invalid-chart');
  const type = normalizeString(input.type, { required: true, maxLength: 20 });
  if (!type.ok || !CHART_TYPES.has(type.value)) return fail('invalid-type');

  if (!Array.isArray(input.data)) return fail('invalid-data');
  if (input.data.length === 0) return fail('empty-data');
  const maxDataPoints = options.maxDataPoints || DEFAULT_MAX_DATA_POINTS;
  if (input.data.length > maxDataPoints) return fail('too-many-data-points', { maxDataPoints });

  const normalized = {
    type: type.value,
    data: []
  };

  for (const key of ['title', 'description', 'xLabel', 'yLabel', 'unit']) {
    const field = normalizeOptionalStringField(input, key);
    if (!field.ok) return fail(`invalid-${key}`);
    if (field.value) normalized[key] = field.value;
  }

  for (let index = 0; index < input.data.length; index += 1) {
    const row = normalizeDataRow(normalized.type, input.data[index], index);
    if (!row.ok) return fail(row.reason, { rowIndex: index });
    normalized.data.push(row.value);
  }

  const colors = normalizeColors(input.colors);
  if (colors) normalized.colors = colors;

  return {
    ok: true,
    chart: normalized
  };
}

export function parseAndNormalizeChartSchema(source, options = {}) {
  try {
    return normalizeChartSchema(JSON.parse(String(source || '')), options);
  } catch {
    return fail('malformed-json');
  }
}

export const SUPPORTED_CHART_TYPES = Object.freeze([...CHART_TYPES]);
