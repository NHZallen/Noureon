import assert from 'node:assert/strict';
import test from 'node:test';
import JSZip from 'jszip';

import {
  extractDocxDocument,
  extractPptxDocument,
  extractXlsxDocument
} from '../src/app/runtime/documents/office-document-extractors.js';

const zipBytes = async files => {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) zip.file(path, content);
  return new Uint8Array(await zip.generateAsync({ type: 'uint8array' }));
};

test('DOCX extraction preserves headings, paragraphs, tables, and auxiliary OOXML text', async () => {
  const bytes = await zipBytes({
    '[Content_Types].xml': `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    'word/document.xml': `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Budget</w:t></w:r></w:p><w:p><w:r><w:t>Overview</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Item</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Amount</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>Cloud</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>10</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>`,
    'word/footnotes.xml': `<w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:footnote w:id="1"><w:p><w:r><w:t>Verified footnote</w:t></w:r></w:p></w:footnote></w:footnotes>`
  });
  const result = await extractDocxDocument({ bytes, name: 'budget.docx' });
  assert.equal(result.method, 'mammoth-ooxml');
  assert.equal(result.sections.some(section => section.chunkType === 'table'
    && section.headers[0] === 'Item' && section.rows[0][1] === '10'), true);
  assert.equal(result.sections.some(section => section.text?.includes('Verified footnote')), true);
});

test('XLSX extraction preserves formula, display, merged, and hidden metadata', async () => {
  const bytes = await zipBytes({
    'xl/workbook.xml': `<workbook xmlns:r="r"><sheets><sheet name="2026預算" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`,
    'xl/sharedStrings.xml': `<sst><si><t>Item</t></si><si><t>Amount</t></si><si><t>Cloud</t></si><si><t>Total</t></si></sst>`,
    'xl/styles.xml': `<styleSheet><cellXfs count="1"><xf numFmtId="0"/></cellXfs></styleSheet>`,
    'xl/worksheets/sheet1.xml': `<worksheet><dimension ref="A1:B3"/><cols><col min="2" max="2" hidden="1"/></cols><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>10</v></c></row><row r="3" hidden="1"><c r="A3" t="s"><v>3</v></c><c r="B3"><f>B2*2</f><v>20</v></c></row></sheetData><mergeCells><mergeCell ref="A2:A3"/></mergeCells></worksheet>`
  });
  const result = await extractXlsxDocument({ bytes, name: 'budget.xlsx' });
  const table = result.sections[0];
  assert.equal(table.sourceLocator.sheet, '2026預算');
  assert.equal(table.tableMetadata.merges.includes('A2:A3'), true);
  assert.equal(table.tableMetadata.hiddenRows.includes(3), true);
  assert.equal(table.tableMetadata.hiddenColumns.includes('B'), true);
  assert.equal(table.tableMetadata.cells.some(cell => cell.formula === 'B2*2'), true);
  assert.equal(table.tableMetadata.cells.some(cell => cell.address === 'A3' && cell.mergedFrom === 'A2'), true);
});

test('PPTX extraction preserves text boxes, picture alt text, tables, and notes', async () => {
  const bytes = await zipBytes({
    'ppt/slides/slide1.xml': `<p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:sp><p:nvSpPr><p:cNvPr id="1" name="Title"/></p:nvSpPr><p:txBody><a:p><a:r><a:t>Quarterly report</a:t></a:r></a:p></p:txBody></p:sp><p:pic><p:nvPicPr><p:cNvPr id="2" name="Chart" descr="Revenue chart"/></p:nvPicPr></p:pic><p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="3" name="Data table"/></p:nvGraphicFramePr><a:graphic><a:graphicData><a:tbl><a:tr><a:tc><a:txBody><a:p><a:r><a:t>Region</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:p><a:r><a:t>Amount</a:t></a:r></a:p></a:txBody></a:tc></a:tr><a:tr><a:tc><a:txBody><a:p><a:r><a:t>North</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:p><a:r><a:t>12</a:t></a:r></a:p></a:txBody></a:tc></a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame></p:cSld></p:sld>`,
    'ppt/notesSlides/notesSlide1.xml': `<p:notes xmlns:p="p" xmlns:a="a"><a:t>Speaker detail</a:t></p:notes>`
  });
  const result = await extractPptxDocument({ bytes, name: 'report.pptx' });
  assert.equal(result.sections.some(section => section.text?.includes('Revenue chart')), true);
  assert.equal(result.sections.some(section => section.chunkType === 'table'
    && section.headers[0] === 'Region' && section.rows[0][1] === '12'), true);
  assert.equal(result.sections.some(section => section.text?.includes('Speaker detail')), true);
});
