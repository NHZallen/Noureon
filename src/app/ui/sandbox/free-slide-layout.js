// Lays out the slides pptx-reader.js read: breaks the text into lines with
// the measurer, works out paragraph spacing and bullets, grows table rows to
// fit their text, and turns tables into shapes and text, so slide-preview.js
// can draw a free-form deck with the same code it draws design-system decks.

import { FONT_FAMILIES, pdfFamily } from '../files/design/fonts.js';
import { breakRichLines } from '../files/design/rich-text.js';

const LINE_HEIGHT = 1.2;
const CJK = /[぀-ヿ㐀-鿿가-힯]/;
const KOREAN = /[가-힯]/;
const JAPANESE = /[぀-ヿ]/;
const SERIF = /serif|times|georgia|cambria|garamond|mincho|song|ming|book|palatino/i;
const WINGDINGS = Object.freeze({ '§': '▪', ü: '✓', Ø: '➢', l: '●', n: '■', q: '❑', v: '❖', '': '•', '·': '•' });

const isSerif = (family) => SERIF.test(family) && !/sans/i.test(family);

/**
 * Turns a model from readPresentation into { layout: { slides }, fontAlias,
 * measure, fonts } for renderPresentationSlides. `fonts` lists the shipped
 * families the text falls back on, so the caller can load them.
 */
export function layoutFreePresentation(model, { measure, fontAlias = (family) => family }) {
  const fonts = new Set();
  let counter = 0;
  const nextId = () => `free-${(counter += 1)}`;

  const stackCache = new Map();
  const stack = (run, text = run.text) => {
    const cjk = CJK.test(text);
    const key = `${run.latin}|${run.ea}|${cjk ? 'c' : ''}${KOREAN.test(text) ? 'k' : JAPANESE.test(text) ? 'j' : ''}`;
    if (stackCache.has(key)) return stackCache.get(key);
    const names = [];
    const add = (family) => {
      if (!family) return;
      names.push(`"${family}"`);
      const shipped = FONT_FAMILIES[pdfFamily(family)]?.files ? pdfFamily(family) : null;
      if (shipped) {
        fonts.add(shipped);
        names.push(`"${fontAlias(shipped)}"`);
      }
    };
    add(run.latin || 'Arial');
    if (cjk) {
      add(run.ea);
      const fallback = KOREAN.test(text) ? 'Noto Sans KR' : JAPANESE.test(text) ? 'Noto Sans JP' : 'Noto Sans TC';
      fonts.add(fallback);
      names.push(`"${fontAlias(fallback)}"`);
    }
    const value = `${names.join(', ')}, ${isSerif(run.latin || '') ? 'serif' : 'sans-serif'}`;
    stackCache.set(key, value);
    return value;
  };

  const languageOf = (text) => (KOREAN.test(text) ? 'ko' : JAPANESE.test(text) ? 'ja' : CJK.test(text) ? 'zh-TW' : 'en');

  const bulletOf = (paragraph, run, size) => {
    const { bullet } = paragraph;
    if (!bullet) return null;
    const family = bullet.font && !/^(?:wingdings|symbol)/i.test(bullet.font) ? `"${bullet.font}", ${stack(run || { latin: 'Arial' }, '•')}` : stack(run || { latin: 'Arial' }, '•');
    if (bullet.kind === 'auto') return { style: 'char', text: numberLabel(bullet), family, color: bullet.color, size };
    const char = /^(?:wingdings|symbol)/i.test(bullet.font || '') ? WINGDINGS[bullet.char] || '•' : bullet.char;
    return { style: 'char', text: char, family, color: bullet.color, size };
  };

  /**
   * Text laid out inside the box (x, y, w, h): { element, height } where
   * height is what the paragraphs need.
   */
  function layoutText({ x, y, w, h, paragraphs, anchor, wrap = true, fontScale = 1, color, rotate }) {
    const laid = [];
    let cursor = 0;
    let largest = 0;
    paragraphs.forEach((source, paragraphIndex) => {
      const runs = source.runs.map((run) => ({
        ...run,
        size: run.size * fontScale,
        strong: run.bold,
        family: run.text === '\n' ? undefined : stack(run)
      }));
      const groups = [[]];
      for (const run of runs) {
        if (run.text === '\n') groups.push([]);
        else groups[groups.length - 1].push(run);
      }
      const nominal = source.size * fontScale;
      groups.forEach((group, groupIndex) => {
        const size = group.length ? Math.max(...group.map((run) => run.size)) : nominal;
        largest = Math.max(largest, size);
        const spacing = source.lineSpacing;
        const lineStep = spacing?.px ? spacing.px : size * LINE_HEIGHT * (spacing?.pct ?? 1);
        const before = paragraphIndex === 0 && groupIndex === 0 ? 0 : groupIndex === 0 ? (source.spaceBefore?.px ?? (source.spaceBefore?.pct ?? 0) * lineStep) : 0;
        const first = group.find((run) => run.text.trim());
        const bullet = groupIndex === 0 && first ? bulletOf(source, first, size) : null;
        const marL = source.marL;
        const available = wrap ? Math.max(20, w - marL) : 1e6;
        const fontOf = (run) => ({ size: run.size, weight: run.strong ? 700 : 400, family: run.family });
        const text = group.map((run) => run.text).join('');
        const lines = text.trim()
          ? breakRichLines(group, { maxWidth: available, fontOf, measure, language: languageOf(text) })
          : [{ runs: [], width: 0 }];
        const top = cursor + before;
        laid.push({
          top,
          lines,
          lineStep,
          size,
          align: source.align,
          indent: marL,
          hangingEm: bullet ? Math.max(0.5, -source.indent / size) : undefined,
          bullet,
          color: undefined
        });
        const after = groupIndex === groups.length - 1 ? (source.spaceAfter?.px ?? (source.spaceAfter?.pct ?? 0) * lineStep) : 0;
        cursor = top + lines.length * lineStep + after;
      });
    });
    return {
      height: cursor,
      element: {
        type: 'text',
        id: nextId(),
        x, y, w, h,
        valign: anchor,
        align: 'left',
        color,
        alpha: 1,
        rotate,
        font: { size: largest || 18, weight: 400, strongWeight: 700, tracking: 0, uppercase: false, role: 'body' },
        paragraphs: laid
      }
    };
  }

  const layoutTextElement = (element, output) => {
    const { insets } = element;
    const inner = {
      x: element.x + insets.left,
      y: element.y + insets.top,
      w: Math.max(1, element.w - insets.left - insets.right),
      h: Math.max(1, element.h - insets.top - insets.bottom)
    };
    output.push(layoutText({ ...element, ...inner }).element);
  };

  function layoutTable(element, output) {
    const columnTotal = element.columns.reduce((sum, width) => sum + width, 0) || element.w;
    const widths = element.columns.map((width) => (width / columnTotal) * element.w);
    let y = element.y;
    element.rows.forEach((row) => {
      const placed = [];
      let x = element.x;
      let need = row.height;
      let column = 0;
      for (const cell of row.cells) {
        const span = Math.max(1, cell.span);
        const width = widths.slice(column, column + span).reduce((sum, value) => sum + value, 0);
        column += span;
        if (!cell.skip) {
          const { margins } = cell;
          const measured = layoutText({
            x: x + margins.left, y, w: Math.max(1, width - margins.left - margins.right), h: 0,
            paragraphs: cell.paragraphs, anchor: cell.anchor, color: cell.color
          });
          need = Math.max(need, measured.height + margins.top + margins.bottom);
          placed.push({ cell, x, width, measured });
        }
        x += width;
      }
      for (const { cell, x: left, width, measured } of placed) {
        const { margins } = cell;
        if (cell.fill || cell.border) {
          output.push({
            type: 'shape', shape: 'rect', x: left, y, w: width, h: need,
            fill: cell.fill, line: cell.border ? { color: cell.border, width: 1, alpha: 1 } : null
          });
        }
        if (measured.element.paragraphs.some((paragraph) => paragraph.lines.some((line) => line.runs.length))) {
          measured.element.y = y + margins.top;
          measured.element.h = need - margins.top - margins.bottom;
          output.push(measured.element);
        }
      }
      y += need;
    });
  }

  function layoutChart(element, output) {
    const { native } = element;
    const size = native.options.catAxisLabelFontSize || 12;
    let { y, h } = element;
    if (native.title) {
      const titleSize = size * 1.4;
      output.push(layoutText({
        x: element.x, y, w: element.w, h: titleSize * 1.6, anchor: 'middle', color: '#404040',
        paragraphs: [{ runs: [{ text: native.title, size: titleSize, bold: false, latin: 'Calibri' }], size: titleSize, align: 'center', marL: 0, indent: 0 }]
      }).element);
      y += titleSize * 1.7;
      h -= titleSize * 1.7;
    }
    const family = stack({ latin: 'Calibri' }, 'a');
    output.push({ type: 'chart', id: nextId(), x: element.x, y, w: element.w, h: Math.max(20, h), native, family });
  }

  const slides = model.slides.map((slide) => {
    const elements = [];
    if (slide.background.image) {
      elements.push({ type: 'image', id: nextId(), x: 0, y: 0, w: model.width, h: model.height, shape: 'rect', resolved: { data: slide.background.image }, stretch: true });
    }
    for (const element of slide.elements) {
      if (element.type === 'text') layoutTextElement(element, elements);
      else if (element.type === 'table') layoutTable(element, elements);
      else if (element.type === 'chart') layoutChart(element, elements);
      else if (element.type === 'image') {
        elements.push({
          ...element,
          id: nextId(),
          resolved: element.data ? { data: element.data } : undefined,
          stretch: true,
          palette: { fill: '#F3F4F6', line: '#9CA3AF', text: '#6B7280' }
        });
      } else elements.push({ ...element, id: nextId() });
    }
    return { number: slide.number, background: slide.background.color || '#FFFFFF', width: model.width, height: model.height, elements };
  });
  return { layout: { slides }, fontAlias, measure, fonts };
}

function numberLabel({ type, number = 1 }) {
  const alpha = (value) => {
    let result = '';
    let rest = value;
    while (rest > 0) {
      result = String.fromCharCode(97 + ((rest - 1) % 26)) + result;
      rest = Math.floor((rest - 1) / 26);
    }
    return result || 'a';
  };
  const roman = (value) => [[10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']].reduce((text, [amount, symbol]) => {
    let rest = text.rest;
    let out = text.out;
    while (rest >= amount) { out += symbol; rest -= amount; }
    return { rest, out };
  }, { rest: value, out: '' }).out;
  const suffix = /ParenBoth/.test(type) ? ')' : /ParenR/.test(type) ? ')' : /Period/.test(type) ? '.' : '';
  const prefix = /ParenBoth/.test(type) ? '(' : '';
  let body = String(number);
  if (/^alphaLc/.test(type)) body = alpha(number);
  else if (/^alphaUc/.test(type)) body = alpha(number).toUpperCase();
  else if (/^romanLc/.test(type)) body = roman(number);
  else if (/^romanUc/.test(type)) body = roman(number).toUpperCase();
  return `${prefix}${body}${suffix}`;
}
