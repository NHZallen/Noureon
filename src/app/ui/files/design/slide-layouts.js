// The 17 slide layouts. Each turns one normalised slide into positioned
// elements, following the approved design proposal: every measurement below
// comes from its stylesheet, expressed in points on the 960 × 540 slide.
//
// Layouts only place content; colours come from the slide palette, fonts
// from the design tokens, and fitting from rich-text.js.

import { applyTypography, formatDocumentDate, isCjkLanguage, quoteMarks } from './language.js';
import { SLIDE_HEIGHT, SLIDE_WIDTH } from './design-tokens.js';
import { parseEmphasis } from './rich-text.js';
import {
  addBackMotifs, addFrontMotifs, addHeader, addImage, addLabel, addLine, addShape, addText, buildText, measureFont, numberText, pad2, showsImage
} from './slide-kit.js';

const W = SLIDE_WIDTH;
const H = SLIDE_HEIGHT;
const runsOf = (ctx, text) => parseEmphasis(applyTypography(text, ctx.language));
const h3Weight = (ctx) => (ctx.design.headingWeight >= 600 ? 700 : 600);
const trendText = (change) => {
  const text = String(change ?? '').trim();
  if (/^[+\u2191\u25B2]/.test(text)) return `▲ ${text.replace(/^[+\u2191\u25B2]\s*/, '')}`;
  if (/^[-\u2212\u2193\u25BC]/.test(text)) return `▼ ${text.replace(/^[-\u2212\u2193\u25BC]\s*/, '')}`;
  return text;
};

// ------------------------------------------------------------ shared parts

/** Header plus the content area below it: { x, y, w, bottom }. */
function contentArea(ctx, slide, s, { width } = {}) {
  const top = addHeader(ctx, slide, { title: s.title, kicker: s.kicker, w: width ?? ctx.headerWidth });
  return { x: ctx.frame.x, y: top, w: ctx.frame.w, bottom: ctx.frame.bottom };
}

/** A source note at the bottom of the area; returns the area above it. */
function addSource(ctx, slide, s, area) {
  if (!s.source) return area;
  const probe = addText(ctx, slide, { id: 'source', text: s.source, x: area.x, y: 0, w: area.w, size: 12.5, minSize: 11, maxLines: 2, color: slide.palette.muted, lineHeight: 1.4 });
  probe.y = area.bottom - probe.h;
  return { ...area, bottom: probe.y - 12 };
}

/** Bullet paragraphs (two levels) in the design's bullet style. */
function bulletParagraphs(ctx, slide, items, { style = ctx.design.bullets } = {}) {
  const indent = style === 'number' ? 1.7 : 1.25;
  const paragraphs = [];
  items.forEach((item, index) => {
    paragraphs.push({
      runs: runsOf(ctx, item.text),
      indent,
      hangingEm: indent,
      spaceBefore: index ? ctx.tokens.spacing.itemGap : 0,
      bullet: { style, text: pad2(index + 1), color: slide.palette.accent, role: 'label' }
    });
    (item.children || []).forEach((child) => {
      paragraphs.push({
        runs: runsOf(ctx, typeof child === 'string' ? child : child.text),
        indent: (indent + 1.1) / 0.9,
        hangingEm: 1.1 / 0.9,
        scale: 0.9,
        spaceBefore: 0.35,
        color: slide.palette.muted,
        bullet: { style: 'sub', color: slide.palette.muted }
      });
    });
  });
  return paragraphs;
}

/** A body text block (bullets and/or prose) fitted to an area. */
function addBody(ctx, slide, { id = 'body', bullets = [], body = '', x, y, w, h, size = ctx.tokens.type.body }) {
  const paragraphs = [];
  if (body) {
    body.split(/\n{2,}|\n/).filter(Boolean).forEach((part, index) => paragraphs.push({ runs: runsOf(ctx, part), spaceBefore: index ? 0.6 : 0 }));
  }
  const list = bulletParagraphs(ctx, slide, bullets);
  if (paragraphs.length && list.length) list[0].spaceBefore = 0.9;
  paragraphs.push(...list);
  if (!paragraphs.length) return null;
  return addText(ctx, slide, { id, paragraphs, x, y, w, h, size, minSize: Math.min(size, 14), lineHeight: ctx.tokens.lineHeight.body });
}

/** Slide background, back motifs; returns nothing. */
function begin(ctx, slide, { big = false, bleed = false } = {}) {
  addBackMotifs(ctx, slide, { big, bleed });
}

// Between name-like parts: an ideographic space in CJK, a middle dot elsewhere.
const separator = (ctx) => (isCjkLanguage(ctx.language) ? '\u3000' : ' \u00b7 ');

function metaLine(ctx) {
  return [ctx.meta.author, formatDocumentDate(ctx.meta.date, ctx.language)].filter(Boolean).join(separator(ctx));
}

/** Stacks prepared text blocks vertically and returns the total height. */
function stack(blocks) {
  let height = 0;
  blocks.forEach((block, index) => {
    height += (index ? block.gap || 0 : 0) + block.element.h;
  });
  return height;
}

function placeStack(blocks, top) {
  let cursor = top;
  blocks.forEach((block, index) => {
    cursor += index ? block.gap || 0 : 0;
    const dy = cursor - block.element.y;
    block.element.y = cursor;
    (block.companions || []).forEach((companion) => { companion.y += dy; });
    cursor += block.element.h;
  });
  return cursor;
}

/** Width of the number column for agenda and closing lists. */
// 2.2 digits of the number font (0.9 em of the item size) wide.
// The widest two-digit number in the number font, plus a little air.
const listNumberWidth = (ctx, size) => {
  if (ctx.design.numbers === 'circle') return size * 1.6;
  const font = measureFont(ctx, 'heading', { size: size * 0.9, weight: 700 });
  return Math.max(ctx.measure('00', font), ctx.measure('88', font)) + 4;
};

/** Number marker for agenda and closing lists in the design's style. */
function addListNumber(ctx, slide, { id, value, x, y, size }) {
  const style = ctx.design.numbers;
  if (style === 'circle') {
    const diameter = size * 1.9 * 0.8;
    addShape(slide, { id: `${id}-disc`, shape: 'ellipse', x, y: y + (size * 1.35 - diameter) / 2, w: diameter, h: diameter, fill: { color: slide.palette.fill }, decorative: false });
    const label = addText(ctx, slide, { id, role: 'heading', text: String(value), x, y: 0, w: diameter, size: size * 0.8 * 0.8, weight: 700, color: slide.palette.onFill, align: 'center', lineHeight: 1 });
    label.y = y + (size * 1.35 - diameter) / 2 + (diameter - label.h) / 2;
    return diameter;
  }
  const element = addText(ctx, slide, { id, role: 'heading', text: numberText(ctx, value), x, y: y + size * 0.1 * 1.35, w: listNumberWidth(ctx, size), size: size * 0.9, maxLines: 1, weight: 700, color: slide.palette.accentText, lineHeight: 1.35 });
  return element.w;
}

// ------------------------------------------------------------ cover

function cover(ctx, slide, s) {
  const { design, tokens } = ctx;
  const { marginX: mx, marginTop: mt, marginBottom: mb } = tokens.spacing;
  const image = showsImage(ctx, s.image) ? s.image : null;
  let kind = design.cover;
  if ((kind === 'split' || kind === 'bleed') && !image) kind = 'type';
  const centered = kind === 'frame' || (design.align === 'center' && kind !== 'split' && kind !== 'band');
  const upper = tokens.uppercaseHeadings;
  begin(ctx, slide, { big: true, bleed: kind === 'bleed' });

  let textX = mx;
  let textW = centered ? W - 220 : W - 2 * mx - 90;
  const onImage = kind === 'bleed';
  if (kind === 'split') textW = W * 0.54 - mx - 30;
  if (kind === 'band') textW = W - 2 * mx;
  if (centered) textX = 110;
  const align = centered ? 'center' : 'left';

  if (kind === 'split') {
    const bleed = design.imageShape === 'bleed';
    const frame = bleed ? { x: W * 0.54, y: 0, w: W * 0.46, h: H } : { x: W - mx - W * 0.38, y: mt, w: W * 0.38, h: H - mt - mb };
    addImage(ctx, slide, { image, ...frame, bleed });
  }
  if (kind === 'bleed') {
    addImage(ctx, slide, { image, x: 0, y: 0, w: W, h: H, bleed: true });
    addShape(slide, { id: 'scrim', x: 0, y: H * 0.3, w: W, h: H * 0.7, gradient: { from: { color: '#000000', alpha: 0 }, to: { color: '#000000', alpha: 0.66 }, stop: 0.7, angle: 90 } });
  }
  if (kind === 'band') addShape(slide, { id: 'band', x: 0, y: 0, w: W, h: H * 0.6, fill: { color: slide.palette.fill } });

  const titleColor = onImage ? '#FFFFFF' : kind === 'band' ? slide.palette.onFill : slide.palette.text;
  const mutedColor = onImage ? '#FFFFFF' : slide.palette.muted;
  const blocks = [];
  const subtitle = s.subtitle ? buildText(ctx, slide, {
    id: 'subtitle', text: s.subtitle, x: textX, y: 0, w: kind === 'band' ? W - 2 * mx : textW, size: tokens.type.h3, minSize: 14, maxLines: 3,
    lineHeight: 1.45, color: mutedColor, align, balance: true
  }) : null;
  const meta = metaLine(ctx) ? buildText(ctx, slide, { id: 'meta', text: metaLine(ctx), x: textX, y: 0, w: textW, size: 13, maxLines: 1, color: mutedColor, align, lineHeight: 1.3 }) : null;
  if (onImage && subtitle) subtitle.alpha = 0.86;
  if (onImage && meta) meta.alpha = 0.86;

  // The kicker is drawn after its position is known; the title gets the
  // height the other blocks leave.
  const kickerHeight = s.kicker ? measureKicker(ctx, s.kicker) : 0;
  const kickerSpace = kickerHeight ? kickerHeight + 18 : 0;
  const titleSpace = kind === 'band'
    ? H * 0.6 - 26 - mt - kickerSpace
    : (centered || kind === 'split' ? H - 2 * mt : H - mt - (mb + 18)) - kickerSpace
      - (subtitle ? subtitle.h + 18 : 0) - (meta ? meta.h + 26 : 0);
  const title = addText(ctx, slide, {
    id: 'title', role: 'heading', text: s.title || ctx.meta.title, x: textX, y: 0, w: textW, h: titleSpace, size: tokens.type.cover, minSize: 30, maxLines: 3,
    lineHeight: tokens.lineHeight.heading, uppercase: upper, tracking: tokens.tracking, balance: true, align, color: titleColor
  });
  title.role = 'title';
  if (subtitle) slide.elements.push(subtitle);
  if (meta) slide.elements.push(meta);
  if (kind === 'band') {
    const bandBottom = H * 0.6 - 26;
    let top = bandBottom - title.h - (kickerHeight ? kickerHeight + 18 : 0);
    if (s.kicker) {
      addLabel(ctx, slide, { text: s.kicker, x: textX, y: top, maxWidth: textW, onFill: true });
      top += kickerHeight + 18;
    }
    title.y = top;
    const below = [subtitle, meta].filter(Boolean);
    let cursor = H * 0.6 + 22;
    below.forEach((element, index) => {
      element.y = cursor + (index && element === meta ? 8 : 0);
      cursor = element.y + element.h + 18;
    });
  } else {
    if (subtitle) blocks.push({ element: subtitle, gap: 18 });
    if (meta) blocks.push({ element: meta, gap: 26 });
    const total = kickerHeight + (kickerHeight ? 18 : 0) + title.h + stack(blocks.length ? [{ element: { h: 0 } }, ...blocks] : []);
    let top;
    if (kind === 'split') top = (H - total) / 2;
    else if (centered) top = (H - total) / 2;
    else top = H - (mb + 18) - total;
    if (s.kicker) {
      addLabel(ctx, slide, { text: s.kicker, x: textX, y: top, maxWidth: textW, align, onFill: onImage });
      top += kickerHeight + 18;
    }
    title.y = top;
    placeStack([{ element: title }, ...blocks], top);
  }
  if (kind === 'frame') addShape(slide, { id: 'cover-frame', x: 30, y: 30, w: W - 60, h: H - 60, line: { color: slide.palette.frame, width: 1 } });
  addFrontMotifs(ctx, slide, { cover: true, footer: false });
  return slide;
}

function measureKicker(ctx, text) {
  const style = ctx.design.labels;
  const size = ctx.tokens.type.label;
  return size * 1.25 + (style === 'pill' ? 10 : style === 'tag' ? 8 : 0);
}

// ------------------------------------------------------------ section

function section(ctx, slide, s) {
  const { design, tokens } = ctx;
  const { marginX: mx, marginTop: mt, marginBottom: mb } = tokens.spacing;
  const kind = design.section;
  const centered = design.align === 'center' && kind !== 'split';
  const number = s.number ?? 1;
  begin(ctx, slide, { big: true });
  const titleWidth = kind === 'split' ? W * 0.6 - 2 * mx : centered ? W - 200 : W - 2 * mx;
  const textX = kind === 'split' ? W * 0.4 + mx : centered ? 100 : mx;
  const align = centered ? 'center' : 'left';
  const title = addText(ctx, slide, {
    id: 'title', role: 'heading', text: s.title, x: textX, y: 0, w: titleWidth, h: H * 0.42, size: tokens.type.section, minSize: 28, maxLines: 2,
    lineHeight: tokens.lineHeight.heading, uppercase: tokens.uppercaseHeadings, tracking: tokens.tracking, balance: true, align
  });
  title.role = 'title';
  const subtitle = s.subtitle ? addText(ctx, slide, { id: 'subtitle', text: s.subtitle, x: textX, y: 0, w: Math.min(titleWidth, 700), size: tokens.type.h3, minSize: 14, maxLines: 3, color: slide.palette.muted, lineHeight: 1.45, align, balance: true }) : null;
  if (subtitle && centered) subtitle.x = textX + (titleWidth - subtitle.w) / 2;
  const blocks = [{ element: title }];
  if (subtitle) blocks.push({ element: subtitle, gap: 14 });

  const bigNumber = (x, y, width, color, alignment = 'left', height = Infinity) => {
    const outline = design.numbers === 'outline';
    const element = addText(ctx, slide, {
      id: 'number', role: 'heading', text: numberText(ctx, number, { big: true }), x, y, w: width, h: height, size: tokens.type.hero, minSize: 36, maxLines: 1,
      lineHeight: 0.9, color, align: alignment, tracking: -0.02
    });
    if (outline) element.paragraphs.forEach((paragraph) => paragraph.lines.forEach((line) => line.runs.forEach((run) => { run.outline = { color, width: 1.5 }; })));
    if (outline) element.paragraphs.forEach((paragraph) => paragraph.runs.forEach((run) => { run.outline = { color, width: 1.5 }; }));
    return element;
  };
  const smallNumber = (x, y, color, id = 'small-number') => addText(ctx, slide, {
    id, role: 'label', text: pad2(number), x, y, w: 200, size: kind === 'rule' ? 15 : 14, weight: kind === 'rule' ? 600 : 500, tracking: 0.08,
    color, lineHeight: 1.2, align
  });

  if (kind === 'field') {
    const small = smallNumber(textX, 0, slide.palette.onFill);
    small.x = centered ? textX + (titleWidth - 200) / 2 : textX;
    const all = [{ element: small }, { element: title, gap: 18 }, ...blocks.slice(1)];
    const total = stack(all);
    placeStack(all, centered ? (H - total) / 2 : H - (mb + 16) - total);
  } else if (kind === 'split') {
    addShape(slide, { id: 'panel', x: 0, y: 0, w: W * 0.4, h: H, fill: { color: slide.palette.fill } });
    const numberElement = bigNumber(mx, 0, W * 0.4 - 2 * mx, slide.palette.onFill);
    numberElement.y = H - mb - numberElement.h;
    const total = stack(blocks);
    placeStack(blocks, (H - total) / 2);
  } else if (kind === 'rule') {
    const small = smallNumber(textX, 0, slide.palette.accentText);
    small.x = centered ? textX + (titleWidth - 200) / 2 : textX;
    const ruleX = centered ? textX + titleWidth / 2 - 32 : textX;
    const rule = addShape(slide, { id: 'rule', x: ruleX, y: 0, w: 64, h: 2, fill: { color: slide.palette.accent }, decorative: false });
    const ruleBlock = { element: { y: 0, h: 2 }, gap: 18, companions: [rule] };
    const all = [{ element: small }, ruleBlock, { element: title, gap: 22 }, ...blocks.slice(1)];
    const total = stack(all);
    placeStack(all, (H - total) / 2);
  } else {
    // The number takes the height the title block leaves.
    const total = stack(blocks);
    const top = centered ? Math.min(H * 0.58, H - (mb + 16) - total) : H - (mb + 16) - total;
    // Corner labels (meta motif) sit in the top margin; keep the number clear.
    const numberTop = (centered ? Math.min(H * 0.16, mt) : mt) + (design.motifs.includes('meta') ? 16 : 0);
    const numberElement = centered
      ? bigNumber(0, numberTop, W, slide.palette.accentText, 'center', top - 20 - numberTop)
      : bigNumber(mx, numberTop, W - 2 * mx, slide.palette.accentText, 'left', top - 20 - numberTop);
    if (centered) numberElement.y = Math.max(numberTop, (numberTop + top - 20 - numberElement.h) / 2);
    placeStack(blocks, top);
  }
  addFrontMotifs(ctx, slide, { footer: false });
  return slide;
}

// ------------------------------------------------------------ agenda

function agenda(ctx, slide, s) {
  const { tokens } = ctx;
  const gap = tokens.spacing.gap;
  begin(ctx, slide);
  const leftWidth = (ctx.frame.w - gap * 2) * 5 / 12;
  const rightX = ctx.frame.x + leftWidth + gap * 2;
  const rightWidth = ctx.frame.w - leftWidth - gap * 2;
  addHeader(ctx, slide, { title: s.title, kicker: s.kicker, w: leftWidth });
  const size = tokens.type.h3;
  let cursor = ctx.frame.y;
  const numberWidth = listNumberWidth(ctx, size);
  const available = ctx.frame.bottom - ctx.frame.y;
  const itemHeight = Math.min(available / Math.max(1, s.items.length), size * 3.4);
  s.items.forEach((item, index) => {
    addLine(slide, { id: `rule-${index}`, x1: rightX, y1: cursor, x2: rightX + rightWidth, y2: cursor, color: slide.palette.line, width: 1, decorative: false });
    const top = cursor + 15;
    addListNumber(ctx, slide, { id: `num-${index}`, value: index + 1, x: rightX, y: top, size });
    const paragraphs = [{ runs: runsOf(ctx, item.title), weight: 400 }];
    if (item.description) paragraphs.push({ runs: runsOf(ctx, item.description), scale: 0.72, color: slide.palette.muted, spaceBefore: 0.2 });
    const text = addText(ctx, slide, {
      id: `item-${index}`, paragraphs, x: rightX + numberWidth + 22, y: top, w: rightWidth - numberWidth - 22, h: itemHeight - 30,
      size, minSize: Math.min(size, 14), lineHeight: 1.35
    });
    cursor = top + Math.max(text.h, size * 1.35) + 15;
  });
  addLine(slide, { id: 'rule-end', x1: rightX, y1: cursor, x2: rightX + rightWidth, y2: cursor, color: slide.palette.line, width: 1, decorative: false });
  addFrontMotifs(ctx, slide);
  return slide;
}

// ------------------------------------------------------------ bullets

function bullets(ctx, slide, s) {
  begin(ctx, slide);
  let area = contentArea(ctx, slide, s);
  area = addSource(ctx, slide, s, area);
  let bottom = area.bottom;
  if (s.callout) {
    const callout = addText(ctx, slide, {
      id: 'callout', text: s.callout, x: area.x + 22, y: 0, w: area.w - 44, size: ctx.tokens.type.body, minSize: 14, maxLines: 3,
      weight: 700, lineHeight: 1.45
    });
    const boxHeight = callout.h + 32;
    const boxY = bottom - boxHeight;
    callout.y = boxY + 16;
    const box = addShape(slide, { id: 'callout-box', x: area.x, y: boxY, w: area.w, h: boxHeight, shape: 'rounded', radius: ctx.design.radius, fill: { color: slide.palette.soft }, decorative: false });
    slide.elements.splice(slide.elements.indexOf(box), 1);
    slide.elements.splice(slide.elements.indexOf(callout), 0, box);
    bottom = boxY - ctx.tokens.spacing.gap;
  }
  addBody(ctx, slide, { bullets: s.bullets, body: s.body, x: area.x, y: area.y, w: area.w, h: bottom - area.y });
  addFrontMotifs(ctx, slide);
  return slide;
}

// ------------------------------------------------------------ split

function split(ctx, slide, s) {
  const { design, tokens } = ctx;
  const { marginX: mx, marginTop: mt, marginBottom: mb } = tokens.spacing;
  const image = showsImage(ctx, s.image) ? s.image : null;
  const side = s.imageSide === 'left' ? 'left' : 'right';
  begin(ctx, slide);
  if (!image) {
    // No picture: a colour panel carries the title instead.
    const panelX = side === 'right' ? W * 0.54 : 0;
    addShape(slide, { id: 'panel', x: panelX, y: 0, w: W * 0.46, h: H, fill: { color: slide.palette.fill } });
    const textW = W * 0.46 - 2 * mx;
    const title = addText(ctx, slide, {
      id: 'title', role: 'heading', text: s.title, x: panelX + mx, y: 0, w: textW, size: tokens.type.title * 1.1, minSize: 24, maxLines: 3,
      lineHeight: tokens.lineHeight.heading, uppercase: tokens.uppercaseHeadings, tracking: tokens.tracking, balance: true, color: slide.palette.onFill
    });
    title.role = 'title';
    title.y = H - (mb + 8) - title.h;
    if (s.kicker) addLabel(ctx, slide, { text: s.kicker, x: panelX + mx, y: title.y - 14 - measureKicker(ctx, s.kicker), maxWidth: textW, onFill: true });
    const bodyX = side === 'right' ? mx : W * 0.46 + mx;
    const bodyW = W * 0.54 - 2 * mx;
    const body = addBody(ctx, slide, { bullets: s.bullets, body: s.body, x: bodyX, y: mt, w: bodyW, h: ctx.frame.bottom - mt });
    if (body) body.y = mt + Math.max(0, (ctx.frame.bottom - mt - body.h) / 2);
    addFrontMotifs(ctx, slide);
    return slide;
  }
  const bleed = design.imageShape === 'bleed';
  const imageWidth = bleed ? W * 0.46 : W * 0.38;
  const imageX = side === 'right' ? (bleed ? W - imageWidth : W - mx - imageWidth) : (bleed ? 0 : mx);
  addImage(ctx, slide, { image, x: imageX, y: bleed ? 0 : mt, w: imageWidth, h: bleed ? H : H - mt - mb, bleed });
  const textX = side === 'right' ? mx : (bleed ? imageWidth + mx : mx + imageWidth + mx);
  const textW = bleed ? W - imageWidth - 2 * mx : W - imageWidth - 3 * mx;
  const top = addHeader(ctx, slide, { title: s.title, kicker: s.kicker, x: textX, w: textW });
  addBody(ctx, slide, { bullets: s.bullets, body: s.body, x: textX, y: top, w: textW, h: ctx.frame.bottom - top });
  addFrontMotifs(ctx, slide);
  return slide;
}

// ------------------------------------------------------------ image

function imageLayout(ctx, slide, s) {
  const { tokens, design } = ctx;
  const { marginX: mx, marginBottom: mb } = tokens.spacing;
  const image = showsImage(ctx, s.image) ? s.image : null;
  const align = design.align === 'center' ? 'center' : 'left';
  if (!image) {
    begin(ctx, slide, { big: true });
    const title = addText(ctx, slide, {
      id: 'title', role: 'heading', text: s.title, x: mx, y: 0, w: W - 2 * mx, size: tokens.type.cover * 0.8, minSize: 26, maxLines: 2,
      lineHeight: tokens.lineHeight.heading, uppercase: tokens.uppercaseHeadings, tracking: tokens.tracking, balance: true, align
    });
    title.role = 'title';
    const caption = s.caption ? addText(ctx, slide, { id: 'caption', text: s.caption, x: mx, y: 0, w: W - 2 * mx, size: tokens.type.h3, minSize: 14, maxLines: 3, color: slide.palette.muted, align, lineHeight: 1.45 }) : null;
    const blocks = [{ element: title }, ...(caption ? [{ element: caption, gap: 10 }] : [])];
    placeStack(blocks, (H - stack(blocks)) / 2);
    addFrontMotifs(ctx, slide, { footer: false });
    return slide;
  }
  addImage(ctx, slide, { image, x: 0, y: 0, w: W, h: H, bleed: true });
  addShape(slide, { id: 'scrim', x: 0, y: H * 0.3, w: W, h: H * 0.7, gradient: { from: { color: '#000000', alpha: 0 }, to: { color: '#000000', alpha: 0.66 }, stop: 0.7, angle: 90 } });
  const title = addText(ctx, slide, {
    id: 'title', role: 'heading', text: s.title, x: mx, y: 0, w: W - 2 * mx, size: tokens.type.title * 1.15, minSize: 26, maxLines: 2,
    lineHeight: tokens.lineHeight.heading, uppercase: tokens.uppercaseHeadings, tracking: tokens.tracking, balance: true, align, color: '#FFFFFF'
  });
  title.role = 'title';
  const caption = s.caption ? addText(ctx, slide, { id: 'caption', text: s.caption, x: mx, y: 0, w: W - 2 * mx, size: 14, maxLines: 2, color: '#FFFFFF', align, lineHeight: 1.4 }) : null;
  if (caption) caption.alpha = 0.88;
  const blocks = [{ element: title }, ...(caption ? [{ element: caption, gap: 10 }] : [])];
  placeStack(blocks, H - (mb + 8) - stack(blocks));
  addFrontMotifs(ctx, slide, { footer: false });
  return slide;
}

// ------------------------------------------------------------ two columns

function twoColumn(ctx, slide, s) {
  const { tokens } = ctx;
  begin(ctx, slide);
  const area = contentArea(ctx, slide, s);
  const gap = tokens.spacing.gap * 1.6;
  const columnW = (area.w - gap) / 2;
  s.columns.slice(0, 2).forEach((column, index) => {
    const x = area.x + index * (columnW + gap);
    const heading = addText(ctx, slide, { id: `col${index}-h`, role: 'heading', text: column.heading, x, y: area.y, w: columnW, size: tokens.type.h3, minSize: 14, maxLines: 2, weight: h3Weight(ctx), lineHeight: 1.3 });
    const ruleY = area.y + heading.h + 12;
    addLine(slide, { id: `col${index}-rule`, x1: x, y1: ruleY, x2: x + columnW, y2: ruleY, color: slide.palette.accent, width: 2, decorative: false });
    const top = ruleY + 16;
    addBody(ctx, slide, { id: `col${index}-body`, bullets: column.items.map((item) => ({ text: item, children: [] })), body: column.body, x, y: top, w: columnW, h: area.bottom - top });
  });
  addFrontMotifs(ctx, slide);
  return slide;
}

// ------------------------------------------------------------ cards

function cardFrame(ctx, slide, { id, x, y, w, h }) {
  const style = ctx.design.cards;
  const radius = ctx.design.radius;
  const palette = slide.palette;
  if (style === 'line') return addLine(slide, { id, x1: x, y1: y, x2: x + w, y2: y, color: palette.text, width: 2, decorative: false });
  const base = { id, x, y, w, h, shape: 'rounded', radius, decorative: false };
  if (style === 'outline') return addShape(slide, { ...base, line: { color: palette.line, width: 1 } });
  if (style === 'shadow') return addShape(slide, { ...base, fill: { color: palette.card }, shadow: true });
  if (style === 'glass') return addShape(slide, { ...base, fill: { color: palette.surface, alpha: 0.6 }, line: { color: palette.line, width: 1 } });
  return addShape(slide, { ...base, fill: { color: palette.surface } });
}

function addIcon(ctx, slide, { id, name, x, y }) {
  if (!name || ctx.design.icons === 'none') return 0;
  const palette = slide.palette;
  if (ctx.design.icons === 'badge') {
    addShape(slide, { id: `${id}-badge`, x, y, w: 52, h: 52, shape: 'rounded', radius: ctx.design.radius * 0.6 + 8, fill: { color: palette.soft }, decorative: false });
    slide.elements.push({ type: 'icon', id: `${slide.id}-${id}`, name, x: x + 13, y: y + 13, size: 26, color: palette.accentText, decorative: false });
    return 52 + 16;
  }
  slide.elements.push({ type: 'icon', id: `${slide.id}-${id}`, name, x, y, size: 30, color: palette.accent, decorative: false });
  return 30 + 16;
}

function cards(ctx, slide, s) {
  const { tokens } = ctx;
  begin(ctx, slide);
  const area = contentArea(ctx, slide, s);
  const count = s.cards.length;
  const gap = tokens.spacing.gap;
  const cardW = (area.w - gap * (count - 1)) / count;
  const lineStyle = ctx.design.cards === 'line';
  const padX = lineStyle ? 0 : 22;
  const padTop = lineStyle ? 18 : 24;
  const padBottom = lineStyle ? 0 : 24;
  const available = area.bottom - area.y;
  const contents = s.cards.map((card, index) => {
    const x = area.x + index * (cardW + gap) + padX;
    const innerW = cardW - padX * 2;
    const parts = [];
    let cursor = area.y + padTop;
    const iconHeight = addIcon(ctx, slide, { id: `card${index}-icon`, name: card.icon, x, y: cursor });
    cursor += iconHeight;
    if (card.label) {
      const label = addLabel(ctx, slide, { id: `card${index}-label`, text: card.label, x, y: cursor, maxWidth: innerW });
      cursor += label.height + 12;
    }
    const title = card.title ? addText(ctx, slide, { id: `card${index}-title`, role: 'heading', text: card.title, x, y: cursor, w: innerW, size: tokens.type.h3, minSize: 14, maxLines: 3, weight: h3Weight(ctx), lineHeight: 1.3 }) : null;
    if (title) cursor += title.h + 10;
    const body = card.body ? addText(ctx, slide, {
      id: `card${index}-body`, text: card.body, x, y: cursor, w: innerW, h: area.y + available - padBottom - cursor,
      size: tokens.type.body * 0.94, minSize: 12, color: slide.palette.muted, lineHeight: 1.55
    }) : null;
    if (body) cursor += body.h;
    parts.push(title, body);
    return { x: x - padX, bottom: cursor + padBottom };
  });
  const cardHeight = Math.min(available, Math.max(...contents.map((content) => content.bottom - area.y)));
  const frames = contents.map((content, index) => cardFrame(ctx, slide, { id: `card${index}`, x: content.x, y: area.y, w: cardW, h: cardHeight }));
  // Card backgrounds go underneath everything else on the slide.
  const firstContent = slide.elements.findIndex((element) => element.id.includes('-card0') || element.id.endsWith('-card0-icon'));
  frames.forEach((frame) => slide.elements.splice(slide.elements.indexOf(frame), 1));
  slide.elements.splice(Math.max(0, firstContent), 0, ...frames);
  addFrontMotifs(ctx, slide);
  return slide;
}

// ------------------------------------------------------------ big number

function bigNumber(ctx, slide, s) {
  const { tokens } = ctx;
  const gap = tokens.spacing.gap;
  begin(ctx, slide);
  let top = ctx.frame.y;
  if (s.kicker || s.title) top = addHeader(ctx, slide, { title: s.title, kicker: s.kicker });
  let area = { x: ctx.frame.x, y: top, w: ctx.frame.w, bottom: ctx.frame.bottom };
  area = addSource(ctx, slide, s, area);
  const valueFont = measureFont(ctx, 'heading', { size: tokens.type.hero, weight: ctx.design.headingWeight, tracking: -0.03 });
  const valueWidth = Math.min(460, ctx.measure(s.value, valueFont) / 0.9 + 4);
  const value = addText(ctx, slide, {
    id: 'value', role: 'heading', text: s.value, x: area.x, y: 0, w: valueWidth, size: tokens.type.hero, minSize: 48, maxLines: 1,
    lineHeight: 1, color: slide.palette.accentText, tracking: -0.03
  });
  const rightX = area.x + valueWidth + gap * 2;
  const rightW = area.w - valueWidth - gap * 2;
  const label = s.label ? addText(ctx, slide, { id: 'label', role: 'heading', text: s.label, x: rightX, y: 0, w: rightW, size: tokens.type.h2, minSize: 18, maxLines: 3, lineHeight: 1.3, balance: true }) : null;
  const change = s.change ? addText(ctx, slide, { id: 'change', role: 'label', text: trendText(s.change), x: rightX, y: 0, w: rightW, size: 15, maxLines: 1, weight: 600, color: slide.palette.accentText, lineHeight: 1.3 }) : null;
  const body = s.body ? addText(ctx, slide, { id: 'body', text: s.body, x: rightX, y: 0, w: rightW, h: area.bottom - area.y, size: tokens.type.body, minSize: 14, color: slide.palette.muted, lineHeight: tokens.lineHeight.body }) : null;
  const blocks = [label && { element: label }, change && { element: change, gap: 10 }, body && { element: body, gap: 14 }].filter(Boolean);
  const rightHeight = stack(blocks);
  const middle = area.y + (area.bottom - area.y) / 2;
  value.y = middle - value.h / 2;
  placeStack(blocks, middle - rightHeight / 2);
  addFrontMotifs(ctx, slide);
  return slide;
}

// ------------------------------------------------------------ stats

function stats(ctx, slide, s) {
  const { tokens } = ctx;
  const gap = tokens.spacing.gap;
  begin(ctx, slide);
  let area = contentArea(ctx, slide, s);
  area = addSource(ctx, slide, s, area);
  const count = s.stats.length;
  const columnW = (area.w - gap * (count - 1)) / count;
  // One value size for all columns, the largest at which every value fits.
  const valueFont = (size) => measureFont(ctx, 'heading', { size, weight: ctx.design.headingWeight, tracking: -0.02 });
  let size = tokens.type.display;
  while (size > 22 && s.stats.some((stat) => ctx.measure(stat.value, valueFont(size)) > columnW * 0.92)) size -= 1;
  const columns = s.stats.map((stat, index) => {
    const x = area.x + index * (columnW + gap);
    const rule = addShape(slide, { id: `stat${index}-rule`, x, y: 0, w: columnW, h: 3, fill: { color: slide.palette.accent }, decorative: false });
    const value = addText(ctx, slide, { id: `stat${index}-value`, role: 'heading', text: stat.value, x, y: 0, w: columnW, size, maxLines: 1, lineHeight: 1.05, tracking: -0.02 });
    const label = stat.label ? addText(ctx, slide, { id: `stat${index}-label`, text: stat.label, x, y: 0, w: columnW, size: tokens.type.body, minSize: 13, maxLines: 3, weight: 700, lineHeight: 1.35 }) : null;
    const change = stat.change ? addText(ctx, slide, { id: `stat${index}-change`, text: trendText(stat.change), x, y: 0, w: columnW, size: 13.5, maxLines: 1, color: slide.palette.muted, lineHeight: 1.3 }) : null;
    const note = stat.note ? addText(ctx, slide, { id: `stat${index}-note`, text: stat.note, x, y: 0, w: columnW, size: 13, maxLines: 3, color: slide.palette.muted, lineHeight: 1.4 }) : null;
    return [{ element: rule }, { element: value, gap: 18 }, label && { element: label, gap: 10 }, change && { element: change, gap: 6 }, note && { element: note, gap: 6 }].filter(Boolean);
  });
  const height = Math.max(...columns.map(stack));
  const top = area.y + Math.max(0, (area.bottom - area.y - height) / 2);
  columns.forEach((blocks) => placeStack(blocks, top));
  addFrontMotifs(ctx, slide);
  return slide;
}

// ------------------------------------------------------------ timeline

function timeline(ctx, slide, s) {
  const { tokens } = ctx;
  const gap = tokens.spacing.gap;
  begin(ctx, slide);
  const area = contentArea(ctx, slide, s);
  const count = s.steps.length;
  const stepW = (area.w - gap * (count - 1)) / count;
  const columns = s.steps.map((step, index) => {
    const x = area.x + index * (stepW + gap);
    const label = step.label ? addText(ctx, slide, { id: `step${index}-label`, role: 'label', text: step.label, x, y: 0, w: stepW, size: 13.5, maxLines: 2, weight: 700, tracking: 0.06, color: slide.palette.accentText, lineHeight: 1.3 }) : null;
    const title = step.title ? addText(ctx, slide, { id: `step${index}-title`, role: 'heading', text: step.title, x, y: 0, w: stepW, size: tokens.type.h3, minSize: 13, maxLines: 3, weight: h3Weight(ctx), lineHeight: 1.3 }) : null;
    const body = step.body ? addText(ctx, slide, { id: `step${index}-body`, text: step.body, x, y: 0, w: stepW, h: 200, size: tokens.type.body * 0.94, minSize: 12, color: slide.palette.muted, lineHeight: tokens.lineHeight.body }) : null;
    return { x, blocks: [label && { element: label, gap: 0 }, title && { element: title, gap: 6 }, body && { element: body, gap: 8 }].filter(Boolean) };
  });
  const contentHeight = Math.max(...columns.map((column) => stack(column.blocks)));
  const top = area.y + Math.max(0, (area.bottom - area.y - contentHeight - 38) / 2);
  addLine(slide, { id: 'track', x1: area.x, y1: top + 8, x2: area.x + area.w, y2: top + 8, color: slide.palette.line, width: 2, decorative: false });
  columns.forEach((column, index) => {
    const square = ctx.design.bullets === 'square';
    addShape(slide, { id: `step${index}-halo`, shape: square ? 'rect' : 'ellipse', x: column.x - 4, y: top - 4, w: 24, h: 24, fill: { color: slide.palette.background }, decorative: false });
    addShape(slide, { id: `step${index}-dot`, shape: square ? 'rect' : 'ellipse', x: column.x, y: top, w: 16, h: 16, fill: { color: slide.palette.accent }, decorative: false });
    if (step(s, index).icon) addIconNextToDot(ctx, slide, column, index, s, top);
    placeStack(column.blocks, top + 38);
  });
  addFrontMotifs(ctx, slide);
  return slide;
}

const step = (s, index) => s.steps[index] || {};
function addIconNextToDot(ctx, slide, column, index, s, top) {
  if (ctx.design.icons === 'none') return;
  slide.elements.push({ type: 'icon', id: `${slide.id}-step${index}-icon`, name: s.steps[index].icon, x: column.x + 26, y: top - 4, size: 22, color: slide.palette.accentText, decorative: false });
}

// ------------------------------------------------------------ comparison

function comparison(ctx, slide, s) {
  const { tokens, design } = ctx;
  const gap = tokens.spacing.gap;
  begin(ctx, slide);
  const area = contentArea(ctx, slide, s);
  const count = s.columns.length;
  const columnW = (area.w - gap * (count - 1)) / count;
  const size = tokens.type.body;
  const columns = s.columns.map((column, index) => {
    const x = area.x + index * (columnW + gap);
    const highlight = column.highlight;
    const heading = addText(ctx, slide, {
      id: `cmp${index}-h`, role: 'heading', text: column.heading, x: x + 22, y: area.y + 14, w: columnW - 44, size: tokens.type.h3, minSize: 14, maxLines: 2,
      weight: h3Weight(ctx), lineHeight: 1.3, color: highlight ? slide.palette.onFill : slide.palette.text
    });
    const headH = heading.h + 28;
    let cursor = area.y + headH;
    const rows = [];
    column.items.forEach((item, row) => {
      const text = addText(ctx, slide, { id: `cmp${index}-r${row}`, text: item, x: x + 22, y: cursor + 12, w: columnW - 44, size, minSize: 13, maxLines: 3, lineHeight: 1.4 });
      rows.push({ y: cursor });
      cursor += text.h + 24;
    });
    if (!column.items.length && column.body) {
      const text = addText(ctx, slide, { id: `cmp${index}-body`, text: column.body, x: x + 22, y: cursor + 12, w: columnW - 44, size, minSize: 13, lineHeight: 1.45 });
      rows.push({ y: cursor });
      cursor += text.h + 24;
    }
    return { x, highlight, headH, rows, bottom: cursor };
  });
  const height = Math.min(area.bottom - area.y, Math.max(...columns.map((column) => column.bottom - area.y)));
  const frames = [];
  columns.forEach((column, index) => {
    const palette = slide.palette;
    frames.push(addShape(slide, { id: `cmp${index}-head`, x: column.x, y: area.y, w: columnW, h: column.headH, shape: 'rounded', radius: [design.radius, design.radius, 0, 0], fill: { color: column.highlight ? palette.fill : palette.surface }, decorative: false }));
    column.rows.forEach((row, rowIndex) => frames.push(addLine(slide, { id: `cmp${index}-line${rowIndex}`, x1: column.x, y1: row.y, x2: column.x + columnW, y2: row.y, color: palette.line, width: 1, decorative: false })));
    frames.push(addShape(slide, { id: `cmp${index}-box`, x: column.x, y: area.y, w: columnW, h: height, shape: 'rounded', radius: design.radius, line: { color: column.highlight ? palette.accent : palette.line, width: column.highlight ? 2 : 1 }, decorative: false }));
  });
  frames.forEach((frame) => slide.elements.splice(slide.elements.indexOf(frame), 1));
  const firstText = slide.elements.findIndex((element) => element.id.endsWith('-cmp0-h'));
  slide.elements.splice(Math.max(0, firstText), 0, ...frames);
  addFrontMotifs(ctx, slide);
  return slide;
}

// ------------------------------------------------------------ quote

function quote(ctx, slide, s) {
  const { tokens, design } = ctx;
  const { marginX: mx } = tokens.spacing;
  const portrait = showsImage(ctx, s.image, { rich: true }) ? s.image : null;
  begin(ctx, slide);
  const centered = design.align === 'center' && !portrait;
  let textX = ctx.frame.x;
  let textW = Math.min(780, ctx.frame.w);
  if (portrait) {
    const bleed = design.imageShape === 'bleed';
    const frame = bleed ? { x: 0, y: 0, w: 250, h: H } : { x: mx, y: H / 2 - 125, w: 220, h: 250 };
    addImage(ctx, slide, { image: portrait, ...frame, bleed, allowCircle: true });
    textX = (bleed ? 250 : mx) + (bleed ? mx : 300);
    textW = W - textX - mx;
  } else if (centered) {
    textX = (W - textW) / 2;
  }
  const align = centered ? 'center' : 'left';
  const [open] = quoteMarks(ctx.language);
  // Corner brackets fill the whole em box, unlike the small raised Latin
  // quote marks, so they are set much smaller to keep clear of the quote.
  const bracket = /^[\u300C\u300E]/.test(open);
  // Guillemets sit at x-height, so they are set smaller than raised quotes.
  const guillemet = open === '«';
  const markSize = bracket ? 56 : guillemet ? 80 : 130;
  const mark = addText(ctx, slide, { id: 'mark', role: 'heading', text: open, x: textX, y: 0, w: centered ? textW : 120, size: markSize, maxLines: 1, lineHeight: 1, color: slide.palette.accent, align });
  // Full-width brackets draw in the right half of their em box; pull the
  // mark back so its ink lines up with the quote.
  if (bracket && align === 'left') mark.x -= markSize * 0.5;
  mark.serifMark = !bracket;
  mark.decorative = true;
  mark.h = bracket ? 56 : guillemet ? 60 : 64;
  const text = addText(ctx, slide, {
    id: 'quote', role: 'heading', text: s.quote, x: textX, y: 0, w: textW, h: ctx.frame.bottom - ctx.frame.y - 64 - (s.attribution || s.role ? 26 + 14 * 1.4 * 2 : 0), size: tokens.type.h2 * 1.1, minSize: 20, maxLines: 5,
    lineHeight: 1.5, tracking: tokens.tracking, balance: true, align
  });
  const attribution = [s.attribution, s.role].filter(Boolean);
  const blocks = [{ element: mark }, { element: text, gap: 0 }];
  let attributionElement = null;
  let dash = null;
  if (attribution.length) {
    const indent = centered ? 0 : 44;
    attributionElement = addText(ctx, slide, {
      id: 'attribution', paragraphs: [{ runs: [{ text: applyTypography(s.attribution || '', ctx.language), strong: true }, ...(s.role ? [{ text: `${separator(ctx)}${applyTypography(s.role, ctx.language)}` }] : [])] }],
      x: textX + indent, y: 0, w: textW - indent, size: 14, maxLines: 2, color: slide.palette.muted, align, lineHeight: 1.4
    });
    // The name is bold, not emphasis: no accent colour or highlighter.
    attributionElement.strongColor = slide.palette.text;
    attributionElement.mark = null;
    if (!centered) dash = addLine(slide, { id: 'dash', x1: textX, y1: 0, x2: textX + 32, y2: 0, color: slide.palette.accent, width: 1.5, decorative: false });
    blocks.push({ element: attributionElement, gap: 26 });
  }
  const top = ctx.frame.y + Math.max(0, (ctx.frame.bottom - ctx.frame.y - stack(blocks)) / 2);
  placeStack(blocks, top);
  if (dash) {
    dash.y1 = attributionElement.y + 14 * 1.4 / 2;
    dash.y2 = dash.y1;
  }
  addFrontMotifs(ctx, slide);
  return slide;
}

// ------------------------------------------------------------ gallery

function gallery(ctx, slide, s) {
  const { tokens } = ctx;
  const gap = tokens.spacing.gap;
  begin(ctx, slide);
  const area = contentArea(ctx, slide, s);
  const shown = s.images.filter((entry) => showsImage(ctx, entry.image) || entry.image.kind === 'placeholder');
  const count = Math.max(1, shown.length);
  const itemW = (area.w - gap * (count - 1)) / count;
  const hasCaptions = shown.some((entry) => entry.caption);
  const captionHeight = hasCaptions ? 10 + 13.5 * 1.4 * 2 : 0;
  shown.forEach((entry, index) => {
    const x = area.x + index * (itemW + gap);
    addImage(ctx, slide, { id: `image${index}`, image: entry.image, x, y: area.y, w: itemW, h: area.bottom - area.y - captionHeight });
    if (entry.caption) addText(ctx, slide, { id: `caption${index}`, text: entry.caption, x, y: area.bottom - captionHeight + 10, w: itemW, size: 13.5, minSize: 11, maxLines: 2, color: slide.palette.muted, lineHeight: 1.4 });
  });
  addFrontMotifs(ctx, slide);
  return slide;
}

// ------------------------------------------------------------ table

function table(ctx, slide, s) {
  const { tokens, design } = ctx;
  begin(ctx, slide);
  let area = contentArea(ctx, slide, s);
  area = addSource(ctx, slide, s, area);
  const data = s.table;
  const size = Math.max(12, tokens.type.body * 0.94);
  const font = measureFont(ctx, 'body', { size, weight: 400 });
  const boldFont = { ...font, weight: 700 };
  const padX = 16;
  // Column widths follow content, within the table width.
  const natural = data.columns.map((column, index) => Math.max(
    ctx.measure(column, boldFont),
    ...data.rows.map((row) => ctx.measure(row[index] || '', font))
  ) + padX * 2);
  const minimum = data.columns.map(() => 60);
  const total = natural.reduce((sum, width) => sum + width, 0);
  let widths = total <= area.w
    ? natural.map((width) => width + (area.w - total) / natural.length)
    : natural.map((width, index) => Math.max(minimum[index], (width / total) * area.w));
  const scale = area.w / widths.reduce((sum, width) => sum + width, 0);
  widths = widths.map((width) => width * scale);
  const headerFill = design.cards === 'flat' || design.cards === 'shadow';
  const element = {
    type: 'table',
    id: `${slide.id}-table`,
    x: area.x,
    y: area.y,
    w: area.w,
    columns: data.columns,
    rows: data.rows,
    align: data.align,
    widths,
    highlightRow: data.highlightRow,
    font: { role: 'body', size },
    padding: { x: padX, y: 11 },
    colors: {
      text: slide.palette.text,
      header: headerFill ? slide.palette.onFill : slide.palette.text,
      headerFill: headerFill ? slide.palette.fill : null,
      headerRule: headerFill ? null : slide.palette.text,
      rule: slide.palette.line,
      highlight: slide.palette.soft
    },
    language: ctx.language,
    decorative: false
  };
  // Row heights from wrapped cell text.
  const rowHeight = (cells, cellFont) => Math.max(...cells.map((cell, index) => {
    const fitted = buildText(ctx, slide, { id: 'cell', text: cell, x: 0, y: 0, w: widths[index] - padX * 2, size, maxLines: 6, weight: cellFont.weight, lineHeight: 1.35 });
    return fitted.h;
  })) + 22;
  element.rowHeights = [rowHeight(data.columns, boldFont), ...data.rows.map((row) => rowHeight(row, font))];
  element.h = element.rowHeights.reduce((sum, height) => sum + height, 0);
  if (element.y + element.h > area.bottom) element.fit = { overflow: true, shrinkRatio: 1 };
  slide.elements.push(element);
  addFrontMotifs(ctx, slide);
  return slide;
}

// ------------------------------------------------------------ chart

function chart(ctx, slide, s) {
  const { tokens } = ctx;
  begin(ctx, slide);
  let area = contentArea(ctx, slide, s);
  area = addSource(ctx, slide, s, area);
  const gap = tokens.spacing.gap * 1.5;
  const chartW = s.takeaway ? (area.w - gap) * 7 / 11 : area.w;
  slide.elements.push({
    type: 'chart',
    id: `${slide.id}-chart`,
    x: area.x,
    y: area.y,
    w: chartW,
    h: area.bottom - area.y,
    chart: s.chart,
    style: ctx.design.chart,
    radius: ctx.design.radius,
    colors: { series: slide.palette.series, text: slide.palette.text, muted: slide.palette.muted, line: slide.palette.line, background: slide.palette.background },
    font: { role: 'body', size: 12 },
    language: ctx.language,
    decorative: false
  });
  if (s.takeaway) {
    const takeaway = addText(ctx, slide, {
      id: 'takeaway', role: 'heading', text: s.takeaway, x: area.x + chartW + gap, y: 0, w: area.w - chartW - gap, h: area.bottom - area.y,
      size: tokens.type.h3, minSize: 14, weight: h3Weight(ctx), lineHeight: 1.45, balance: true
    });
    takeaway.y = area.y + Math.max(0, (area.bottom - area.y - takeaway.h) / 2);
  }
  addFrontMotifs(ctx, slide);
  return slide;
}

// ------------------------------------------------------------ closing

function closing(ctx, slide, s) {
  const { tokens, design } = ctx;
  begin(ctx, slide, { big: true });
  const centered = design.align === 'center';
  const align = centered ? 'center' : 'left';
  const width = Math.min(760, ctx.frame.w);
  const x = centered ? (W - width) / 2 : ctx.frame.x;
  const title = addText(ctx, slide, {
    id: 'title', role: 'heading', text: s.title, x, y: 0, w: width, h: (ctx.frame.bottom - ctx.frame.y) * 0.45, size: tokens.type.cover * 0.85, minSize: 30, maxLines: 2,
    lineHeight: tokens.lineHeight.heading, uppercase: tokens.uppercaseHeadings, tracking: tokens.tracking, balance: true, align
  });
  title.role = 'title';
  const blocks = [{ element: title }];
  if (s.subtitle) blocks.push({ element: addText(ctx, slide, { id: 'subtitle', text: s.subtitle, x, y: 0, w: width, size: tokens.type.h3, minSize: 14, maxLines: 3, color: slide.palette.muted, lineHeight: 1.45, align, balance: true }), gap: 16 });
  const contact = s.contact ? buildText(ctx, slide, { id: 'contact', text: s.contact, x, y: 0, w: width, size: 14, maxLines: 2, color: slide.palette.muted, align, lineHeight: 1.4 }) : null;
  const itemWidth = centered ? Math.min(width, 620) : width;
  const itemX = centered ? (W - itemWidth) / 2 : x;
  // The next steps shrink together until the whole block fits the frame.
  const available = ctx.frame.bottom - ctx.frame.y - stack(blocks) - (contact ? contact.h + 34 : 0);
  let size = tokens.type.h3;
  let items = [];
  for (; ; size -= 1) {
    const numberWidth = listNumberWidth(ctx, size);
    items = (s.bullets || []).map((item, index) => buildText(ctx, slide, { id: `next${index}`, text: item.text, x: itemX + numberWidth + 18, y: 0, w: itemWidth - numberWidth - 18, size, minSize: size, maxLines: 2, lineHeight: 1.35 }));
    const height = items.reduce((sum, item, index) => sum + item.h + (index ? 14 : 28), 0);
    if (height <= available || size <= 14) break;
  }
  items.forEach((text, index) => {
    slide.elements.push(text);
    const before = slide.elements.length;
    addListNumber(ctx, slide, { id: `next${index}-num`, value: index + 1, x: itemX, y: 0, size });
    blocks.push({ element: text, gap: index ? 14 : 28, companions: slide.elements.slice(before) });
  });
  if (contact) {
    slide.elements.push(contact);
    blocks.push({ element: contact, gap: 34 });
  }
  placeStack(blocks, ctx.frame.y + Math.max(0, (ctx.frame.bottom - ctx.frame.y - stack(blocks)) / 2));
  addFrontMotifs(ctx, slide);
  return slide;
}

export const LAYOUT_RENDERERS = Object.freeze({
  cover, agenda, section, bullets, split, image: imageLayout, twoColumn, cards, bigNumber, stats, timeline, comparison, quote, gallery, table, chart, closing
});

export { trendText };
