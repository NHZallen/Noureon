import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import { createOfficeReader, officeRequestParts } from '../src/app/ui/files/office-text/office-reader.js';
import { extractOffice, OFFICE_KINDS, officeKindOf } from '../src/app/ui/files/office-text/office-text.js';

const file = (kind) => ({ data: readFileSync(new URL(`./fixtures/office/sample.${kind}`, import.meta.url)), mimeType: OFFICE_KINDS[kind].mime, name: `sample.${kind}` });
const read = (kind, options = {}) => extractOffice(file(kind), { JSZip, DOMParser, ...options });
const base64 = (kind) => ({ inlineData: { mimeType: OFFICE_KINDS[kind].mime, name: `sample.${kind}`, data: readFileSync(new URL(`./fixtures/office/sample.${kind}`, import.meta.url)).toString('base64') } });

test('the kind of file: by its type, or by its name when the type is not known', () => {
  assert.equal(officeKindOf({ mimeType: OFFICE_KINDS.docx.mime }), 'docx');
  assert.equal(officeKindOf({ mimeType: 'application/octet-stream', name: 'a.XLSX' }), 'xlsx');
  assert.equal(officeKindOf({ mimeType: 'application/pdf', name: 'a.docx' }), '', 'a type that says another thing is believed');
  assert.equal(officeKindOf({ mimeType: 'text/plain', name: 'a.txt' }), '');
});

test('a Word file: headings, paragraphs, lists, a table (with its bar escaped), the picture marked where it is, in the order of the file', async () => {
  const content = await read('docx');
  assert.match(content.text, /^# 第一章 概述\n\n這是第一段，含 English words and 數字 123。\n\n- 第一點\n- 第二點\n\n\| 名稱 \| 數量 \|\n\| --- \| --- \|\n\| 蘋果 \| 3 \|\n\| 香蕉 \\\| 特價 \| 5 \|\n\n## Section Two\n\n\[Image 1\]\n\nText after the picture\.$/);
  assert.equal(content.imageTotal, 1);
  assert.equal(content.images.length, 1);
  assert.equal(content.images[0].mimeType, 'image/png');
  assert.equal([...content.images[0].bytes.slice(0, 4)].join(','), '137,80,78,71', 'the picture is the PNG of the file');
  assert.equal(content.usable, true);
  assert.equal(content.omitted, 0);
});

test('a PowerPoint file: each slide with its title, its text, the numbers of its chart as a table, its picture marked with the slide, its table and the notes', async () => {
  const content = await read('pptx');
  assert.match(content.text, /## Slide 1: Quarterly review\n\n- Revenue grew\n {2}- Costs fell\n\nNotes: Speaker note: mention the new market\./);
  assert.match(content.text, /## Slide 2: Chart and picture\n\n\[Chart 1\]\n\n\[Image 1: slide 2\]\n\n\[Chart 1, bar\]\n\| {2}\| Sales \| Cost \|\n\| --- \| --- \| --- \|\n\| Q1 \| 10 \| 5 \|\n\| Q2 \| 20 \| 7 \|\n\| Q3 \| 30 \| 9 \|/);
  assert.match(content.text, /## Slide 3: Table\n\n\| A \| B \|\n\| --- \| --- \|\n\| 1 \| 2 \|/);
  assert.equal(content.imageTotal, 1);
  assert.equal(content.images[0].label, 'slide 2');
  assert.equal(content.charts, 1);
});

test('an Excel file: each sheet with data as a table of what Excel shows (a date as a date, a formula with no saved value as its formula), empty sheets left out', async () => {
  const content = await read('xlsx');
  assert.match(content.text, /## Sheet: Sales\n\n\| Item \| Qty \| Date \| Total \|\n\| --- \| --- \| --- \| --- \|\n\| Apple \| 3 \| 2026-10-01 \| =B2\*2 \|\n\| Pear\\\|Plum \| 5 \| 2026-10-02 \| 10\.5 \|/);
  assert.match(content.text, /## Sheet: Notes\n\n\| note \|\n\| --- \|\n\| 中文 cell \|/);
  assert.doesNotMatch(content.text, /空表/);
  assert.equal(content.usable, true);
});

test('the pictures of a file are at most the number asked for, the rest is counted as left out', async () => {
  const content = await read('docx', { maxImages: 0 });
  assert.equal(content.images.length, 0);
  assert.equal(content.omitted, 1);
});

test('a file that is not what its kind says is refused, and a file of almost no text and some pictures is not usable (a scan)', async () => {
  await assert.rejects(() => extractOffice({ data: new TextEncoder().encode('not a zip'), mimeType: OFFICE_KINDS.docx.mime }, { JSZip, DOMParser }));
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const make = async (paragraph) => {
    const zip = new JSZip();
    zip.file('word/document.xml', `<w:document ${W}><w:body>${paragraph}</w:body></w:document>`);
    zip.file('word/_rels/document.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/scan.png"/></Relationships>');
    zip.file('word/media/scan.png', new Uint8Array([137, 80, 78, 71]));
    return extractOffice({ data: await zip.generateAsync({ type: 'uint8array' }), mimeType: OFFICE_KINDS.docx.mime }, { JSZip, DOMParser });
  };
  const scan = await make('<w:p><w:r><w:t>Hi</w:t></w:r><w:r><w:drawing><a:blip r:embed="rId1"/></w:drawing></w:r></w:p>');
  assert.equal(scan.usable, false, 'two letters and a picture are a scan, not a document');
  assert.equal(scan.imageTotal, 1);
  const note = await make('<w:p><w:r><w:t>Hi</w:t></w:r></w:p>');
  assert.equal(note.usable, true, 'a short note with no picture is a document');
});

test('the parts of a request: the text with what was left out told, and the pictures named by their number only for a model that sees', async () => {
  const content = await read('docx');
  const seen = officeRequestParts(content, { sendImages: true });
  assert.equal(seen.length, 3);
  assert.match(seen[0].text, /^# File: sample\.docx \(Word document\)\n\n# 第一章/);
  assert.equal(seen[1].text, '[Image 1] of sample.docx:');
  assert.equal(seen[2].inlineData.mimeType, 'image/png');
  assert.equal(seen[2].inlineData.name, 'image-1.png');
  const blind = officeRequestParts(content, { sendImages: false });
  assert.equal(blind.length, 1);
  assert.match(blind[0].text, /\(The file has 1 image\(s\) that this model cannot look at\.\)$/);
  const left = officeRequestParts({ ...content, omitted: 3 }, { sendImages: true });
  assert.match(left[0].text, /\(3 more image\(s\) of the file were not sent\.\)$/);
});

test('the reader: a file the model reads stays, one it cannot read becomes its content, one with pictures stays for the translator when the model cannot see, and the history is read too', async () => {
  const reader = createOfficeReader({ loadDeps: async () => ({ JSZip, DOMParser }) });
  const parts = [{ text: 'Look' }, base64('docx')];
  const reads = await reader.expandParts(parts, { canRead: () => true });
  assert.equal(reads.changed, false);
  assert.equal(reads.parts[1], parts[1], 'a file the model reads is not touched');

  const sees = await reader.expandParts(parts, { canRead: () => false, supportsVision: true });
  assert.equal(sees.changed, true);
  assert.equal(sees.parts.filter((part) => part.inlineData).length, 1);
  assert.equal(sees.parts[0].text, 'Look');

  const blindWithTranslator = await reader.expandParts(parts, { canRead: () => false, supportsVision: false, hasTranslator: true });
  assert.equal(blindWithTranslator.changed, false, 'the translator describes the pictures');
  const blindWithout = await reader.expandParts(parts, { canRead: () => false, supportsVision: false, hasTranslator: false });
  assert.equal(blindWithout.changed, true);
  assert.equal(blindWithout.parts.some((part) => part.inlineData), false);

  const sheet = await reader.expandParts([base64('xlsx')], { canRead: () => false, supportsVision: false, hasTranslator: true });
  assert.equal(sheet.changed, true, 'a workbook with no pictures needs no translator');

  const history = [{ role: 'user', parts: [{ text: 'first' }, base64('pptx')] }, { role: 'model', parts: [{ text: 'answer' }] }];
  const messages = await reader.expandMessages(history, { canRead: () => false, supportsVision: true });
  assert.match(messages[0].parts[0].text, /^first/);
  assert.equal(history[0].parts.length, 2, 'the stored message is not changed');
  assert.equal(messages[1], history[1]);

  // A file that cannot be read is left for the translator, not lost.
  const broken = await reader.expandParts([{ inlineData: { mimeType: OFFICE_KINDS.docx.mime, data: Buffer.from('nope').toString('base64') } }], { canRead: () => false });
  assert.equal(broken.changed, false);
});

test('the same file is read once however many times it comes (a file in the history comes every turn)', async () => {
  let loads = 0;
  const reader = createOfficeReader({ loadDeps: async () => { loads += 1; return { JSZip, DOMParser }; } });
  const part = base64('xlsx');
  await reader.expandParts([part], {});
  await reader.expandParts([{ inlineData: { ...part.inlineData } }], {});
  assert.equal(loads, 1);
});

test('the pictures of a file are made smaller by the page before they go (when it can), and the reader says how many it sent', async () => {
  const shrunk = [];
  const reader = createOfficeReader({ loadDeps: async () => ({ JSZip, DOMParser, shrinkImage: async (image) => { shrunk.push(image.bytes.length); return { ...image, mimeType: 'image/jpeg', bytes: new Uint8Array([1, 2, 3]) }; } }) });
  const out = await reader.expandParts([base64('docx')], { canRead: () => false, supportsVision: true });
  assert.equal(out.imagesSent, 1);
  assert.equal(shrunk.length, 1);
  const picture = out.parts.find((part) => part.inlineData);
  assert.equal(picture.inlineData.mimeType, 'image/jpeg');
  assert.equal(picture.inlineData.data, 'AQID');
  // A model that cannot see gets no picture and nothing is shrunk.
  const blind = await reader.expandParts([base64('docx')], { canRead: () => false, supportsVision: false });
  assert.equal(blind.imagesSent, 0);
  assert.equal(shrunk.length, 1);
});
