// The layout engine: a normalised DocumentSpec in, positioned slides out.
//
// It continues over-full slides onto new ones, decides which slides become
// colour blocks, numbers pages and sections, runs the layouts and the
// quality checks. The PPTX writer and the slide preview both draw the result.

import { buildDesignTokens, SLIDE_HEIGHT, SLIDE_WIDTH } from './design-tokens.js';
import { LAYOUT_CAPACITY } from './document-spec.js';
import { formatDocumentDate, generatedText } from './language.js';
import { invertPalette } from './palette.js';
import { checkDeckStructure, checkElements, checkPaletteContrast } from './quality-checks.js';
import { LAYOUT_RENDERERS } from './slide-layouts.js';
import { showsImage } from './slide-kit.js';
import { createEstimatingMeasurer } from './text-layout.js';

// Lists a layout can split across slides, with the per-slide capacity.
const CONTINUED_LISTS = Object.freeze({
  bullets: ['bullets', LAYOUT_CAPACITY.bullets],
  agenda: ['items', LAYOUT_CAPACITY.agenda],
  cards: ['cards', LAYOUT_CAPACITY.cards],
  stats: ['stats', LAYOUT_CAPACITY.stats],
  timeline: ['steps', LAYOUT_CAPACITY.timeline],
  gallery: ['images', LAYOUT_CAPACITY.gallery],
  closing: ['bullets', LAYOUT_CAPACITY.closing]
});

function chunk(items, capacity) {
  const count = Math.ceil(items.length / capacity);
  const size = Math.ceil(items.length / count);
  return Array.from({ length: count }, (_, index) => items.slice(index * size, (index + 1) * size));
}

/** Splits slides whose lists exceed the layout capacity (balanced parts). */
export function expandContinuations(slides, language) {
  const output = [];
  const continued = (title, index) => (index && title ? `${title}${generatedText(language, 'continued')}` : title);
  for (const [sourceIndex, original] of slides.entries()) {
    const slide = { ...original, sourceIndex };
    const list = CONTINUED_LISTS[slide.layout];
    if (list && Array.isArray(slide[list[0]]) && slide[list[0]].length > list[1]) {
      chunk(slide[list[0]], list[1]).forEach((part, index) => {
        output.push({ ...slide, [list[0]]: part, title: continued(slide.title, index), continuation: index, callout: index ? '' : slide.callout, notes: index ? '' : slide.notes });
      });
    } else if (slide.layout === 'table' && slide.table?.rows.length > LAYOUT_CAPACITY.tableRows) {
      let offset = 0;
      chunk(slide.table.rows, LAYOUT_CAPACITY.tableRows).forEach((rows, index) => {
        const highlight = slide.table.highlightRow ? slide.table.highlightRow - offset : null;
        offset += rows.length;
        output.push({ ...slide, table: { ...slide.table, rows, highlightRow: highlight >= 1 && highlight <= rows.length ? highlight : null }, title: continued(slide.title, index), continuation: index, notes: index ? '' : slide.notes });
      });
    } else {
      output.push(slide);
    }
  }
  return output;
}

function renderSlide(ctx, slideSpec, number) {
  const inverse = isInverse(ctx, slideSpec);
  const palette = inverse ? invertPalette(ctx.tokens.palette) : ctx.tokens.palette;
  const slide = {
    id: `s${number}`,
    number,
    layout: slideSpec.layout,
    inverse,
    palette,
    background: slideSpec.background === 'soft' && !inverse ? palette.soft : palette.background,
    elements: [],
    notes: slideSpec.notes || '',
    continuation: slideSpec.continuation || 0,
    sourceIndex: slideSpec.sourceIndex
  };
  (LAYOUT_RENDERERS[slideSpec.layout] || LAYOUT_RENDERERS.bullets)(ctx, slide, slideSpec);
  return slide;
}

/**
 * Bullet slides whose text still overflows at the minimum size continue on a
 * new slide: the list is split in two (up to twice) and laid out again.
 */
function splitOverfull(ctx, slides, depth = 0) {
  return slides.flatMap((slideSpec) => {
    if (slideSpec.layout !== 'bullets' || (slideSpec.bullets || []).length < 2 || depth > 1) return [slideSpec];
    const trial = renderSlide(ctx, slideSpec, 1);
    if (!trial.elements.some((element) => element.fit?.overflow && !element.decorative)) return [slideSpec];
    const middle = Math.ceil(slideSpec.bullets.length / 2);
    const base = slideSpec.title.replace(generatedText(ctx.language, 'continued'), '');
    const first = { ...slideSpec, bullets: slideSpec.bullets.slice(0, middle), callout: '' };
    const second = {
      ...slideSpec,
      bullets: slideSpec.bullets.slice(middle),
      title: base ? `${base}${generatedText(ctx.language, 'continued')}` : '',
      continuation: (slideSpec.continuation || 0) + 1,
      notes: ''
    };
    return splitOverfull(ctx, [first, second], depth + 1);
  });
}

function isInverse(ctx, slide) {
  const { design, tokens } = ctx;
  if (slide.background === 'accent') return true;
  if (slide.layout === 'section' && design.section === 'field') return true;
  if (slide.layout === 'image' && !showsImage(ctx, slide.image)) return true;
  if (slide.layout === 'cover') {
    const imageless = !showsImage(ctx, slide.image);
    const kind = (design.cover === 'split' || design.cover === 'bleed') && imageless ? 'type' : design.cover;
    return kind === 'type' && design.colorUse === 'vivid' && design.background !== 'accent';
  }
  return tokens.inverseLayouts.includes(slide.layout);
}

const shortTitle = (title) => {
  const text = String(title || '').trim();
  return text.length > 42 ? `${text.slice(0, 40)}…` : text;
};

/** Element bounds in the form quality-checks.js expects. */
function checkable(element, slideNumber) {
  if (element.type === 'line') {
    return { id: element.id, slide: slideNumber, kind: 'line', x: Math.min(element.x1, element.x2), y: Math.min(element.y1, element.y2), w: Math.abs(element.x2 - element.x1), h: Math.abs(element.y2 - element.y1), decorative: element.decorative };
  }
  if (element.type === 'icon') return { id: element.id, slide: slideNumber, kind: 'icon', x: element.x, y: element.y, w: element.size, h: element.size, decorative: element.decorative };
  return {
    id: element.id,
    slide: slideNumber,
    kind: element.type,
    role: element.role,
    x: element.x,
    y: element.y,
    w: element.w,
    h: element.h,
    fit: element.fit ? { ...element.fit } : undefined,
    pixels: element.source?.pixels,
    decorative: element.decorative || element.type === 'glow' || (element.type === 'image' && (element.w >= SLIDE_WIDTH - 1 || element.h >= SLIDE_HEIGHT - 1)),
    language: element.language
  };
}

/**
 * Lays out a normalised spec. `measure` measures text (canvas in the
 * browser, estimates elsewhere); `fontAlias` names the families the preview
 * registers. Returns { slides, tokens, design, meta, issues }.
 */
export function layoutPresentation(spec, { measure = createEstimatingMeasurer(), fontAlias = (family) => family } = {}) {
  const design = spec.design;
  const language = spec.meta.language;
  const tokens = buildDesignTokens(design, { language });
  const { marginX, marginTop, marginBottom } = tokens.spacing;
  const frame = { x: marginX, y: marginTop, w: SLIDE_WIDTH - 2 * marginX, bottom: SLIDE_HEIGHT - marginBottom - 24 };
  let source = expandContinuations(spec.slides, language);
  const date = formatDocumentDate(spec.meta.date, language);
  const ctx = {
    spec,
    design,
    tokens,
    language,
    measure,
    fontAlias,
    frame,
    headerWidth: frame.w - (design.motifs.includes('shapes') ? 90 : 0),
    meta: { ...spec.meta, shortTitle: shortTitle(spec.meta.title), date: spec.meta.date },
    // On a deck that is entirely the accent colour, emphasis is a highlighter
    // mark: the accent cannot be told apart from the background.
    emphasis: design.background === 'accent' ? 'mark' : 'color',
    total: source.length,
    tracker: date
  };

  source = splitOverfull(ctx, source);
  ctx.total = source.length;
  const slides = source.map((slideSpec, index) => {
    if (slideSpec.layout === 'section' && slideSpec.title) ctx.tracker = slideSpec.title;
    return renderSlide(ctx, slideSpec, index + 1);
  });

  const elements = slides.flatMap((slide) => slide.elements.map((element) => checkable(element, slide.number)));
  const issues = [
    ...checkPaletteContrast(tokens.palette),
    ...checkDeckStructure({ ...spec, slides: source }),
    ...checkElements(elements, { language })
  ];
  return { slides, tokens, design, language, meta: ctx.meta, issues };
}
