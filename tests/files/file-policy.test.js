import assert from 'node:assert/strict';
import test from 'node:test';

import { createBundleFileName, dedupeFileNames, sanitizeFileName } from '../../src/app/ui/files/file-name-policy.js';
import { resolveFileType } from '../../src/app/ui/files/file-type-registry.js';
import {
  buildTextFileContent,
  neutralizeSpreadsheetCell,
  parseDelimited,
  sanitizeDelimitedText
} from '../../src/app/ui/files/generators/text-file.js';
import { describeFileBlock } from '../../src/app/ui/files/file-block-model.js';

test('file names are reduced to one safe path segment', () => {
  assert.equal(sanitizeFileName('../../etc/passwd.txt'), 'passwd.txt');
  assert.equal(sanitizeFileName('C:\\Users\\me\\report.docx'), 'report.docx');
  assert.equal(sanitizeFileName('a<b>c:d"e|f?g*.txt'), 'a_b_c_d_e_f_g_.txt');
  assert.equal(sanitizeFileName('  spaced   name  .md  '), 'spaced name.md');
  assert.equal(sanitizeFileName('trailing dots...'), 'trailing dots');
  assert.equal(sanitizeFileName('第三季營運報告.docx'), '第三季營運報告.docx');
});

test('invisible and bidirectional characters cannot disguise an extension', () => {
  assert.equal(sanitizeFileName('invoice\u202Etxt.exe'), 'invoicetxt.exe');
  assert.equal(resolveFileType(sanitizeFileName('invoice\u202Etxt.exe')).policy, 'block');
  assert.equal(sanitizeFileName('re\u200Bport.txt'), 'report.txt');
});

test('Windows device names are never produced', () => {
  assert.equal(sanitizeFileName('CON.txt'), '_CON.txt');
  assert.equal(sanitizeFileName('lpt1'), '_lpt1');
  assert.equal(sanitizeFileName('console.txt'), 'console.txt');
});

test('missing names and extensions fall back predictably, and long names keep their extension', () => {
  assert.equal(sanitizeFileName('', { defaultExtension: 'csv' }), 'noureon-file.csv');
  assert.equal(sanitizeFileName('notes', { defaultExtension: 'txt' }), 'notes.txt');
  const long = sanitizeFileName(`${'長'.repeat(300)}.xlsx`);
  assert.equal(Array.from(long).length, 120);
  assert.ok(long.endsWith('.xlsx'));
});

test('bundle names are unique case-insensitively', () => {
  assert.deepEqual(dedupeFileNames(['a.txt', 'A.txt', 'a.txt', 'b']), ['a.txt', 'A (2).txt', 'a (3).txt', 'b']);
  assert.equal(createBundleFileName(new Date(2026, 8, 26, 9, 5)), 'noureon-files-20260926-0905.zip');
});

test('executables, archives and macro documents are blocked; scripts only warn', () => {
  for (const name of ['setup.exe', 'run.scr', 'a.lnk', 'x.hta', 'm.docm', 'book.xlsm', 'pkg.msi', 'bundle.zip', 'app.apk', 'fix.reg']) {
    assert.equal(resolveFileType(name).policy, 'block', name);
  }
  for (const name of ['build.sh', 'deploy.ps1', 'start.bat', 'main.py', 'tool.js']) {
    assert.equal(resolveFileType(name).policy, 'warn', name);
  }
  assert.equal(resolveFileType('report.docx').generator, 'docx');
  assert.equal(resolveFileType('data.csv').family, 'csv');
  assert.equal(resolveFileType('Dockerfile').language, 'Dockerfile');
  assert.equal(resolveFileType('unknown.weird').generator, 'text');
});

test('CSV parsing honours quotes, escaped quotes and embedded line breaks', () => {
  const rows = parseDelimited('a,"b,c","say ""hi""","line\nbreak"\n1,2,3,4');
  assert.deepEqual(rows.map((row) => row.map((field) => field.value)), [
    ['a', 'b,c', 'say "hi"', 'line\nbreak'],
    ['1', '2', '3', '4']
  ]);
});

test('spreadsheet formula injection is neutralized without touching numbers', () => {
  assert.equal(neutralizeSpreadsheetCell('=HYPERLINK("http://x")'), '\'=HYPERLINK("http://x")');
  assert.equal(neutralizeSpreadsheetCell('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(neutralizeSpreadsheetCell('+cmd|calc'), "'+cmd|calc");
  assert.equal(neutralizeSpreadsheetCell('-12.5'), '-12.5');
  assert.equal(neutralizeSpreadsheetCell('+3%'), '+3%');
  assert.equal(neutralizeSpreadsheetCell('-'), '-');
  assert.equal(neutralizeSpreadsheetCell('台北'), '台北');
  assert.equal(
    sanitizeDelimitedText('name,value\n"=1+1",-5\nok,"a,b"'),
    'name,value\r\n"\'=1+1",-5\r\nok,"a,b"'
  );
});

test('CSV gets a BOM for Excel; calendar and batch files get CRLF', () => {
  const csv = buildTextFileContent(describeFileBlock({ name: 'a.csv', content: 'x,y\n1,2', complete: true }));
  assert.equal(csv, '\uFEFFx,y\r\n1,2');
  const ics = buildTextFileContent(describeFileBlock({ name: 'e.ics', content: 'BEGIN:VCALENDAR\nEND:VCALENDAR', complete: true }));
  assert.equal(ics, 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n');
  const txt = buildTextFileContent(describeFileBlock({ name: 'n.txt', content: 'hello', complete: true }));
  assert.equal(txt, 'hello\n');
});

test('block descriptors expose the state the card needs', () => {
  assert.equal(describeFileBlock({ name: 'a.txt', content: 'x', complete: true }).state, 'ready');
  assert.equal(describeFileBlock({ name: 'a.txt', content: 'x', complete: false }).state, 'incomplete');
  assert.equal(describeFileBlock({ name: 'a.exe', content: 'x', complete: true }).state, 'blocked');
  assert.equal(describeFileBlock({ name: 'a.txt', content: 'x', complete: true, oversized: true }).state, 'too-large');
  const words = describeFileBlock({ name: 'a.md', content: 'one\ntwo\nthree', complete: true });
  assert.deepEqual(words.stats, { key: 'statLines', count: 3 });
  assert.equal(describeFileBlock({ name: '', extensionHint: 'csv', content: 'a\n1', complete: true }).name, 'noureon-file.csv');
});
