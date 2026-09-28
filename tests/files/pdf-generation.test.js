import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { DOCUMENT_PRESET_IDS } from '../../src/app/ui/files/design/document-presets.js';
import { enforceDocumentTemplate } from '../../src/app/ui/files/design/deck-template-enforcer.js';
import { FONT_FAMILIES, fontSource, pdfFamily, resolveFontRoles } from '../../src/app/ui/files/design/fonts.js';
import { getFileAuthoringGuidance } from '../../src/app/ui/files/file-authoring-guidance.js';
import { describeFileBlock } from '../../src/app/ui/files/file-block-model.js';
import { isGeneratorAvailable } from '../../src/app/ui/files/file-type-registry.js';
import { createFontSubsetter } from '../../src/app/ui/files/generators/font-embedding.js';
import { composePdf, generatePdfFile } from '../../src/app/ui/files/generators/pdf-file.js';
import { isEmojiCluster, obliqueFont, PdfFontSet, readPdfFontMetrics } from '../../src/app/ui/files/generators/pdf-fonts.js';

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

const pdfText = async (bytes) => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useSystemFonts: false, verbosity: 0 });
  const pdf = await task.promise;
  const pages = [];
  for (let number = 1; number <= pdf.numPages; number += 1) {
    const content = await (await pdf.getPage(number)).getTextContent();
    pages.push(content.items.map((item) => item.str).join(''));
  }
  const outline = await pdf.getOutline();
  await task.destroy();
  return { pages, outline: outline || [] };
};

const SAMPLE = `---
title: 第三季營運報告
subtitle: 亞太市場帶動成長
author: 分析團隊
date: 2026-10-01
toc: true
TEMPLATE_LINE
---

## 一、摘要

本季營收達 **2,630 萬元**，年增 *7.3%*。詳見 [網站](https://noureon.com)，或執行 \`npm run report\`。

### 主要發現

- [x] 企業客戶成長 18%
- 續約率由 86% 提升到 91%

| 市場 | 營收 |
|:--|--:|
| 台灣 | 1,200 |
| 日本 | 980 |

> 只有日本衰退。

\`\`\`js
const growth = 0.073;
\`\`\`

## 二、下一步

完成 ✅ 簡体说明 ひらがな 한국어 Привет.
`;

const generate = async (template, content = SAMPLE, name = 'report.pdf') => {
  const descriptor = describeFileBlock({ name, content: content.replace('TEMPLATE_LINE', template ? `template: ${template}` : ''), complete: true });
  return generatePdfFile(descriptor, { language: 'zh-TW', fontAssets: await fontAssets() });
};

test('PDF is a generated format and the guidance teaches it', async () => {
  assert.equal(isGeneratorAvailable('pdf'), true);
  const guidance = await getFileAuthoringGuidance();
  assert.match(guidance, /## PDF documents \(\.pdf\)/);
  assert.match(guidance, /exactly like a Word document/);
  assert.ok(guidance.indexOf('## Word documents') < guidance.indexOf('## PDF documents'), 'PDF refers to the Word rules above it');
});

test('PDF fonts: installed Office fonts map to shipped families, and every family has a file', () => {
  assert.equal(pdfFamily('Aptos'), 'Inter');
  assert.equal(pdfFamily('Microsoft JhengHei'), 'Noto Sans TC');
  assert.equal(pdfFamily('Microsoft YaHei'), 'Noto Sans SC');
  assert.equal(pdfFamily('Yu Gothic'), 'Noto Sans JP');
  assert.equal(pdfFamily('Malgun Gothic'), 'Noto Sans KR');
  assert.equal(pdfFamily('Source Serif 4'), 'Source Serif 4');
  for (const family of ['Noto Sans SC', 'Noto Sans JP', 'Noto Sans KR', 'Noto Emoji']) {
    assert.ok(FONT_FAMILIES[family].pdfOnly, family);
    assert.ok(fs.existsSync(new URL(fontSource(family, 400).file, FONT_DIRECTORY)), family);
  }
});

test('the shipped CJK faces cover their scripts', async () => {
  const assets = await fontAssets();
  const covers = async (file, text) => {
    const { codePoints } = readPdfFontMetrics(await assets.loadFontFile(file));
    return [...text].every((char) => codePoints.has(char.codePointAt(0)));
  };
  assert.equal(await covers('noto-sans-sc.ttf', '这个说们来时简体'), true);
  assert.equal(await covers('noto-sans-jp.ttf', 'ひらがなカタカナ漢字'), true);
  assert.equal(await covers('noto-sans-kr.ttf', '안녕하세요한국어'), true);
  assert.equal(await covers('noto-emoji.ttf', '✅🚀📊❤'), true);
  assert.equal(await covers('noto-sans-tc.ttf', 'ひら'), false, 'Traditional Chinese faces have no kana');
});

test('text is split by font: Latin, Chinese, fallbacks by script, emoji', async () => {
  const assets = await fontAssets();
  const fonts = new PdfFontSet({ roles: resolveFontRoles('modern', { language: 'zh-TW' }), script: 'zh-Hant', loadFontFile: assets.loadFontFile, subsetter: await assets.loadSubsetter() });
  const sample = '季度 report ✅ 完成 简体说 ひらがな 한국어';
  await fonts.prepare({ sample });
  assert.deepEqual([...fonts.fallbacks].sort(), ['Noto Emoji', 'Noto Sans JP', 'Noto Sans KR', 'Noto Sans SC']);
  const runs = fonts.runs(sample, { role: 'body', weight: 400 });
  const familyOf = (id) => [...fonts.faces.values()].find((face) => face.id === id).family;
  const byText = runs.map((run) => [run.text, familyOf(run.font)]);
  assert.deepEqual(byText.slice(0, 5), [['季度 ', 'Noto Sans TC'], ['report ', 'Inter'], ['✅', 'Noto Emoji'], [' ', 'Inter'], ['完成 ', 'Noto Sans TC']], 'spaces stay with the text before them, except after an emoji');
  assert.ok(byText.some(([text, family]) => text.includes('说') && family === 'Noto Sans SC'));
  assert.ok(byText.some(([text, family]) => text.includes('ひらがな') && family === 'Noto Sans JP'));
  assert.ok(byText.some(([text, family]) => text.includes('한국어') && family === 'Noto Sans KR'));
  // Every run gets the same line: pitch divided by its face's natural line.
  const heights = runs.map((run) => run.lineHeight * readPdfFontMetricsCache(fonts, familyOf(run.font)));
  heights.forEach((height) => assert.ok(Math.abs(height - 1.2) < 0.01, `${height}`));
  assert.equal(isEmojiCluster('©'), false, 'text symbols stay in the text face');
  assert.equal(isEmojiCluster('❤️'), true);
  assert.equal(isEmojiCluster('🇹🇼'), true);
});

const readPdfFontMetricsCache = (fonts, family) => fonts.metrics.get(family).lineHeight;

test('SVG text gets the one face that has all of its characters', async () => {
  const assets = await fontAssets();
  // A Japanese document: its East Asian face (JIS level 1) has no 灣 or 坡.
  const fonts = new PdfFontSet({ roles: resolveFontRoles('modern', { language: 'ja' }), script: 'ja', loadFontFile: assets.loadFontFile, subsetter: await assets.loadSubsetter() });
  await fonts.prepare({ sample: 'これは日本語です。台灣 新加坡' });
  const id = fonts.singleFace('0 448 台灣 日本 新加坡');
  const face = [...fonts.faces.values()].find((entry) => entry.id === id);
  assert.equal(face.family, 'Noto Sans TC');
  assert.ok(face.text.has('坡'));
});

test('a Chinese document quoting a little Japanese stays Chinese', async () => {
  const { detectDocumentLanguage } = await import('../../src/app/ui/files/design/language.js');
  assert.equal(detectDocumentLanguage('本季營收成長，日本市場的口號是「ありがとう」，其餘市場持平。'), 'zh-TW');
  assert.equal(detectDocumentLanguage('これは日本語の文章です。売上は増えました。'), 'ja');
});

test('italics are slanted outlines that still form a valid font', async () => {
  const assets = await fontAssets();
  const subsetter = await assets.loadSubsetter();
  const source = subsetter.subset(await assets.loadFontFile('inter.ttf'), 'Italic', { variations: { wght: 400 }, instance: true });
  const slanted = obliqueFont(source);
  const before = readPdfFontMetrics(source);
  const after = readPdfFontMetrics(slanted);
  assert.deepEqual([...after.codePoints].sort(), [...before.codePoints].sort());
  assert.equal(after.lineHeight, before.lineHeight);
  assert.notDeepEqual(slanted, source);
});

test('every document template makes a PDF with its fonts, bookmarks and table of contents', async () => {
  for (const template of DOCUMENT_PRESET_IDS) {
    const blob = await generate(template);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const raw = Buffer.from(bytes).toString('latin1');
    assert.match(raw.slice(0, 8), /^%PDF-1\.\d/, template);
    assert.match(raw, /\/FontFile2/, `${template} embeds TrueType fonts`);
    const { pages, outline } = await pdfText(bytes);
    const text = pages.join('\n');
    assert.match(text, /第三季營運報告/, template);
    assert.match(text, /目錄/, `${template} table of contents`);
    assert.match(text, /簡体说明 ひらがな 한국어/, `${template} other scripts fall back to their own faces`);
    assert.deepEqual(outline.map((item) => item.title), ['一、摘要', '二、下一步'], `${template} bookmarks`);
    assert.deepEqual(outline[0].items.map((item) => item.title), ['主要發現']);
    const hasCover = ['page', 'band', 'shapes', 'title'].includes({ standard: 'none', elegant: 'page', lines: 'block', monochrome: 'page', spearmint: 'block', geometric: 'shapes', swiss: 'page', academic: 'title', technical: 'band' }[template]);
    assert.equal(blob.documentLayout.coverPages, hasCover ? 1 : 0, template);
    // The table of contents lists the page the section starts on.
    const tocPage = pages.findIndex((page) => page.includes('目錄'));
    const summaryPage = pages.findIndex((page, index) => index > tocPage && page.includes('本季營收'));
    assert.match(pages[tocPage], new RegExp(`一、摘要\\s*${summaryPage + 1}`), `${template} toc page number`);
  }
});

test('a PDF without design keys uses the standard template; headers and page numbers follow the settings', async () => {
  const content = '---\ntitle: Plain\nheader: Running head\nfooter: Confidential\n---\n\n## Part\n\nText.';
  const { definition } = await composePdf(describeFileBlock({ name: 'plain.pdf', content, complete: true }), { language: 'en', fontAssets: await fontAssets() });
  assert.equal(definition.pageSize.width.toFixed(1), (210 * 72 / 25.4).toFixed(1), 'A4');
  const footer = definition.footer(1, 3);
  assert.deepEqual(footer.stack.map((line) => line.text.map((run) => run.text).join('')), ['Confidential', '1 / 3']);
  assert.equal(definition.header(1).alignment, 'right');
  const text = (await pdfText(await (await generate('', content, 'plain.pdf')).arrayBuffer())).pages.join('');
  assert.match(text, /Running head/);
  assert.match(text, /Confidential/);

  const landscape = await composePdf(describeFileBlock({ name: 'l.pdf', content: '---\norientation: landscape\npageSize: Letter\npageNumbers: false\n---\n\nText.', complete: true }), { language: 'en', fontAssets: await fontAssets() });
  assert.ok(landscape.definition.pageSize.width > landscape.definition.pageSize.height);
  assert.equal(landscape.definition.footer(1, 1), null, 'no page numbers');
});

test('a chosen document template is applied to PDF files as well', () => {
  const fence = '````';
  const reply = `Here:\n${fence}file a.pdf\n---\ntitle: T\nfonts: kai\ncover: band\n---\n\nBody\n${fence}`;
  const enforced = enforceDocumentTemplate(reply, 'academic');
  assert.match(enforced, /template: academic/);
  assert.doesNotMatch(enforced, /fonts: kai|cover: band/);
});
