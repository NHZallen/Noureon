import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { getFontKit } from '../../server/slides/font-kit.js';
import { buildFreePresentation } from '../../server/slides/free-deck.js';
import { onlyShippedFonts, renderContactSheets } from '../../server/slides/render.js';

const deck = readFileSync(join(process.cwd(), 'tests', 'fixtures', 'free-deck.pptx'));
// JPEG and PNG start with fixed bytes; the picture is read back with the canvas to count what was drawn.
const isJpeg = (buffer) => buffer[0] === 0xff && buffer[1] === 0xd8;

async function inkOf(png) {
  const { loadImage, createCanvas } = await import('@napi-rs/canvas');
  const image = await loadImage(png);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, image.width, image.height).data;
  let ink = 0;
  for (let index = 0; index < pixels.length; index += 4) ink += 255 - pixels[index];
  return ink;
}

test('a deck Python drew is read, laid out with real fonts and drawn as numbered sheets, with no browser', async () => {
  const kit = await getFontKit();
  const presentation = await buildFreePresentation(deck, { kit });
  assert.equal(presentation.layout.slides.length, 4);
  const slides = [];
  const sheets = [];
  const result = await renderContactSheets(presentation, { kit, language: 'zh-TW', onSlide: (event) => slides.push(event), onSheet: (event) => sheets.push(event) });
  assert.equal(result.checkedSlides, 4);
  assert.equal(result.totalSlides, 4);
  assert.equal(result.images.length, 1, 'four slides on one sheet');
  const sheet = Buffer.from(result.images[0], 'base64');
  assert.ok(isJpeg(sheet));
  const { loadImage } = await import('@napi-rs/canvas');
  const picture = await loadImage(sheet);
  assert.deepEqual([picture.width, picture.height], [1600, 956]);
  assert.deepEqual(slides.map((slide) => slide.number), [1, 2, 3, 4]);
  assert.ok(slides.every((slide) => slide.url.startsWith('data:image/jpeg;base64,')));
  assert.equal(sheets.length, 1);
  if (process.env.SLIDE_SHEET_OUT) writeFileSync(process.env.SLIDE_SHEET_OUT, sheet);
});

test('font stacks name only the app\'s faces: a renderer given an unknown name first would ignore the weight', async () => {
  const stack = '&quot;Calibri&quot;, &quot;Noureon Deck Noto Sans TC&quot;, &quot;Noureon Deck Noto Sans TC&quot;, serif';
  assert.equal(onlyShippedFonts(`<text font-family="${stack}" font-weight="700"/>`), `<text font-family="'Noureon Deck Noto Sans TC', serif" font-weight="700"/>`);
  assert.equal(onlyShippedFonts('<text font-family="Arial, sans-serif"/>'), '<text font-family="Arial, sans-serif"/>', 'a stack with none of them is left as it is');

  const kit = await getFontKit();
  await kit.ensure([['Noto Sans TC', 400], ['Noto Sans TC', 700]]);
  const { Resvg } = await import('@resvg/resvg-js');
  const ink = async (weight) => {
    const svg = onlyShippedFonts(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="80"><text x="10" y="55" font-size="40" font-weight="${weight}" font-family="&quot;Calibri&quot;, &quot;Noureon Deck Noto Sans TC&quot;">營運報告</text></svg>`);
    return inkOf(new Resvg(svg, { font: { fontFiles: kit.files(), loadSystemFonts: false }, background: '#ffffff' }).render().asPng());
  };
  assert.ok(await ink(700) > (await ink(400)) * 1.2, 'bold Chinese is drawn bolder than regular');
});

test('the same fonts are made once for the process, and a family the app does not ship is skipped', async () => {
  const kit = await getFontKit();
  await kit.ensure([['Inter', 400], ['Calibri', 400]]);
  const before = kit.files().length;
  await kit.ensure([['Inter', 400], ['Inter', 700]]);
  assert.equal(kit.files().length, before, 'nothing made twice');
  assert.ok(before >= 3);
});

test('a stop ends the drawing', async () => {
  const kit = await getFontKit();
  const presentation = await buildFreePresentation(deck, { kit });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => renderContactSheets(presentation, { kit, signal: controller.signal }), { name: 'AbortError' });
});

test('a file that is not a presentation is refused', async () => {
  const kit = await getFontKit();
  await assert.rejects(() => buildFreePresentation(Buffer.from('not a deck'), { kit }));
});

const DESIGNED = JSON.stringify({
  design: { preset: 'office' },
  meta: { language: 'zh-TW', title: '年度報告' },
  slides: [
    { layout: 'cover', title: '2026 年度營運報告', subtitle: 'Annual operations review' },
    { layout: 'bullets', title: '三大重點', bullets: ['營收成長 23%', '毛利率改善 2.1 個百分點', '客服回應時間縮短 40%'] },
    { layout: 'chart', title: 'Revenue', chart: { type: 'bar', categories: ['Q1', 'Q2', 'Q3', 'Q4'], series: [{ name: '2026', values: [140, 160, 185, 210] }] } }
  ]
});

test('a deck from the design system is laid out with its own fonts and drawn the same way', async () => {
  const { parseDocumentSpec } = await import('../../src/app/ui/files/design/document-spec.js');
  const { layoutDesignedDeck } = await import('../../server/slides/designed-deck.js');
  const parsed = parseDocumentSpec(DESIGNED, { uiLanguage: 'zh-TW' });
  assert.equal(parsed.ok, true, parsed.reason);
  const kit = await getFontKit();
  const presentation = await layoutDesignedDeck(parsed.spec, { kit, language: 'zh-TW' });
  assert.equal(presentation.layout.slides.length, 3);
  const result = await renderContactSheets(presentation, { kit, language: 'zh-TW' });
  assert.equal(result.images.length, 1);
  assert.ok(isJpeg(Buffer.from(result.images[0], 'base64')));
  if (process.env.SLIDE_SHEET_OUT) writeFileSync(process.env.SLIDE_SHEET_OUT.replace('.jpg', '-designed.jpg'), Buffer.from(result.images[0], 'base64'));
});

test('the colours of the file\'s theme are read with the server\'s XML parser too: a chart that names no colours takes the theme\'s accents in turn', async () => {
  const kit = await getFontKit();
  const presentation = await buildFreePresentation(deck, { kit });
  const chart = presentation.layout.slides.flatMap((slide) => slide.elements).find((element) => element.type === 'chart');
  assert.ok(chart, 'the deck has a chart');
  assert.deepEqual(chart.native.options.chartColors, ['4F81BD', 'C0504D'], 'blue, then red: the first two accents of the theme, not black');
});
