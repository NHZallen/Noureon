// The cells of an Excel file (.xlsx) for a model that cannot read the file itself: each sheet as a table of what Excel shows (dates as dates, numbers as
// formatted), the first row as the header. A formula that has no saved value (a file a program wrote) is shown as its formula. The rows and columns the
// preview reader keeps (1000 and 60) are what is sent; a sheet that has more says so.

import { readWorkbookLayout } from '../../sandbox/xlsx-reader.js';
import { markdownTable } from './xml-tools.js';

const shown = (cell) => cell?.display || (cell?.formula ? `=${cell.formula}` : '');

/** { text, sheets, truncated } of the workbook. */
export async function readXlsxText(zip, bytes, { JSZip, DOMParser }) {
  const layout = await readWorkbookLayout({ arrayBuffer: async () => bytes }, { JSZip, DOMParser });
  const sections = [];
  let truncated = false;
  for (const sheet of layout.sheets) {
    const rows = [sheet.header, ...sheet.rows].map((row) => row.map(shown));
    // The used part of the sheet: no empty rows at the end, no empty columns at the end.
    while (rows.length && rows.at(-1).every((value) => !value)) rows.pop();
    const columns = Math.max(0, ...rows.map((row) => row.reduce((last, value, index) => (value ? index + 1 : last), 0)));
    if (!rows.length || !columns) continue;
    const table = markdownTable(rows.map((row) => row.slice(0, columns)));
    if (sheet.truncated) truncated = true;
    sections.push([`## Sheet: ${sheet.name}`, table, ...(sheet.truncated ? ['(The sheet has more rows than are shown.)'] : [])].join('\n\n'));
  }
  const media = Object.keys(zip.files).filter((name) => name.startsWith('xl/media/')).length;
  const charts = Object.keys(zip.files).filter((name) => /^xl\/charts\/chart\d+\.xml$/.test(name)).length;
  return { text: sections.join('\n\n'), sheets: layout.sheets.length, truncated, imageTotal: media, charts };
}
