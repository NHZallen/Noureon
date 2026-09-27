import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import JSZip from 'jszip';
import PptxGenJS from 'pptxgenjs';

import { describeFileBlock } from '../../src/app/ui/files/file-block-model.js';
import { generateFileBlob } from '../../src/app/ui/files/file-generators.js';
import { isGeneratorAvailable } from '../../src/app/ui/files/file-type-registry.js';
import { DESIGN_PRESET_IDS } from '../../src/app/ui/files/design/design-presets.js';
import { normalizeDocumentSpec } from '../../src/app/ui/files/design/document-spec.js';
import { ICON_NAMES, iconSegments } from '../../src/app/ui/files/design/icons.js';
import { fitRichText, parseEmphasis } from '../../src/app/ui/files/design/rich-text.js';
import { layoutPresentation } from '../../src/app/ui/files/design/slide-engine.js';
import { parsePathData, roundedRectSegments, segmentsToPathData, shapeSegments } from '../../src/app/ui/files/design/svg-path.js';
import { createEstimatingMeasurer } from '../../src/app/ui/files/design/text-layout.js';
import { createFontSubsetter, readFontInfo, renameFontFace } from '../../src/app/ui/files/generators/font-embedding.js';
import { formatValue, niceScale } from '../../src/app/ui/files/previews/slide-chart-preview.js';
import { PPTX_MIME } from '../../src/app/ui/files/generators/pptx-file.js';
import { writePresentation } from '../../src/app/ui/files/generators/pptx-writer.js';
import { renderSlideSvg } from '../../src/app/ui/files/previews/slide-preview.js';
import { conversationImageSources, createConversationImageResolver } from '../../src/app/ui/files/conversation-images.js';
import { createDom } from '../behaviours/helpers/create-dom.js';

const DECKS = JSON.parse(fs.readFileSync(new URL('./fixtures/sample-deck.json', import.meta.url), 'utf8'));
const LANGUAGES = ['zh-TW', 'en', 'fr', 'ru', 'es'];
const FONT_DIRECTORY = new URL('../../src/assets/fonts/', import.meta.url);
const SUBSETTER_WASM = new URL('../../node_modules/harfbuzzjs/dist/harfbuzz-subset.wasm', import.meta.url);
const loadFontFile = async (file) => new Uint8Array(fs.readFileSync(new URL(file, FONT_DIRECTORY)));

const layoutOf = (language, preset) => layoutPresentation(
  normalizeDocumentSpec({ ...DECKS[language], design: { preset } }, { uiLanguage: language }),
  { measure: createEstimatingMeasurer() }
);

const generatePptx = async (content, context = {}) => {
  const descriptor = describeFileBlock({ name: 'deck.pptx', content, complete: true });
  const blob = await generateFileBlob(descriptor, { language: 'zh-TW', ...context });
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  return { blob, zip, read: (path) => zip.file(path)?.async('string') };
};

test('the sample deck covers every layout in all five languages', () => {
  assert.deepEqual(Object.keys(DECKS).sort(), [...LANGUAGES].sort());
  for (const language of LANGUAGES) {
    const layouts = new Set(DECKS[language].slides.map((slide) => slide.layout));
    assert.equal(layouts.size, 17, `${language} uses all 17 layouts`);
  }
});

test('every preset lays out the deck in every language without errors or warnings', () => {
  for (const preset of DESIGN_PRESET_IDS) {
    for (const language of LANGUAGES) {
      const layout = layoutOf(language, preset);
      assert.ok(layout.slides.length >= DECKS[language].slides.length, `${preset}/${language} keeps every slide`);
      const problems = layout.issues.filter((issue) => issue.severity !== 'fixed');
      assert.deepEqual(problems, [], `${preset}/${language}`);
      for (const slide of layout.slides) {
        for (const element of slide.elements) {
          if (element.decorative || element.type === 'line') continue;
          const w = element.w ?? element.size;
          const h = element.h ?? element.size;
          assert.ok(element.x >= -0.5 && element.y >= -0.5 && element.x + w <= 960.5 && element.y + h <= 540.5,
            `${preset}/${language} slide ${slide.number} ${element.id} stays on the slide`);
        }
      }
    }
  }
});

test('the .pptx generator is registered and writes slides, notes, native charts and tables', async () => {
  assert.equal(isGeneratorAvailable('pptx'), true);
  const { blob, zip, read } = await generatePptx(JSON.stringify({ ...DECKS['zh-TW'], preset: 'consulting' }));
  assert.equal(blob.type, PPTX_MIME);
  const { layout } = blob.presentation;
  assert.ok(!Object.keys(blob).includes('presentation'), 'the layout is not part of the file');
  const slides = Object.keys(zip.files).filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path));
  assert.equal(slides.length, layout.slides.length);
  assert.ok(Object.keys(zip.files).some((path) => /^ppt\/charts\/chart\d+\.xml$/.test(path)), 'charts are native');
  assert.ok(Object.keys(zip.files).some((path) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(path)), 'speaker notes are written');

  const cover = await read('ppt/slides/slide1.xml');
  assert.match(cover, /亞太市場帶動第三季成長|亞太市場/);
  assert.match(cover, /<a:spcPts val="\d+"\/>/, 'exact line spacing');
  assert.match(cover, /lang="zh-TW"/);
  assert.doesNotMatch(cover, /\|/, 'typeface markers are resolved');
  const all = (await Promise.all(slides.map((path) => read(path)))).join('');
  assert.match(all, /<a:tbl>/, 'tables are native');
  assert.match(all, /<a:ea typeface="Noto Sans TC"\/>|<a:ea typeface="[^"]+"\/>/);
});

test('a Markdown deck is accepted as the fallback format', async () => {
  const { blob } = await generatePptx('# 年度回顧\n\n團隊成果\n\n## 三個重點\n\n- 營收成長 **12%**\n- 新增兩個市場\n- 客戶滿意度提升\n\nNotes: 先講營收。');
  const { layout } = blob.presentation;
  assert.equal(layout.slides[0].layout, 'cover');
  assert.equal(layout.slides[1].layout, 'bullets');
});

test('an unreadable spec fails with a reason instead of an empty file', async () => {
  await assert.rejects(() => generatePptx('{ "slides": [] }'), /presentation spec could not be read/);
});

test('uploads resolve to the attached images; missing ones become placeholders', async () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const spec = {
    title: 'Photos', language: 'en',
    slides: [
      { layout: 'cover', title: 'Cover' },
      { layout: 'split', title: 'Upload', bullets: ['a', 'b'], image: 'upload:1' },
      { layout: 'split', title: 'Missing', bullets: ['a', 'b'], image: 'upload:3' }
    ]
  };
  const resolveImage = async (source) => (source.index === 1 ? { data: png, pixels: { width: 1, height: 1 } } : null);
  const { blob, zip } = await generatePptx(JSON.stringify(spec), { resolveImage });
  const images = blob.presentation.layout.slides.flatMap((slide) => slide.elements.filter((element) => element.type === 'image'));
  assert.equal(images[0].resolved.data, png);
  assert.equal(images[1].source.kind, 'placeholder');
  assert.ok(Object.keys(zip.files).some((path) => /^ppt\/media\/image/.test(path)), 'the upload is in the package');
});

test('conversation images are read in order from user messages only', async () => {
  const png = 'data:image/png;base64,iVBORw0KGgo=';
  const { document, cleanup } = createDom(`
    <div class="user-message"><button class="message-media-thumb"><img src="${png}#1"></button></div>
    <div class="model-message"><button class="message-media-thumb"><img src="${png}#model"></button></div>
    <div class="user-message"><button class="message-media-thumb message-media-video"><img src="${png}#video"></button>
      <button class="message-media-thumb"><img src="${png}#2"></button>
      <button class="message-media-thumb"><img src="https://example.com/x.png"></button></div>`);
  try {
    assert.deepEqual(conversationImageSources(document), [`${png}#1`, `${png}#2`]);
    const resolve = createConversationImageResolver({ document, window: {} });
    assert.equal(await resolve({ kind: 'upload', index: 5 }), null);
    assert.equal(await resolve({ kind: 'asset', name: 'x.png' }), null);
  } finally {
    cleanup();
  }
});

test('embedded fonts are static subsets renamed to their Office typeface', async () => {
  const subsetter = await createFontSubsetter(fs.readFileSync(SUBSETTER_WASM));
  const inter = await loadFontFile('inter.ttf');
  const subset = subsetter.subset(inter, 'Hello', { variations: { wght: 300 }, instance: true });
  assert.ok(subset.length < inter.length / 4, 'subsets are small');
  const renamed = renameFontFace(subset, { family: 'Inter Light', weight: 300 });
  const info = readFontInfo(renamed);
  assert.equal(info.family, 'Inter Light');
  assert.equal(info.style, 'Regular');
  assert.equal(info.weight, 300);
  const bold = readFontInfo(renameFontFace(subset, { family: 'Inter', bold: true }));
  assert.equal(bold.style, 'Bold');
  assert.equal(bold.weight, 700);
});

test('a Traditional Chinese deck embeds its fonts; a Latin deck never embeds CJK faces', async () => {
  const subsetter = await createFontSubsetter(fs.readFileSync(SUBSETTER_WASM));
  const fonts = { embed: true, subsetter, loadFontFile };
  const chinese = await writePresentation(layoutOf('zh-TW', 'whitespace'), { PptxGenJS, JSZip, fonts });
  assert.ok(chinese.embedded.some((name) => /Noto Sans TC/.test(name)), chinese.embedded.join(', '));
  const zip = await JSZip.loadAsync(chinese.bytes);
  assert.ok(Object.keys(zip.files).some((path) => /^ppt\/fonts\/font\d+\.fntdata$/.test(path)));
  assert.match(await zip.file('ppt/presentation.xml').async('string'), /<p:embeddedFontLst>/);

  const english = await writePresentation(layoutOf('en', 'swiss'), { PptxGenJS, JSZip, fonts });
  assert.ok(english.embedded.length > 0);
  assert.ok(!english.embedded.some((name) => /Noto|Cactus|WenKai|Huninn/.test(name)), english.embedded.join(', '));
});

test('rich text parses emphasis and shrinks to fit its box', () => {
  assert.deepEqual(parseEmphasis('營收 **成長 12%** 了'), [{ text: '營收 ' }, { text: '成長 12%', strong: true }, { text: ' 了' }]);
  assert.deepEqual(parseEmphasis('a ** b'), [{ text: 'a ** b' }]);
  const measure = createEstimatingMeasurer();
  const paragraphs = [{ runs: parseEmphasis('A fairly long sentence that needs to wrap across several lines in a narrow box') }];
  const fit = fitRichText(paragraphs, { width: 200, height: 60, font: { size: 24 }, minSize: 12, lineHeight: 1.2, measure, language: 'en' });
  assert.ok(fit.size < 24 && fit.size >= 12);
  assert.equal(fit.overflow, false);
  assert.ok(fit.height <= 60.01);
});

test('path data, rounded corners and every icon produce closed, bounded outlines', () => {
  const arc = parsePathData('M0 0 A10 10 0 0 1 20 0');
  assert.ok(arc.some((segment) => segment.type === 'C' || segment[0] === 'C'), 'arcs become cubics');
  const rounded = segmentsToPathData(roundedRectSegments(0, 0, 100, 50, [10, 0, 10, 0]));
  assert.match(rounded, /^M/);
  assert.match(segmentsToPathData(shapeSegments({ shape: 'arch', w: 200, h: 300, radius: 0 })), /Z\s*$/i);
  for (const name of [...ICON_NAMES, 'photo']) {
    const data = segmentsToPathData(iconSegments(name));
    assert.ok(data.length > 10, name);
    const numbers = (data.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
    assert.ok(numbers.every((value) => value >= -0.5 && value <= 24.5), `${name} stays in the 24 × 24 box`);
  }
});

test('the slide preview draws every element of a slide as SVG', () => {
  const layout = layoutOf('zh-TW', 'softlight');
  const { document, cleanup } = createDom();
  try {
    const context = { layout, fontAlias: (family) => `Noureon Deck ${family}`, measure: createEstimatingMeasurer() };
    for (const slide of layout.slides) {
      const svg = renderSlideSvg(document, slide, context);
      assert.equal(svg.getAttribute('viewBox'), '0 0 960 540');
      const text = svg.textContent;
      for (const element of slide.elements.filter((item) => item.type === 'text')) {
        const first = element.paragraphs[0]?.lines[0]?.runs.map((run) => run.text).join('') || '';
        if (first.trim()) assert.ok(text.includes(element.font.uppercase ? first.toUpperCase() : first), `slide ${slide.number} shows ${first}`);
      }
      for (const chart of slide.elements.filter((element) => element.type === 'chart')) {
        const bars = svg.querySelector(`[data-element="${chart.id}"]`)?.querySelectorAll('rect') || [];
        assert.ok(bars.length >= chart.chart.data.length, `slide ${slide.number} draws its chart`);
      }
    }
  } finally {
    cleanup();
  }
});

test('chart previews format values like the file does', () => {
  assert.equal(formatValue(1234, '#,##0'), '1,234');
  assert.equal(formatValue(12.345, '#,##0.0'), '12.3');
  assert.equal(formatValue(42.5, '0.0"%"'), '42.5%');
  assert.equal(formatValue(42.5, '0.0" %"'), '42.5 %');
  const scale = niceScale(3, 97);
  assert.equal(scale.min, 0);
  assert.ok(scale.max >= 97 && scale.max <= 120);
});
