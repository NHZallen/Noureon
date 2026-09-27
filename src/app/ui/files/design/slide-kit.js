// Building blocks for slide layouts. A slide is a list of positioned
// elements in points on the 960 × 540 slide; the PPTX writer and the slide
// preview both draw exactly these elements.
//
// Element types:
//   text   – paragraphs of styled runs already fitted to the box
//   shape  – rect, ellipse, rounded or custom outline (segments)
//   line   – a straight rule
//   image  – upload, asset or placeholder frame with a shape
//   icon   – one of the 32 line icons
//   chart  – a chart spec drawn natively (or as an image fallback)
//   table  – a laid-out table
//   glow   – a soft radial light (motif)

import { applyTypography, generatedText, isCjkLanguage } from './language.js';
import { cssFontStack, FONT_SETS, hasNarrowNoBreakSpace, MONO_FAMILY } from './fonts.js';
import { SLIDE_HEIGHT, SLIDE_WIDTH } from './design-tokens.js';
import { fitRichText, parseEmphasis } from './rich-text.js';

export const pad2 = (value) => String(value).padStart(2, '0');

const ROLE_FONTS = Object.freeze({ heading: 'heading', body: 'body', label: 'label', mono: 'label' });

/** The measuring font for a role (what the canvas or estimator uses). */
export function measureFont(ctx, role, { size, weight, uppercase = false, tracking = 0 }) {
  const resolved = ctx.tokens.fonts[ROLE_FONTS[role] || 'body'];
  const set = FONT_SETS[ctx.design.fonts] || FONT_SETS.modern;
  let family = cssFontStack(resolved, set, ROLE_FONTS[role] || 'body', { alias: ctx.fontAlias });
  if (role === 'mono') family = `"${ctx.fontAlias(MONO_FAMILY)}", ${family}`;
  return { size, weight, family, condensed: role === 'mono' ? 1 : resolved.condensed, tracking, uppercase };
}

/** Default weight of a role in this design. */
export function roleWeight(ctx, role) {
  if (role === 'heading') return ctx.design.headingWeight;
  if (role === 'label' || role === 'mono') return 500;
  return 400;
}

/**
 * A fitted text element (not yet on the slide). `text` (with **emphasis**)
 * or `paragraphs` ([{ runs, scale, indent, spaceBefore, weight, color,
 * bullet }]). Its `h` is the height the text needs unless `keepBox` keeps
 * the given box for a vertical alignment other than top.
 */
export function buildText(ctx, slide, {
  id, role = 'body', x, y, w, h = Infinity, text, paragraphs, size, minSize = size, maxLines = Infinity,
  weight = roleWeight(ctx, role), color = slide.palette.text, strongColor = null, align = 'left', valign = 'top',
  lineHeight = ctx.tokens.lineHeight.body, uppercase = false, tracking = 0, balance = false, decorative = false,
  keepBox = false
}) {
  const written = paragraphs || [{ runs: parseEmphasis(applyTypography(text, ctx.language)) }];
  // Narrow no-break spaces become regular ones where the face lacks them.
  const latinFamily = role === 'mono' ? MONO_FAMILY : ctx.tokens.fonts[ROLE_FONTS[role] || 'body'].latin;
  const source = hasNarrowNoBreakSpace(latinFamily)
    ? written
    : written.map((paragraph) => ({ ...paragraph, runs: paragraph.runs.map((run) => ({ ...run, text: run.text.replace(/\u202F/g, '\u00A0') })) }));
  const font = measureFont(ctx, role, { size, weight, uppercase, tracking });
  // Headings, short texts and all CJK text carry the engine's line breaks into
  // the file: PowerPoint breaks Chinese between any two characters, the
  // engine only between words. Long Latin text wraps in PowerPoint itself.
  const explicit = balance || maxLines <= 3 || isCjkLanguage(ctx.language);
  const fit = fitRichText(source, {
    width: w, height: h, font, minSize, maxLines, lineHeight, measure: ctx.measure, language: ctx.language, balance,
    strongWeight: Math.max(700, weight), drawFactor: explicit ? 0.97 : 1, widows: true
  });
  const element = {
    type: 'text',
    id: `${slide.id}-${id}`,
    role,
    x, y, w,
    h: keepBox && Number.isFinite(h) ? h : explicit ? fit.drawnHeight : fit.height,
    align,
    valign: keepBox ? valign : 'top',
    color,
    strongColor: strongColor ?? (ctx.emphasis === 'mark' ? null : slide.palette.accentText),
    mark: ctx.emphasis === 'mark' ? slide.palette.mark : null,
    font: { role, size: fit.size, weight, uppercase, tracking, lineHeight, strongWeight: Math.max(700, weight) },
    paragraphs: fit.paragraphs,
    breaks: explicit ? 'explicit' : 'auto',
    // One-line texts never wrap in PowerPoint (numbers, labels, values).
    noWrap: explicit,
    fit: { overflow: fit.overflow, shrinkRatio: fit.shrinkRatio, lines: fit.lines },
    language: ctx.language,
    decorative
  };
  return element;
}

/** Adds a fitted text element to the slide (see buildText). */
export function addText(ctx, slide, options) {
  const element = buildText(ctx, slide, options);
  slide.elements.push(element);
  return element;
}

export function addShape(slide, shape) {
  const element = { type: 'shape', shape: 'rect', fill: null, line: null, radius: 0, decorative: true, ...shape, id: `${slide.id}-${shape.id}` };
  slide.elements.push(element);
  return element;
}

export function addLine(slide, line) {
  const element = { type: 'line', width: 1, dash: null, decorative: true, ...line, id: `${slide.id}-${line.id}` };
  slide.elements.push(element);
  return element;
}

// ---------------------------------------------------------------- labels

/**
 * A kicker label in the design's label style (text, pill, tag, bracket).
 * Returns { height, width } of what was drawn.
 */
export function addLabel(ctx, slide, { id = 'kicker', text, x, y, maxWidth, align = 'left', onFill = false }) {
  if (!text) return { height: 0, width: 0 };
  const style = ctx.design.labels;
  const size = ctx.tokens.type.label;
  const palette = slide.palette;
  const role = style === 'bracket' ? 'mono' : 'label';
  const shown = style === 'bracket' ? `[ ${text} ]` : text;
  const tracking = style === 'bracket' ? 0.02 : 0.08;
  const padX = style === 'pill' ? 14 : style === 'tag' ? 10 : 0;
  const padY = style === 'pill' ? 5 : style === 'tag' ? 4 : 0;
  const color = style === 'tag' ? (onFill ? palette.fill : palette.onFill) : onFill ? palette.onFill : palette.accentText;
  const font = measureFont(ctx, role, { size, weight: 600, uppercase: true, tracking });
  const textWidth = Math.min(maxWidth - padX * 2, ctx.measure(shown, font) / 0.92 + 1);
  const element = addText(ctx, slide, {
    id, role, text: shown, x: 0, y: y + padY, w: Math.max(20, textWidth), size, minSize: Math.min(size, 10), maxLines: 2,
    weight: 600, uppercase: true, tracking, color, lineHeight: 1.25
  });
  element.strongColor = null;
  const drawnWidth = Math.min(textWidth, Math.max(...element.paragraphs.flatMap((paragraph) => paragraph.lines.map((line) => line.width)), 0) + 1);
  const width = drawnWidth + padX * 2;
  const left = align === 'center' ? x + (maxWidth - width) / 2 : x;
  element.x = left + padX;
  element.w = Math.max(drawnWidth, 1);
  const height = element.h + padY * 2;
  if (style === 'pill' || style === 'tag') {
    const chip = addShape(slide, {
      id: `${id}-chip`, x: left, y, w: width, h: height,
      shape: 'rounded',
      radius: style === 'pill' ? height / 2 : ctx.design.radius * 0.35,
      fill: style === 'tag' ? { color: onFill ? palette.onFill : palette.fill } : null,
      line: style === 'pill' ? { color, width: 1.5 } : null
    });
    // The chip belongs under its text.
    slide.elements.splice(slide.elements.indexOf(chip), 1);
    slide.elements.splice(slide.elements.indexOf(element), 0, chip);
  }
  return { height, width };
}

// ---------------------------------------------------------------- titles

/** Kicker and title at the top of a content slide; returns the y below it. */
export function addHeader(ctx, slide, { title, kicker, x = ctx.frame.x, y = ctx.frame.y, w = ctx.headerWidth, size = ctx.tokens.type.title, align = 'left' } = {}) {
  let cursor = y;
  const labelBox = addLabel(ctx, slide, { text: kicker, x, y: cursor, maxWidth: w, align });
  if (labelBox.height) cursor += labelBox.height + 12;
  if (title) {
    const element = addText(ctx, slide, {
      id: 'title', role: 'heading', text: title, x, y: cursor, w, size, minSize: Math.min(size, 22), maxLines: 2,
      lineHeight: ctx.tokens.lineHeight.heading, uppercase: ctx.tokens.uppercaseHeadings, tracking: ctx.tokens.tracking,
      balance: true, align
    });
    element.role = 'title';
    element.font.role = 'heading';
    cursor += element.h;
  }
  if (ctx.design.motifs.includes('rules') && !slide.inverse && (title || kicker)) {
    cursor += 14;
    addLine(slide, { id: 'header-rule', x1: x, y1: cursor, x2: x + w, y2: cursor, color: slide.palette.line, width: 1 });
  }
  return cursor + ctx.tokens.spacing.gap;
}

// ---------------------------------------------------------------- chrome

/** Footer text and page number, or the four corner labels of `meta`. */
export function addChrome(ctx, slide, { footer = true } = {}) {
  const palette = slide.palette;
  const motifs = ctx.design.motifs;
  const { marginX: mx, marginBottom: mb } = ctx.tokens.spacing;
  if (motifs.includes('meta')) {
    const size = 11;
    const corner = (id, text, x, y, align) => {
      if (!text) return;
      addText(ctx, slide, {
        id, role: 'label', text, x, y, w: 380, size, maxLines: 1, weight: 500, uppercase: true, tracking: 0.1,
        color: palette.muted, lineHeight: 1.1, align, decorative: true
      });
    };
    corner('meta-tl', ctx.meta.shortTitle, mx, 20, 'left');
    corner('meta-tr', ctx.tracker, SLIDE_WIDTH - mx - 380, 20, 'right');
    corner('meta-bl', ctx.meta.author, mx, SLIDE_HEIGHT - 18 - 12, 'left');
    corner('meta-br', `${pad2(slide.number)} / ${pad2(ctx.total)}`, SLIDE_WIDTH - mx - 380, SLIDE_HEIGHT - 18 - 12, 'right');
    return;
  }
  if (!footer) return;
  const y = SLIDE_HEIGHT - mb * (motifs.includes('rules') ? 0.45 : 0.55) - 12;
  if (motifs.includes('rules')) {
    addLine(slide, { id: 'footer-rule', x1: mx, y1: y - 9, x2: SLIDE_WIDTH - mx, y2: y - 9, color: palette.line, width: 1 });
  }
  if (ctx.meta.footer) {
    addText(ctx, slide, { id: 'footer', text: ctx.meta.footer, x: mx, y, w: 640, size: 12, maxLines: 1, color: palette.muted, lineHeight: 1.1, decorative: true });
  }
  if (ctx.meta.slideNumbers) {
    addText(ctx, slide, { id: 'page', text: String(slide.number), x: SLIDE_WIDTH - mx - 80, y, w: 80, size: 12, maxLines: 1, color: palette.muted, lineHeight: 1.1, align: 'right', decorative: true });
  }
}

// ---------------------------------------------------------------- motifs

const GLOW_POSITIONS = [
  [[590, -230], [-220, 320]],
  [[-200, -250], [620, 300]],
  [[288, -330], [680, 280]]
];

/** Background motifs (grid, glow, blob, shapes), drawn before the content. */
export function addBackMotifs(ctx, slide, { big = false, bleed = false } = {}) {
  if (bleed) return;
  const motifs = ctx.design.motifs;
  const palette = slide.palette;
  const variant = slide.number % 3;
  if (motifs.includes('grid')) {
    for (let x = 80; x < SLIDE_WIDTH; x += 80) addLine(slide, { id: `grid-v${x}`, x1: x, y1: 0, x2: x, y2: SLIDE_HEIGHT, color: palette.line, width: 1, alpha: 0.35 });
    for (let y = 80; y < SLIDE_HEIGHT; y += 80) addLine(slide, { id: `grid-h${y}`, x1: 0, y1: y, x2: SLIDE_WIDTH, y2: y, color: palette.line, width: 1, alpha: 0.35 });
  }
  if (motifs.includes('glow') && !slide.inverse) {
    GLOW_POSITIONS[variant].forEach(([x, y], index) => {
      slide.elements.push({ type: 'glow', id: `${slide.id}-glow${index + 1}`, x, y, w: 520, h: 520, color: index === 0 ? palette.glow1 : palette.glow2, alpha: 0.6, decorative: true });
    });
  }
  if (motifs.includes('blob')) {
    const size = big ? [560, 480] : [320, 280];
    const [x, y, rotate] = [[SLIDE_WIDTH - size[0] + 120, -110, 0], [-130, SLIDE_HEIGHT - size[1] + 140, 40], [SLIDE_WIDTH - size[0] + 90, SLIDE_HEIGHT - size[1] + 120, -30]][variant];
    addShape(slide, { id: 'blob', shape: 'blob', x, y, w: size[0], h: size[1], rotate, fill: { color: slide.inverse ? palette.surface : palette.accent2Soft } });
  }
  if (motifs.includes('shapes')) {
    const a = { color: slide.inverse ? palette.onFill : palette.accent, alpha: slide.inverse ? 0.25 : 1 };
    const b = { color: slide.inverse ? palette.onFill : palette.accent2, alpha: slide.inverse ? 0.15 : 1 };
    const W = SLIDE_WIDTH;
    const H = SLIDE_HEIGHT;
    const shapes = big
      ? [
        [{ shape: 'ellipse', x: W - 300, y: H - 270, w: 420, h: 420 }, { shape: 'ellipse', x: W - 420, y: H - 200, w: 160, h: 160 }],
        [{ shape: 'rounded', radius: [220, 220, 0, 0], x: W - 400, y: H - 220, w: 440, h: 220 }, { shape: 'rect', x: W - 210, y: 40, w: 170, h: 170 }],
        [{ shape: 'rounded', radius: [0, 0, 0, 300], x: W - 300, y: 0, w: 300, h: 300 }, { shape: 'rounded', radius: [75, 75, 0, 0], x: W - 450, y: H - 75, w: 150, h: 75 }]
      ][variant]
      : [
        [{ shape: 'ellipse', x: W - 75, y: -75, w: 150, h: 150 }, { shape: 'ellipse', x: W - 126, y: 30, w: 34, h: 34 }],
        [{ shape: 'rounded', radius: [0, 0, 60, 60], x: W - 160, y: 0, w: 120, h: 60 }, { shape: 'rect', x: W - 60, y: 0, w: 60, h: 60 }],
        [{ shape: 'rounded', radius: [0, 0, 0, 80], x: W - 80, y: 0, w: 80, h: 80 }, { shape: 'rect', x: W - 120, y: 0, w: 40, h: 40 }]
      ][variant];
    shapes.forEach((shape, index) => addShape(slide, { id: `shape-${index ? 'b' : 'a'}`, ...shape, fill: index ? b : a }));
  }
}

/** Foreground motifs (frame, meta corners) and chrome, drawn last. */
export function addFrontMotifs(ctx, slide, { cover = false, footer = true } = {}) {
  if (ctx.design.motifs.includes('frame') && !cover) {
    addShape(slide, { id: 'frame', x: 18, y: 18, w: SLIDE_WIDTH - 36, h: SLIDE_HEIGHT - 36, line: { color: slide.inverse ? slide.palette.line : slide.palette.frame, width: 1 } });
  }
  addChrome(ctx, slide, { footer });
}

// ---------------------------------------------------------------- images

/** The image shape of the design for a frame of this size. */
export function imageShape(ctx, { allowCircle = false, bleed = false } = {}) {
  if (bleed) return { shape: 'rect', radius: 0 };
  const radius = ctx.design.radius;
  switch (ctx.design.imageShape) {
    case 'rounded': return { shape: 'rounded', radius: Math.max(radius, 20) };
    case 'arch': return { shape: 'arch', radius };
    case 'circle': return allowCircle ? { shape: 'ellipse', radius: 0 } : { shape: 'rounded', radius: Math.max(radius, 20) };
    case 'bleed': return { shape: 'rect', radius: 0 };
    default: return { shape: 'rounded', radius };
  }
}

/** Adds an image (or a replaceable placeholder frame). */
export function addImage(ctx, slide, { id = 'image', image, x, y, w, h, bleed = false, allowCircle = false }) {
  const shape = imageShape(ctx, { allowCircle, bleed });
  const source = image || { kind: 'placeholder', text: '', alt: '' };
  const element = {
    type: 'image',
    id: `${slide.id}-${id}`,
    x, y, w, h,
    ...shape,
    source,
    fit: source.fit || 'cover',
    focus: source.focus || 'center',
    alt: source.alt || source.text || '',
    placeholderText: source.kind === 'placeholder' ? (source.text || generatedText(ctx.language, 'imagePlaceholder')) : '',
    palette: { fill: slide.palette.surface, line: slide.palette.line, text: slide.palette.muted },
    decorative: false
  };
  slide.elements.push(element);
  return element;
}

/** Whether a slide shows a given image under the design's imagery setting. */
export function showsImage(ctx, image, { rich = false } = {}) {
  if (!image) return false;
  if (image.kind !== 'placeholder') return true;
  if (ctx.design.imagery === 'none') return false;
  return !rich || ctx.design.imagery === 'rich';
}

// ---------------------------------------------------------------- numbers

/** How a list or section number is written in the design's number style. */
export function numberText(ctx, value, { big = false } = {}) {
  const style = ctx.design.numbers;
  if (style === 'plain' || (style === 'circle' && big)) return String(value);
  return pad2(value);
}
