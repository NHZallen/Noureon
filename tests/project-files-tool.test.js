import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { createProjectFilesLoader, passagesOf, pieceIdOf, projectFilesListText, projectPassages, READ_PROJECT_FILE_TOOL, SEARCH_PROJECT_FILES_TOOL, sourceOfPieceId } from '../src/data/project-files-tool.js';
import { textHash } from '../src/app/runtime/memory-notes/vector-math.js';
import { extractProjectFileText, textKindOf } from '../src/app/runtime/projects/project-file-text.js';
import { createOfficeReader } from '../src/app/ui/files/office-text/office-reader.js';
import { memoryDoneLabel } from '../src/app/runtime/sandbox/sandbox-texts.js';

// The tools with which the model looks into the files of a project by itself (docs/superpowers/specs/2026-10-31-projects-design.md, §16): a search over passages and a read by position, over
// the text of each file, read only when a call needs it.

const BUDGET = 'The quarterly budget for the Taipei office is 480,000 dollars. Hiring is frozen until the third quarter. Travel is cut by a fifth.\n\n'.repeat(3);
const POEM = '春天來了，花開滿山。\n\n夏天的雨落在屋頂，很安靜。\n\n秋天的風帶來桂花的香氣。\n\n冬天的夜很長，適合讀書。';
const entries = [
  { id: 'f1', name: 'budget.txt', kind: 'file', size: 1000 },
  { id: 'f2', name: 'poems.md', kind: 'file', size: 800 },
  { id: 'f3', name: 'scan.pdf', kind: 'file', size: 90000 }
];
const texts = { f1: BUDGET, f2: POEM, f3: '' };
const loaderWith = (extra = {}) => {
  const reads = [];
  const loader = createProjectFilesLoader({ entries, readText: async (entry) => { reads.push(entry.id); return texts[entry.id]; }, ...extra });
  return { loader, reads };
};

test('the passages are cut at the end of a line or sentence, overlap a little and say where they are', () => {
  const passages = passagesOf('a'.repeat(500) + '\n' + 'b'.repeat(600) + '\n' + 'c'.repeat(300), { size: 900, overlap: 100 });
  assert.ok(passages.length >= 2);
  assert.equal(passages[0].start, 0);
  assert.ok(passages[0].end <= 900);
  assert.ok(passages[1].start < passages[0].end, 'they overlap');
  assert.equal(passages.at(-1).end, 1402);
  assert.deepEqual(passagesOf('   '), []);
});

test('the tools are offered while there are files and calls left, and the search finds the passage with the file and the place', async () => {
  const { loader } = loaderWith();
  assert.deepEqual(loader.tools.map((tool) => tool.name), [SEARCH_PROJECT_FILES_TOOL.name, READ_PROJECT_FILE_TOOL.name]);
  assert.equal(loader.handles('search_project_files'), true);
  assert.equal(loader.handles('memory_write'), false);
  const answer = JSON.parse(await loader.run({ name: 'search_project_files', args: { query: 'Taipei office budget' } }));
  assert.equal(answer.passages[0].file, 'budget.txt');
  assert.match(answer.passages[0].text, /480,000 dollars/);
  assert.equal(answer.passages[0].start, 0);
  assert.deepEqual(answer.no_text, ['scan.pdf'], 'a file with no text is said so');
  assert.deepEqual(loader.outcome(), { key: 'projectFilesSearching', count: answer.passages.length });
  assert.equal(loader.outcome(), null, 'told once');
});

test('Chinese is found too, and a search can be limited to one file', async () => {
  const { loader } = loaderWith();
  const found = JSON.parse(await loader.run({ name: 'search_project_files', args: { query: '秋天 桂花' } }));
  assert.equal(found.passages[0].file, 'poems.md');
  const only = await loader.run({ name: 'search_project_files', args: { query: 'budget', file: 'poems' } });
  assert.match(only, /Nothing in the project files matches/);
  assert.match(await loader.run({ name: 'search_project_files', args: { query: 'budget', file: 'nothing.docx' } }), /There is no such file/);
});

test('nothing matching says so and lists the files; the model is not given anything made up', async () => {
  const { loader } = loaderWith();
  const answer = await loader.run({ name: 'search_project_files', args: { query: 'submarine propulsion' } });
  assert.match(answer, /budget\.txt, poems\.md, scan\.pdf/);
  assert.deepEqual(loader.outcome(), { key: 'projectFilesSearching', count: 0 });
});

test('a file is read part by part from a place, with where the next part begins; a file with no text says so', async () => {
  const { loader } = loaderWith();
  const first = JSON.parse(await loader.run({ name: 'read_project_file', args: { file: 'budget.txt', start: 0, length: 200 } }));
  assert.equal(first.text.length, 200);
  assert.equal(first.next, 200);
  assert.equal(first.total, BUDGET.length);
  const rest = JSON.parse(await loader.run({ name: 'read_project_file', args: { file: 'BUDGET', start: first.next, length: 12000 } }));
  assert.equal(rest.next, null);
  assert.equal(rest.text, BUDGET.slice(200));
  assert.match(await loader.run({ name: 'read_project_file', args: { file: 'scan.pdf' } }), /No text could be read/);
  assert.equal(JSON.parse(await loader.run({ name: 'read_project_file', args: { file: 'poems.md', start: 99999 } })).text, '');
});

test('the text of a file is read only when a call needs it, and once', async () => {
  const { loader, reads } = loaderWith();
  assert.deepEqual(reads, []);
  await loader.run({ name: 'read_project_file', args: { file: 'poems.md' } });
  await loader.run({ name: 'read_project_file', args: { file: 'poems.md' } });
  assert.deepEqual(reads, ['f2']);
  await loader.run({ name: 'search_project_files', args: { query: 'budget' } });
  assert.deepEqual([...reads].sort(), ['f1', 'f2', 'f3'], 'a search reads them all, once each');
});

test('a file that cannot be read does not break the search, and the number of calls is limited', async () => {
  const loader = createProjectFilesLoader({ entries: entries.slice(0, 2), maxCalls: 2, readText: async (entry) => { if (entry.id === 'f2') throw new Error('gone'); return BUDGET; } });
  assert.equal(JSON.parse(await loader.run({ name: 'search_project_files', args: { query: 'budget' } })).passages[0].file, 'budget.txt');
  assert.match(await loader.run({ name: 'read_project_file', args: { file: 'poems.md' } }), /could not be read/);
  assert.deepEqual(loader.tools, [], 'no tools once the calls are used');
  assert.match(await loader.run({ name: 'search_project_files', args: { query: 'x' } }), /limit of 2/);
});

test('one file needs no name, the used files are told, and the rows of the step list have their words', async () => {
  const used = [];
  const loader = createProjectFilesLoader({ entries: [entries[1]], readText: async () => POEM, onUsed: ({ files }) => used.push(...files) });
  assert.match(await loader.run({ name: 'read_project_file', args: {} }), /春天來了/);
  assert.deepEqual(used, ['poems.md']);
  assert.equal(loader.stepEvent({ name: 'read_project_file' }, 'en').label, 'Reading a project file…');
  assert.equal(loader.stepEvent({ name: 'search_project_files' }, 'zh-TW').label, '正在查閱專案檔案…');
  assert.equal(memoryDoneLabel('en', 'projectFilesSearching', 3), 'Looked through the project files: 3 passages');
  assert.equal(memoryDoneLabel('en', 'projectFilesSearching', 0), 'Looked through the project files: nothing relevant');
  assert.equal(memoryDoneLabel('zh-TW', 'projectFilesReading', 1), '閱讀了專案檔案');
  assert.match(projectFilesListText([{ name: 'a.pdf', kind: 'file', kindText: 'PDF', size: 2048 }]), /^- a\.pdf \(PDF, 2 KB\)$/);
});

test('the text of a file: text as it is, a PDF by its pages, a Word or PowerPoint file by the reader of attachments, a picture none', async () => {
  const getPdfjs = () => import('pdfjs-dist/legacy/build/pdf.mjs');
  const encode = (text) => new TextEncoder().encode(text);
  assert.equal(textKindOf({ name: 'a.md' }), 'text');
  assert.equal(textKindOf({ name: 'a.pdf' }), 'pdf');
  assert.equal(textKindOf({ name: 'a.pptx' }), 'office');
  assert.equal(textKindOf({ name: 'a.png', mime: 'image/png' }), '');
  assert.equal(await extractProjectFileText({ bytes: encode('# Title\r\n\r\nHello'), name: 'a.md' }), '# Title\n\nHello');
  assert.equal(await extractProjectFileText({ bytes: encode('x'), name: 'a.png', mime: 'image/png' }), '');
  const pdf = encode(`%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 44>>stream
BT /F1 18 Tf 20 100 Td (Hello retrieval) Tj ET
endstream endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
trailer<</Root 1 0 R/Size 6>>
%%EOF`);
  assert.match(await extractProjectFileText({ bytes: pdf, name: 'a.pdf', getPdfjs }), /\[Page 1\]\s*Hello retrieval/);
  assert.equal(await extractProjectFileText({ bytes: pdf, name: 'a.pdf' }), '', 'no pdf.js, no text');
  const officeReader = createOfficeReader({ loadDeps: async () => ({ JSZip: (await import('jszip')).default, DOMParser: (await import('@xmldom/xmldom')).DOMParser }) });
  const deck = new Uint8Array(fs.readFileSync(new URL('./fixtures/free-deck.pptx', import.meta.url)));
  const deckText = await extractProjectFileText({ bytes: deck, name: 'free-deck.pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', officeReader });
  assert.ok(deckText.length > 20, 'the words of the slides');
});

test('the piece of a passage is named by its source and its number, and the search and the vectors cut the same passages', () => {
  assert.equal(pieceIdOf('abc-1', 3), 'src:abc-1:3');
  assert.equal(sourceOfPieceId('src:abc-1:3'), 'abc-1');
  assert.equal(sourceOfPieceId('src:a:b:12'), 'a:b', 'the number is what follows the last colon');
  assert.equal(sourceOfPieceId('conv:x:1'), '', 'a piece of a past conversation is not one of a project');
  const passages = projectPassages([{ id: 'f1', name: 'budget.txt', text: BUDGET }, { id: 'f2', name: 'poems.md', text: POEM }, { id: 'f9', name: 'empty', text: '' }]);
  assert.deepEqual(passages.map((passage) => passage.id).slice(0, 2), ['src:f1:0', 'src:f2:0']);
  assert.deepEqual(passages.map((passage) => passage.number), passages.map((passage) => Number(passage.id.split(':')[2])));
  assert.equal(passages.every((passage) => passage.text && passage.end > passage.start), true);
  assert.equal(projectPassages([{ id: 'f1', name: 'a', text: 'x'.repeat(5000) }, { id: 'f2', name: 'b', text: 'y'.repeat(5000) }], { budget: 5500 }).filter((passage) => passage.file.id === 'f2').every((passage) => passage.end <= 500), true, 'the budget is shared by the files in order');
});

test('the search puts the keywords and the vectors together; a vector of text that changed, or one that fails, does not count', async () => {
  const poems = projectPassages([{ id: 'f2', name: 'poems.md', text: POEM }]);
  const spring = poems[0];
  const asked = [];
  // The vectors find the poem when the words of the question are not in it at all.
  const meaning = async (query, options) => { asked.push({ query, options }); return [{ id: spring.id, hash: textHash(spring.text), cosine: 0.8 }]; };
  const { loader } = loaderWith({ vectorSearch: meaning });
  const found = JSON.parse(await loader.run({ name: 'search_project_files', args: { query: 'zzzz qqqq' } }));
  assert.equal(found.search, 'keywords and meaning');
  assert.equal(found.passages[0].file, 'poems.md');
  assert.deepEqual(asked[0].options.fileIds, ['f1', 'f2', 'f3'], 'asked about every file, a file the tools cannot read included');
  // The same hit with the hash of other text: not used.
  const stale = loaderWith({ vectorSearch: async () => [{ id: spring.id, hash: 'old', cosine: 0.9 }] }).loader;
  assert.match(await stale.run({ name: 'search_project_files', args: { query: 'zzzz qqqq' } }), /Nothing in the project files matches/);
  // A passage that is not in the files, and a failing search: the keywords alone.
  const odd = loaderWith({ vectorSearch: async () => [{ id: 'src:nowhere:0', hash: 'x', cosine: 0.9 }] }).loader;
  assert.equal(JSON.parse(await odd.run({ name: 'search_project_files', args: { query: 'budget Taipei' } })).search, 'keywords');
  const broken = loaderWith({ vectorSearch: async () => { throw new Error('offline'); } }).loader;
  const fallback = JSON.parse(await broken.run({ name: 'search_project_files', args: { query: 'budget Taipei' } }));
  assert.equal(fallback.search, 'keywords');
  assert.equal(fallback.passages[0].file, 'budget.txt');
  // A call about one file looks only in that file, for the keywords and for the vectors.
  const only = loaderWith({ vectorSearch: async () => [{ id: spring.id, hash: textHash(spring.text), cosine: 0.8 }] }).loader;
  assert.match(await only.run({ name: 'search_project_files', args: { query: 'zzzz qqqq', file: 'budget.txt' } }), /Nothing in the project files matches/);
});

test('what both find ranks above what only one finds', async () => {
  const both = projectPassages([{ id: 'f1', name: 'budget.txt', text: BUDGET }, { id: 'f2', name: 'poems.md', text: POEM }]);
  const budgetPiece = both.find((passage) => passage.file.id === 'f1');
  const poemPiece = both.find((passage) => passage.file.id === 'f2');
  const { loader } = loaderWith({ vectorSearch: async () => [{ id: poemPiece.id, hash: textHash(poemPiece.text), cosine: 0.9 }, { id: budgetPiece.id, hash: textHash(budgetPiece.text), cosine: 0.7 }] });
  const found = JSON.parse(await loader.run({ name: 'search_project_files', args: { query: 'budget Taipei hiring' } }));
  assert.equal(found.passages[0].file, 'budget.txt', 'the keywords and the vectors agree on it');
});
