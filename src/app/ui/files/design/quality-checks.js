// Programmatic quality checks. They run on every generated document, cost no
// tokens, never block a download, and feed three places: the preview's
// "checks" list, a hint on the file card, and the vision review (V1).
//
// Issue shape: { id, severity, slide?, element?, detail? } where severity is
//   error  – visibly broken (text cut off, element off the slide)
//   warning – works but worth fixing (repetitive rhythm, too dense)
//   fixed  – the engine already corrected it (shrunk text, rebalanced title)

import { characterBudgetFactor } from './language.js';
import { contrastReport } from './palette.js';
import { SLIDE_HEIGHT, SLIDE_WIDTH } from './design-tokens.js';
import { hasOrphanLine } from './text-layout.js';

export const CHECK_IDS = Object.freeze([
  'text-overflow', 'text-shrunk', 'out-of-bounds', 'overlap', 'low-contrast', 'layout-repetition',
  'orphan-title', 'empty-section', 'dense-content', 'low-resolution', 'layout-changed'
]);

// Characters of body text a slide carries comfortably, written for Chinese
// and scaled by the document language (Latin scripts need about twice as many).
const TEXT_BUDGET = Object.freeze({
  cover: 80, agenda: 120, section: 60, bullets: 240, split: 160, image: 90, twoColumn: 260, cards: 240,
  bigNumber: 110, stats: 160, timeline: 220, comparison: 260, quote: 100, gallery: 120, table: 400, chart: 120, closing: 160
});
const STRUCTURAL = new Set(['cover', 'section', 'closing']);

function slideText(slide) {
  const parts = [];
  const visit = (value, key) => {
    if (['layout', 'background', 'kind', 'fit', 'focus', 'trend', 'icon', 'align', 'imageSide', 'title', 'notes', 'source'].includes(key)) return;
    if (typeof value === 'string') parts.push(value);
    else if (Array.isArray(value)) value.forEach((item) => visit(item));
    else if (value && typeof value === 'object') Object.entries(value).forEach(([childKey, child]) => visit(child, childKey));
  };
  Object.entries(slide).forEach(([key, value]) => visit(value, key));
  return parts.join('').replace(/\s+/g, '');
}

/** Checks that need only the normalised spec: rhythm, structure, density. */
export function checkDeckStructure(spec) {
  const issues = [];
  const slides = spec.slides || [];
  const factor = characterBudgetFactor(spec.meta?.language);

  let run = 1;
  for (let index = 1; index < slides.length; index += 1) {
    run = slides[index].layout === slides[index - 1].layout ? run + 1 : 1;
    if (run === 3 && !STRUCTURAL.has(slides[index].layout)) {
      issues.push({ id: 'layout-repetition', severity: 'warning', slide: index + 1, detail: { layout: slides[index].layout, run: 3 } });
    }
  }
  const contentSlides = slides.filter((slide) => !STRUCTURAL.has(slide.layout));
  if (contentSlides.length >= 6) {
    const counts = new Map();
    contentSlides.forEach((slide) => counts.set(slide.layout, (counts.get(slide.layout) || 0) + 1));
    for (const [layout, total] of counts) {
      if (total / contentSlides.length > 0.5) issues.push({ id: 'layout-repetition', severity: 'warning', detail: { layout, share: total / contentSlides.length } });
    }
  }

  slides.forEach((slide, index) => {
    if (slide.layout === 'section') {
      const next = slides[index + 1];
      if (!next || next.layout === 'section' || next.layout === 'closing') issues.push({ id: 'empty-section', severity: 'warning', slide: index + 1 });
    }
    const budget = (TEXT_BUDGET[slide.layout] || 240) * factor;
    const length = slideText(slide).length;
    if (length > budget * 1.25) issues.push({ id: 'dense-content', severity: 'warning', slide: index + 1, detail: { characters: length, budget: Math.round(budget) } });
  });

  for (const issue of spec.issues || []) {
    if (issue.code === 'layout-changed') issues.push({ id: 'layout-changed', severity: 'fixed', slide: issue.slide, detail: { from: issue.from, to: issue.to, reason: issue.reason } });
  }
  return issues;
}

/** Any text/background pair of the palette below its WCAG target. */
export function checkPaletteContrast(palette) {
  return contrastReport(palette)
    .filter((pair) => !pair.pass)
    .map((pair) => ({ id: 'low-contrast', severity: 'error', detail: { foreground: pair.foreground, background: pair.background, ratio: Math.round(pair.ratio * 100) / 100, target: pair.target } }));
}

const overlaps = (a, b) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;

/**
 * Checks laid-out elements. Each element is
 *   { id, slide, kind: 'text'|'image'|'shape'|'chart'|'table', role?, x, y, w, h,
 *     fit?: { overflow, shrinkRatio, lines }, pixels?: { width, height },
 *     decorative?: true, language? }
 * in points on the 960 × 540 slide. Decorative shapes may bleed off the edge.
 */
export function checkElements(elements, { width = SLIDE_WIDTH, height = SLIDE_HEIGHT, language = 'zh-TW' } = {}) {
  const issues = [];
  const bySlide = new Map();
  for (const element of elements) {
    const where = { slide: element.slide, element: element.id };
    if (!element.decorative && (element.x < -0.5 || element.y < -0.5 || element.x + element.w > width + 0.5 || element.y + element.h > height + 0.5)) {
      issues.push({ id: 'out-of-bounds', severity: 'error', ...where });
    }
    if (element.fit?.overflow) issues.push({ id: 'text-overflow', severity: 'error', ...where });
    else if (element.fit && element.fit.shrinkRatio < 0.85) issues.push({ id: 'text-shrunk', severity: 'fixed', ...where, detail: { ratio: Math.round(element.fit.shrinkRatio * 100) / 100 } });
    if (element.role === 'title' && element.fit?.lines && hasOrphanLine(element.fit.lines, element.language || language)) {
      issues.push({ id: 'orphan-title', severity: 'warning', ...where });
    }
    if (element.kind === 'image' && element.pixels) {
      // 150 dpi is the least that looks sharp when projected or printed.
      const needWidth = (element.w / 72) * 150;
      const needHeight = (element.h / 72) * 150;
      if (element.pixels.width < needWidth * 0.8 || element.pixels.height < needHeight * 0.8) {
        issues.push({ id: 'low-resolution', severity: 'warning', ...where, detail: { pixels: element.pixels, needed: { width: Math.round(needWidth), height: Math.round(needHeight) } } });
      }
    }
    if (element.kind === 'text' && !element.decorative) {
      if (!bySlide.has(element.slide)) bySlide.set(element.slide, []);
      bySlide.get(element.slide).push(element);
    }
  }
  for (const texts of bySlide.values()) {
    for (let a = 0; a < texts.length; a += 1) {
      for (let b = a + 1; b < texts.length; b += 1) {
        if (overlaps(texts[a], texts[b])) issues.push({ id: 'overlap', severity: 'error', slide: texts[a].slide, element: texts[a].id, detail: { with: texts[b].id } });
      }
    }
  }
  return issues;
}

export function summarizeIssues(issues) {
  const summary = { error: 0, warning: 0, fixed: 0 };
  issues.forEach((issue) => { summary[issue.severity] = (summary[issue.severity] || 0) + 1; });
  return summary;
}
