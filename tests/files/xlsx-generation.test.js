import assert from 'node:assert/strict';
import test from 'node:test';
import { DOMParser } from '@xmldom/xmldom';
import JSZip from 'jszip';

import { describeFileBlock } from '../../src/app/ui/files/file-block-model.js';
import { buildFileMetaText } from '../../src/app/ui/files/file-card-renderer.js';
import { generateFileBlob } from '../../src/app/ui/files/file-generators.js';
import { evaluateWorkbook } from '../../src/app/ui/files/generators/formula-engine.js';
import { formatCellValue, layoutWorkbook } from '../../src/app/ui/files/generators/sheet-layout.js';
import { parseSpreadsheet, parseValueText, sanitizeFormula, SHEET_LIMITS, SpreadsheetSpecError } from '../../src/app/ui/files/generators/spreadsheet-spec.js';
import { renderXlsxPreview } from '../../src/app/ui/files/previews/xlsx-sheet-preview.js';
import { createDom } from '../behaviours/helpers/create-dom.js';

const FINANCE = JSON.stringify({
  accent: '#1F6F43',
  sheets: [
    {
      name: '季度營收',
      columns: [{ header: '市場' }, { header: 'Q1', format: 'integer' }, { header: 'Q2', format: 'integer' }, { header: '全年', format: 'integer' }, { header: '占比', format: 'percent' }],
      rows: [
        ['台灣', 1200, 1250, { formula: 'SUM(B2:C2)' }, { formula: 'IF(D5=0,0,D2/D5)' }],
        ['日本', 980, 940, { formula: 'SUM(B3:C3)' }, { formula: 'IF(D5=0,0,D3/D5)' }],
        ['新加坡', 450, 480, { formula: 'SUM(B4:C4)' }, { formula: 'IF(D5=0,0,D4/D5)' }],
        ['合計', { formula: 'SUM(B2:B4)' }, { formula: 'SUM(C2:C4)' }, { formula: 'SUM(D2:D4)' }, { formula: 'SUM(E2:E4)' }]
      ]
    },
    {
      name: "Q3 'notes'",
      columns: ['日期', '項目', { header: '金額', currency: 'TWD' }, '連結'],
      rows: [
        ['2025-01-15', '伺服器', 32000, { formula: 'HYPERLINK("https://noureon.com","site")' }],
        ['2025-02-03', { value: '廣告', bold: true, fill: '#FFF2CC' }, 18500, '=SUM(A1)'],
        ['小計', null, { formula: 'SUM(C2:C3)' }, { formula: "'季度營收'!D5/1000" }]
      ],
      merges: ['A4:B4'],
      freeze: 'B2'
    }
  ]
});

const generate = async (content, name = '報表.xlsx') => {
  const blob = await generateFileBlob(describeFileBlock({ name, content, complete: true }), { language: 'zh-TW' });
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  return { blob, zip, read: (path) => zip.file(path)?.async('string') };
};

test('formulas only come from the formula field and never reach outside the workbook', () => {
  assert.equal(sanitizeFormula('=SUM(B2:B9)'), 'SUM(B2:B9)');
  assert.equal(sanitizeFormula("'Other sheet'!B2*2"), "'Other sheet'!B2*2");
  assert.equal(sanitizeFormula('WEBSERVICE("https://evil.example")'), null);
  assert.equal(sanitizeFormula('filterxml(A1,"//x")'), null);
  assert.equal(sanitizeFormula("cmd|' /C calc'!A0"), null, 'DDE');
  assert.equal(sanitizeFormula('[Budget.xlsx]Sheet1!A1'), null, 'other workbooks');
  assert.equal(sanitizeFormula('HYPERLINK("file:///C:/x","a")'), null);
  assert.equal(sanitizeFormula('HYPERLINK("https://noureon.com","a")'), 'HYPERLINK("https://noureon.com","a")');
  assert.equal(sanitizeFormula('CONCAT("a|b","[c]")'), 'CONCAT("a|b","[c]")', 'characters inside strings are fine');
  assert.equal(sanitizeFormula('x'.repeat(SHEET_LIMITS.formula + 1)), null);

  const { workbook, repairs } = parseSpreadsheet(FINANCE);
  const notes = workbook.sheets[1];
  assert.equal(notes.rows[1][3].type, 'string', 'text starting with = stays text');
  assert.equal(notes.rows[1][3].value, '=SUM(A1)');
  assert.equal(notes.rows[0][3].type, 'formula');
  assert.deepEqual(repairs, []);
  const refused = parseSpreadsheet(JSON.stringify({ rows: [['a'], [{ formula: 'RTD("x",,"y")' }]] }));
  assert.equal(refused.workbook.sheets[0].rows[0][0].type, 'string');
  assert.equal(refused.repairs[0].code, 'formula-refused');
});

test('values are read the way people write them', () => {
  assert.deepEqual(parseValueText('1,234.5'), { kind: 'number', value: 1234.5, decimals: 1, currency: null, grouped: true });
  assert.equal(parseValueText('−3.2%').value, -0.032);
  assert.equal(parseValueText('NT$ 1,200').currency, 'TWD');
  assert.equal(parseValueText('(500)').value, -500);
  assert.equal(parseValueText('1,200 元').currency, 'TWD');
  assert.equal(parseValueText('USD 12.50').currency, 'USD');
  assert.equal(parseValueText('00123'), null, 'codes with leading zeros stay text');
  assert.equal(parseValueText('0.5').value, 0.5);
  assert.equal(parseValueText('2026-01-31').kind, 'date');
  assert.equal(parseValueText('about 5'), null);
});

test('Markdown tables and CSV become typed sheets', () => {
  const markdown = '## 業務名單\n\n| 姓名 | 業績 | 達成率 | 年度 |\n|:--|--:|:-:|---|\n| 王 | NT$ 1,234,000 | 102.5% | 2024 |\n| Lee | NT$ 980,500 | 88% | 2025 |\n\n| SKU | Price |\n|---|---|\n| 00123 | $12.50 |';
  const { workbook } = parseSpreadsheet(markdown);
  assert.deepEqual(workbook.sheets.map((sheet) => sheet.name), ['業務名單', 'Sheet2']);
  const [sales, products] = workbook.sheets;
  assert.equal(sales.columns[1].format, '"NT$"#,##0');
  assert.equal(sales.columns[2].format, '0.0%');
  assert.equal(sales.columns[2].align, 'center');
  assert.equal(sales.columns[3].format, '0', 'years get no thousands separator');
  assert.equal(sales.rows[0][1].value, 1234000);
  assert.equal(products.rows[0][0].type, 'string');
  assert.equal(products.rows[0][1].value, 12.5);

  const csv = parseSpreadsheet('Region;Sales\nNorth;"1,5"\nSouth;3').workbook.sheets[0];
  assert.deepEqual(csv.columns.map((column) => column.header), ['Region', 'Sales']);
  assert.throws(() => parseSpreadsheet('just words'), SpreadsheetSpecError);
});

test('sizes, names and merges are bounded', () => {
  const rows = Array.from({ length: SHEET_LIMITS.rows + 5 }, (_, index) => [index]);
  const { workbook, repairs } = parseSpreadsheet(JSON.stringify({ sheets: [
    { name: 'A/B:C*?[x]', rows: [['n'], ...rows] },
    { name: 'a/b:c*?[x]', rows: [['n'], [1]], merges: ['A1:A1', 'A1:C9', 'A1:A2'] }
  ] }));
  assert.equal(workbook.sheets[0].rows.length, SHEET_LIMITS.rows);
  assert.equal(repairs.find((repair) => repair.code === 'rows-truncated').from, SHEET_LIMITS.rows + 5);
  assert.equal(workbook.sheets[0].name, 'A B C   x');
  assert.notEqual(workbook.sheets[1].name.toLowerCase(), workbook.sheets[0].name.toLowerCase(), 'sheet names stay unique');
  assert.deepEqual(workbook.sheets[1].merges, [{ row: 0, column: 0, rowSpan: 2, columnSpan: 1 }], 'only valid merges survive');
  const many = parseSpreadsheet(JSON.stringify({ sheets: Array.from({ length: 25 }, () => ({ rows: [['x'], [1]] })) }));
  assert.equal(many.workbook.sheets.length, SHEET_LIMITS.sheets);
});

test('the formula engine computes common formulas and gives up on the rest', () => {
  const { workbook } = parseSpreadsheet(JSON.stringify({ sheets: [
    { name: 'Data', rows: [['a', 'b', 'c'],
      [10, 0, { formula: 'IF(B2=0,0,A2/B2)' }],
      [20, 4, { formula: 'IFERROR(A3/0,"n/a")' }],
      [30, 5, { formula: 'SUMIF(A2:A4,">15",B2:B4)' }],
      [{ formula: 'A5' }, { formula: 'TODAY()' }, { formula: 'ROUND(AVERAGE(A2:A4),1)&" avg"' }],
      [{ formula: 'Other!A2*2' }, { formula: '10%*A2' }, { formula: 'A6+1' }]] },
    { name: 'Other', rows: [['x'], [21]] }
  ] }));
  const values = evaluateWorkbook(workbook);
  const at = (row, column, sheet = 0) => values.get(`${sheet}:${row}:${column}`);
  assert.equal(at(1, 2), 0, 'IF evaluates only the branch it takes');
  assert.equal(at(2, 2), 'n/a');
  assert.equal(at(3, 2), 9);
  assert.deepEqual(at(4, 0), { error: '#REF!' }, 'a cell referring to itself');
  assert.equal(at(4, 1), undefined, 'volatile and unknown functions are left to Excel');
  assert.equal(at(4, 2), '20 avg');
  assert.equal(at(5, 0), 42);
  assert.equal(at(5, 1), 1);
});

test('the workbook opens as valid Excel parts with cached results, filters and frozen panes', async () => {
  const { read, blob } = await generate(FINANCE);
  const parser = new DOMParser({ onError: (level, message) => { if (level !== 'warning') throw new Error(message); } });
  const parts = ['xl/workbook.xml', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'xl/sharedStrings.xml'];
  for (const part of parts) parser.parseFromString(await read(part), 'application/xml');
  const workbookXml = await read('xl/workbook.xml');
  assert.equal((workbookXml.match(/<definedNames/g) || []).length, 1);
  assert.equal((workbookXml.match(/<calcPr/g) || []).length, 1);
  assert.match(workbookXml, /<calcPr calcId="191029" fullCalcOnLoad="1"\/>/);
  assert.match(workbookXml, /<definedName name="_xlnm._FilterDatabase" localSheetId="1" hidden="1">'Q3 ''notes'!\$A\$1:\$D\$4<\/definedName>/);
  const first = await read('xl/worksheets/sheet1.xml');
  assert.match(first, /<c r="D2"[^>]*><f>SUM\(B2:C2\)<\/f><v>2450<\/v><\/c>/);
  assert.match(first, /<c r="D5"[^>]*><f>SUM\(D2:D4\)<\/f><v>5300<\/v><\/c>/);
  assert.match(first, /<\/sheetData><autoFilter ref="A1:E5"\/>/);
  assert.match(first, /<pane ySplit="1"[^>]*state="frozen"\/>/);
  const second = await read('xl/worksheets/sheet2.xml');
  assert.match(second, /<c r="D2"[^>]*><f>HYPERLINK\("https:\/\/noureon.com","site"\)<\/f><\/c>/, 'HYPERLINK is left to Excel (no cached value)');
  assert.match(second, /<col min="4" max="4" width="10"/, 'an uncalculated formula does not widen its column (the text "=SUM(A1)" sets it)');
  assert.match(second, /<c r="D4"[^>]*><f>'季度營收'!D5\/1000<\/f><v>5.3<\/v><\/c>/);
  assert.match(second, /<mergeCell ref="A4:B4"\/>/);
  assert.match(second, /xSplit="1"/);
  assert.match(await read('xl/styles.xml'), /Microsoft JhengHei/, 'Chinese sheets use an installed CJK font');
  assert.equal(blob.workbook.layout.sheets.length, 2);
});

test('the layout: accent header, bands, bold total under a rule, formatted values', () => {
  const { workbook } = parseSpreadsheet(FINANCE);
  const layout = layoutWorkbook(workbook);
  const [sheet] = layout.sheets;
  assert.equal(sheet.header[0].style.fill, layout.colors.header);
  assert.equal(sheet.header[1].style.align, 'right', 'number column headers align with their numbers');
  assert.equal(sheet.rows[1][0].style.fill, layout.colors.band);
  assert.equal(sheet.rows[0][0].style.fill, undefined);
  assert.equal(sheet.rows[3][0].style.bold, true, 'the 合計 row is the total');
  assert.equal(sheet.rows[3][1].style.topRule, layout.colors.rule);
  assert.equal(sheet.rows[3][3].display, '5,300');
  assert.equal(sheet.rows[0][4].display, '46.2%');
  assert.equal(formatCellValue(1234.5, '"NT$"#,##0'), 'NT$1,235');
  assert.equal(formatCellValue(-0.032, '0.0%'), '-3.2%');
  assert.equal(formatCellValue(new Date(Date.UTC(2025, 0, 5)), 'yyyy-mm-dd'), '2025-01-05');
  assert.equal(formatCellValue(1500.25, '#,##0.00 "€"'), '1,500.25 €');
  assert.equal(formatCellValue(0.1 + 0.2, undefined), '0.3');
  assert.equal(layoutWorkbook(parseSpreadsheet('a,b\n1,2').workbook).font.family, 'Aptos Narrow');
});

test('file cards count sheets and rows', () => {
  const card = describeFileBlock({ name: '報表.xlsx', content: FINANCE, complete: true });
  assert.equal(card.state, 'ready');
  assert.equal(buildFileMetaText('zh-TW', card), 'Excel 試算表 · 2 個工作表 · 7 列');
  assert.equal(buildFileMetaText('en', describeFileBlock({ name: 'a.xlsx', content: '| a |\n|---|\n| 1 |\n| 2 |', complete: true })), 'Excel spreadsheet · 2 rows');
});

test('the sheet preview draws tabs, merges, filters and frozen panes', async () => {
  const { document, window, cleanup } = createDom('<div id="host"></div>');
  try {
    const { blob } = await generate(FINANCE);
    const host = document.getElementById('host');
    const view = await renderXlsxPreview(blob, host, { window, document, limitText: (count) => `first ${count}` });
    const root = host.shadowRoot;
    assert.equal(view.pageCount, 2);
    const tabs = [...root.querySelectorAll('[role="tab"]')];
    assert.deepEqual(tabs.map((tab) => tab.textContent), ['季度營收', "Q3 'notes"], 'a trailing apostrophe is not allowed in sheet names');
    assert.equal(root.querySelector('[data-cell="D5"]').textContent, '5,300');
    assert.equal(root.querySelectorAll('thead th').length, 6, 'corner and column letters');
    assert.equal(root.querySelectorAll('.filter').length, 5);
    assert.ok(root.querySelector('[data-cell="A1"]').classList.contains('frozen-row'));
    tabs[1].click();
    assert.equal(tabs[1].getAttribute('aria-selected'), 'true');
    assert.equal(root.querySelector('[data-cell="A4"]').colSpan, 2);
    assert.equal(root.querySelector('[data-cell="B4"]'), null, 'merged cells are covered');
    assert.ok(root.querySelector('[data-cell="A2"]').classList.contains('frozen-column'));
    assert.equal(root.querySelector('.limit').hidden, true);
    view.dispose();
    assert.equal(root.childNodes.length, 0);
  } finally {
    cleanup();
  }
});
