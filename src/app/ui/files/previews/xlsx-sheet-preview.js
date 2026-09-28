// Sheet preview: draws the workbook layout a .xlsx Blob was written from
// (attached by xlsx-file.js) the way Excel and Google Sheets show it: column
// letters and row numbers, grid lines, frozen panes, merged cells, the
// header's filter buttons, and the sheet tabs below the grid. The filter
// buttons work as in Excel (sort, pick values); they change the preview
// only, never the file. Built with DOM
// methods in a shadow root; no markup from the file is parsed. Charts are
// drawn at their anchor cells from the same data the file's charts cache.

import { formatCellValue } from '../generators/sheet-layout.js';
import { cellAddress } from '../generators/spreadsheet-spec.js';
import { drawChart } from './slide-chart-preview.js';

const MAX_ROWS = 500;
// Excel's column width unit is about 7 px for its default 11 pt font.
const pixels = (width) => Math.round(width * 7 + 5);
const ROW_HEADER_WIDTH = 44;
const ROW_HEIGHT = 22;
// Excel's default column (8.43 characters) for the empty columns under charts.
const BLANK_WIDTH = 8.43;
const SVG = 'http://www.w3.org/2000/svg';

const STYLE = `
  :host { all: initial; display: block; }
  .sheet { position: relative; display: flex; flex-direction: column; border: 1px solid #d4d4d4; background: #fff; color: #1f1f1f; font: 13px/1.35 var(--sheet-font); }
  .grid { overflow: auto; max-height: min(62vh, 560px); }
  table { border-collapse: separate; border-spacing: 0; table-layout: fixed; }
  td, th { box-sizing: border-box; height: 22px; padding: 1px 6px; overflow: hidden; white-space: nowrap; text-overflow: clip; border-right: 1px solid #e1e1e1; border-bottom: 1px solid #e1e1e1; vertical-align: bottom; background-clip: padding-box; }
  td.wrap { white-space: pre-wrap; vertical-align: top; }
  th { position: sticky; top: 0; z-index: 3; background: #f5f5f5; color: #616161; font-weight: 400; text-align: center; font-size: 12px; }
  th.corner { left: 0; z-index: 5; }
  td.row-number { position: sticky; left: 0; z-index: 2; background: #f5f5f5; color: #616161; text-align: center; font-size: 12px; padding: 1px 2px; }
  td.frozen-row { position: sticky; z-index: 2; }
  td.frozen-column { position: sticky; z-index: 2; }
  td.frozen-row.frozen-column { z-index: 3; }
  td.freeze-bottom { border-bottom: 2px solid #bdbdbd; }
  td.freeze-right { border-right: 2px solid #bdbdbd; }
  td.formula { color: #6b6b6b; font-style: italic; }
  .filter { float: right; width: 14px; height: 14px; margin: 2px -3px 0 4px; padding: 0; border: 1px solid rgba(255,255,255,0.75); border-radius: 2px; box-sizing: border-box; position: relative; background: transparent; color: inherit; cursor: pointer; }
  .filter::after { content: ""; position: absolute; left: 3px; top: 4px; border: 3px solid transparent; border-top: 4px solid currentColor; }
  .filter:hover { background: rgba(255,255,255,0.18); }
  .filter:focus-visible { outline: 2px solid currentColor; outline-offset: 1px; }
  .filter.active { background: currentColor; }
  .filter.active::after { border-top-color: var(--filter-ink, #1f1f1f); }
  .menu { position: fixed; z-index: 10; width: 232px; max-width: calc(100% - 8px); box-sizing: border-box; padding: 6px 0; background: #fff; color: #1f1f1f; border: 1px solid #d4d4d4; border-radius: 6px; box-shadow: 0 4px 16px rgba(0,0,0,0.14); font-size: 13px; }
  .menu .item { display: block; width: 100%; padding: 7px 14px; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
  .menu .item:hover:not(:disabled), .menu .item:focus-visible { background: #f0f0f0; outline: none; }
  .menu .item:disabled { color: #9e9e9e; cursor: default; }
  .menu hr { margin: 6px 0; border: 0; border-top: 1px solid #e1e1e1; }
  .menu .values { max-height: 220px; overflow: auto; padding: 0 8px; }
  .menu label { display: flex; align-items: center; gap: 8px; padding: 3px 6px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .menu input { margin: 0; accent-color: #1f1f1f; }
  .menu .actions { display: flex; justify-content: flex-end; gap: 8px; padding: 8px 12px 2px; }
  .menu .actions button { padding: 5px 14px; border: 1px solid #d4d4d4; border-radius: 4px; background: #fff; color: #1f1f1f; font: inherit; cursor: pointer; }
  .menu .actions button.primary { background: #1f1f1f; border-color: #1f1f1f; color: #fff; }
  .menu .actions button:focus-visible { outline: 2px solid #1f1f1f; outline-offset: 1px; }
  .tabs { display: flex; gap: 2px; padding: 0 6px; overflow-x: auto; border-top: 1px solid #d4d4d4; background: #f5f5f5; }
  .tab { flex: 0 0 auto; padding: 6px 14px 7px; border: 0; border-bottom: 2px solid transparent; background: transparent; color: #424242; font: inherit; font-size: 12px; cursor: pointer; white-space: nowrap; }
  .tab:hover { background: #ebebeb; }
  .tab[aria-selected="true"] { background: #fff; border-bottom-color: #1f1f1f; color: #1f1f1f; font-weight: 600; }
  .tab:focus-visible { outline: 2px solid #1f1f1f; outline-offset: -2px; }
  .canvas { position: relative; width: max-content; }
  .chart { position: absolute; z-index: 1; background: #fff; border: 1px solid #d9d9d9; box-sizing: border-box; }
  .chart svg { display: block; }
  .limit { margin: 0; padding: 6px 10px; color: #616161; font-size: 12px; border-top: 1px solid #e1e1e1; }
`;

function columnLetter(index) {
  return cellAddress(0, index).replace(/\d+$/, '');
}

function element(document, tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function applyStyle(node, style = {}, colors) {
  if (style.fill) node.style.backgroundColor = style.fill;
  if (style.color) node.style.color = style.color;
  if (style.bold) node.style.fontWeight = '700';
  if (style.italic) node.style.fontStyle = 'italic';
  if (style.align) node.style.textAlign = style.align;
  if (style.wrap) node.classList.add('wrap');
  if (style.topRule) node.style.borderTop = `1px solid ${style.topRule || colors.rule}`;
}

const hex = (color) => String(color || '').replace('#', '');

// A laid-out chart in the form drawChart takes (pptxgenjs's).
function nativeOf(chart, language) {
  const format = chart.series[0]?.format || null;
  const base = {
    catAxisLabelColor: '595959', catAxisLabelFontSize: 11, catAxisLineColor: 'BFBFBF',
    valAxisLabelColor: '595959', valGridLine: { color: 'D9D9D9', style: 'solid' },
    legendColor: '595959', dataLabelColor: '404040', legendPos: 'b',
    showLegend: chart.series.length > 1,
    formatValue: (value) => formatCellValue(value, format && !/[yd]/i.test(format) ? format : '#,##0.##', { language })
  };
  // Stacked lines and areas are drawn as running totals.
  const values = (series, index) => (chart.stacked && (chart.type === 'line' || chart.type === 'area')
    ? series.values.map((value, point) => chart.series.slice(0, index + 1).reduce((sum, item) => sum + (item.values[point] || 0), 0))
    : series.values);
  const data = chart.series.map((series, index) => ({ name: series.name, labels: chart.categories, values: values(series, index) }));
  const chartColors = chart.series.map((series) => hex(series.color));
  switch (chart.type) {
    case 'column':
    case 'bar':
      return { type: 'bar', data, options: { ...base, barDir: chart.type === 'bar' ? 'bar' : 'col', barGrouping: chart.stacked ? 'stacked' : 'clustered', barGapWidthPct: 80, chartColors, catAxisOrientation: 'maxMin' } };
    case 'line':
    case 'area':
    case 'radar':
      return { type: chart.type, data, options: { ...base, chartColors, lineSize: 2.25, lineDataSymbolSize: 6, lineDataSymbol: chart.type === 'area' ? 'none' : 'circle' } };
    case 'pie':
    case 'doughnut':
      return { type: 'doughnut', data: data.slice(0, 1), options: { ...base, showLegend: true, holeSize: chart.type === 'pie' ? 0 : 55, chartColors: chart.pointColors.map(hex) } };
    case 'scatter':
      return { type: 'scatter', data: [{ name: 'x', values: chart.xValues }, ...data], options: { ...base, chartColors, lineDataSymbolSize: 8 } };
    default:
      return null;
  }
}

function drawSheetChart(document, chart, { family, language }) {
  const box = element(document, 'div', 'chart');
  box.style.width = `${chart.width}px`;
  box.style.height = `${chart.height}px`;
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('width', String(chart.width));
  svg.setAttribute('height', String(chart.height));
  svg.setAttribute('viewBox', `0 0 ${chart.width} ${chart.height}`);
  svg.setAttribute('role', 'img');
  if (chart.title) svg.setAttribute('aria-label', chart.title);
  const group = document.createElementNS(SVG, 'g');
  svg.appendChild(group);
  const context = document.createElement('canvas').getContext?.('2d');
  const measure = (text, { size = 11 } = {}) => {
    if (!context) return String(text).length * size * 0.6;
    context.font = `${size}px ${family}`;
    return context.measureText(String(text)).width;
  };
  let top = 10;
  if (chart.title) {
    const title = document.createElementNS(SVG, 'text');
    title.setAttribute('x', String(chart.width / 2));
    title.setAttribute('y', '28');
    title.setAttribute('text-anchor', 'middle');
    title.setAttribute('font-size', '18');
    title.setAttribute('font-family', family);
    title.setAttribute('fill', '#404040');
    title.textContent = chart.title;
    group.appendChild(title);
    top = 42;
  }
  const native = nativeOf(chart, language);
  try {
    if (native) drawChart(document, group, native, { left: 10, right: chart.width - 14, top, bottom: chart.height - 10 }, { measure, family, background: 'FFFFFF' });
  } catch {
    // A chart the preview cannot draw leaves its frame empty; the file is fine.
  }
  box.appendChild(svg);
  return box;
}

// The rows the preview shows, in order, after sorting and filtering:
// [{ source: data row index, number: row number shown }].
function visibleRows(sheet, state, language) {
  let order = sheet.rows.map((_, index) => index);
  if (state.sort) order = sortRows(sheet, order, state.sort, language);
  const numbers = new Map(order.map((source, position) => [source, (state.sort ? position : source) + 2]));
  const shown = order.filter((source) => [...state.filters].every(([column, allowed]) => allowed.has(sheet.rows[source][column]?.display ?? '')));
  return shown.map((source) => ({ source, number: numbers.get(source) }));
}

const sortKey = (cell) => {
  const value = cell?.value;
  if (typeof value === 'number') return { number: value };
  if (value instanceof Date) return { number: value.getTime() };
  const text = cell?.display ?? '';
  return text === '' ? { empty: true } : { text };
};

function compareCells(a, b, language) {
  const left = sortKey(a);
  const right = sortKey(b);
  if (left.empty || right.empty) return left.empty && right.empty ? 0 : null;
  if (left.number !== undefined && right.number !== undefined) return left.number - right.number;
  // Numbers come before text, as in Excel.
  if (left.number !== undefined) return -1;
  if (right.number !== undefined) return 1;
  return left.text.localeCompare(right.text, language, { numeric: true, sensitivity: 'base' });
}

function sortRows(sheet, order, { column, direction }, language) {
  const sign = direction === 'descending' ? -1 : 1;
  return [...order].sort((a, b) => {
    const result = compareCells(sheet.rows[a][column], sheet.rows[b][column], language);
    // Blanks stay last either way; equal rows keep their order.
    if (result === null) return (sheet.rows[a][column]?.display ?? '') === '' ? 1 : -1;
    return result * sign || a - b;
  });
}

function drawSheet(document, sheet, colors, { rowLimit = MAX_ROWS, family = 'sans-serif', language = 'en', view = null } = {}) {
  const table = element(document, 'table');
  const colgroup = element(document, 'colgroup');
  // Charts float over the grid, to the right of the table by default; the
  // grid extends under them as Excel's does.
  const charts = sheet.charts || [];
  const sheetWidths = [...sheet.widths];
  const span = (count) => sheetWidths.slice(0, count).reduce((sum, width) => sum + pixels(width), 0);
  for (const chart of charts) {
    while (sheetWidths.length < chart.anchor.column) sheetWidths.push(BLANK_WIDTH);
    while (span(sheetWidths.length) < span(chart.anchor.column) + chart.width + pixels(BLANK_WIDTH)) sheetWidths.push(BLANK_WIDTH);
  }
  const blankColumns = sheetWidths.length - sheet.widths.length;
  // Empty rows continue the grid down to the bottom of the lowest chart.
  const chartRows = Math.max(0, ...charts.map((chart) => chart.anchor.row + Math.ceil(chart.height / ROW_HEIGHT) + 1));
  const widths = [ROW_HEADER_WIDTH, ...sheetWidths.map(pixels)];
  widths.forEach((width) => {
    const col = element(document, 'col');
    col.style.width = `${width}px`;
    colgroup.appendChild(col);
  });
  table.appendChild(colgroup);
  table.style.width = `${widths.reduce((sum, width) => sum + width, 0)}px`;

  const head = element(document, 'thead');
  const letters = element(document, 'tr');
  letters.appendChild(element(document, 'th', 'corner'));
  sheetWidths.forEach((_, index) => letters.appendChild(element(document, 'th', '', columnLetter(index))));
  head.appendChild(letters);
  table.appendChild(head);

  // Cells covered by a merge (other than its top-left cell) are skipped.
  // Sorted or filtered rows no longer line up with merges below the header.
  const active = Boolean(view && (view.state.sort || view.state.filters.size));
  const covered = new Set();
  const spans = new Map();
  for (const merge of sheet.merges.filter((entry) => !active || entry.row === 0)) {
    spans.set(`${merge.row}:${merge.column}`, merge);
    for (let row = merge.row; row < merge.row + merge.rowSpan; row += 1) {
      for (let column = merge.column; column < merge.column + merge.columnSpan; column += 1) {
        if (row !== merge.row || column !== merge.column) covered.add(`${row}:${column}`);
      }
    }
  }
  const left = [];
  let offset = ROW_HEADER_WIDTH;
  sheetWidths.forEach((width) => { left.push(offset); offset += pixels(width); });

  const body = element(document, 'tbody');
  const shown = view ? visibleRows(sheet, view.state, language) : sheet.rows.map((_, source) => ({ source, number: source + 2 }));
  const entries = [{ cells: sheet.header, source: -1, number: 1 }, ...shown.slice(0, rowLimit).map((entry) => ({ ...entry, cells: sheet.rows[entry.source] }))];
  const rows = entries.map((entry) => entry.cells);
  rows.forEach((cells, rowIndex) => {
    const tr = element(document, 'tr');
    const entry = entries[rowIndex];
    const number = element(document, 'td', 'row-number', String(entry.number));
    tr.appendChild(number);
    const frozenRow = rowIndex < sheet.freeze.rows;
    if (frozenRow) {
      // Frozen rows stay under the column letters (22 px each).
      number.classList.add('frozen-row');
      number.style.top = `${22 + rowIndex * 22}px`;
      number.style.zIndex = '4';
    }
    cells.forEach((cell, column) => {
      const key = `${rowIndex}:${column}`;
      if (covered.has(key)) return;
      const td = element(document, 'td', '', cell.display);
      const merge = spans.get(key);
      if (merge) {
        if (merge.columnSpan > 1) td.colSpan = merge.columnSpan;
        if (merge.rowSpan > 1) td.rowSpan = merge.rowSpan;
      }
      applyStyle(td, cell.style, colors);
      if (rowIndex === 0 && sheet.autoFilter && cell.display !== undefined) {
        const button = element(document, 'button', 'filter');
        button.type = 'button';
        button.dataset.column = String(column);
        button.setAttribute('aria-haspopup', 'dialog');
        button.setAttribute('aria-expanded', 'false');
        if (view) {
          button.setAttribute('aria-label', view.text('sheetFilterButton', { name: cell.display || columnLetter(column) }));
          if (view.state.filters.has(column) || view.state.sort?.column === column) button.classList.add('active');
          button.style.setProperty('--filter-ink', cell.style?.fill || '#1f1f1f');
          button.addEventListener('click', (event) => {
            event.stopPropagation();
            view.openMenu(column, button);
          });
        }
        td.prepend(button);
      }
      if (cell.type === 'formula' && cell.value === undefined) td.classList.add('formula');
      if (frozenRow) {
        td.classList.add('frozen-row');
        td.style.top = `${22 + rowIndex * 22}px`;
        if (!td.style.backgroundColor) td.style.backgroundColor = '#fff';
        if (rowIndex === sheet.freeze.rows - 1) td.classList.add('freeze-bottom');
      }
      if (column < sheet.freeze.columns) {
        td.classList.add('frozen-column');
        td.style.left = `${left[column]}px`;
        if (!td.style.backgroundColor) td.style.backgroundColor = '#fff';
        if (column === sheet.freeze.columns - 1) td.classList.add('freeze-right');
      }
      if (cell.type === 'formula' && cell.formula) td.title = `=${cell.formula}`;
      td.dataset.cell = cellAddress(entry.source + 1, column);
      tr.appendChild(td);
    });
    for (let blank = 0; blank < blankColumns; blank += 1) tr.appendChild(element(document, 'td'));
    body.appendChild(tr);
  });
  for (let rowIndex = rows.length; rowIndex < chartRows; rowIndex += 1) {
    const tr = element(document, 'tr');
    tr.appendChild(element(document, 'td', 'row-number', String(rowIndex + 1)));
    sheetWidths.forEach(() => tr.appendChild(element(document, 'td')));
    body.appendChild(tr);
  }
  table.appendChild(body);
  if (!charts.length) return table;
  const canvas = element(document, 'div', 'canvas');
  canvas.appendChild(table);
  for (const chart of charts) {
    const node = drawSheetChart(document, chart, { family, language });
    node.style.left = `${left[chart.anchor.column]}px`;
    // Below the column letters, at the anchor row.
    node.style.top = `${ROW_HEIGHT + chart.anchor.row * ROW_HEIGHT}px`;
    canvas.appendChild(node);
  }
  return canvas;
}

/**
 * Renders the workbook a Blob was generated from into `host` (its own
 * shadow root). Returns { pageCount: sheet count, dispose }.
 */
const FALLBACK_TEXTS = Object.freeze({
  sheetFilterButton: 'Filter "{name}"', sheetSortAscending: 'Sort A to Z', sheetSortDescending: 'Sort Z to A',
  sheetFilterAll: '(Select all)', sheetFilterBlank: '(Blanks)', sheetFilterClear: 'Clear filter',
  sheetFilterApply: 'OK', sheetFilterCancel: 'Cancel', sheetFilterNote: 'Sorting and filtering change the preview only.'
});
const fallbackText = (key, values = {}) => String(FALLBACK_TEXTS[key] || key).replace(/\{(\w+)\}/g, (_, name) => values[name] ?? '');

export async function renderXlsxPreview(blob, host, { document = globalThis.document, limitText = (count) => `${count}`, text = fallbackText } = {}) {
  const built = blob?.workbook;
  if (!built?.layout) throw new Error('sheet layout unavailable');
  const { layout } = built;
  const shadow = host.shadowRoot || host.attachShadow({ mode: 'open' });
  const style = element(document, 'style');
  style.textContent = STYLE;
  const root = element(document, 'div', 'sheet');
  const fontStack = `"${layout.font.family}", "Aptos Narrow", Calibri, "Microsoft JhengHei", "PingFang TC", "Noto Sans TC", sans-serif`;
  root.style.setProperty('--sheet-font', fontStack);
  const grid = element(document, 'div', 'grid');
  const tabs = element(document, 'div', 'tabs');
  tabs.setAttribute('role', 'tablist');
  const limit = element(document, 'p', 'limit');
  root.append(grid, limit, tabs);
  shadow.replaceChildren(style, root);

  const buttons = layout.sheets.map((sheet, index) => {
    const tab = element(document, 'button', 'tab', sheet.name);
    tab.type = 'button';
    tab.setAttribute('role', 'tab');
    tab.addEventListener('click', () => show(index));
    tab.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const next = (index + (event.key === 'ArrowRight' ? 1 : -1) + layout.sheets.length) % layout.sheets.length;
      show(next);
      buttons[next].focus();
    });
    tabs.appendChild(tab);
    return tab;
  });
  // Sort and filters per sheet, kept while switching tabs.
  const states = layout.sheets.map(() => ({ sort: null, filters: new Map() }));
  const language = layout.font.language || 'en';
  let current = 0;
  let menu = null;

  const closeMenu = ({ focus = false } = {}) => {
    if (!menu) return;
    const { node, button } = menu;
    node.remove();
    button.setAttribute('aria-expanded', 'false');
    menu = null;
    if (focus && button.isConnected) button.focus();
  };

  // Redraws the sheet, keeping the scroll position and the focused button.
  const redraw = (focusColumn) => {
    const { scrollTop, scrollLeft } = grid;
    show(current, { keepScroll: true });
    grid.scrollTop = scrollTop;
    grid.scrollLeft = scrollLeft;
    if (focusColumn !== undefined) grid.querySelector(`.filter[data-column="${focusColumn}"]`)?.focus();
  };

  function openMenu(column, button) {
    const reopen = menu?.column === column;
    closeMenu();
    if (reopen) return;
    const sheet = layout.sheets[current];
    const state = states[current];
    const node = element(document, 'div', 'menu');
    node.setAttribute('role', 'dialog');
    node.setAttribute('aria-label', text('sheetFilterButton', { name: sheet.header[column]?.display || columnLetter(column) }));
    const action = (label, handler, disabled = false) => {
      const item = element(document, 'button', 'item', label);
      item.type = 'button';
      item.disabled = disabled;
      item.addEventListener('click', handler);
      node.appendChild(item);
      return item;
    };
    const sortBy = (direction) => () => {
      state.sort = { column, direction };
      closeMenu();
      redraw(column);
    };
    action(text('sheetSortAscending'), sortBy('ascending'));
    action(text('sheetSortDescending'), sortBy('descending'));
    action(text('sheetFilterClear'), () => {
      state.filters.delete(column);
      if (state.sort?.column === column) state.sort = null;
      closeMenu();
      redraw(column);
    }, !state.filters.has(column) && state.sort?.column !== column);
    node.appendChild(element(document, 'hr'));

    // Every value of the column, in ascending order, blanks last.
    const seen = new Map();
    for (const row of sheet.rows) {
      const key = row[column]?.display ?? '';
      if (!seen.has(key)) seen.set(key, row[column]);
    }
    const values = [...seen.keys()].sort((a, b) => {
      const result = compareCells(seen.get(a), seen.get(b), language);
      return result === null ? (a === '' ? 1 : -1) : result;
    }).slice(0, 1000);
    const allowed = state.filters.get(column);
    const list = element(document, 'div', 'values');
    const checkbox = (label, checked) => {
      const row = element(document, 'label');
      const input = element(document, 'input');
      input.type = 'checkbox';
      input.checked = checked;
      row.append(input, element(document, 'span', '', label));
      row.title = label;
      list.appendChild(row);
      return input;
    };
    const all = checkbox(text('sheetFilterAll'), true);
    const boxes = values.map((value) => ({ value, input: checkbox(value === '' ? text('sheetFilterBlank') : value, !allowed || allowed.has(value)) }));
    const syncAll = () => {
      const checked = boxes.filter((entry) => entry.input.checked).length;
      all.checked = checked === boxes.length;
      all.indeterminate = checked > 0 && checked < boxes.length;
    };
    syncAll();
    all.addEventListener('change', () => boxes.forEach((entry) => { entry.input.checked = all.checked; }));
    boxes.forEach((entry) => entry.input.addEventListener('change', syncAll));
    node.appendChild(list);

    const actions = element(document, 'div', 'actions');
    const cancel = element(document, 'button', '', text('sheetFilterCancel'));
    cancel.type = 'button';
    cancel.addEventListener('click', () => closeMenu({ focus: true }));
    const apply = element(document, 'button', 'primary', text('sheetFilterApply'));
    apply.type = 'button';
    apply.addEventListener('click', () => {
      const chosen = boxes.filter((entry) => entry.input.checked).map((entry) => entry.value);
      if (chosen.length === boxes.length) state.filters.delete(column);
      else state.filters.set(column, new Set(chosen));
      closeMenu();
      redraw(column);
    });
    actions.append(cancel, apply);
    node.appendChild(actions);
    node.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        event.preventDefault();
        closeMenu({ focus: true });
      }
    });
    node.addEventListener('click', (event) => event.stopPropagation());

    root.appendChild(node);
    // Fixed to the viewport so the dialog's scrolling box does not cut it
    // off; below the button, or above it when there is more room there.
    const view = document.defaultView || globalThis;
    const anchor = button.getBoundingClientRect();
    const width = node.offsetWidth || 232;
    const below = view.innerHeight - anchor.bottom - 8;
    const above = anchor.top - 8;
    const upward = node.offsetHeight > below && above > below;
    node.style.maxHeight = `${Math.max(160, (upward ? above : below) - 4)}px`;
    node.style.overflowY = 'auto';
    const cellLeft = button.closest('td')?.getBoundingClientRect().left ?? anchor.left;
    node.style.left = `${Math.max(4, Math.min(cellLeft, view.innerWidth - width - 4))}px`;
    node.style.top = upward ? `${Math.max(4, anchor.top - 4 - Math.min(node.offsetHeight, above - 4))}px` : `${anchor.bottom + 4}px`;
    button.setAttribute('aria-expanded', 'true');
    menu = { node, button, column };
    node.querySelector('.item')?.focus();
  }

  // A click anywhere else in the preview closes the menu, as in Excel.
  const onOutside = () => closeMenu();
  root.addEventListener('click', onOutside);
  // The menu is placed against the viewport: any scroll or resize closes it.
  const onMove = (event) => { if (menu && !event.composedPath?.().includes(menu.node)) closeMenu(); };
  document.addEventListener('scroll', onMove, true);
  (document.defaultView || globalThis).addEventListener('resize', onMove);

  function show(index, { keepScroll = false } = {}) {
    if (index !== current) closeMenu();
    current = index;
    const sheet = layout.sheets[index];
    const state = states[index];
    grid.replaceChildren(drawSheet(document, sheet, layout.colors, { family: fontStack, language, view: { state, text, openMenu } }));
    if (!keepScroll) {
      grid.scrollTop = 0;
      grid.scrollLeft = 0;
    }
    buttons.forEach((tab, tabIndex) => {
      tab.setAttribute('aria-selected', String(tabIndex === index));
      tab.tabIndex = tabIndex === index ? 0 : -1;
    });
    const notes = [];
    if (sheet.rows.length > MAX_ROWS) notes.push(limitText(MAX_ROWS));
    if (state.sort || state.filters.size) notes.push(text('sheetFilterNote'));
    limit.hidden = notes.length === 0;
    limit.textContent = notes.join(' ');
  }
  show(0);
  return {
    pageCount: layout.sheets.length,
    show,
    dispose() {
      closeMenu();
      root.removeEventListener('click', onOutside);
      document.removeEventListener('scroll', onMove, true);
      (document.defaultView || globalThis).removeEventListener('resize', onMove);
      shadow.replaceChildren();
    }
  };
}
