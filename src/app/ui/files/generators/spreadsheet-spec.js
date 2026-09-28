// What the model writes for a .xlsx file → a normalised workbook. Accepts the
// JSON spec from the authoring guidance, one or more Markdown tables (a "##"
// heading before a table names its sheet) or CSV/TSV. The Excel writer and
// the sheet preview both render the result, so they always agree.
//
// Safety: text is never a formula; formulas only come from an explicit
// "formula" field and are checked against FORMULA_POLICY (no external data,
// DDE or other workbooks). Sizes are bounded by SHEET_LIMITS.

import { parseRelaxedJson } from '../design/relaxed-json.js';
import { parseHexColor } from '../design/color.js';
import { parseDelimited } from './text-file.js';

export const SHEET_LIMITS = Object.freeze({ sheets: 20, rows: 10000, columns: 100, cells: 200000, text: 32767, formula: 2000, name: 31, format: 60 });

export class SpreadsheetSpecError extends Error {
  constructor(reason) {
    super(`spreadsheet could not be read (${reason})`);
    this.name = 'SpreadsheetSpecError';
    this.reason = reason;
  }
}

// ------------------------------------------------------------ formulas

// Functions that reach outside the workbook (web requests, add-ins, system
// information) or run code. HYPERLINK is allowed only to web and mail links.
const BLOCKED_FUNCTIONS = /\b(?:WEBSERVICE|FILTERXML|RTD|CALL|REGISTER\.ID|REGISTER|EXEC|EXECUTE|IMAGE|INFO|CELL|DDE|SQL\.REQUEST)\s*\(/i;
const outsideStrings = (formula) => formula.replace(/"(?:[^"]|"")*"/g, '""');

/** Returns the formula without its leading "=", or null when it is refused. */
export function sanitizeFormula(value) {
  const formula = String(value ?? '').trim().replace(/^=+/, '').trim();
  if (!formula || formula.length > SHEET_LIMITS.formula) return null;
  const code = outsideStrings(formula);
  if (BLOCKED_FUNCTIONS.test(code)) return null;
  // DDE ("cmd|' /c calc'!A0") and references to other workbooks ([Book]Sheet!A1).
  if (/[|[\]]/.test(code) || /\bfile:/i.test(formula)) return null;
  if (/\bHYPERLINK\s*\(/i.test(code) && !/\bHYPERLINK\s*\(\s*"(?:https?:\/\/|mailto:)/i.test(formula)) return null;
  return formula;
}

// ------------------------------------------------------------ values

const CURRENCY_FORMATS = Object.freeze({
  TWD: '"NT$"#,##0', USD: '"$"#,##0.00', EUR: '#,##0.00 "€"', GBP: '"£"#,##0.00', JPY: '"¥"#,##0', CNY: '"¥"#,##0.00',
  HKD: '"HK$"#,##0.00', KRW: '"₩"#,##0', RUB: '#,##0.00 "₽"', SGD: '"S$"#,##0.00'
});
const CURRENCY_SYMBOLS = Object.freeze([['NT$', 'TWD'], ['US$', 'USD'], ['HK$', 'HKD'], ['S$', 'SGD'], ['$', 'USD'], ['€', 'EUR'], ['£', 'GBP'], ['¥', 'JPY'], ['₩', 'KRW'], ['₽', 'RUB'], ['元', 'TWD']]);
const NAMED_FORMATS = Object.freeze({
  text: '@', string: '@', general: null, number: '#,##0.##', integer: '#,##0', int: '#,##0', decimal: '#,##0.00', float: '#,##0.00',
  percent: '0.0%', percentage: '0.0%', '%': '0.0%', date: 'yyyy-mm-dd', datetime: 'yyyy-mm-dd hh:mm', time: 'hh:mm', currency: '#,##0.00', money: '#,##0.00', year: '0'
});
const SAFE_FORMAT = /^[0-9#,.%$¥€£₩₽ "()\-+[\]/:;@*A-Za-z\\_一-鿿]+$/;

/** An Excel number format from a name ("percent"), a currency code or a format string. */
export function normalizeFormat(value, { currency } = {}) {
  const code = String(currency || '').trim().toUpperCase();
  if (CURRENCY_FORMATS[code]) return CURRENCY_FORMATS[code];
  if (value == null || value === '') return undefined;
  const text = String(value).trim();
  const named = NAMED_FORMATS[text.toLowerCase()];
  if (named !== undefined) return named || undefined;
  if (CURRENCY_FORMATS[text.toUpperCase()]) return CURRENCY_FORMATS[text.toUpperCase()];
  return text.length <= SHEET_LIMITS.format && SAFE_FORMAT.test(text) ? text : undefined;
}

const decimalsOf = (digits) => (digits.includes('.') ? digits.split('.')[1].length : 0);

/**
 * Reads text the way a person means it: "1,234", "−3.2%", "NT$ 1,200",
 * "(500)" and ISO dates. Returns null for anything else, including numbers
 * with leading zeros (codes, phone numbers stay text).
 */
export function parseValueText(input) {
  const text = String(input ?? '').trim().replace(/[−‒–]/g, '-').replace(/ /g, ' ');
  if (!text) return null;
  const date = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(text);
  if (date) {
    const [year, month, day] = date.slice(1).map(Number);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return { kind: 'date', value: new Date(Date.UTC(year, month - 1, day)) };
  }
  let rest = text;
  let currency = null;
  for (const [symbol, code] of CURRENCY_SYMBOLS) {
    if (rest.startsWith(symbol) || rest.startsWith(`-${symbol}`)) {
      currency = code;
      rest = rest.startsWith('-') ? `-${rest.slice(1 + symbol.length)}` : rest.slice(symbol.length);
      break;
    }
    if (rest.endsWith(symbol)) {
      currency = code;
      rest = rest.slice(0, -symbol.length);
      break;
    }
  }
  rest = rest.trim();
  const code = /^([A-Z]{3})\s+(.+)$/.exec(rest) || /^(.+?)\s+([A-Z]{3})$/.exec(rest);
  if (!currency && code && CURRENCY_FORMATS[code[1]] && /\d/.test(code[2])) { currency = code[1]; rest = code[2]; }
  if (!currency && code && CURRENCY_FORMATS[code[2]] && /\d/.test(code[1])) { currency = code[2]; rest = code[1]; }
  let negative = false;
  if (/^\(.*\)$/.test(rest)) { negative = true; rest = rest.slice(1, -1).trim(); }
  if (/^[+-]/.test(rest)) { negative = negative !== (rest[0] === '-'); rest = rest.slice(1).trim(); }
  const percent = rest.endsWith('%');
  if (percent) rest = rest.slice(0, -1).trim();
  const grouped = /^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(rest);
  const plain = /^\d+(?:\.\d+)?$/.test(rest) || /^\.\d+$/.test(rest);
  if (!grouped && !plain) return null;
  const digits = rest.replace(/,/g, '');
  if (/^0\d/.test(digits)) return null;
  let value = Number(digits);
  if (!Number.isFinite(value)) return null;
  if (negative) value = -value;
  const decimals = decimalsOf(digits);
  if (percent) return { kind: 'percent', value: value / 100, decimals };
  return { kind: currency ? 'currency' : 'number', value, decimals, currency, grouped };
}

// ------------------------------------------------------------ cells

const TEXT_LIMIT = (value) => String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, SHEET_LIMITS.text);
const ALIGN = new Set(['left', 'center', 'right']);

function styleOf(source) {
  const style = {};
  if (source.bold === true) style.bold = true;
  if (source.italic === true) style.italic = true;
  if (source.wrap === true) style.wrap = true;
  const fill = parseHexColor(source.fill ?? source.background ?? source.backgroundColor);
  if (fill) style.fill = fill;
  const color = parseHexColor(source.color ?? source.textColor);
  if (color) style.color = color;
  const align = String(source.align ?? '').toLowerCase();
  if (ALIGN.has(align)) style.align = align;
  return style;
}

const EMPTY = Object.freeze({ type: 'empty' });

/** One cell from what the model wrote: a raw value or { value, formula, … }. */
function normalizeCell(raw, { repairs, where }) {
  if (raw == null || raw === '') return EMPTY;
  if (typeof raw === 'number') return Number.isFinite(raw) ? { type: 'number', value: raw } : EMPTY;
  if (typeof raw === 'boolean') return { type: 'boolean', value: raw };
  if (typeof raw === 'string') return { type: 'string', value: TEXT_LIMIT(raw), inferable: true };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { type: 'string', value: TEXT_LIMIT(JSON.stringify(raw)) };
  const style = styleOf(raw);
  const format = normalizeFormat(raw.format ?? raw.numberFormat, { currency: raw.currency });
  const extra = { ...(format ? { format } : {}), ...(Object.keys(style).length ? { style } : {}) };
  const span = { columnSpan: Number.isInteger(raw.colspan ?? raw.columnSpan) ? raw.colspan ?? raw.columnSpan : undefined, rowSpan: Number.isInteger(raw.rowspan ?? raw.rowSpan) ? raw.rowspan ?? raw.rowSpan : undefined };
  const written = raw.formula ?? (typeof raw.value === 'string' && raw.value.trim().startsWith('=') && raw.type === 'formula' ? raw.value : undefined);
  if (written !== undefined) {
    const formula = sanitizeFormula(written);
    if (formula) return { type: 'formula', formula, ...extra, span };
    repairs.push({ code: 'formula-refused', where, formula: String(written).slice(0, 80) });
    return { type: 'string', value: TEXT_LIMIT(String(written)), ...extra, span };
  }
  const inner = normalizeCell(raw.value ?? null, { repairs, where });
  return { ...inner, ...extra, span };
}

// ------------------------------------------------------------ columns

function normalizeColumn(raw, index) {
  if (raw == null || typeof raw !== 'object') return { header: raw == null ? '' : TEXT_LIMIT(String(raw)), key: raw == null ? String(index) : String(raw) };
  const header = raw.header ?? raw.name ?? raw.title ?? raw.label ?? raw.key ?? '';
  const width = Number(raw.width);
  return {
    header: TEXT_LIMIT(String(header)),
    key: String(raw.key ?? header),
    width: Number.isFinite(width) && width > 0 ? Math.min(80, Math.max(4, width)) : undefined,
    format: normalizeFormat(raw.format ?? raw.type ?? raw.numberFormat, { currency: raw.currency }),
    ...(ALIGN.has(String(raw.align ?? '').toLowerCase()) ? { align: String(raw.align).toLowerCase() } : {})
  };
}

// Text columns of numbers ("1,234", "12%") become numbers when most of their
// cells read as one; the format follows what was written.
function inferColumn(sheet, columnIndex) {
  const column = sheet.columns[columnIndex];
  const cells = sheet.rows.map((row) => row[columnIndex]).filter((cell) => cell && cell.type === 'string' && cell.inferable && cell.value.trim() !== '' && !/^[-–—]$/.test(cell.value.trim()));
  if (!cells.length) return;
  const parsed = cells.map((cell) => parseValueText(cell.value));
  const readable = parsed.filter(Boolean);
  const numericFormat = column.format && column.format !== '@';
  if (column.format === '@' || (!numericFormat && readable.length < Math.max(1, Math.ceil(cells.length * 0.8)))) return;
  const kinds = new Set(readable.map((entry) => entry.kind));
  if (kinds.has('date') && kinds.size > 1) return;
  const decimals = Math.min(4, Math.max(0, ...readable.map((entry) => entry.decimals || 0)));
  if (!column.format) {
    const currency = readable.find((entry) => entry.currency)?.currency;
    if (kinds.has('date')) column.format = 'yyyy-mm-dd';
    else if ([...kinds].every((kind) => kind === 'percent')) column.format = decimals ? `0.${'0'.repeat(decimals)}%` : '0%';
    else if (currency && CURRENCY_FORMATS[currency]) column.format = decimals && !CURRENCY_FORMATS[currency].includes('.') ? CURRENCY_FORMATS[currency].replace('#,##0', `#,##0.${'0'.repeat(decimals)}`) : CURRENCY_FORMATS[currency];
    else if (readable.every((entry) => entry.kind === 'number' && !entry.grouped && !entry.decimals && entry.value >= 1900 && entry.value <= 2100)) column.format = '0';
    else column.format = decimals ? `#,##0.${'0'.repeat(decimals)}` : '#,##0';
  }
  sheet.rows.forEach((row) => {
    const cell = row[columnIndex];
    if (!cell || cell.type !== 'string' || !cell.inferable) return;
    const entry = parseValueText(cell.value);
    if (!entry) return;
    row[columnIndex] = { ...cell, type: entry.kind === 'date' ? 'date' : 'number', value: entry.value, inferable: undefined };
  });
}

// ------------------------------------------------------------ sheets

const cellAddress = (row, column) => {
  let name = '';
  for (let index = column + 1; index > 0; index = Math.floor((index - 1) / 26)) name = String.fromCharCode(65 + ((index - 1) % 26)) + name;
  return `${name}${row + 1}`;
};
export { cellAddress };

export function parseCellAddress(address) {
  const match = /^\$?([A-Z]{1,3})\$?(\d{1,7})$/i.exec(String(address || '').trim());
  if (!match) return null;
  const column = [...match[1].toUpperCase()].reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
  return { row: Number(match[2]) - 1, column };
}

function sheetName(raw, index, used) {
  let name = String(raw ?? '').replace(/[[\]:*?/\\]/g, ' ').replace(/^'+|'+$/g, '').trim().slice(0, SHEET_LIMITS.name) || `Sheet${index + 1}`;
  const base = name;
  for (let copy = 2; used.has(name.toLowerCase()); copy += 1) name = `${base.slice(0, SHEET_LIMITS.name - 4)} (${copy})`;
  used.add(name.toLowerCase());
  return name;
}

function parseFreeze(raw) {
  if (raw === false || raw === 0) return { rows: 0, columns: 0 };
  if (raw === true || raw == null) return { rows: 1, columns: 0 };
  if (typeof raw === 'number') return { rows: Math.max(0, Math.floor(raw)), columns: 0 };
  if (typeof raw === 'string') {
    const cell = parseCellAddress(raw);
    return cell ? { rows: cell.row, columns: cell.column } : { rows: 1, columns: 0 };
  }
  return { rows: Math.max(0, Math.floor(Number(raw.rows ?? raw.row ?? 1)) || 0), columns: Math.max(0, Math.floor(Number(raw.columns ?? raw.column ?? raw.cols ?? 0)) || 0) };
}

function parseMerges(raw, sheet, repairs) {
  const merges = [];
  const list = Array.isArray(raw) ? raw : [];
  const rowCount = sheet.rows.length + 1;
  for (const entry of list) {
    const text = typeof entry === 'string' ? entry : entry?.range ?? (entry?.from && entry?.to ? `${entry.from}:${entry.to}` : '');
    const [from, to] = String(text).split(':').map(parseCellAddress);
    if (!from || !to) continue;
    const merge = { row: Math.min(from.row, to.row), column: Math.min(from.column, to.column), rowSpan: Math.abs(to.row - from.row) + 1, columnSpan: Math.abs(to.column - from.column) + 1 };
    const inside = merge.row + merge.rowSpan <= rowCount && merge.column + merge.columnSpan <= sheet.columns.length;
    const overlaps = merges.some((other) => merge.row < other.row + other.rowSpan && other.row < merge.row + merge.rowSpan && merge.column < other.column + other.columnSpan && other.column < merge.column + merge.columnSpan);
    if (!inside || overlaps || merge.rowSpan * merge.columnSpan < 2) { repairs.push({ code: 'merge-dropped', range: text }); continue; }
    merges.push(merge);
  }
  // Spans written on cells ({ "colspan": 2 }) are merges too.
  sheet.rows.forEach((row, rowIndex) => row.forEach((cell, column) => {
    const columnSpan = Math.min(cell.span?.columnSpan || 1, sheet.columns.length - column);
    const rowSpan = Math.min(cell.span?.rowSpan || 1, rowCount - (rowIndex + 1));
    if (columnSpan * rowSpan >= 2) {
      const merge = { row: rowIndex + 1, column, rowSpan, columnSpan };
      if (!merges.some((other) => merge.row < other.row + other.rowSpan && other.row < merge.row + merge.rowSpan && merge.column < other.column + other.columnSpan && other.column < merge.column + merge.columnSpan)) merges.push(merge);
    }
  }));
  return merges;
}

// ------------------------------------------------------------ charts

const CHART_TYPES = Object.freeze({
  column: 'column', col: 'column', bar: 'column', vertical: 'column', verticalbar: 'column', columns: 'column',
  horizontalbar: 'bar', barh: 'bar', hbar: 'bar', horizontal: 'bar', row: 'bar',
  line: 'line', lines: 'line', area: 'area', pie: 'pie', doughnut: 'doughnut', donut: 'doughnut', ring: 'doughnut',
  scatter: 'scatter', xy: 'scatter', radar: 'radar', spider: 'radar'
});
const MAX_CHARTS = 10;
const MAX_CHART_SERIES = 12;
const RANGE = /^\s*(?:'?[^'!]*'?!)?\$?([A-Z]{1,3})\$?(\d+)\s*:\s*\$?([A-Z]{1,3})\$?(\d+)\s*$/i;

const columnIndex = (letters) => [...letters.toUpperCase()].reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0) - 1;

// A column named by letter ("B"), by header ("營收") or by number (2 = B).
function resolveChartColumn(reference, sheet) {
  if (typeof reference === 'number' && Number.isInteger(reference)) return reference >= 1 && reference <= sheet.columns.length ? reference - 1 : null;
  const text = String(reference ?? '').trim();
  if (!text) return null;
  const range = RANGE.exec(text);
  if (range) return columnIndex(range[1]);
  const byHeader = sheet.columns.findIndex((column) => String(column.header).trim().toLowerCase() === text.toLowerCase() || column.key === text);
  if (byHeader >= 0) return byHeader;
  if (/^[A-Z]{1,3}$/i.test(text)) {
    const index = columnIndex(text);
    return index < sheet.columns.length ? index : null;
  }
  return null;
}

// Data rows as sheet row numbers ("2:9", "2-9", [2, 9]); row 1 is the header.
function resolveChartRows(raw, sheet) {
  let first;
  let last;
  if (Array.isArray(raw)) [first, last] = raw.map(Number);
  else if (typeof raw === 'string') {
    const range = RANGE.exec(raw);
    const match = range ? [range[2], range[4]] : /^\s*(\d+)\s*[-:]\s*(\d+)\s*$/.exec(raw)?.slice(1);
    if (match) [first, last] = match.map(Number);
  }
  if (!Number.isInteger(first) || !Number.isInteger(last)) return null;
  const from = Math.max(0, Math.min(first, last) - 2);
  const to = Math.min(sheet.rows.length - 1, Math.max(first, last) - 2);
  return from <= to ? { from, to } : null;
}

function parseCharts(raw, sheet, repairs, sheetIndex) {
  const list = (Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : []).slice(0, MAX_CHARTS);
  const charts = [];
  list.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return;
    const typeKey = String(entry.type ?? 'column').toLowerCase().replace(/[^a-z]/g, '');
    const type = CHART_TYPES[typeKey] || 'column';
    if (!CHART_TYPES[typeKey]) repairs.push({ code: 'chart-type', sheet: sheetIndex, chart: index, from: entry.type });
    // Categories: "x" (or "categories" as a range); values: "y" (or "values").
    const x = resolveChartColumn(entry.x ?? entry.category ?? entry.categories ?? entry.labels ?? 0, sheet) ?? 0;
    const rawY = entry.y ?? entry.values ?? entry.series ?? entry.value;
    let y = (Array.isArray(rawY) ? rawY : rawY == null ? [] : [rawY])
      .map((item) => resolveChartColumn(item && typeof item === 'object' ? item.column ?? item.values ?? item.y : item, sheet))
      .filter((column) => column !== null && column !== x);
    // Without value columns, every numeric column other than the categories.
    if (!y.length) {
      y = sheet.columns.map((_, column) => column).filter((column) => column !== x && sheet.rows.some((row) => row[column]?.type === 'number' || row[column]?.type === 'formula'));
    }
    y = [...new Set(y)].slice(0, type === 'pie' || type === 'doughnut' ? 1 : MAX_CHART_SERIES);
    if (!y.length) {
      repairs.push({ code: 'chart-no-values', sheet: sheetIndex, chart: index });
      return;
    }
    const rows = resolveChartRows(entry.rows ?? (typeof (entry.categories ?? entry.x) === 'string' ? entry.categories ?? entry.x : null), sheet);
    const anchor = typeof (entry.anchor ?? entry.position ?? entry.cell) === 'string' ? parseCellAddress(String(entry.anchor ?? entry.position ?? entry.cell).trim()) : null;
    charts.push({
      type,
      title: typeof entry.title === 'string' ? TEXT_LIMIT(entry.title).slice(0, 200) : '',
      x,
      y,
      rows,
      stacked: entry.stacked === true && ['column', 'bar', 'area', 'line'].includes(type),
      anchor: anchor && anchor.row >= 0 && anchor.column >= 0 ? anchor : null
    });
  });
  return charts;
}

function buildSheet(raw, index, { used, repairs, budget }) {
  let columns = Array.isArray(raw.columns) ? raw.columns.slice(0, SHEET_LIMITS.columns).map(normalizeColumn) : [];
  let rows = Array.isArray(raw.rows) ? raw.rows : Array.isArray(raw.data) ? raw.data : [];
  // Records ({ "Name": "…", "Sales": 1 }) are mapped by column key or header.
  if (rows.some((row) => row && typeof row === 'object' && !Array.isArray(row))) {
    if (!columns.length) {
      const keys = [...new Set(rows.flatMap((row) => (row && typeof row === 'object' && !Array.isArray(row) ? Object.keys(row) : [])))];
      columns = keys.slice(0, SHEET_LIMITS.columns).map((key) => normalizeColumn(key));
    }
    rows = rows.map((row) => (Array.isArray(row) ? row : columns.map((column) => row?.[column.key] ?? row?.[column.header])));
  }
  // Without columns, the first row is the header.
  if (!columns.length && rows.length) {
    columns = (Array.isArray(rows[0]) ? rows[0] : []).slice(0, SHEET_LIMITS.columns).map((cell) => normalizeColumn(cell && typeof cell === 'object' ? cell.value ?? '' : cell));
    rows = rows.slice(1);
  }
  const width = Math.min(SHEET_LIMITS.columns, Math.max(columns.length, ...rows.map((row) => (Array.isArray(row) ? row.length : 0)), 1));
  while (columns.length < width) columns.push({ header: '', key: String(columns.length) });
  const allowedRows = Math.max(0, Math.min(SHEET_LIMITS.rows, Math.floor(budget.cells / width)));
  if (rows.length > allowedRows) {
    repairs.push({ code: 'rows-truncated', sheet: index, from: rows.length, to: allowedRows });
    rows = rows.slice(0, allowedRows);
  }
  budget.cells -= rows.length * width;
  const name = sheetName(raw.name ?? raw.sheet ?? raw.title, index, used);
  const sheet = {
    name,
    columns,
    rows: rows.map((row, rowIndex) => Array.from({ length: width }, (_, column) => normalizeCell(Array.isArray(row) ? row[column] : undefined, { repairs, where: `${name}!${cellAddress(rowIndex + 1, column)}` })))
  };
  columns.forEach((_, column) => inferColumn(sheet, column));
  sheet.rows.forEach((row) => row.forEach((cell) => { if (cell.inferable) delete cell.inferable; }));
  sheet.freeze = parseFreeze(raw.freeze ?? raw.frozen);
  sheet.freeze.rows = Math.min(sheet.freeze.rows, sheet.rows.length + 1);
  sheet.freeze.columns = Math.min(sheet.freeze.columns, width);
  sheet.autoFilter = raw.autoFilter !== false && raw.filter !== false && sheet.rows.length > 0 && columns.some((column) => column.header);
  sheet.merges = parseMerges(raw.merges ?? raw.merge, sheet, repairs);
  sheet.rows.forEach((row) => row.forEach((cell) => { delete cell.span; }));
  sheet.charts = sheet.rows.length ? parseCharts(raw.charts ?? raw.chart, sheet, repairs, index) : [];
  return sheet;
}

// ------------------------------------------------------------ sources

function fromJson(value) {
  if (Array.isArray(value)) return { sheets: value.every((entry) => entry && typeof entry === 'object' && !Array.isArray(entry) && (entry.rows || entry.data)) ? value : [{ rows: value }] };
  if (value && typeof value === 'object') {
    if (Array.isArray(value.sheets)) return value;
    if (value.rows || value.data || value.columns) return { ...value, sheets: [value] };
  }
  return null;
}

const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;
const splitRow = (line) => {
  const cells = [];
  let cell = '';
  const body = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  for (let index = 0; index < body.length; index += 1) {
    if (body[index] === '\\' && body[index + 1] === '|') { cell += '|'; index += 1; continue; }
    if (body[index] === '|') { cells.push(cell); cell = ''; continue; }
    cell += body[index];
  }
  cells.push(cell);
  return cells.map((text) => text.trim().replace(/^\*\*(.*)\*\*$/, '$1').replace(/`([^`]*)`/g, '$1'));
};

function fromMarkdown(source) {
  const lines = source.split('\n');
  const sheets = [];
  let heading = '';
  for (let index = 0; index < lines.length; index += 1) {
    const title = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(lines[index]);
    if (title) { heading = title[1].replace(/[*_`]/g, ''); continue; }
    if (!TABLE_ROW.test(lines[index]) || !TABLE_SEPARATOR.test(lines[index + 1] || '')) continue;
    const header = splitRow(lines[index]);
    const align = splitRow(lines[index + 1]).map((cell) => (/^:-+:$/.test(cell) ? 'center' : /-:$/.test(cell) ? 'right' : undefined));
    const rows = [];
    index += 2;
    while (index < lines.length && TABLE_ROW.test(lines[index])) { rows.push(splitRow(lines[index])); index += 1; }
    index -= 1;
    sheets.push({ name: heading, columns: header.map((text, column) => ({ header: text, ...(align[column] ? { align: align[column] } : {}) })), rows });
    heading = '';
  }
  return sheets.length ? { sheets } : null;
}

function fromDelimited(source) {
  const lines = source.split('\n').filter((line) => line.trim());
  if (lines.length < 1) return null;
  const delimiter = lines[0].includes('\t') ? '\t' : lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',';
  if (!lines[0].includes(delimiter)) return null;
  const rows = parseDelimited(source, delimiter).map((row) => row.map((cell) => cell.value)).filter((row) => row.some((cell) => cell !== ''));
  return rows.length ? { sheets: [{ rows }] } : null;
}

/**
 * Parses what the model wrote. Returns { workbook, repairs } or throws
 * SpreadsheetSpecError when nothing tabular can be read.
 */
export function parseSpreadsheet(content, { language = 'zh-TW' } = {}) {
  let source = String(content ?? '').replace(/\r\n?/g, '\n').replace(/^﻿/, '');
  const fenced = /^\s*(`{3,}|~{3,})[^\n]*\n([\s\S]*?)\n\1\s*$/.exec(source);
  if (fenced) source = fenced[2];
  if (!source.trim()) throw new SpreadsheetSpecError('empty');
  let input = null;
  if (/^\s*[[{]/.test(source)) {
    try {
      input = fromJson(parseRelaxedJson(source).value);
    } catch {
      input = null;
    }
  }
  input ||= fromMarkdown(source) || fromDelimited(source);
  if (!input?.sheets?.length) throw new SpreadsheetSpecError('no table');
  const repairs = [];
  const used = new Set();
  const budget = { cells: SHEET_LIMITS.cells };
  const sheets = input.sheets.slice(0, SHEET_LIMITS.sheets)
    .filter((sheet) => sheet && typeof sheet === 'object')
    .map((sheet, index) => buildSheet(sheet, index, { used, repairs, budget }));
  if (input.sheets.length > SHEET_LIMITS.sheets) repairs.push({ code: 'sheets-truncated', from: input.sheets.length });
  if (!sheets.length) throw new SpreadsheetSpecError('no sheet');
  const accent = parseHexColor(input.accent ?? input.design?.accent ?? input.color);
  return {
    workbook: {
      title: typeof input.title === 'string' ? TEXT_LIMIT(input.title).slice(0, 200) : '',
      language,
      accent: accent || null,
      sheets
    },
    repairs
  };
}
