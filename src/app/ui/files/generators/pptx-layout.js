// The layout half of presentation generation: spec → positioned slides, with
// the real fonts in a browser. The .pptx writer, the slide preview and the
// design panel's thumbnails all start here, so they show the same thing.

import { buildDesignTokens } from '../design/design-tokens.js';
import { parseDocumentSpec } from '../design/document-spec.js';
import { generatedText } from '../design/language.js';
import { layoutPresentation } from '../design/slide-engine.js';
import { createCanvasMeasurer, createEstimatingMeasurer } from '../design/text-layout.js';
import { NATIVE_CHART_TYPES } from './pptx-charts.js';

export class PresentationSpecError extends Error {
  constructor(reason) {
    super(`presentation spec could not be read (${reason})`);
    this.name = 'PresentationSpecError';
    this.reason = reason;
  }
}

export const bytesToBase64 = (bytes) => {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
};

/** Parses what the model wrote; throws PresentationSpecError when unusable. */
export function parseDeck(content, { language = 'zh-TW' } = {}) {
  const parsed = parseDocumentSpec(content, { uiLanguage: language });
  if (!parsed.ok) throw new PresentationSpecError(parsed.reason);
  return parsed;
}

const isBrowser = (context) => Boolean(context.document?.createElement && typeof context.window?.FontFace === 'function');

/**
 * Registers a design's fonts and returns the measurer and font alias to lay
 * it out with. `eastAsian: false` skips the large CJK faces (thumbnails).
 */
export async function prepareFonts(design, language, context, { eastAsian = true } = {}) {
  // Where there is no page (the server), the caller says how its fonts are made ready: (design, language, { eastAsian }) => { measure, fontAlias }.
  if (typeof context.prepareFonts === 'function') return context.prepareFonts(design, language, { eastAsian });
  if (!isBrowser(context)) return { measure: createEstimatingMeasurer(), fontAlias: (family) => family, assets: null, tokens: null };
  const assets = await import('./pptx-assets.js');
  const tokens = buildDesignTokens(design, { language });
  try {
    await assets.registerDeckFonts(tokens, { document: context.document, window: context.window, eastAsian });
    return { measure: createCanvasMeasurer(context.document.createElement('canvas').getContext('2d')), fontAlias: assets.fontAlias, assets, tokens };
  } catch {
    // Fonts could not load (offline without a cache): estimate instead.
    return { measure: createEstimatingMeasurer(), fontAlias: (family) => family, assets, tokens };
  }
}

/** Draws charts PowerPoint has no native type for with the chat renderer. */
async function renderFallbackCharts(layout, context) {
  if (typeof context.loadChartImageRenderer !== 'function') return;
  const charts = layout.slides.flatMap((slide) => slide.elements.filter((element) => element.type === 'chart' && !NATIVE_CHART_TYPES.includes(element.chart.type)));
  if (!charts.length) return;
  try {
    const { renderChartImage } = await context.loadChartImageRenderer();
    for (const element of charts) {
      try {
        const image = await renderChartImage(element.chart, context);
        if (image?.png) element.image = { data: `data:image/png;base64,${bytesToBase64(image.png)}`, pixels: { width: image.width, height: image.height } };
      } catch {
        // Left as a titled frame.
      }
    }
  } catch {
    // No chart renderer available.
  }
}

/**
 * Resolves uploads and assets once, onto the elements, so the file and the
 * preview show the same picture. Unresolvable sources become placeholders.
 */
async function resolveImages(layout, context) {
  if (typeof context.resolveImage !== 'function') return;
  const elements = layout.slides.flatMap((slide) => slide.elements.filter((element) => element.type === 'image' && element.source.kind !== 'placeholder'));
  await Promise.all(elements.map(async (element) => {
    try {
      const resolved = await context.resolveImage(element.source);
      if (resolved?.data) element.resolved = resolved;
    } catch {
      // Drawn as a placeholder.
    }
    if (!element.resolved) {
      element.source = { kind: 'placeholder', text: element.alt || '', alt: element.alt || '' };
      element.placeholderText = element.alt || generatedText(layout.language, 'imagePlaceholder');
    }
  }));
}

/**
 * Lays out a parsed spec (optionally with another design) with the design's
 * real fonts, fallback chart images and resolved uploads.
 */
export async function layoutDeck(spec, context = {}, { design = spec.design, fonts = null } = {}) {
  const deck = design === spec.design ? spec : { ...spec, design };
  const prepared = fonts || await prepareFonts(deck.design, deck.meta.language, context);
  const layout = layoutPresentation(deck, { measure: prepared.measure, fontAlias: prepared.fontAlias });
  if (isBrowser(context)) await renderFallbackCharts(layout, context);
  await resolveImages(layout, context);
  return { layout, fontAlias: prepared.fontAlias, measure: prepared.measure, fonts: prepared };
}

/**
 * The first `count` slides of the deck in another design, for thumbnails.
 * Only Latin fonts are loaded for designs that are not in use yet; CJK text
 * falls back to the device's fonts at thumbnail size.
 */
export async function layoutThumbnails(spec, design, context = {}, { count = 1 } = {}) {
  const deck = { ...spec, design, slides: spec.slides.slice(0, count) };
  const fonts = await prepareFonts(design, spec.meta.language, context, { eastAsian: false });
  const layout = layoutPresentation(deck, { measure: fonts.measure, fontAlias: fonts.fontAlias });
  await resolveImages(layout, context);
  return { layout, fontAlias: fonts.fontAlias, measure: fonts.measure };
}
