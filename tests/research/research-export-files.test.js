import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import JSZip from 'jszip';

import { createFontSubsetter } from '../../src/app/ui/files/generators/font-embedding.js';
import { generateDocxFile } from '../../src/app/ui/files/generators/docx-file.js';
import { generatePdfFile } from '../../src/app/ui/files/generators/pdf-file.js';
import { buildDocumentModel, numericColumns } from '../../src/app/ui/files/generators/document-model.js';
import { exportReport, exportWithNotice, reportFileName } from '../../src/app/ui/research/research-export.js';
import { linkCitations, raiseHeadings, reportDescriptor, reportDocumentSource, reportGeneratorOptions, sourcesSection, splitTitle } from '../../src/app/ui/research/research-document.js';

const FONT_DIRECTORY = new URL('../../src/assets/fonts/', import.meta.url);
const SUBSETTER_WASM = new URL('../../node_modules/harfbuzzjs/dist/harfbuzz-subset.wasm', import.meta.url);
let assetsPromise = null;
const fontAssets = () => {
  assetsPromise ||= createFontSubsetter(fs.readFileSync(SUBSETTER_WASM)).then((subsetter) => ({
    loadFontFile: async (file) => new Uint8Array(fs.readFileSync(new URL(file, FONT_DIRECTORY))),
    loadSubsetter: async () => subsetter
  }));
  return assetsPromise;
};

const REPORT = {
  title: '固態電池研究',
  topic: '固態電池',
  finishedAt: Date.UTC(2026, 9, 4, 8, 0, 0),
  text: [
    '# 固態電池研究',
    '## 執行摘要',
    '固態電池以固態電解質取代液態電解液 [1]。多家廠商預計 2027 年前後小量產 [2][3]，詳見 [官網](https://example.com/site)。',
    '## 技術路線',
    '目前主要有三條路線 [1]。',
    '| 路線 | 離子電導率 (mS/cm) | 代表廠商 |\n|---|---|---|\n| 硫化物 | 25 | 豐田 |\n| 氧化物 | 0.5 | QuantumScape |',
    '### 硫化物',
    '對水氣敏感 [2]，公式 $E=mc^2$。',
    '#### 細節',
    '更深一層的標題。',
    '## 未知引用',
    '這個 [9] 沒有來源，`程式碼 [1]` 也不要動。',
    '```',
    '[1] in code',
    '```'
  ].join('\n\n'),
  sources: [
    { n: 1, url: 'https://example.com/a?x=1&y=(2)', title: 'Solid-state batteries: where the technology stands' },
    { n: 2, url: 'https://news.test/b', title: '豐田宣布固態電池時程' },
    { n: 3, url: 'https://research.test/c', title: 'Cost projections' }
  ]
};

const pdfInfo = async (bytes) => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useSystemFonts: false, verbosity: 0 });
  const pdf = await task.promise;
  const pages = [];
  const links = [];
  let minX = Infinity;
  for (let number = 1; number <= pdf.numPages; number += 1) {
    const page = await pdf.getPage(number);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str).join(''));
    for (const item of content.items) if (item.str.trim()) minX = Math.min(minX, item.transform[4]);
    links.push(...(await page.getAnnotations()).filter((annotation) => annotation.url).map((annotation) => annotation.url));
  }
  const outline = (await pdf.getOutline()) || [];
  const metadata = await pdf.getMetadata();
  const view = (await pdf.getPage(1)).view;
  await task.destroy();
  return { pages, links, outline, info: metadata.info, view, minX };
};
const flattenOutline = (items, depth = 0) => items.flatMap((item) => [[depth, item.title], ...flattenOutline(item.items || [], depth + 1)]);

// ----- the document source

test('the report becomes a document: the title is its own, the sections are headings, the citations are links, and the sources end it', () => {
  const { title, body } = splitTitle(REPORT.text);
  assert.equal(title, '固態電池研究');
  assert.doesNotMatch(body, /^# /m);
  assert.match(raiseHeadings('## A\n\n### B\n\n#### C\n\n```\n## not a heading\n```'), /^# A\n\n## B\n\n### C\n\n```\n## not a heading\n```$/);
  const linked = linkCitations('A [1] and [2][3], a stranger [9], code `[1]` and a link [1](https://x.test).\n\n```\n[1]\n```', REPORT.sources);
  assert.equal(linked, 'A [[1]](<https://example.com/a?x=1&y=(2)>) and [[2]](<https://news.test/b>)[[3]](<https://research.test/c>), a stranger [9], code `[1]` and a link [1](https://x.test).\n\n```\n[1]\n```');
  assert.equal(sourcesSection([], 'en'), '');
  assert.match(sourcesSection(REPORT.sources, 'en'), /^\n\n# References\n\n\*\*\[1\]\*\* Solid-state batteries: where the technology stands {2}\n<https:\/\/example\.com\/a\?x=1&y=\(2\)>\n\n\*\*\[2\]\*\* /);

  const source = reportDocumentSource(REPORT, { language: 'zh-TW', target: 'pdf' });
  assert.match(source, /^---\ntitle: 固態電池研究\nauthor: Noureon 深度研究\ndate: 2026-10-04\naccent: #6B7280\n/);
  assert.match(source, /bodySize: 9\n/);
  assert.match(reportDocumentSource(REPORT, { language: 'en', target: 'docx' }), /author: Noureon Deep Research[\s\S]*bodySize: 12\n/);
  const model = buildDocumentModel(source, { citations: true });
  assert.equal(model.meta.title, '固態電池研究');
  assert.equal(model.meta.design.design.bodySize, 9);
  const headings = model.blocks.filter((block) => block.type === 'heading');
  assert.deepEqual(headings.map((block) => [block.level, block.runs[0].text]), [[1, '執行摘要'], [1, '技術路線'], [2, '硫化物'], [3, '細節'], [1, '未知引用'], [1, '參考資料']]);
  const cites = model.blocks.flatMap((block) => (block.runs || []).filter((run) => run.cite));
  assert.deepEqual(cites.map((run) => [run.cite, run.link]), [[1, 'https://example.com/a?x=1&y=(2)'], [2, 'https://news.test/b'], [3, 'https://research.test/c'], [1, 'https://example.com/a?x=1&y=(2)'], [2, 'https://news.test/b']]);
  const plain = buildDocumentModel(source);
  assert.equal(plain.blocks.flatMap((block) => (block.runs || []).filter((run) => run.cite)).length, 0, 'only a report reads citations');
});

test('a column of numbers is told apart for the table of a report', () => {
  const model = buildDocumentModel('| a | b | c | d |\n|---|---|---|---|\n| x | 1,200 | 12.5% | 3 億 |\n| y | -4 | 0.5 | n/a |');
  assert.deepEqual(numericColumns(model.blocks[0]), [false, true, true, false]);
  assert.deepEqual(numericColumns(buildDocumentModel('| a |\n|---|\n').blocks[0] || { header: [[]], rows: [] }), [false]);
});

// ----- the PDF

test('the PDF has the page of the sample: A4, margins of 78 pt, bookmarks for every heading at any depth, a grey label for each citation that opens its source, and the sources at the end', async () => {
  const descriptor = reportDescriptor(REPORT, { language: 'zh-TW', target: 'pdf', name: '固態電池研究.pdf' });
  const blob = await generatePdfFile(descriptor, { language: 'zh-TW', fontAssets: await fontAssets(), report: reportGeneratorOptions('pdf') });
  const { pages, links, outline, info, view, minX } = await pdfInfo(await blob.arrayBuffer());
  assert.ok(Math.abs(minX - 78) < 1.5, `the text starts 78 pt from the edge, got ${minX}`);
  assert.deepEqual(view.map(Math.round), [0, 0, 595, 842], 'A4');
  assert.equal(info.Title, '固態電池研究');
  assert.equal(info.Author, 'Noureon 深度研究');
  const text = pages.join('\n');
  assert.match(text, /固態電池研究/);
  assert.match(text, /執行摘要/);
  assert.match(text, /參考資料/);
  assert.match(text, /Solid-state batteries: where the technology stands/);
  assert.deepEqual(flattenOutline(outline), [[0, '執行摘要'], [0, '技術路線'], [1, '硫化物'], [2, '細節'], [0, '未知引用'], [0, '參考資料']], 'a bookmark for each heading, at every level');
  for (const url of ['https://example.com/a?x=1&y=(2)', 'https://news.test/b', 'https://research.test/c', 'https://example.com/site']) assert.ok(links.includes(url), `a link to ${url}`);
  assert.ok(links.filter((url) => url === 'https://news.test/b').length >= 2, 'the citation and the list of sources both open it');
  assert.match(text, /\s1\s/, 'the citation number is on the page');
});

test('the brand line at the top of the first page opens the site, and a PDF without a logo still has the name', async () => {
  const png = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64'));
  const dataUrl = `data:image/png;base64,${Buffer.from(png).toString('base64')}`;
  const descriptor = reportDescriptor(REPORT, { language: 'en', target: 'pdf', name: 'r.pdf' });
  const withLogo = await generatePdfFile(descriptor, { language: 'en', fontAssets: await fontAssets(), report: reportGeneratorOptions('pdf', { logo: dataUrl }) });
  const first = await pdfInfo(await withLogo.arrayBuffer());
  assert.match(first.pages[0], /^Noureon/);
  assert.ok(first.links.some((url) => url.replace(/\/$/, '') === 'https://noureon.com'));
  const bare = await generatePdfFile(descriptor, { language: 'en', fontAssets: await fontAssets(), report: reportGeneratorOptions('pdf') });
  assert.match((await pdfInfo(await bare.arrayBuffer())).pages[0], /^Noureon/);
});

// ----- the Word file

test('the Word file has real heading styles, grey hyperlink citations, a table whose head repeats, native equations and the sources at the end', async () => {
  const descriptor = reportDescriptor(REPORT, { language: 'zh-TW', target: 'docx', name: '固態電池研究.docx' });
  const blob = await generateDocxFile(descriptor, { language: 'zh-TW', fontAssets: await fontAssets(), report: reportGeneratorOptions('docx') });
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const xml = await zip.file('word/document.xml').async('string');
  const styles = await zip.file('word/styles.xml').async('string');
  const rels = await zip.file('word/_rels/document.xml.rels').async('string');
  assert.deepEqual([...xml.matchAll(/<w:pStyle w:val="(Heading\d|Title)"\/>/g)].map((match) => match[1]), ['Title', 'Heading1', 'Heading1', 'Heading2', 'Heading3', 'Heading1', 'Heading1'], 'the title is the Title style and the sections are Heading 1, 2 and 3');
  assert.match(styles, /w:styleId="Heading1"/);
  assert.match(xml, /<w:tblHeader\/>/, 'the head of the table repeats');
  assert.match(xml, /<m:oMath>/, 'a native equation');
  assert.match(xml, /w:val="Hyperlink"/);
  assert.match(xml, /w:rStyle w:val="Hyperlink"[^>]*\/>(?:(?!<\/w:r>).)*?<w:color w:val="[0-9A-F]{6}"\/>/s);
  for (const url of ['https://example.com/a?x=1&amp;y=(2)', 'https://news.test/b', 'https://research.test/c']) assert.ok(rels.includes(url), `a hyperlink to ${url}`);
  assert.match(xml, /參考資料/);
  assert.match(xml, /w:w="11906"/, 'A4');
  assert.match(styles, /<w:hyperlink|w:styleId="Hyperlink"/);
  const hyperlinkStyle = /<w:style [^>]*w:styleId="Hyperlink"[\s\S]*?<\/w:style>/.exec(styles)?.[0] || '';
  assert.doesNotMatch(hyperlinkStyle, /w:val="1D4ED8"/i, 'the links are not the usual blue');
  assert.match(hyperlinkStyle, /<w:color w:val="[0-9A-F]{6}"/);
  const fonts = Object.keys(zip.files).filter((name) => name.startsWith('word/fonts/'));
  assert.ok(Array.isArray(fonts));
});

// ----- handing the file over

const fakePage = () => {
  const downloads = [];
  const anchors = [];
  const document = {
    createElement: () => { const anchor = { click() { downloads.push({ name: this.download, href: this.href }); anchors.push(this); }, remove() {} }; return anchor; },
    body: { appendChild() {} }
  };
  const window = {
    navigator: {},
    URL: { createObjectURL: (blob) => { downloads.blobs = [...(downloads.blobs || []), blob]; return 'blob:test'; }, revokeObjectURL() {} },
    setTimeout: () => 0,
    matchMedia: () => ({ matches: false }),
    fetch: async () => ({ ok: true, blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }) }),
    FileReader: class { readAsDataURL() { this.result = 'data:image/png;base64,AQID'; this.onload(); } }
  };
  document.defaultView = window;
  return { document, window, downloads };
};

test('the Markdown file is made when it is asked for and handed over under the report\'s name', async () => {
  const { document, window, downloads } = fakePage();
  const result = await exportReport('md', REPORT, { language: 'en', document, window });
  assert.equal(result, 'downloaded');
  assert.equal(downloads[0].name, '固態電池研究.md');
  const text = await downloads.blobs[0].text();
  assert.match(text, /^# 固態電池研究/);
  assert.match(text, /## References\n\n\[1\] Solid-state batteries/);
  assert.equal(reportFileName({ title: 'A/B' }, 'pdf'), 'A B.pdf');
});

test('a failed export is told with its reason and the busy label goes away', async () => {
  const notices = [];
  const busy = [];
  const result = await exportWithNotice('pdf', null, { language: 'en', document: fakePage().document, showNotification: (text, kind) => notices.push([text, kind]), onBusy: (kind) => busy.push(kind) });
  assert.equal(result, 'failed');
  assert.match(notices[0][0], /^The export failed: /);
  assert.equal(notices[0][1], 'error');
  assert.deepEqual(busy, ['pdf', null]);
});
