import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import JSZip from 'jszip';
import { loadPyodide } from 'pyodide';

import { finalizeAssistantResponse } from '../../src/app/legacy-runtime/features/assistant-response-finalization.js';
import { generateFileBlob } from '../../src/app/ui/files/file-generators.js';
import { applyFileCards } from '../../src/app/ui/files/file-markdown-cards.js';
import { getFileBlock } from '../../src/app/ui/files/file-block-model.js';
import {
  collectSandboxInputs,
  createSandboxFileParts,
  describeSandboxFile,
  encodeBase64,
  latestRunFiles,
  loadSandboxFileBlob,
  registerSandboxFileParts,
  sandboxFileType
} from '../../src/app/ui/sandbox/sandbox-files.js';
import { formatSandboxRunBlock, liftSandboxRunBlock } from '../../src/app/ui/sandbox/sandbox-run-block.js';
import { cellPosition, displayNumber, readWorkbookLayout } from '../../src/app/ui/sandbox/xlsx-reader.js';
import { createDom } from '../behaviours/helpers/create-dom.js';

const bytes = (text) => new TextEncoder().encode(text);
let counter = 0;
const createId = () => `file-${counter += 1}`;

test('a run keeps the newest version of each file as a message part, referred to by id', async () => {
  const run = {
    status: 'done',
    steps: [
      { code: 'a', files: [{ name: 'chart.png', size: 3 }, { name: 'data.csv', size: 3 }], outputs: [{ name: 'chart.png', bytes: bytes('old') }, { name: 'data.csv', bytes: bytes('a,b') }] },
      { code: 'b', files: [{ name: 'chart.png', size: 3 }], outputs: [{ name: 'chart.png', bytes: bytes('new') }] }
    ]
  };
  const parts = createSandboxFileParts(run, { createId });
  assert.deepEqual(parts.map((part) => [part.sandboxFile.name, part.sandboxFile.mimeType, part.sandboxFile.size]), [
    ['data.csv', 'text/csv;charset=utf-8', 3],
    ['chart.png', 'image/png', 3]
  ]);
  assert.equal(run.steps[0].files[0].id, undefined, 'the first chart was replaced');
  assert.equal(run.steps[1].files[0].id, parts[1].sandboxFile.id);
  const stored = liftSandboxRunBlock(`${formatSandboxRunBlock(run)}x`).run;
  assert.deepEqual(latestRunFiles(stored).map((file) => file.name), ['data.csv', 'chart.png']);
  assert.equal(await (await loadSandboxFileBlob(parts[1].sandboxFile.id)).text(), 'new');
  assert.equal(JSON.stringify(stored).includes('"outputs"'), false);
});

test('descriptors show saved files as ready, missing or blocked, with text kept for the source view', () => {
  const csv = { id: 'csv-1', name: '銷售.csv', mimeType: 'text/csv', size: 7, data: encodeBase64(bytes('﻿a,b\n1,2')) };
  const lost = { id: 'lost-1', name: 'report.docx', mimeType: 'application/octet-stream', size: 100, data: { __astraCloudAsset: { path: 'u/x' } } };
  registerSandboxFileParts([{ sandboxFile: csv }, { sandboxFile: lost }]);
  const ready = describeSandboxFile({ id: 'csv-1', name: '銷售.csv', size: 7 });
  assert.equal(ready.state, 'ready');
  assert.equal(ready.generator, 'stored');
  assert.equal(ready.family, 'csv');
  assert.equal(ready.content, 'a,b\n1,2');
  assert.equal(getFileBlock('sandbox-csv-1'), ready, 'registered for the card buttons');
  const missing = describeSandboxFile({ id: 'lost-1', name: 'report.docx', size: 100 }, { canRerun: true });
  assert.equal(missing.state, 'missing');
  assert.equal(missing.canRerun, true);
  assert.equal(describeSandboxFile({ id: 'nothing', name: 'setup.exe' }).state, 'blocked');
  assert.notEqual(describeSandboxFile({ id: 'nothing', name: 'deck.pptx' }).pagePreview, false, 'decks Python drew are previewed by the slide reader');
  assert.equal(sandboxFileType('plot.png').family, 'image');
  assert.equal(sandboxFileType('bundle.zip').family, 'archive', 'archives Python makes are allowed');
});

test('the stored generator delivers the saved bytes', async () => {
  const data = bytes('%PDF-1.7 test');
  registerSandboxFileParts([{ sandboxFile: { id: 'pdf-1', name: 'a.pdf', mimeType: 'application/pdf', size: data.length, data: encodeBase64(data) } }]);
  const blob = await generateFileBlob(describeSandboxFile({ id: 'pdf-1', name: 'a.pdf' }));
  assert.equal(blob.type, 'application/pdf');
  assert.equal(await blob.text(), '%PDF-1.7 test');
});

test('/input gets the attachments and earlier files of the conversation, the newest of each name', () => {
  const conversation = {
    messages: [
      { role: 'user', parts: [{ text: 'hi' }, { inlineData: { name: 'data.csv', mimeType: 'text/csv', data: encodeBase64(bytes('old')) } }] },
      { role: 'model', parts: [{ text: 'x' }, { sandboxFile: { id: 'a', name: 'data.csv', mimeType: 'text/csv', data: encodeBase64(bytes('newer')) } }, { sandboxFile: { id: 'b', name: 'gone.png', data: { marker: true } } }] }
    ]
  };
  const inputs = collectSandboxInputs(conversation, [{ inlineData: { name: 'photo.jpg', mimeType: 'image/jpeg', data: encodeBase64(bytes('jpg')) } }]);
  assert.deepEqual(inputs.map((file) => [file.name, new TextDecoder().decode(file.bytes())]), [['data.csv', 'newer'], ['photo.jpg', 'jpg']]);
});

test('saved files get cards after the answer, a bundle with the other files, and a missing one offers to run again', () => {
  const { document, cleanup } = createDom('');
  try {
    registerSandboxFileParts([
      { sandboxFile: { id: 'x1', name: 'a.xlsx', size: 4, data: encodeBase64(bytes('PK..')) } },
      { sandboxFile: { id: 'x2', name: 'b.png', size: 4, data: encodeBase64(bytes('png!')) } },
      { sandboxFile: { id: 'x3', name: 'c.docx', size: 9, data: null } }
    ]);
    const root = document.createElement('div');
    root.innerHTML = '<p>The answer.</p>';
    const extra = [
      describeSandboxFile({ id: 'x1', name: 'a.xlsx' }),
      describeSandboxFile({ id: 'x2', name: 'b.png' }),
      describeSandboxFile({ id: 'x3', name: 'c.docx' }, { canRerun: true })
    ];
    applyFileCards({ document, root, blocks: [], language: 'zh-TW', extraDescriptors: extra });
    const cards = [...root.querySelectorAll('.ac-file-card')];
    assert.equal(root.firstElementChild.tagName, 'P', 'cards follow the answer');
    assert.deepEqual(cards.map((card) => card.dataset.fileState), ['ready', 'ready', 'missing']);
    assert.ok(cards[2].textContent.includes('檔案不在這台裝置上'));
    assert.ok(cards[2].querySelector('[data-file-action="rerun"]'));
    assert.equal(cards[2].querySelector('[data-file-action="download"]'), null);
    assert.equal(cards[0].querySelector('[data-file-action="copy"]'), null, 'no source to copy');
    assert.equal(root.querySelector('[data-file-action="download-all"]').dataset.fileIds, 'sandbox-x1,sandbox-x2');
  } finally {
    cleanup();
  }
});

test('the reply message keeps the files after its text', async () => {
  const conversation = { messages: [] };
  const finalAiMessage = { role: 'model', parts: [] };
  const extraParts = [{ sandboxFile: { id: 'q', name: 'q.csv', data: 'YQ==' } }];
  await finalizeAssistantResponse({
    fullResponse: 'Done.',
    extraParts,
    finalAiMessage,
    conversation,
    signal: new AbortController().signal,
    responseUsesCouncil: false,
    targetElement: null,
    uiLanguage: 'en',
    persistAppData: async () => {},
    completeSingleModelView: async () => {},
    queueBackgroundTask: () => {}
  });
  assert.deepEqual(finalAiMessage.parts, [{ text: 'Done.' }, extraParts[0]]);
});

test('cell references and number display follow Excel', () => {
  assert.deepEqual(cellPosition('B3'), { row: 2, column: 1 });
  assert.deepEqual(cellPosition('AA10'), { row: 9, column: 26 });
  assert.equal(displayNumber(0.1 + 0.2), '0.3');
  assert.equal(displayNumber(1234567.891, { thousands: true, decimals: 2 }), '1,234,567.89');
  assert.equal(displayNumber(0.256, { percent: true, decimals: 1 }), '25.6%');
  assert.equal(displayNumber(45567, { date: true }), '2024-10-02');
});

test('a workbook written by openpyxl is read into the sheet preview layout', async () => {
  const pyodide = await loadPyodide();
  for (const wheel of ['et_xmlfile-2.0.0-py3-none-any.whl', 'openpyxl-3.1.5-py2.py3-none-any.whl']) {
    // The same pinned wheels the sandbox serves, unpacked into site-packages.
    pyodide.unpackArchive(new Uint8Array(readFileSync(new URL(`../../public/sandbox/wheels/${wheel}`, import.meta.url))), 'wheel');
  }
  pyodide.runPython(`
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
wb = Workbook()
ws = wb.active
ws.title = "銷售"
ws.append(["區域", "營收", "占比"])
ws.append(["北部", 1200.5, 0.4])
ws.append(["南部", 800, 0.6])
ws["A1"].font = Font(bold=True)
ws["B1"].fill = PatternFill("solid", fgColor="FFFF00")
ws["C2"].number_format = "0.0%"
ws["C3"].number_format = "0.0%"
ws["B4"] = "=SUM(B2:B3)"
ws.merge_cells("A5:C5")
ws["A5"] = "合計說明"
ws.freeze_panes = "A2"
ws.auto_filter.ref = "A1:C3"
ws.column_dimensions["A"].width = 20
wb.create_sheet("空白")
wb.save("/tmp/book.xlsx")
`);
  const blob = new Blob([pyodide.FS.readFile('/tmp/book.xlsx')]);
  const { window, cleanup } = createDom('');
  try {
    const layout = await readWorkbookLayout(blob, { JSZip, DOMParser: window.DOMParser });
    assert.deepEqual(layout.sheets.map((sheet) => sheet.name), ['銷售', '空白']);
    const [sheet] = layout.sheets;
    assert.deepEqual(sheet.header.map((cell) => cell.display), ['區域', '營收', '占比']);
    assert.equal(sheet.header[0].style.bold, true);
    assert.equal(sheet.header[1].style.fill, '#FFFF00');
    assert.deepEqual(sheet.rows[0].map((cell) => cell.display), ['北部', '1200.5', '40.0%']);
    assert.equal(sheet.rows[0][1].style.align, 'right');
    assert.equal(sheet.rows[2][1].type, 'formula');
    assert.equal(sheet.rows[2][1].formula, 'SUM(B2:B3)');
    assert.deepEqual(sheet.merges, [{ row: 4, column: 0, rowSpan: 1, columnSpan: 3 }]);
    assert.deepEqual(sheet.freeze, { rows: 1, columns: 0 });
    assert.equal(sheet.autoFilter, true);
    assert.equal(sheet.widths[0], 20);
    assert.equal(layout.font.family, 'Microsoft JhengHei');
  } finally {
    cleanup();
  }
});
