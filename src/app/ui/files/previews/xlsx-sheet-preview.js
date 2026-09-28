// Sheet preview: draws the workbook layout a .xlsx Blob was written from
// (attached by xlsx-file.js) the way Excel and Google Sheets show it: column
// letters and row numbers, grid lines, frozen panes, merged cells, the
// header's filter buttons, and the sheet tabs below the grid. Built with DOM
// methods in a shadow root; no markup from the file is parsed.

import { cellAddress } from '../generators/spreadsheet-spec.js';

const MAX_ROWS = 500;
// Excel's column width unit is about 7 px for its default 11 pt font.
const pixels = (width) => Math.round(width * 7 + 5);
const ROW_HEADER_WIDTH = 44;

const STYLE = `
  :host { all: initial; display: block; }
  .sheet { display: flex; flex-direction: column; border: 1px solid #d4d4d4; background: #fff; color: #1f1f1f; font: 13px/1.35 var(--sheet-font); }
  .grid { overflow: auto; max-height: min(62vh, 560px); }
  table { border-collapse: separate; border-spacing: 0; table-layout: fixed; }
  td, th { box-sizing: border-box; height: 22px; padding: 1px 6px; overflow: hidden; white-space: nowrap; text-overflow: clip; border-right: 1px solid #e1e1e1; border-bottom: 1px solid #e1e1e1; vertical-align: bottom; background-clip: padding-box; }
  td.wrap { white-space: pre-wrap; vertical-align: top; }
  th { position: sticky; top: 0; z-index: 3; background: #f5f5f5; color: #616161; font-weight: 400; text-align: center; font-size: 12px; }
  th.corner { left: 0; z-index: 5; }
  td.row-number { position: sticky; left: 0; z-index: 2; background: #f5f5f5; color: #616161; text-align: center; font-size: 12px; padding: 1px 2px; }
  td.frozen-row { position: sticky; z-index: 1; }
  td.frozen-column { position: sticky; z-index: 1; }
  td.frozen-row.frozen-column { z-index: 2; }
  td.freeze-bottom { border-bottom: 2px solid #bdbdbd; }
  td.freeze-right { border-right: 2px solid #bdbdbd; }
  td.formula { color: #6b6b6b; font-style: italic; }
  .filter { float: right; width: 14px; height: 14px; margin: 2px -3px 0 4px; border: 1px solid rgba(255,255,255,0.75); border-radius: 2px; box-sizing: border-box; position: relative; }
  .filter::after { content: ""; position: absolute; left: 3px; top: 4px; border: 3px solid transparent; border-top: 4px solid currentColor; }
  .tabs { display: flex; gap: 2px; padding: 0 6px; overflow-x: auto; border-top: 1px solid #d4d4d4; background: #f5f5f5; }
  .tab { flex: 0 0 auto; padding: 6px 14px 7px; border: 0; border-bottom: 2px solid transparent; background: transparent; color: #424242; font: inherit; font-size: 12px; cursor: pointer; white-space: nowrap; }
  .tab:hover { background: #ebebeb; }
  .tab[aria-selected="true"] { background: #fff; border-bottom-color: #1f1f1f; color: #1f1f1f; font-weight: 600; }
  .tab:focus-visible { outline: 2px solid #1f1f1f; outline-offset: -2px; }
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

function drawSheet(document, sheet, colors, { rowLimit = MAX_ROWS } = {}) {
  const table = element(document, 'table');
  const colgroup = element(document, 'colgroup');
  const widths = [ROW_HEADER_WIDTH, ...sheet.widths.map(pixels)];
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
  sheet.widths.forEach((_, index) => letters.appendChild(element(document, 'th', '', columnLetter(index))));
  head.appendChild(letters);
  table.appendChild(head);

  // Cells covered by a merge (other than its top-left cell) are skipped.
  const covered = new Set();
  const spans = new Map();
  for (const merge of sheet.merges) {
    spans.set(`${merge.row}:${merge.column}`, merge);
    for (let row = merge.row; row < merge.row + merge.rowSpan; row += 1) {
      for (let column = merge.column; column < merge.column + merge.columnSpan; column += 1) {
        if (row !== merge.row || column !== merge.column) covered.add(`${row}:${column}`);
      }
    }
  }
  const left = [];
  let offset = ROW_HEADER_WIDTH;
  sheet.widths.forEach((width) => { left.push(offset); offset += pixels(width); });

  const body = element(document, 'tbody');
  const rows = [sheet.header, ...sheet.rows.slice(0, rowLimit)];
  rows.forEach((cells, rowIndex) => {
    const tr = element(document, 'tr');
    const number = element(document, 'td', 'row-number', String(rowIndex + 1));
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
        const button = element(document, 'span', 'filter');
        button.setAttribute('aria-hidden', 'true');
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
      td.dataset.cell = cellAddress(rowIndex, column);
      tr.appendChild(td);
    });
    body.appendChild(tr);
  });
  table.appendChild(body);
  return table;
}

/**
 * Renders the workbook a Blob was generated from into `host` (its own
 * shadow root). Returns { pageCount: sheet count, dispose }.
 */
export async function renderXlsxPreview(blob, host, { document = globalThis.document, limitText = (count) => `${count}` } = {}) {
  const built = blob?.workbook;
  if (!built?.layout) throw new Error('sheet layout unavailable');
  const { layout } = built;
  const shadow = host.shadowRoot || host.attachShadow({ mode: 'open' });
  const style = element(document, 'style');
  style.textContent = STYLE;
  const root = element(document, 'div', 'sheet');
  root.style.setProperty('--sheet-font', `"${layout.font.family}", "Aptos Narrow", Calibri, "Microsoft JhengHei", "PingFang TC", "Noto Sans TC", sans-serif`);
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
  function show(index) {
    const sheet = layout.sheets[index];
    grid.replaceChildren(drawSheet(document, sheet, layout.colors));
    grid.scrollTop = 0;
    grid.scrollLeft = 0;
    buttons.forEach((tab, tabIndex) => {
      tab.setAttribute('aria-selected', String(tabIndex === index));
      tab.tabIndex = tabIndex === index ? 0 : -1;
    });
    const hidden = sheet.rows.length > MAX_ROWS;
    limit.hidden = !hidden;
    limit.textContent = hidden ? limitText(MAX_ROWS) : '';
  }
  show(0);
  return {
    pageCount: layout.sheets.length,
    show,
    dispose() {
      shadow.replaceChildren();
    }
  };
}
