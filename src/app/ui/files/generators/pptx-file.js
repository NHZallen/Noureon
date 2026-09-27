// DocumentSpec → .pptx. Parses what the model wrote, lays the slides out with
// the design system, and writes them with native text, shapes, charts and
// tables plus the font subsets the design needs.
//
// In the browser the layout measures text with the real fonts (canvas) and
// the Blob carries the layout, so the preview draws exactly what the file
// contains. Without a DOM (tests, workers) it measures with estimates and
// skips embedding.

import JSZip from 'jszip';
import PptxGenJS from 'pptxgenjs';
import { iconSegments } from '../design/icons.js';
import { segmentsToPathData, shapeSegments } from '../design/svg-path.js';
import { bytesToBase64, layoutDeck, parseDeck, PresentationSpecError } from './pptx-layout.js';
import { writePresentation } from './pptx-writer.js';

export const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

const escapeXml = (value) => String(value).replace(/[<>&"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[char]));

/**
 * A replaceable picture for an image placeholder: the frame colour, a dashed
 * border, the picture icon and the description. As a picture (not shapes),
 * PowerPoint's "Change Picture" keeps its size, crop and shape.
 */
export function placeholderSvg({ w, h, text, colors, shape, radius = 0 }) {
  const scale = 2;
  const outline = segmentsToPathData(shapeSegments({ shape: shape === 'ellipse' ? 'ellipse' : shape === 'arch' ? 'arch' : 'rounded', w: w - 3, h: h - 3, radius }));
  const iconSize = Math.min(38, Math.min(w, h) * 0.16);
  const icon = segmentsToPathData(iconSegments('photo'));
  const label = String(text || '').slice(0, 80);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(w * scale)}" height="${Math.round(h * scale)}" viewBox="0 0 ${w} ${h}">`
    + `<rect width="${w}" height="${h}" fill="${colors.fill}"/>`
    + `<path d="${outline}" transform="translate(1.5 1.5)" fill="none" stroke="${colors.line}" stroke-width="1.5" stroke-dasharray="5 4"/>`
    + (iconSize >= 12 ? `<path d="${icon}" transform="translate(${w / 2 - iconSize / 2} ${h / 2 - iconSize}) scale(${iconSize / 24})" fill="none" stroke="${colors.text}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>` : '')
    + (label ? `<text x="${w / 2}" y="${h / 2 + 18}" text-anchor="middle" font-family="Segoe UI, Microsoft JhengHei, PingFang TC, Noto Sans TC, sans-serif" font-size="13" fill="${colors.text}">${escapeXml(label)}</text>` : '')
    + '</svg>';
  return svg;
}

const svgDataUrl = (svg) => `data:image/svg+xml;base64,${bytesToBase64(new TextEncoder().encode(svg))}`;

export { PresentationSpecError };

export async function buildPresentation(descriptor, context = {}) {
  const parsed = parseDeck(descriptor.content, { language: context.language || 'zh-TW' });
  const { spec } = parsed;
  const browser = Boolean(context.document?.createElement && typeof context.window?.FontFace === 'function');
  const { layout, fontAlias, fonts: prepared } = await layoutDeck(spec, context);
  let fonts = null;
  if (prepared.assets && prepared.tokens?.fonts.embedded) {
    try {
      fonts = { embed: true, loadFontFile: prepared.assets.loadFontFile, subsetter: await prepared.assets.loadSubsetter() };
    } catch {
      fonts = null;
    }
  }
  const images = {
    resolve: null,
    placeholder: browser ? (frame) => svgDataUrl(placeholderSvg(frame)) : null
  };
  const charts = { image: (chart, box, colors, element) => element?.image || null };
  let result;
  try {
    result = await writePresentation(layout, { PptxGenJS, JSZip, fonts, images, charts });
  } catch (error) {
    if (!fonts) throw error;
    // Embedding is an enhancement: a font problem must not cost the file.
    result = await writePresentation(layout, { PptxGenJS, JSZip, fonts: null, images, charts });
  }
  return { bytes: result.bytes, embedded: result.embedded, layout, spec, repairs: parsed.repairs, fontAlias };
}

export async function generatePptxFile(descriptor, context = {}) {
  const presentation = await buildPresentation(descriptor, context);
  const blob = new Blob([presentation.bytes], { type: PPTX_MIME });
  // The preview draws the same layout; it is not part of the file.
  Object.defineProperty(blob, 'presentation', { value: presentation, enumerable: false });
  return blob;
}
