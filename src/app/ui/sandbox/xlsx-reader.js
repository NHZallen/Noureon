// Reads a workbook Python wrote (openpyxl, pandas, XlsxWriter) into the
// layout the sheet preview draws (the one layoutWorkbook builds for Standard
// mode workbooks): per sheet the header row, the cells with their display
// text and basic style, column widths, merges, frozen panes and filters.
// Charts are not read. Loaded when such a file is previewed.

const MAX_ROWS = 1000;
const MAX_COLUMNS = 60;
const NEUTRAL_COLORS = Object.freeze({ header: '#F2F2F2', onHeader: '#1F1F1F', band: '#FFFFFF', text: '#1F1F1F', rule: '#1F1F1F', grid: '#D9D9D9' });
const DATE_FORMAT_IDS = new Set([14, 15, 16, 17, 22, 27, 30, 36, 45, 46, 47, 50, 57]);
const PERCENT_FORMAT_IDS = new Set([9, 10]);
const THOUSANDS_FORMAT_IDS = new Set([3, 4]);
const CJK = /[぀-ヿ㐀-鿿가-힯]/;

const children = (node, name) => [...(node?.children || [])].filter((child) => child.localName === name);
const child = (node, name) => children(node, name)[0] || null;
const textOf = (node) => (node ? [...node.getElementsByTagName('*')].filter((item) => item.localName === 't').map((item) => item.textContent).join('') || (node.localName === 't' ? node.textContent : '') : '');

function parseXml(DOMParser, text) {
  const document = new DOMParser().parseFromString(text, 'application/xml');
  if (document.getElementsByTagName('parsererror').length) throw new Error('the workbook could not be read');
  return document.documentElement;
}

// "C12" → { row: 11, column: 2 }
export function cellPosition(reference) {
  const match = /^([A-Z]+)(\d+)$/.exec(String(reference || '').toUpperCase());
  if (!match) return null;
  let column = 0;
  for (const letter of match[1]) column = column * 26 + (letter.charCodeAt(0) - 64);
  return { row: Number(match[2]) - 1, column: column - 1 };
}

const colorOf = (node) => {
  const rgb = node?.getAttribute?.('rgb');
  return rgb && /^[0-9A-F]{8}$/i.test(rgb) ? `#${rgb.slice(2)}` : undefined;
};

function readStyles(root) {
  if (!root) return [];
  const fonts = children(child(root, 'fonts'), 'font').map((font) => ({
    bold: Boolean(child(font, 'b')) || undefined,
    italic: Boolean(child(font, 'i')) || undefined,
    color: colorOf(child(font, 'color'))
  }));
  const fills = children(child(root, 'fills'), 'fill').map((fill) => {
    const pattern = child(fill, 'patternFill');
    return pattern?.getAttribute('patternType') === 'solid' ? colorOf(child(pattern, 'fgColor')) : undefined;
  });
  const formats = new Map(children(child(root, 'numFmts'), 'numFmt').map((format) => [Number(format.getAttribute('numFmtId')), format.getAttribute('formatCode') || '']));
  return children(child(root, 'cellXfs'), 'xf').map((xf) => {
    const font = fonts[Number(xf.getAttribute('fontId') || 0)] || {};
    const alignment = child(xf, 'alignment');
    const formatId = Number(xf.getAttribute('numFmtId') || 0);
    const code = formats.get(formatId) || '';
    return {
      style: {
        bold: font.bold,
        italic: font.italic,
        color: font.color,
        fill: fills[Number(xf.getAttribute('fillId') || 0)],
        align: ['left', 'center', 'right'].includes(alignment?.getAttribute('horizontal')) ? alignment.getAttribute('horizontal') : undefined,
        wrap: alignment?.getAttribute('wrapText') === '1' || undefined
      },
      date: DATE_FORMAT_IDS.has(formatId) || (/[ymd]/i.test(code) && !/^[#0.,%]+$/.test(code)),
      percent: PERCENT_FORMAT_IDS.has(formatId) || /%/.test(code),
      thousands: THOUSANDS_FORMAT_IDS.has(formatId) || /#,##0/.test(code),
      decimals: /\.(0+)/.exec(code)?.[1].length ?? (formatId === 2 || formatId === 4 || formatId === 10 ? 2 : null)
    };
  });
}

// Excel's serial day number (1900 system) as YYYY-MM-DD.
const excelDate = (serial) => {
  const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
  return Number.isNaN(date.getTime()) ? String(serial) : date.toISOString().slice(0, serial % 1 ? 16 : 10).replace('T', ' ');
};

export function displayNumber(value, format = {}) {
  if (!Number.isFinite(value)) return String(value);
  if (format.date) return excelDate(value);
  const scaled = format.percent ? value * 100 : value;
  const decimals = format.decimals ?? (Number.isInteger(scaled) ? 0 : Math.min(10, Math.max(0, 10 - Math.floor(Math.log10(Math.abs(scaled) || 1)) - 1)));
  let text = format.decimals === null || format.decimals === undefined
    ? String(Number(scaled.toPrecision(11)))
    : scaled.toFixed(decimals);
  if (format.thousands) {
    const [whole, fraction] = text.split('.');
    text = `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${fraction ? `.${fraction}` : ''}`;
  }
  return format.percent ? `${text}%` : text;
}

function readSheet(root, { strings, styles, name }) {
  const grid = [];
  let columns = 0;
  for (const row of children(child(root, 'sheetData'), 'row')) {
    for (const cell of children(row, 'c')) {
      const position = cellPosition(cell.getAttribute('r'));
      if (!position || position.row >= MAX_ROWS + 1 || position.column >= MAX_COLUMNS) continue;
      const type = cell.getAttribute('t');
      const format = styles[Number(cell.getAttribute('s') || 0)] || { style: {} };
      const raw = child(cell, 'v')?.textContent;
      const formula = child(cell, 'f')?.textContent || undefined;
      let entry;
      if (type === 's') entry = { type: 'string', value: strings[Number(raw)] ?? '' };
      else if (type === 'inlineStr') entry = { type: 'string', value: textOf(child(cell, 'is')) };
      else if (type === 'str') entry = { type: 'string', value: raw ?? '' };
      else if (type === 'b') entry = { type: 'boolean', value: raw === '1' };
      else if (type === 'e') entry = { type: 'string', value: raw ?? '#ERROR' };
      else if (raw !== undefined && raw !== '') entry = { type: format.date ? 'date' : 'number', value: Number(raw) };
      else entry = { type: 'empty', value: null };
      const display = entry.type === 'number' || entry.type === 'date'
        ? displayNumber(entry.value, format)
        : entry.type === 'boolean' ? (entry.value ? 'TRUE' : 'FALSE') : String(entry.value ?? '');
      const numeric = entry.type === 'number' || entry.type === 'date';
      grid[position.row] ||= [];
      grid[position.row][position.column] = {
        type: formula ? 'formula' : entry.type,
        value: entry.value,
        formula,
        display,
        style: { ...format.style, align: format.style.align ?? (numeric ? 'right' : undefined) }
      };
      columns = Math.max(columns, position.column + 1);
    }
  }
  const empty = () => ({ type: 'empty', value: null, display: '', style: {} });
  const rowCount = Math.max(1, grid.length);
  const dense = Array.from({ length: rowCount }, (_, row) => Array.from({ length: Math.max(1, columns) }, (__, column) => grid[row]?.[column] || empty()));

  const widths = Array.from({ length: Math.max(1, columns) }, (_, column) => {
    const longest = Math.max(0, ...dense.slice(0, 200).map((row) => [...String(row[column].display)].reduce((sum, char) => sum + (CJK.test(char) ? 2 : 1), 0)));
    return Math.round(Math.min(50, Math.max(8, longest + 2)));
  });
  for (const col of children(child(root, 'cols'), 'col')) {
    const width = Number(col.getAttribute('width'));
    if (!Number.isFinite(width) || col.getAttribute('customWidth') === '0') continue;
    for (let index = Number(col.getAttribute('min')) - 1; index < Math.min(Number(col.getAttribute('max')), widths.length); index += 1) {
      if (index >= 0) widths[index] = Math.round(Math.min(80, Math.max(2, width)));
    }
  }

  const pane = child(child(child(root, 'sheetViews'), 'sheetView'), 'pane');
  const frozen = pane && ['frozen', 'frozenSplit'].includes(pane.getAttribute('state'));
  const merges = children(child(root, 'mergeCells'), 'mergeCell').map((merge) => {
    const [from, to] = String(merge.getAttribute('ref') || '').split(':').map(cellPosition);
    if (!from || !to) return null;
    return { row: from.row, column: from.column, rowSpan: to.row - from.row + 1, columnSpan: to.column - from.column + 1 };
  }).filter(Boolean);

  return {
    name,
    charts: [],
    header: dense[0],
    rows: dense.slice(1, MAX_ROWS + 1),
    truncated: grid.length > MAX_ROWS + 1,
    widths,
    freeze: {
      rows: frozen ? Number(pane.getAttribute('ySplit') || 0) : 0,
      columns: frozen ? Number(pane.getAttribute('xSplit') || 0) : 0
    },
    autoFilter: Boolean(child(root, 'autoFilter')),
    merges
  };
}

export async function readWorkbookLayout(blob, { JSZip, DOMParser = globalThis.DOMParser } = {}) {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const read = async (path) => {
    const entry = zip.file(path);
    return entry ? parseXml(DOMParser, await entry.async('string')) : null;
  };
  const workbook = await read('xl/workbook.xml');
  if (!workbook) throw new Error('not an Excel workbook');
  const relations = await read('xl/_rels/workbook.xml.rels');
  const targets = new Map(children(relations, 'Relationship').map((relation) => [relation.getAttribute('Id'), relation.getAttribute('Target')]));
  const sharedStrings = await read('xl/sharedStrings.xml');
  const strings = children(sharedStrings, 'si').map((item) => textOf(item));
  const styles = readStyles(await read('xl/styles.xml'));
  const sheets = [];
  for (const sheet of children(child(workbook, 'sheets'), 'sheet')) {
    const id = sheet.getAttribute('r:id') || [...sheet.attributes].find((attribute) => attribute.localName === 'id')?.value;
    const target = targets.get(id);
    if (!target) continue;
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
    const root = await read(path);
    if (root) sheets.push(readSheet(root, { strings, styles, name: sheet.getAttribute('name') || `Sheet${sheets.length + 1}` }));
  }
  if (!sheets.length) throw new Error('the workbook has no sheets');
  const sample = sheets.flatMap((sheet) => [...sheet.header, ...sheet.rows.slice(0, 20).flat()]).map((cell) => cell.display).join('');
  return {
    font: { family: CJK.test(sample) ? 'Microsoft JhengHei' : 'Aptos Narrow', language: CJK.test(sample) ? 'zh-TW' : 'en' },
    colors: NEUTRAL_COLORS,
    accent: '#1F1F1F',
    sheets,
    values: new Map()
  };
}
