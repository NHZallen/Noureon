import assert from 'node:assert/strict';
import test from 'node:test';
import JSZip from 'jszip';

import { describeFileBlock } from '../../src/app/ui/files/file-block-model.js';
import { generateFileBlob } from '../../src/app/ui/files/file-generators.js';
import { buildDocumentModel, parseFrontMatter, runsToPlainText } from '../../src/app/ui/files/generators/document-model.js';
import { mathToLinearText, parseLatexMath } from '../../src/app/ui/files/generators/latex-math.js';

const FENCE = '```';

const generateDocx = async (content, context = {}) => {
  const descriptor = describeFileBlock({ name: '報告.docx', content, complete: true });
  const blob = await generateFileBlob(descriptor, { language: 'zh-TW', ...context });
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const read = (path) => zip.file(path)?.async('string');
  return { blob, zip, document: await read('word/document.xml'), read };
};

test('front matter is parsed into safe, bounded document settings', () => {
  const { meta, body } = parseFrontMatter('---\ntitle: "季報"\ntoc: yes\norientation: Landscape\npageSize: letter\npage-numbers: false\nunknown: x\n---\nBody');
  assert.equal(meta.title, '季報');
  assert.equal(meta.toc, true);
  assert.equal(meta.orientation, 'landscape');
  assert.equal(meta.pageSize, 'LETTER');
  assert.equal(meta.pageNumbers, false);
  assert.equal(body, 'Body');
  assert.equal(parseFrontMatter('---\npageSize: huge\n---\n').meta.pageSize, 'A4');
  assert.equal(parseFrontMatter('No front matter').meta.title, '');
});

test('a single leading H1 becomes the title; several H1s stay headings', () => {
  const single = buildDocumentModel('# 年度報告\n\n## 一、摘要\n\n內容');
  assert.equal(single.meta.title, '年度報告');
  assert.equal(single.blocks[0].type, 'heading');
  assert.equal(single.blocks[0].level, 2);

  const multiple = buildDocumentModel('# 第一章\n\n內容\n\n# 第二章');
  assert.equal(multiple.meta.title, '');
  assert.equal(multiple.blocks.filter((block) => block.level === 1).length, 2);
});

test('math, page breaks, charts and soft breaks become the right blocks', () => {
  const { blocks } = buildDocumentModel([
    '面積為 $\\pi r^2$，而價格 $5 與 $10 不是公式。',
    '中文第一行',
    '中文第二行 and',
    'English line',
    '',
    '$$E = mc^2$$',
    '',
    '\\pagebreak',
    '',
    `${FENCE}js`,
    'const cost = "$1 and $2";',
    FENCE,
    '',
    `${FENCE}chart`,
    '{ "type": "bar", "title": "T", "data": [{ "label": "a", "value": 1 }] }',
    FENCE
  ].join('\n'));

  const paragraph = blocks[0];
  assert.equal(paragraph.type, 'paragraph');
  assert.deepEqual(paragraph.runs.filter((run) => run.math !== undefined).map((run) => run.math), ['\\pi r^2']);
  assert.match(runsToPlainText(paragraph.runs), /價格 \$5 與 \$10 不是公式。中文第一行中文第二行 and English line/);
  assert.deepEqual(blocks.slice(1).map((block) => block.type), ['math', 'pagebreak', 'code', 'chart']);
  assert.equal(blocks[1].latex, 'E = mc^2');
  assert.equal(blocks[3].text, 'const cost = "$1 and $2";');
  assert.equal(blocks[4].chart.type, 'bar');
});

test('unsafe links are dropped and XML-invalid characters removed', () => {
  const { blocks } = buildDocumentModel('[ok](https://example.com) [bad](javascript:alert(1)) a\u0001b￾c');
  const runs = blocks[0].runs;
  assert.deepEqual(runs[0], { link: 'https://example.com', text: 'ok' });
  assert.ok(runs.every((run) => !run.link || run.link.startsWith('https:')), 'javascript: link is not kept');
  assert.equal(runsToPlainText(runs), 'ok bad abc');
});

test('the LaTeX parser builds structure for the constructs models use', () => {
  const [frac] = parseLatexMath('\\frac{a+b}{2}');
  assert.equal(frac.type, 'frac');
  assert.equal(mathToLinearText(frac.num), 'a+b');

  const [sum] = parseLatexMath('\\sum_{i=1}^{n} x_i');
  assert.equal(sum.type, 'nary');
  assert.equal(mathToLinearText(sum.sub), 'i=1');
  assert.equal(sum.body[0].type, 'sub');

  const [root] = parseLatexMath('\\sqrt[3]{x}');
  assert.equal(root.type, 'sqrt');
  assert.equal(mathToLinearText(root.degree), '3');

  const [brackets] = parseLatexMath('\\left[ x \\right)');
  assert.deepEqual([brackets.open, brackets.close], ['[', ')']);

  const [matrix] = parseLatexMath('\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}');
  assert.equal(matrix.type, 'matrix');
  assert.deepEqual(matrix.rows.map((row) => row.map((cell) => mathToLinearText(cell))), [['a', 'b'], ['c', 'd']]);

  assert.equal(mathToLinearText(parseLatexMath('x^2 + \\alpha \\leq \\infty')), 'x²+α≤∞');
  assert.equal(mathToLinearText(parseLatexMath('\\text{if } x')), 'if x');
});

test('a complete document produces valid Word parts with native equations', async () => {
  const content = [
    '---',
    'title: 第三季營運報告',
    'toc: true',
    'header: 內部文件',
    '---',
    '## 一、摘要',
    '',
    '成長率 $r = \\frac{a}{b}$，見 [官網](https://noureon.com)。',
    '',
    '$$\\begin{bmatrix} 1 & 2 \\\\ 3 & 4 \\end{bmatrix}$$',
    '',
    '3. 第三點',
    '4. 第四點',
    '',
    '- [x] 已完成',
    '',
    '| 地區 | 營收 |',
    '| --- | ---: |',
    '| 台灣 | 1,200 |',
    '',
    '> 引用',
    '',
    `${FENCE}python`,
    '  indented()',
    FENCE,
    '',
    `${FENCE}chart`,
    '{ "type": "bar", "title": "營收", "data": [{ "label": "台灣", "value": 1200 }] }',
    FENCE
  ].join('\n');
  const { blob, document, read } = await generateDocx(content);

  assert.equal(blob.type, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.match(document, /<w:pStyle w:val="Title"\/>/);
  assert.match(document, /<m:oMath>[\s\S]*<m:f>/, 'inline fraction is a native equation');
  assert.match(document, /<m:oMathPara>[\s\S]*<m:mcs><m:mc><m:mcPr><m:count m:val="2"\/>/, 'display matrix declares its columns');
  assert.match(document, /<w:bookmarkStart w:name="noureon_heading_1" w:id="\d+"\/>/);
  assert.match(document, /<w:hyperlink [^>]*w:anchor="noureon_heading_1"/, 'table of contents links to the heading');
  assert.match(document, /<w:t xml:space="preserve">  indented\(\)<\/w:t>/, 'code keeps leading spaces');
  assert.match(document, /☑<\/w:t><w:tab\/>/, 'task checkbox is followed by a real tab');
  assert.match(document, /<w:tblHeader\/>/, 'table header repeats across pages');
  assert.match(document, /數值|營收/, 'chart falls back to a data table without a browser');

  const numbering = await read('word/numbering.xml');
  assert.match(numbering, /<w:start w:val="3"\/>/, 'ordered list keeps its start number');
  const relationships = await read('word/_rels/document.xml.rels');
  assert.match(relationships, /Target="https:\/\/noureon\.com"[^>]*TargetMode="External"|TargetMode="External"[^>]*Target="https:\/\/noureon\.com"/);
  const core = await read('docProps/core.xml');
  assert.match(core, /<dc:title>第三季營運報告<\/dc:title>/);
  assert.match(core, /<dc:creator>Noureon<\/dc:creator>/);
  assert.ok(await read('word/header1.xml'), 'running header is written');
  assert.match(await read('word/footer1.xml'), /PAGE/);
});

test('chart images from the browser exporter are embedded as SVG with a PNG fallback', async () => {
  const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64'));
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="5"></svg>');
  const { zip, document } = await generateDocx(`${FENCE}chart\n{ "type": "bar", "title": "營收", "data": [{ "label": "a", "value": 1 }] }\n${FENCE}`, {
    loadChartImageRenderer: async () => ({ renderChartImage: async () => ({ svg, png, width: 760, height: 380 }) })
  });
  const media = Object.keys(zip.files).filter((path) => path.startsWith('word/media/'));
  assert.ok(media.some((path) => path.endsWith('.svg')));
  assert.ok(media.some((path) => path.endsWith('.png')));
  assert.match(document, /<asvg:svgBlip|svgBlip/);
  assert.doesNotMatch(document, /<w:tbl>/, 'no fallback table when the image exists');
});

test('landscape Letter documents swap the page and keep tables inside the margins', async () => {
  const { document } = await generateDocx('---\norientation: landscape\npageSize: Letter\n---\n| a | b |\n| - | - |\n| 1 | 2 |');
  assert.match(document, /<w:pgSz w:w="15840" w:h="12240" w:orient="landscape"\/>/);
  const widths = [...document.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map((match) => Number(match[1]));
  assert.ok(widths.reduce((sum, width) => sum + width, 0) <= 15840 - 2880);
});
