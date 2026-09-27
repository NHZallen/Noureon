// Slide preview: draws the layout a .pptx Blob was written from (attached by
// pptx-file.js) as SVG, element by element, with the same fonts, positions
// and line breaks. Text baselines follow PowerPoint's rule for exact line
// spacing: the first baseline sits at 75% of the line step below the top.
// Everything is built with DOM methods; no markup from the file is parsed.

import { cssFontStack, FONT_SETS, MONO_FAMILY } from '../design/fonts.js';
import { ICON_STROKE, iconSegments } from '../design/icons.js';
import { SLIDE_HEIGHT, SLIDE_WIDTH } from '../design/design-tokens.js';
import { breakRichLines } from '../design/rich-text.js';
import { segmentsToPathData, shapeSegments } from '../design/svg-path.js';
import { createCanvasMeasurer, createEstimatingMeasurer } from '../design/text-layout.js';
import { drawNativeChart } from './slide-chart-preview.js';

const SVG = 'http://www.w3.org/2000/svg';
const BASELINE = 0.75;
const ROLE_NAMES = Object.freeze({ heading: 'heading', title: 'heading', body: 'body', label: 'label', mono: 'label' });
// The bullet characters and sizes the file writes (pptx-text.js).
const BULLETS = Object.freeze({ dot: ['●', 0.6], square: ['■', 0.55], dash: ['—', 1], arrow: ['→', 1], sub: ['–', 1] });

function create(document, name, attributes = {}, parent = null) {
  const node = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) {
    if (value !== undefined && value !== null && value !== false) node.setAttribute(key, String(value));
  }
  if (parent) parent.appendChild(node);
  return node;
}

let uniqueId = 0;
const nextId = (prefix) => `${prefix}-${(uniqueId += 1)}`;

// ------------------------------------------------------------ text

function familyFor(context, role) {
  const { layout, fontAlias } = context;
  const roleName = ROLE_NAMES[role] || 'body';
  const set = FONT_SETS[layout.design.fonts] || FONT_SETS.modern;
  const stack = cssFontStack(layout.tokens.fonts[roleName], set, roleName, { alias: fontAlias });
  return role === 'mono' ? `"${fontAlias(MONO_FAMILY)}", ${stack}` : stack;
}

function drawText(document, parent, element, context) {
  const font = element.font;
  const drawnHeight = element.paragraphs.reduce((bottom, paragraph) => Math.max(bottom, paragraph.top + paragraph.lines.length * paragraph.lineStep), 0);
  const offset = element.valign === 'middle' ? (element.h - drawnHeight) / 2 : element.valign === 'bottom' ? element.h - drawnHeight : 0;
  const group = create(document, 'g', { 'data-element': element.id, opacity: element.alpha < 1 ? element.alpha : null }, parent);
  for (const paragraph of element.paragraphs) {
    const size = paragraph.size || font.size;
    const align = paragraph.align || element.align;
    const left = element.x + (paragraph.indent || 0);
    const width = element.w - (paragraph.indent || 0);
    const hanging = paragraph.hangingEm ? paragraph.hangingEm * size : paragraph.indent || 0;
    const tracking = font.tracking ? font.tracking * size : 0;
    const runFont = (run) => ({
      size,
      weight: run.strong ? font.strongWeight : paragraph.weight ?? font.weight,
      family: familyFor(context, run.role || font.role),
      tracking: font.tracking,
      uppercase: font.uppercase
    });
    paragraph.lines.forEach((line, lineIndex) => {
      const baseline = element.y + offset + paragraph.top + lineIndex * paragraph.lineStep + paragraph.lineStep * BASELINE;
      if (lineIndex === 0 && paragraph.bullet) drawBullet(document, group, paragraph, { x: left - hanging, baseline, size, color: paragraph.bullet.color || element.color, context });
      const widths = line.runs.map((run) => context.measure(run.text, runFont(run)));
      const lineWidth = widths.reduce((sum, value) => sum + value, 0);
      const start = align === 'center' ? left + (width - lineWidth) / 2 : align === 'right' ? left + width - lineWidth : left;
      // Highlighter marks behind strong runs, as tall as the text line.
      if (element.mark) {
        let cursor = start;
        line.runs.forEach((run, index) => {
          if (run.strong) create(document, 'rect', { x: cursor, y: baseline - size * 0.9, width: widths[index], height: size * 1.16, fill: element.mark }, group);
          cursor += widths[index];
        });
      }
      const text = create(document, 'text', { x: start, y: baseline, 'font-size': size, 'letter-spacing': tracking || null, style: 'white-space:pre' }, group);
      for (const run of line.runs) {
        const face = runFont(run);
        const color = run.color || (run.strong && element.strongColor) || paragraph.color || element.color;
        const span = create(document, 'tspan', {
          'font-family': face.family,
          'font-weight': face.weight,
          fill: run.outline ? 'none' : color,
          stroke: run.outline ? run.outline.color : null,
          'stroke-width': run.outline ? run.outline.width : null
        }, text);
        span.textContent = font.uppercase ? run.text.toUpperCase() : run.text;
      }
    });
  }
}

function drawBullet(document, parent, paragraph, { x, baseline, size, color, context }) {
  const { style } = paragraph.bullet;
  if (style === 'number') {
    const text = create(document, 'text', { x, y: baseline, 'font-size': size, 'font-family': familyFor(context, paragraph.bullet.role || 'label'), 'font-weight': 700, fill: color }, parent);
    text.textContent = paragraph.bullet.text;
    return;
  }
  const [character, scale] = BULLETS[style] || BULLETS.dot;
  // PowerPoint centres a scaled bullet on the text's x-height.
  const shift = (1 - scale) * size * 0.32;
  const text = create(document, 'text', { x, y: baseline - shift, 'font-size': size * scale, 'font-family': 'Arial, sans-serif', fill: color }, parent);
  text.textContent = character;
}

// ------------------------------------------------------------ shapes

/** A shape outline node; `transform` in attributes is applied around it. */
function shapeNode(document, element, attributes, parent) {
  const uniform = !Array.isArray(element.radius);
  if (element.shape === 'rect' || !element.shape || (element.shape === 'rounded' && uniform)) {
    const radius = element.shape === 'rounded' ? Math.min(element.radius || 0, element.w / 2, element.h / 2) : 0;
    return create(document, 'rect', { x: element.x, y: element.y, width: element.w, height: element.h, rx: radius || null, ...attributes }, parent);
  }
  if (element.shape === 'ellipse') {
    return create(document, 'ellipse', { cx: element.x + element.w / 2, cy: element.y + element.h / 2, rx: element.w / 2, ry: element.h / 2, ...attributes }, parent);
  }
  const translate = `translate(${element.x} ${element.y})`;
  return create(document, 'path', {
    d: segmentsToPathData(shapeSegments(element)),
    ...attributes,
    transform: attributes.transform ? `${attributes.transform} ${translate}` : translate
  }, parent);
}

function drawShape(document, parent, defs, element) {
  const attributes = { fill: 'none' };
  if (element.fill) {
    attributes.fill = element.fill.color;
    if (element.fill.alpha < 1) attributes['fill-opacity'] = element.fill.alpha;
  }
  if (element.gradient) {
    const id = nextId('ac-slide-gradient');
    const angle = ((element.gradient.angle ?? 90) * Math.PI) / 180;
    const dx = Math.cos(angle) / 2;
    const dy = Math.sin(angle) / 2;
    const gradient = create(document, 'linearGradient', { id, x1: 0.5 - dx, y1: 0.5 - dy, x2: 0.5 + dx, y2: 0.5 + dy }, defs);
    const stop = (offset, value) => create(document, 'stop', { offset, 'stop-color': value.color, 'stop-opacity': value.alpha ?? 1 }, gradient);
    stop(0, element.gradient.from);
    stop(element.gradient.stop ?? 1, element.gradient.to);
    stop(1, element.gradient.to);
    attributes.fill = `url(#${id})`;
  }
  if (element.line) {
    attributes.stroke = element.line.color;
    attributes['stroke-width'] = element.line.width;
    if (element.line.alpha < 1) attributes['stroke-opacity'] = element.line.alpha;
    if (element.line.dash) attributes['stroke-dasharray'] = '5 4';
  }
  if (element.shadow) {
    // The writer's outer shadow: 18pt blur, 6pt down, 18% black.
    const id = nextId('ac-slide-shadow');
    const filter = create(document, 'filter', { id, x: '-20%', y: '-20%', width: '140%', height: '150%' }, defs);
    create(document, 'feDropShadow', { dx: 0, dy: 6, stdDeviation: 9, 'flood-color': '#000000', 'flood-opacity': 0.18 }, filter);
    attributes.filter = `url(#${id})`;
  }
  if (element.rotate) attributes.transform = `rotate(${element.rotate} ${element.x + element.w / 2} ${element.y + element.h / 2})`;
  shapeNode(document, element, attributes, parent);
}

function drawGlow(document, parent, defs, element) {
  // The file's circle-path gradient runs to the box corners; an SVG radial
  // gradient runs to the ellipse edge, so its stops are the file's × √2.
  const id = nextId('ac-slide-glow');
  const gradient = create(document, 'radialGradient', { id }, defs);
  [[0, 1], [0.22, 0.72], [0.42, 0.38], [0.58, 0.12], [0.7, 0]].forEach(([position, share]) => {
    create(document, 'stop', { offset: Math.min(1, position * Math.SQRT2), 'stop-color': element.color, 'stop-opacity': (element.alpha ?? 0.6) * share }, gradient);
  });
  create(document, 'ellipse', { cx: element.x + element.w / 2, cy: element.y + element.h / 2, rx: element.w / 2, ry: element.h / 2, fill: `url(#${id})` }, parent);
}

function drawLine(document, parent, element) {
  create(document, 'line', {
    x1: element.x1, y1: element.y1, x2: element.x2, y2: element.y2, stroke: element.color, 'stroke-width': element.width,
    'stroke-opacity': element.alpha < 1 ? element.alpha : null, 'stroke-dasharray': element.dash ? '5 4' : null
  }, parent);
}

function drawIcon(document, parent, element) {
  create(document, 'path', {
    d: segmentsToPathData(iconSegments(element.name)),
    transform: `translate(${element.x} ${element.y}) scale(${element.size / 24})`,
    fill: 'none', stroke: element.color, 'stroke-width': ICON_STROKE, 'stroke-linecap': 'round', 'stroke-linejoin': 'round'
  }, parent);
}

// ------------------------------------------------------------ images

const FOCUS = Object.freeze({ top: 'xMidYMin', bottom: 'xMidYMax', left: 'xMinYMid', right: 'xMaxYMid', center: 'xMidYMid' });

function drawImage(document, parent, defs, element, context) {
  const clip = nextId('ac-slide-clip');
  shapeNode(document, element, {}, create(document, 'clipPath', { id: clip }, defs));
  const group = create(document, 'g', { 'clip-path': `url(#${clip})`, 'data-element': element.id }, parent);
  const data = element.resolved?.data;
  if (data) {
    create(document, 'image', {
      href: data, x: element.x, y: element.y, width: element.w, height: element.h,
      preserveAspectRatio: `${FOCUS[element.focus] || 'xMidYMid'} ${element.fit === 'contain' ? 'meet' : 'slice'}`
    }, group);
    return;
  }
  // The replaceable placeholder picture (placeholderSvg in pptx-file.js).
  const colors = element.palette;
  create(document, 'rect', { x: element.x, y: element.y, width: element.w, height: element.h, fill: colors.fill }, group);
  shapeNode(document, { ...element, x: element.x + 1.5, y: element.y + 1.5, w: element.w - 3, h: element.h - 3, shape: element.shape === 'rect' ? 'rounded' : element.shape }, {
    fill: 'none', stroke: colors.line, 'stroke-width': 1.5, 'stroke-dasharray': '5 4'
  }, group);
  const iconSize = Math.min(38, Math.min(element.w, element.h) * 0.16);
  if (iconSize >= 12) {
    create(document, 'path', {
      d: segmentsToPathData(iconSegments('photo')),
      transform: `translate(${element.x + element.w / 2 - iconSize / 2} ${element.y + element.h / 2 - iconSize}) scale(${iconSize / 24})`,
      fill: 'none', stroke: colors.text, 'stroke-width': 1.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round'
    }, group);
  }
  if (element.placeholderText) {
    const text = create(document, 'text', {
      x: element.x + element.w / 2, y: element.y + element.h / 2 + 18, 'text-anchor': 'middle', 'font-size': 13,
      'font-family': 'Segoe UI, Microsoft JhengHei, PingFang TC, Noto Sans TC, sans-serif', fill: colors.text
    }, group);
    text.textContent = element.placeholderText.slice(0, 80);
  }
}

// ------------------------------------------------------------ tables

function drawTable(document, parent, element, context) {
  const family = familyFor(context, 'body');
  const { colors, padding } = element;
  const size = element.font.size;
  const lineStep = size * 1.35;
  const group = create(document, 'g', { 'data-element': element.id }, parent);
  let y = element.y;
  [element.columns, ...element.rows].forEach((row, rowIndex) => {
    const height = element.rowHeights[rowIndex];
    const header = rowIndex === 0;
    const highlight = !header && element.highlightRow === rowIndex;
    if (header && colors.headerFill) create(document, 'rect', { x: element.x, y, width: element.w, height, fill: colors.headerFill }, group);
    if (highlight) create(document, 'rect', { x: element.x, y, width: element.w, height, fill: colors.highlight }, group);
    let x = element.x;
    row.forEach((cell, columnIndex) => {
      const width = element.widths[columnIndex];
      const weight = header || highlight ? 700 : 400;
      const cellFont = { size, weight, family };
      const lines = breakRichLines([{ text: String(cell ?? '') }], { maxWidth: width - padding.x * 2, fontOf: () => cellFont, measure: context.measure, language: element.language });
      const align = element.align?.[columnIndex] || 'left';
      const top = y + (height - lines.length * lineStep) / 2;
      const anchorX = align === 'right' ? x + width - padding.x : align === 'center' ? x + width / 2 : x + padding.x;
      lines.forEach((line, lineIndex) => {
        const text = create(document, 'text', {
          x: anchorX, y: top + lineIndex * lineStep + lineStep * BASELINE, 'font-size': size, 'font-family': family, 'font-weight': weight,
          fill: header ? colors.header : colors.text, 'text-anchor': { right: 'end', center: 'middle' }[align] || 'start', style: 'white-space:pre'
        }, group);
        text.textContent = line.runs.map((run) => run.text).join('');
      });
      x += width;
    });
    y += height;
    const rule = header ? colors.headerRule : colors.rule;
    if (rule) create(document, 'line', { x1: element.x, y1: y, x2: element.x + element.w, y2: y, stroke: rule, 'stroke-width': header ? 2 : 1 }, group);
  });
}

// ------------------------------------------------------------ charts

function drawChart(document, parent, element, context) {
  const image = element.image;
  if (image?.data) {
    // Types PowerPoint has no chart for: the same picture the file carries.
    const pixels = image.pixels || { width: element.w, height: element.h };
    const ratio = pixels.width / pixels.height;
    const w = Math.min(element.w, element.h * ratio);
    create(document, 'image', { href: image.data, x: element.x, y: element.y + (element.h - w / ratio) / 2, width: w, height: w / ratio }, parent);
    return;
  }
  if (drawNativeChart(document, parent, element, context)) return;
  const text = create(document, 'text', {
    x: element.x + element.w / 2, y: element.y + element.h / 2, 'text-anchor': 'middle', 'font-size': 14,
    'font-family': familyFor(context, 'body'), fill: element.colors.muted
  }, parent);
  text.textContent = element.chart.title || element.chart.type;
}

// ------------------------------------------------------------ slides

/** Builds one slide's SVG. */
export function renderSlideSvg(document, slide, context) {
  const svg = create(document, 'svg', { viewBox: `0 0 ${SLIDE_WIDTH} ${SLIDE_HEIGHT}`, class: 'ac-slide-svg', role: 'img', 'aria-label': String(slide.number) });
  const defs = create(document, 'defs', {}, svg);
  create(document, 'rect', { width: SLIDE_WIDTH, height: SLIDE_HEIGHT, fill: slide.background }, svg);
  for (const element of slide.elements) {
    switch (element.type) {
      case 'text': drawText(document, svg, element, context); break;
      case 'shape': drawShape(document, svg, defs, element); break;
      case 'glow': drawGlow(document, svg, defs, element); break;
      case 'line': drawLine(document, svg, element); break;
      case 'icon': drawIcon(document, svg, element); break;
      case 'image': drawImage(document, svg, defs, element, context); break;
      case 'chart': drawChart(document, svg, element, context); break;
      case 'table': drawTable(document, svg, element, context); break;
      default: break;
    }
  }
  return svg;
}

/**
 * Page renderer for the file preview dialog: every slide of the presentation
 * a Blob came from, in order. Returns { pageCount, dispose }.
 */
export async function renderPptxPreview(blob, container, { document = globalThis.document } = {}) {
  const presentation = blob?.presentation;
  if (!presentation?.layout) throw new Error('slide layout unavailable');
  const { layout, fontAlias = (family) => family } = presentation;
  const context2d = document.createElement('canvas').getContext?.('2d');
  const context = { layout, fontAlias, measure: context2d ? createCanvasMeasurer(context2d) : createEstimatingMeasurer() };
  const list = document.createElement('div');
  list.className = 'ac-slide-preview';
  for (const slide of layout.slides) {
    const figure = document.createElement('figure');
    figure.className = 'ac-slide-frame';
    figure.appendChild(renderSlideSvg(document, slide, context));
    const caption = document.createElement('figcaption');
    caption.className = 'ac-slide-caption';
    caption.textContent = String(slide.number);
    figure.appendChild(caption);
    list.appendChild(figure);
  }
  container.replaceChildren(list);
  return { pageCount: layout.slides.length, dispose: () => list.remove() };
}
