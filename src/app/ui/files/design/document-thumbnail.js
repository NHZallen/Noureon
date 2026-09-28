// Thumbnails of the Word templates for the Design picker: the first page of
// a sample document as SVG, drawn from the same theme the generator uses
// (fonts, colours, cover, heading and table treatment). Body text is drawn
// as lines, the way Word's own template gallery shows it at this size.

import { buildDocumentTheme } from './document-design.js';
import { FONT_FAMILIES } from './fonts.js';

const SVG = 'http://www.w3.org/2000/svg';
const WIDTH = 210;
const HEIGHT = 297;
const MARGINS = Object.freeze({ narrow: 18, normal: 24, wide: 30 });
const CJK = /[⺀-鿿가-힯豈-﫿＀-￯]/;

function create(document, name, attributes = {}, parent = null) {
  const node = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) {
    if (value !== undefined && value !== null && value !== false) node.setAttribute(key, String(value));
  }
  if (parent) parent.appendChild(node);
  return node;
}

const color = (hex) => `#${String(hex || '000000').replace('#', '')}`;

// Rough advance widths, enough to wrap a sample title.
const advance = (char, upper) => (CJK.test(char) ? 1 : char === ' ' ? 0.28 : upper ? 0.68 : 0.54);

function wrap(text, size, width, { upper = false, tracking = 0 } = {}) {
  const words = CJK.test(text) ? [...text] : String(text).split(/(?<= )/);
  const lines = [];
  let line = '';
  let lineWidth = 0;
  for (const word of words) {
    const wordWidth = [...word].reduce((sum, char) => sum + (advance(char, upper) + tracking) * size, 0);
    if (line && lineWidth + wordWidth > width) {
      lines.push(line.trimEnd());
      line = '';
      lineWidth = 0;
    }
    line += word;
    lineWidth += wordWidth;
  }
  if (line) lines.push(line.trimEnd());
  return lines.slice(0, 3);
}

/**
 * Builds one template's thumbnail. `fontAlias` maps a family to the name its
 * face was registered under (the picker loads the Latin faces); East Asian
 * text falls back to the page's fonts.
 */
export function renderDocumentThumbnail(document, design, { language = 'zh-TW', text, fontAlias = (family) => family } = {}) {
  const theme = buildDocumentTheme(design, { content: `${text.title}${text.heading}`, language });
  const { colors, roles } = theme;
  const m = MARGINS[design.margins] || MARGINS.normal;
  const inner = WIDTH - m * 2;
  const family = (role) => {
    const resolved = roles[role];
    const latin = FONT_FAMILIES[resolved.latin]?.system ? resolved.latin : fontAlias(resolved.latin);
    return `"${latin}", "${resolved.eastAsian}", ${resolved.generic}`;
  };
  const headingFamily = family('heading');
  const upper = design.headingCase !== 'normal' && !CJK.test(text.title);
  const tracking = theme.headingTracking;
  const svg = create(document, 'svg', { viewBox: `0 0 ${WIDTH} ${HEIGHT}`, class: 'ac-doc-thumb-svg', role: 'img', 'aria-hidden': 'true' });
  create(document, 'rect', { width: WIDTH, height: HEIGHT, fill: '#FFFFFF' }, svg);

  const title = (value, { x, y, size, fill = colors.title, anchor = 'start', maxWidth = inner }) => {
    const lines = wrap(upper ? value.toUpperCase() : value, size, maxWidth, { upper, tracking });
    lines.forEach((line, index) => {
      const node = create(document, 'text', {
        x, y: y + index * size * 1.12, 'font-size': size, 'font-family': headingFamily, 'font-weight': design.headingWeight,
        fill: color(fill), 'text-anchor': anchor, 'letter-spacing': tracking ? `${tracking}em` : null
      }, svg);
      node.textContent = line;
    });
    return y + (lines.length - 1) * size * 1.12;
  };
  const label = (value, { x, y, size, fill = colors.muted, anchor = 'start' }) => {
    const node = create(document, 'text', { x, y, 'font-size': size, 'font-family': family('body'), fill: color(fill), 'text-anchor': anchor }, svg);
    node.textContent = value;
  };
  const bars = (y, count, { x = m, width = inner, indent = 0, center = false } = {}) => {
    const pitch = 2.3 + 3 * design.lineSpacing;
    for (let index = 0; index < count; index += 1) {
      const last = index === count - 1;
      const shorten = last ? 0.55 : 1 - (index % 3) * 0.04;
      const first = index === 0 ? indent : 0;
      const w = (width - first) * shorten;
      create(document, 'rect', { x: center ? (WIDTH - w) / 2 : x + first, y: y + index * pitch, width: w, height: 1.6, rx: 0.4, fill: '#D5D7DB' }, svg);
    }
    return y + count * pitch;
  };
  const center = design.titleAlign === 'center';

  // ------------------------------------------------------------ covers
  if (design.cover === 'band') {
    create(document, 'rect', { width: WIDTH, height: 166, fill: color(colors.fill) }, svg);
    label(text.kicker, { x: m, y: 104, size: 5.5, fill: colors.onFillMuted });
    const end = title(text.title, { x: m, y: 124, size: 15, fill: colors.onFill });
    label(text.subtitle, { x: m, y: end + 14, size: 6, fill: colors.onFillMuted });
    label(text.author, { x: m, y: 186, size: 5, fill: colors.text });
    return svg;
  }
  if (design.cover === 'shapes') {
    const w = WIDTH / 4;
    [[colors.accent, colors.soft, colors.accent2, colors.fill], [null, colors.accent2Soft, colors.accent, null]].forEach((row, r) => {
      row.forEach((fill, c) => { if (fill) create(document, 'rect', { x: c * w, y: r * 33, width: w, height: 33, fill: color(fill) }, svg); });
    });
    const end = title(text.title, { x: m, y: 118, size: 15 });
    label(text.subtitle, { x: m, y: end + 14, size: 6 });
    create(document, 'rect', { x: m, y: end + 22, width: 18, height: 1.6, fill: color(colors.accent) }, svg);
    label(text.author, { x: m, y: end + 34, size: 5 });
    return svg;
  }
  if (design.cover === 'page') {
    const size = 15;
    const lines = wrap(text.title, size, inner, { upper, tracking }).length;
    const block = 14 + lines * size * 1.12 + 26;
    const top = center ? (HEIGHT - block) / 2 : HEIGHT - m - block - 10;
    const x = center ? WIDTH / 2 : m;
    const anchor = center ? 'middle' : 'start';
    create(document, 'rect', { x: center ? WIDTH / 2 - 9 : m, y: top, width: 18, height: 1.6, fill: color(colors.accent) }, svg);
    const end = title(text.title, { x, y: top + 22, size, anchor });
    label(text.subtitle, { x, y: end + 14, size: 6, anchor });
    label(text.author, { x, y: end + 26, size: 5, anchor });
    return svg;
  }
  if (design.cover === 'title') {
    // APA title page: centred in the upper half, running head top right.
    label('1', { x: WIDTH - m, y: 16, size: 4.5, anchor: 'end' });
    const end = title(text.title, { x: WIDTH / 2, y: 86, size: 8, anchor: 'middle', fill: colors.text });
    label(text.author, { x: WIDTH / 2, y: end + 20, size: 5.5, fill: colors.text, anchor: 'middle' });
    label(text.kicker, { x: WIDTH / 2, y: end + 30, size: 5.5, fill: colors.text, anchor: 'middle' });
    return svg;
  }

  // ------------------------------------------------------------ first page
  let y = 34;
  if (design.cover === 'block') create(document, 'rect', { x: m - 5, y: y - 13, width: 1.6, height: 34, fill: color(colors.accent) }, svg);
  const titleX = design.cover === 'block' ? m + 3 : center ? WIDTH / 2 : m;
  const anchor = center && design.cover !== 'block' ? 'middle' : 'start';
  y = title(text.title, { x: titleX, y, size: 11, anchor });
  label(text.subtitle, { x: titleX, y: y + 10, size: 5.5, anchor });
  y += 30;

  const headingSize = 7.5;
  const headingFill = design.headings === 'shaded' ? colors.onFill : colors.heading;
  if (design.headings === 'shaded') create(document, 'rect', { x: m - 2, y: y - headingSize - 1.5, width: inner + 4, height: headingSize + 5, fill: color(colors.fill) }, svg);
  if (design.headings === 'bar') create(document, 'rect', { x: m, y: y - headingSize, width: 1.8, height: headingSize + 2, fill: color(colors.accent) }, svg);
  const headingX = design.headings === 'centered' ? WIDTH / 2 : design.headings === 'bar' ? m + 5 : m;
  const heading = create(document, 'text', {
    x: headingX, y, 'font-size': headingSize, 'font-family': headingFamily, 'font-weight': design.headingWeight,
    fill: color(headingFill), 'text-anchor': design.headings === 'centered' ? 'middle' : 'start'
  }, svg);
  heading.textContent = upper ? text.heading.toUpperCase() : text.heading;
  if (design.headings === 'rule') create(document, 'rect', { x: m, y: y + 3, width: inner, height: 0.5, fill: color(colors.rule) }, svg);
  y += 10;
  y = bars(y, 4, { indent: design.paragraphs === 'indented' ? 8 : 0 }) + 6;

  // A small table in the template's treatment.
  const rowHeight = 7;
  const tableTop = y;
  if (design.tables !== 'lines') create(document, 'rect', { x: m, y: tableTop, width: inner, height: rowHeight, fill: color(colors.headerFill) }, svg);
  for (let row = 1; row <= 3; row += 1) {
    const top = tableTop + row * rowHeight;
    if (design.tables === 'shaded' && row % 2 === 0) create(document, 'rect', { x: m, y: top, width: inner, height: rowHeight, fill: color(colors.stripeFill) }, svg);
  }
  const rule = (at, weight, fill = colors.border) => create(document, 'rect', { x: m, y: at, width: inner, height: weight, fill: color(fill) }, svg);
  if (design.tables === 'lines') {
    rule(tableTop, 0.9, colors.text);
    rule(tableTop + rowHeight, 0.5, colors.text);
    rule(tableTop + rowHeight * 4, 0.9, colors.text);
  } else {
    for (let row = 1; row <= 4; row += 1) rule(tableTop + row * rowHeight, 0.35);
    if (design.tables === 'grid') {
      rule(tableTop, 0.35);
      [0, inner / 2, inner].forEach((offset) => create(document, 'rect', { x: m + offset, y: tableTop, width: 0.35, height: rowHeight * 4, fill: color(colors.border) }, svg));
    }
  }
  for (let row = 0; row < 4; row += 1) {
    const cellY = tableTop + row * rowHeight + 3;
    create(document, 'rect', { x: m + 3, y: cellY, width: inner * 0.28, height: 1.4, fill: row === 0 ? '#9CA0A6' : '#D5D7DB' }, svg);
    create(document, 'rect', { x: m + inner - 3 - inner * 0.16, y: cellY, width: inner * 0.16, height: 1.4, fill: row === 0 ? '#9CA0A6' : '#D5D7DB' }, svg);
  }
  y = tableTop + rowHeight * 4 + 10;
  bars(y, 5, { indent: design.paragraphs === 'indented' ? 8 : 0 });
  return svg;
}
