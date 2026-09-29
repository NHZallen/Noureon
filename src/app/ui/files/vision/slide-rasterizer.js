import { fontSource } from '../design/fonts.js';
import { bytesToBase64 } from '../generators/pptx-layout.js';
import { loadFontFile, loadSubsetter } from '../generators/pptx-assets.js';
import { renderSlideSvg } from '../previews/slide-preview.js';
import { groupReviewedSlides, MAX_REVIEWED_SLIDES } from './vision-sheet-plan.js';

export { MAX_REVIEWED_SLIDES };
const alias = 'Noureon Deck ';
const SVG = 'http://www.w3.org/2000/svg';
const labels = Object.freeze({ 'zh-TW': '第 {number} 頁', en: 'Slide {number}', fr: 'Diapositive {number}', ru: 'Слайд {number}', es: 'Diapositiva {number}' });

/** Embed the actual subset fonts used by an SVG before loading it as an image. */
export async function embedSlideFonts(svg, { document }) {
  const faces = new Map();
  svg.querySelectorAll('[font-family]').forEach(node => {
    const family = node.getAttribute('font-family') || '';
    const weight = Number(node.getAttribute('font-weight')) || 400;
    for (const match of family.matchAll(/Noureon Deck ([\p{L}\p{N} _-]+)/gu)) {
      const name = match[1].trim();
      const key = `${name}|${weight}`;
      faces.set(key, { name, weight, text: `${faces.get(key)?.text || ''}${node.textContent || ''}` });
    }
  });
  if (!faces.size) return svg;
  const subsetter = await loadSubsetter();
  const rules = [];
  for (const { name, weight, text } of faces.values()) {
    const source = fontSource(name, weight);
    if (!source) continue;
    const bytes = await loadFontFile(source.file);
    const subset = subsetter.subset(bytes, text, {
      variations: source.variations, instance: Boolean(source.variable)
    });
    rules.push(`@font-face{font-family:"${alias}${name}";font-weight:${weight};src:url(data:font/ttf;base64,${bytesToBase64(subset)}) format("truetype")}`);
  }
  if (rules.length) {
    const style = document.createElementNS(SVG, 'style');
    style.textContent = rules.join('\n');
    svg.insertBefore(style, svg.firstChild);
  }
  return svg;
}

const abortIfNeeded = signal => { if (signal?.aborted) throw new DOMException('Aborted', 'AbortError'); };

async function rasterize(svg, { document, window, signal, width = 960, height = 540 }) {
  abortIfNeeded(signal);
  // Without an intrinsic size Firefox cannot draw an SVG image to a canvas
  // and other browsers may rasterize it at 300 × 150 before scaling.
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  const serialized = new window.XMLSerializer().serializeToString(svg);
  const url = window.URL.createObjectURL(new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new window.Image();
    image.src = url;
    if (image.decode) await image.decode();
    else await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
    abortIfNeeded(signal);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(image, 0, 0, width, height);
    return canvas;
  } finally {
    window.URL.revokeObjectURL(url);
  }
}

/** Four numbered slides per JPEG, up to the first 24 rendered slides. */
const thumbnail = (document, canvas, width) => {
  const small = document.createElement('canvas');
  small.width = width;
  small.height = Math.max(1, Math.round((width * canvas.height) / canvas.width));
  small.getContext('2d').drawImage(canvas, 0, 0, small.width, small.height);
  return small.toDataURL('image/jpeg', 0.6);
};

/** `onSlide` and `onSheet` show the work as it happens (the progress window). */
export async function createContactSheets(presentation, { document, window, language = 'zh-TW', signal, onProgress = () => {}, onSlide = () => {}, onSheet = () => {} }) {
  const { layout, fontAlias, measure } = presentation;
  const selected = layout.slides.slice(0, MAX_REVIEWED_SLIDES);
  const groups = groupReviewedSlides(selected);
  const images = [];
  for (const [groupIndex, group] of groups.entries()) {
    abortIfNeeded(signal);
    const sheet = document.createElement('canvas');
    sheet.width = 1600;
    sheet.height = 956;
    const ctx = sheet.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 1600, 956);
    for (let slot = 0; slot < group.length; slot++) {
      const slide = group[slot];
      const svg = renderSlideSvg(document, slide, { layout, fontAlias, measure });
      await embedSlideFonts(svg, { document });
      // Decks of other proportions (4:3) are drawn whole, centred in the cell.
      const width = slide.width || 960;
      const height = slide.height || 540;
      const picture = await rasterize(svg, { document, window, signal, width, height });
      const x = slot % 2 * 800;
      const y = Math.floor(slot / 2) * 478;
      ctx.font = '20px Arial, "Microsoft JhengHei", "PingFang TC", sans-serif';
      ctx.fillStyle = '#111111';
      ctx.fillText((labels[language] || labels.en).replace('{number}', String(slide.number)), x + 8, y + 22);
      const fit = Math.min(800 / width, 450 / height);
      ctx.drawImage(picture, x + (800 - width * fit) / 2, y + 28 + (450 - height * fit) / 2, width * fit, height * fit);
      onProgress(groupIndex * 4 + slot + 1, selected.length);
      onSlide({ index: groupIndex * 4 + slot, total: selected.length, number: slide.number, url: thumbnail(document, picture, 160) });
    }
    images.push(sheet.toDataURL('image/jpeg', 0.85).split(',')[1]);
    onSheet({ index: groupIndex, total: groups.length, url: thumbnail(document, sheet, 360) });
  }
  return { images, checkedSlides: selected.length, totalSlides: layout.slides.length };
}
