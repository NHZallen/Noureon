// Draws the slides of a laid-out presentation the way the page's visual check does (src/app/ui/files/vision/slide-rasterizer.js), without a
// browser: each slide is the same SVG the preview draws (src/app/ui/files/previews/slide-preview.js), rendered to a picture with the
// app's own fonts, and four slides at a time are put on one numbered sheet for the model to look at.

import { renderSlideSvg } from '../../src/app/ui/files/previews/slide-preview.js';
import { groupReviewedSlides, MAX_REVIEWED_SLIDES } from '../../src/app/ui/files/vision/vision-sheet-plan.js';
import { aliasOf } from './font-kit.js';

const LABELS = Object.freeze({ 'zh-TW': '第 {number} 頁', en: 'Slide {number}', fr: 'Diapositive {number}', ru: 'Слайд {number}', es: 'Diapositiva {number}' });
const SHEET = Object.freeze({ width: 1600, height: 956, cellWidth: 800, cellHeight: 450, rowHeight: 478 });

const abortIfNeeded = (signal) => {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
};

let xml = null;
/** The small XML tools the SVG is built and written with (a document that is not a page's). */
async function xmlTools() {
  xml ||= import('@xmldom/xmldom').then(({ DOMImplementation, XMLSerializer }) => ({
    document: new DOMImplementation().createDocument(null, 'root'),
    serialize: (node) => new XMLSerializer().serializeToString(node)
  }));
  return xml;
}

const GENERIC = /^(?:serif|sans-serif|monospace|cursive|fantasy)$/;

/**
 * The font stacks keep only the app's own faces (and the generic names). A renderer that is given an unknown name first and the face
 * after it ignores the weight of the text, and the page's fallback to the machine's fonts means nothing here: the stacks of a deck
 * name the app's faces as their fallback, which is what the person's own computer would draw without the deck's fonts.
 */
export function onlyShippedFonts(svgText) {
  return svgText.replace(/font-family="([^"]*)"/g, (whole, value) => {
    const names = value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").split(',').map((name) => name.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    const kept = [...new Set(names.filter((name) => name.startsWith('Noureon Deck ') || GENERIC.test(name)))];
    return kept.some((name) => name.startsWith('Noureon Deck ')) ? `font-family="${kept.map((name) => (GENERIC.test(name) ? name : `'${name}'`)).join(', ')}"` : whole;
  });
}

/** One slide as a picture (PNG bytes), at its own size. */
export async function renderSlidePng(presentation, slide, kit) {
  const { Resvg } = await import('@resvg/resvg-js');
  const { document, serialize } = await xmlTools();
  const width = slide.width || 960;
  const height = slide.height || 540;
  const svg = renderSlideSvg(document, slide, { layout: presentation.layout, fontAlias: presentation.fontAlias, measure: presentation.measure });
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  const rendered = new Resvg(onlyShippedFonts(serialize(svg)), {
    fitTo: { mode: 'width', value: width },
    font: { fontFiles: kit.files(), loadSystemFonts: false, defaultFontFamily: aliasOf('Inter') },
    background: '#ffffff'
  }).render();
  return { png: rendered.asPng(), width, height };
}

const dataUrl = (buffer) => `data:image/jpeg;base64,${buffer.toString('base64')}`;

/**
 * Four numbered slides per JPEG, up to the first 24 slides. Resolves { images: [base64 JPEG], checkedSlides, totalSlides }.
 * `onSlide({ index, total, number, url })` and `onSheet({ index, total, url })` show the work as it happens (small pictures).
 */
export async function renderContactSheets(presentation, { kit, language = 'zh-TW', signal, onSlide = () => {}, onSheet = () => {} }) {
  const { createCanvas, loadImage } = await import('@napi-rs/canvas');
  const { layout } = presentation;
  const selected = layout.slides.slice(0, MAX_REVIEWED_SLIDES);
  const groups = groupReviewedSlides(selected);
  const label = LABELS[language] || LABELS.en;
  const small = (image, width, quality) => {
    const canvas = createCanvas(width, Math.max(1, Math.round((width * image.height) / image.width)));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toBuffer('image/jpeg', quality);
  };
  const images = [];
  for (const [groupIndex, group] of groups.entries()) {
    abortIfNeeded(signal);
    const sheet = createCanvas(SHEET.width, SHEET.height);
    const context = sheet.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, SHEET.width, SHEET.height);
    for (let slot = 0; slot < group.length; slot += 1) {
      const slide = group[slot];
      const { png, width, height } = await renderSlidePng(presentation, slide, kit);
      abortIfNeeded(signal);
      const picture = await loadImage(png);
      const x = (slot % 2) * SHEET.cellWidth;
      const y = Math.floor(slot / 2) * SHEET.rowHeight;
      context.font = `20px "${aliasOf('Inter')}", "${aliasOf('Noto Sans TC')}", sans-serif`;
      context.fillStyle = '#111111';
      context.fillText(label.replace('{number}', String(slide.number)), x + 8, y + 22);
      // Decks of other proportions (4:3) are drawn whole, centred in the cell.
      const fit = Math.min(SHEET.cellWidth / width, SHEET.cellHeight / height);
      context.drawImage(picture, x + (SHEET.cellWidth - width * fit) / 2, y + 28 + (SHEET.cellHeight - height * fit) / 2, width * fit, height * fit);
      onSlide({ index: groupIndex * 4 + slot, total: selected.length, number: slide.number, url: dataUrl(small(picture, 160, 60)) });
    }
    images.push(sheet.toBuffer('image/jpeg', 85).toString('base64'));
    onSheet({ index: groupIndex, total: groups.length, url: dataUrl(small(sheet, 360, 60)) });
  }
  return { images, checkedSlides: selected.length, totalSlides: layout.slides.length };
}
