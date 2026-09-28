// The look of generated workbooks, shared by the Excel writer and the sheet
// preview: one style after Excel's built-in table style "Medium 2" and
// Google Sheets' alternating colours — a header row in the accent colour
// with white bold text, lightly tinted bands, numbers right-aligned with
// thousands separators, a bold total row under a rule. The accent is the
// only design choice (the model may set it for the content).

import { buildPalette } from '../design/palette.js';
import { detectDocumentLanguage } from '../design/language.js';
import { evaluateWorkbook, isError } from './formula-engine.js';

// Excel's default theme (2023): accent 1.
export const DEFAULT_SHEET_ACCENT = '#156082';
// A label that marks a total row; \b does not work after CJK characters.
const TOTAL_LABEL = /^(?:合計|總計|小計|總和|共計|total|totals|grand total|sum|subtotal|total général|sous-total|итого|всего|total general)(?:$|[\s:：(（])/i;
const CJK = /[⺀-鿿가-힯豈-﫿＀-￯]/;

/** The installed font a sheet uses: Excel does not embed fonts. */
export function sheetFont(workbook) {
  const sample = workbook.sheets.flatMap((sheet) => [sheet.name, ...sheet.columns.map((column) => column.header), ...sheet.rows.slice(0, 50).flat().map((cell) => (cell.type === 'string' ? cell.value : ''))]).join(' ');
  const language = detectDocumentLanguage(sample, workbook.language || 'en');
  if (language === 'ja') return { family: 'Yu Gothic', language };
  if (language === 'ko') return { family: 'Malgun Gothic', language };
  if (language === 'zh-CN') return { family: 'Microsoft YaHei', language };
  if (CJK.test(sample)) return { family: 'Microsoft JhengHei', language };
  return { family: 'Aptos Narrow', language };
}

// ------------------------------------------------------------ display

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const pad = (value, length = 2) => String(value).padStart(length, '0');

function formatDate(date, format) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const parts = { yyyy: date.getUTCFullYear(), yy: pad(date.getUTCFullYear() % 100), mm: pad(date.getUTCMonth() + 1), m: date.getUTCMonth() + 1, dd: pad(date.getUTCDate()), d: date.getUTCDate(), hh: pad(date.getUTCHours()), ss: pad(date.getUTCSeconds()) };
  let seenHour = false;
  return String(format).replace(/yyyy|yy|mm|m|dd|d|hh|ss/g, (token) => {
    if (token === 'hh') seenHour = true;
    // "mm" after hours is minutes.
    if (token === 'mm' && seenHour) return pad(date.getUTCMinutes());
    return String(parts[token]);
  });
}

const serialToDate = (serial) => new Date(EXCEL_EPOCH + serial * 86400000);
const isDateFormat = (format) => /(?:^|[^"])(?:yy|dd|m\/|d\/|hh:mm)/i.test(String(format || '').replace(/"[^"]*"/g, ''));

/** A value as Excel shows it with a number format (the formats we write). */
export function formatCellValue(value, format, { language = 'en' } = {}) {
  if (value == null) return '';
  if (isError(value)) return value.error;
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (value instanceof Date) return formatDate(value, format && isDateFormat(format) ? format : 'yyyy-mm-dd');
  if (typeof value !== 'number') return String(value);
  if (format === '@') return String(value);
  if (format && isDateFormat(format)) return formatDate(serialToDate(value), format);
  if (!format) {
    const rounded = Math.round(value * 1e10) / 1e10;
    return Math.abs(rounded) >= 1e11 ? rounded.toExponential(5) : String(rounded);
  }
  const section = String(format).split(';')[0];
  const literal = (text) => text.replace(/"([^"]*)"/g, '$1').replace(/\\(.)/g, '$1').replace(/[#0,.%]/g, '');
  const numberPart = /[#0][#0,]*(?:\.[0#]+)?/.exec(section.replace(/"[^"]*"/g, (quoted) => ' '.repeat(quoted.length)));
  if (!numberPart) return literal(section);
  const prefix = literal(section.slice(0, numberPart.index));
  const suffix = literal(section.slice(numberPart.index + numberPart[0].length));
  const pattern = numberPart[0];
  const percent = section.includes('%');
  const decimals = pattern.includes('.') ? pattern.split('.')[1].length : 0;
  const minDecimals = pattern.includes('.') ? (pattern.split('.')[1].match(/0/g) || []).length : 0;
  const grouping = pattern.includes(',');
  const scaled = Math.abs(percent ? value * 100 : value);
  let text = scaled.toLocaleString('en-US', { minimumFractionDigits: minDecimals, maximumFractionDigits: decimals, useGrouping: grouping });
  if (!grouping) text = text.replace(/,/g, '');
  const negative = value < 0 && Number(text.replace(/,/g, '')) !== 0;
  return `${negative ? '-' : ''}${prefix}${text}${percent ? '%' : ''}${suffix}`.trim() || text;
}

// ------------------------------------------------------------ widths

const visualLength = (text) => [...String(text || '')].reduce((total, char) => total + (CJK.test(char) ? 2 : 1), 0);

// ------------------------------------------------------------ charts

// Excel's default chart size (5 × 3 in) and the rows one takes up at the
// default row height (15 pt = 20 px), plus a spare row between charts.
export const CHART_SIZE = Object.freeze({ width: 480, height: 288 });
const CHART_ROWS = Math.ceil(CHART_SIZE.height / 20) + 1;

const numericValue = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) return (value.getTime() - EXCEL_EPOCH) / 86400000;
  return null;
};

/**
 * Charts with everything the writer and the preview draw: data rows (a total
 * row at the end is left out unless rows are given), category labels,
 * series names, values and colours, and the anchor cell (by default to the
 * right of the table, one blank column away, charts stacked downwards).
 */
function layoutCharts(sheet, rows, { totalRows, colors }) {
  const lastData = rows.length - 1 - (totalRows.has(rows.length - 1) ? 1 : 0);
  return (sheet.charts || []).map((chart, index) => {
    const from = chart.rows?.from ?? 0;
    const to = chart.rows?.to ?? Math.max(from, lastData);
    const range = rows.slice(from, to + 1);
    const pie = chart.type === 'pie' || chart.type === 'doughnut';
    return {
      type: chart.type,
      title: chart.title,
      stacked: chart.stacked,
      from,
      to,
      x: chart.x,
      categories: range.map((row) => row[chart.x]?.display ?? ''),
      xValues: chart.type === 'scatter' ? range.map((row) => numericValue(row[chart.x]?.value)) : null,
      series: chart.y.map((column, seriesIndex) => ({
        column,
        name: sheet.columns[column].header || `Series ${seriesIndex + 1}`,
        values: range.map((row) => numericValue(row[column]?.value)),
        format: sheet.columns[column].format || range.find((row) => row[column]?.format)?.[column].format || null,
        color: colors[seriesIndex % colors.length]
      })),
      pointColors: pie ? range.map((_, point) => colors[point % colors.length]) : null,
      anchor: chart.anchor || { row: 1 + index * CHART_ROWS, column: sheet.columns.length + 1 },
      ...CHART_SIZE
    };
  });
}

// ------------------------------------------------------------ layout

function isTotalRow(sheet, rowIndex) {
  const row = sheet.rows[rowIndex];
  const label = row.find((cell) => cell.type === 'string' && cell.value.trim());
  if (label && TOTAL_LABEL.test(label.value.trim())) return true;
  const formulas = row.filter((cell) => cell.type === 'formula');
  return formulas.length > 0 && formulas.every((cell) => /^SUM\s*\(/i.test(cell.formula)) && rowIndex === sheet.rows.length - 1 && sheet.rows.length > 2;
}

/**
 * Everything both renderers need: per sheet, the column widths and
 * alignment and, per cell, its display text and style. `values` holds the
 * formula results (see evaluateWorkbook).
 */
export function layoutWorkbook(workbook) {
  const accent = workbook.accent || DEFAULT_SHEET_ACCENT;
  const palette = buildPalette({ mode: 'light', background: 'neutral', colorUse: 'balanced', chart: 'categorical', accent, accent2: null });
  const colors = { header: palette.fill, onHeader: palette.onFill, band: palette.soft, text: palette.text, rule: palette.accent, grid: '#D9D9D9' };
  const font = sheetFont(workbook);
  const values = evaluateWorkbook(workbook);
  const sheets = workbook.sheets.map((sheet, sheetIndex) => {
    const numericColumn = sheet.columns.map((column, index) => {
      const cells = sheet.rows.map((row) => row[index]).filter((cell) => cell.type !== 'empty');
      return cells.length > 0 && cells.filter((cell) => cell.type === 'number' || cell.type === 'formula' || cell.type === 'date').length >= cells.length * 0.6;
    });
    const totalRows = new Set(sheet.rows.map((_, index) => index).filter((index) => sheet.rows.length > 1 && index === sheet.rows.length - 1 && isTotalRow(sheet, index)));
    const rows = sheet.rows.map((row, rowIndex) => row.map((cell, column) => {
      const format = cell.format ?? sheet.columns[column].format;
      const value = cell.type === 'formula' ? values.get(`${sheetIndex}:${rowIndex + 1}:${column}`) : cell.value;
      const numeric = cell.type === 'number' || cell.type === 'date' || (cell.type === 'formula' && typeof value === 'number');
      const total = totalRows.has(rowIndex);
      const band = !total && rowIndex % 2 === 1;
      return {
        type: cell.type,
        value,
        formula: cell.formula,
        format,
        display: cell.type === 'formula' && value === undefined ? `=${cell.formula}` : formatCellValue(value ?? null, format, { language: font.language }),
        style: {
          align: cell.style?.align ?? sheet.columns[column].align ?? (numeric ? 'right' : undefined),
          bold: cell.style?.bold ?? (total || undefined),
          italic: cell.style?.italic,
          wrap: cell.style?.wrap,
          fill: cell.style?.fill ?? (band ? colors.band : undefined),
          color: cell.style?.color,
          topRule: total ? colors.rule : undefined
        }
      };
    }));
    const widths = sheet.columns.map((column, index) => {
      if (column.width) return column.width;
      // Wrapped text and formulas Excel still has to calculate do not widen a column.
      const measured = (cell) => (cell.style.wrap || (cell.type === 'formula' && cell.value === undefined) ? 0 : visualLength(cell.display));
      const longest = Math.max(visualLength(column.header) * 1.1 + 2, ...rows.slice(0, 500).map((row) => measured(row[index])));
      return Math.round(Math.min(50, Math.max(8, longest + 2)));
    });
    return {
      name: sheet.name,
      charts: layoutCharts(sheet, rows, { totalRows, colors: palette.series }),
      header: sheet.columns.map((column, index) => ({
        display: column.header,
        style: { bold: true, fill: colors.header, color: colors.onHeader, align: column.align ?? (numericColumn[index] ? 'right' : 'left') }
      })),
      rows,
      widths,
      freeze: sheet.freeze,
      autoFilter: sheet.autoFilter,
      merges: sheet.merges
    };
  });
  return { font, colors, accent, sheets, values };
}
