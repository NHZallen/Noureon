// Workbook spec → .xlsx. write-excel-file writes cells, styles, merges,
// column widths and frozen panes; three things are added to its package
// afterwards: cached formula results (viewers that do not calculate show
// them), autofilters on the header row, and fullCalcOnLoad so Excel
// recalculates everything when the file opens. Native charts are added as
// DrawingML parts (xlsx-charts.js).
//
// The Blob carries the layout, so the sheet preview draws exactly this.

import JSZip from 'jszip';
import writeExcelFile from 'write-excel-file/universal';
import { cellAddress, parseSpreadsheet, SpreadsheetSpecError } from './spreadsheet-spec.js';
import { isError } from './formula-engine.js';
import { addCharts } from './xlsx-charts.js';
import { layoutWorkbook } from './sheet-layout.js';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export { SpreadsheetSpecError };

const escapeXml = (value) => String(value).replace(/[<>&"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[char]));

function cellStyle(style = {}) {
  return {
    ...(style.bold ? { fontWeight: 'bold' } : {}),
    ...(style.italic ? { fontStyle: 'italic' } : {}),
    ...(style.fill ? { backgroundColor: style.fill } : {}),
    ...(style.color ? { textColor: style.color } : {}),
    ...(style.align ? { align: style.align } : {}),
    ...(style.wrap ? { wrap: true } : {}),
    ...(style.topRule ? { topBorderStyle: 'thin', topBorderColor: style.topRule } : {})
  };
}

function sheetData(sheet, source) {
  const header = sheet.header.map((cell) => ({ value: cell.display || null, type: String, alignVertical: 'center', height: 22, ...cellStyle(cell.style) }));
  const rows = sheet.rows.map((row, rowIndex) => row.map((cell, column) => {
    const style = cellStyle(cell.style);
    const original = source.rows[rowIndex][column];
    switch (cell.type) {
      case 'string': return { value: original.value, type: String, ...(cell.format === '@' ? { format: '@' } : {}), ...style };
      case 'number': return { value: original.value, type: Number, ...(cell.format ? { format: cell.format } : {}), ...style };
      case 'boolean': return { value: original.value, type: Boolean, ...style };
      case 'date': return { value: original.value, type: Date, format: cell.format || 'yyyy-mm-dd', ...style };
      case 'formula': return { value: original.formula, type: 'Formula', ...(cell.format ? { format: cell.format } : {}), ...style };
      default: return Object.keys(style).length ? { value: null, ...style } : null;
    }
  }));
  const data = [header, ...rows];
  // Merged ranges: the top-left cell spans, the others are left out.
  for (const merge of sheet.merges) {
    const anchor = data[merge.row][merge.column] || { value: null };
    data[merge.row][merge.column] = { ...anchor, ...(merge.columnSpan > 1 ? { columnSpan: merge.columnSpan } : {}), ...(merge.rowSpan > 1 ? { rowSpan: merge.rowSpan } : {}) };
    for (let row = merge.row; row < merge.row + merge.rowSpan; row += 1) {
      for (let column = merge.column; column < merge.column + merge.columnSpan; column += 1) {
        if (row !== merge.row || column !== merge.column) data[row][column] = null;
      }
    }
  }
  return data;
}

// A formula cell as the library writes it: <c r="B5" s="3"><f>…</f></c>.
function addCachedValues(xml, sheetIndex, layout) {
  const results = new Map();
  layout.sheets[sheetIndex].rows.forEach((row, rowIndex) => row.forEach((cell, column) => {
    if (cell.type === 'formula' && cell.value !== undefined) results.set(cellAddress(rowIndex + 1, column), cell.value);
  }));
  if (!results.size) return xml;
  return xml.replace(/<c r="([A-Z]+\d+)"((?:\s+[a-z]+="[^"]*")*)><f>([\s\S]*?)<\/f><\/c>/g, (match, address, attributes, formula) => {
    if (!results.has(address)) return match;
    const value = results.get(address);
    const plain = attributes.replace(/\s+t="[^"]*"/, '');
    if (isError(value)) return `<c r="${address}"${plain} t="e"><f>${formula}</f><v>${escapeXml(value.error)}</v></c>`;
    if (typeof value === 'boolean') return `<c r="${address}"${plain} t="b"><f>${formula}</f><v>${value ? 1 : 0}</v></c>`;
    if (typeof value === 'number') return `<c r="${address}"${plain}><f>${formula}</f><v>${value}</v></c>`;
    return `<c r="${address}"${plain} t="str"><f>${formula}</f><v>${escapeXml(value)}</v></c>`;
  });
}

const quoteSheet = (name) => `'${String(name).replace(/'/g, "''")}'`;

async function finishPackage(bytes, layout) {
  const zip = await JSZip.loadAsync(bytes);
  const workbookPath = 'xl/workbook.xml';
  let workbookXml = await zip.file(workbookPath).async('string');
  const filters = [];
  for (const [index, sheet] of layout.sheets.entries()) {
    const path = `xl/worksheets/sheet${index + 1}.xml`;
    const file = zip.file(path);
    if (!file) continue;
    let xml = addCachedValues(await file.async('string'), index, layout);
    if (sheet.autoFilter && sheet.header.length) {
      const range = `A1:${cellAddress(sheet.rows.length, sheet.header.length - 1)}`;
      // Schema order: sheetData, sheetCalcPr, sheetProtection, …, autoFilter.
      xml = xml.replace('</sheetData>', `</sheetData><autoFilter ref="${range}"/>`);
      filters.push(`<definedName name="_xlnm._FilterDatabase" localSheetId="${index}" hidden="1">${escapeXml(quoteSheet(sheet.name))}!$A$1:$${range.split(':')[1].replace(/(\d+)$/, '$$$1')}</definedName>`);
    }
    zip.file(path, xml);
  }
  // The library writes empty <definedNames/> and <calcPr/>; a second copy
  // of either makes Excel repair the file.
  if (filters.length) {
    if (/<definedNames\/>/.test(workbookXml)) workbookXml = workbookXml.replace('<definedNames/>', `<definedNames>${filters.join('')}</definedNames>`);
    else if (/<\/definedNames>/.test(workbookXml)) workbookXml = workbookXml.replace('</definedNames>', `${filters.join('')}</definedNames>`);
    else workbookXml = workbookXml.replace('</sheets>', `</sheets><definedNames>${filters.join('')}</definedNames>`);
  }
  const calculation = '<calcPr calcId="191029" fullCalcOnLoad="1"/>';
  workbookXml = /<calcPr\b[^>]*\/>/.test(workbookXml)
    ? workbookXml.replace(/<calcPr\b[^>]*\/>/, calculation)
    : workbookXml.replace('</workbook>', `${calculation}</workbook>`);
  zip.file(workbookPath, workbookXml);
  await addCharts(zip, layout);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

export async function buildWorkbook(descriptor, context = {}) {
  const { workbook, repairs } = parseSpreadsheet(descriptor.content, { language: context.language || 'zh-TW' });
  const layout = layoutWorkbook(workbook);
  const sheets = layout.sheets.map((sheet, index) => ({
    data: sheetData(sheet, workbook.sheets[index]),
    sheet: sheet.name,
    columns: sheet.widths.map((width) => ({ width })),
    ...(sheet.freeze.rows ? { stickyRowsCount: sheet.freeze.rows } : {}),
    ...(sheet.freeze.columns ? { stickyColumnsCount: sheet.freeze.columns } : {})
  }));
  const blob = await writeExcelFile(sheets, { fontFamily: layout.font.family, fontSize: 11 }).toBlob();
  const bytes = await finishPackage(new Uint8Array(await blob.arrayBuffer()), layout);
  return { bytes, workbook, layout, repairs };
}

export async function generateXlsxFile(descriptor, context = {}) {
  const built = await buildWorkbook(descriptor, context);
  const blob = new Blob([built.bytes], { type: XLSX_MIME });
  // The preview draws the same layout; it is not part of the file.
  Object.defineProperty(blob, 'workbook', { value: { workbook: built.workbook, layout: built.layout }, enumerable: false });
  return blob;
}
