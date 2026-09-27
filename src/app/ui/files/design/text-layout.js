// Text measurement and line breaking for the layout engine. Positions are
// computed once and shared by the PPTX output and the slide preview, so the
// engine must predict where PowerPoint will wrap. It measures with the real
// fonts in the browser (canvas) and with per-character estimates in tests,
// breaks Chinese only between words (Intl.Segmenter), follows the kinsoku
// rules, and keeps a safety margin for the difference between renderers.

// PowerPoint and the browser shape text slightly differently; plan with 92%.
export const SAFETY_FACTOR = 0.92;

const CJK = /[\u3040-\u30FF\u3400-\u9FFF\uF900-\uFAFF\uAC00-\uD7AF\uFF00-\uFFEF\u3000-\u303F]/;
const WHITESPACE = /^[ \t\u00A0\u2000-\u200A\u202F\u3000]+$/;
// Characters that may not start a line (closing marks, CJK full stops…).
const NO_LINE_START = new Set([...',.;:!?%)]}\u00BB\u201D\u2019、。，．；：！？）\u300D\u300F】〉》〕…‥ー々・％']);
// Characters that may not end a line (opening marks).
const NO_LINE_END = new Set([...'([{\u00AB\u201C\u2018（\u300C\u300E【〈《〔']);
// No-break spaces glue their neighbours (French "7,3 %", "\u00AB Bonjour \u00BB").
const GLUE = new Set(['\u00A0', '\u202F', '\u2060']);
const BREAK_AFTER = new Set(['-', '‐', '–', '—', '/']);

const segmenters = new Map();
function wordSegmenter(language) {
  if (typeof Intl === 'undefined' || !Intl.Segmenter) return null;
  const locale = /^zh-(?:TW|HK|MO|Hant)/i.test(language) || language === 'zh' ? 'zh-Hant' : language || 'en';
  if (!segmenters.has(locale)) segmenters.set(locale, new Intl.Segmenter(locale, { granularity: 'word' }));
  return segmenters.get(locale);
}

const graphemes = (text) => (typeof Intl !== 'undefined' && Intl.Segmenter
  ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map((part) => part.segment)
  : [...text]);

function charWidthEm(char, condensed) {
  if (CJK.test(char)) return 1;
  if (char === '\u202F' || char === '\u2009') return 0.18;
  if (WHITESPACE.test(char)) return 0.28 * condensed;
  if (/[A-Z]/.test(char)) return 0.66 * condensed;
  if (/[a-z]/.test(char)) return 0.53 * condensed;
  if (/[0-9]/.test(char)) return 0.58 * condensed;
  if (/[\u0410-\u042F\u0401]/.test(char)) return 0.72 * condensed;
  if (/[\u0430-\u044F\u0451]/.test(char)) return 0.58 * condensed;
  if (/[\u00C0-\u024F]/.test(char)) return 0.6 * condensed;
  if (/[.,;:'`|!]/.test(char)) return 0.3 * condensed;
  return 0.55 * condensed;
}

/**
 * A measurer is `(text, font) => width in points`. `font` carries `size`,
 * and optionally `weight`, `family` (CSS stack), `condensed` (Latin width
 * factor), `tracking` (em) and `uppercase`.
 */
export function createEstimatingMeasurer() {
  return (text, font) => {
    const source = font.uppercase ? String(text).toUpperCase() : String(text);
    const condensed = font.condensed || 1;
    let width = 0;
    let count = 0;
    for (const char of source) {
      width += charWidthEm(char, condensed);
      count += 1;
    }
    return (width + (font.tracking || 0) * count) * font.size;
  };
}

/** Measures with real fonts through a 2D canvas context (browser only). */
export function createCanvasMeasurer(context) {
  const cache = new Map();
  return (text, font) => {
    const source = font.uppercase ? String(text).toUpperCase() : String(text);
    const css = `${font.weight || 400} ${font.size}px ${font.family || 'sans-serif'}`;
    const key = `${css}\u0000${source}`;
    if (!cache.has(key)) {
      context.font = css;
      const tracking = (font.tracking || 0) * font.size * [...source].length;
      cache.set(key, context.measureText(source).width + tracking);
      if (cache.size > 5000) cache.delete(cache.keys().next().value);
    }
    return cache.get(key);
  };
}

// Splits a paragraph into atoms: the pieces a line may break between.
function atomsOf(paragraph, language) {
  const segmenter = wordSegmenter(language);
  const pieces = segmenter
    ? [...segmenter.segment(paragraph)].map((part) => part.segment)
    : paragraph.split(/(\s+)/).flatMap((piece) => (CJK.test(piece) ? [...piece] : [piece])).filter(Boolean);
  const atoms = [];
  for (const piece of pieces) {
    const previous = atoms[atoms.length - 1];
    if (previous === undefined) {
      atoms.push(piece);
      continue;
    }
    const last = previous[previous.length - 1];
    const first = piece[0];
    const breakable = WHITESPACE.test(last) && !GLUE.has(last)
      || BREAK_AFTER.has(last)
      || ((CJK.test(last) || CJK.test(first)) && !WHITESPACE.test(first));
    const mustJoin = !breakable
      || NO_LINE_START.has(first)
      || NO_LINE_END.has(last)
      || GLUE.has(first) || GLUE.has(last)
      || (WHITESPACE.test(piece) && !GLUE.has(first));
    if (mustJoin) atoms[atoms.length - 1] = previous + piece;
    else atoms.push(piece);
  }
  return atoms;
}

const trimEnd = (text) => text.replace(/[ \t\u2000-\u200A\u3000]+$/, '');

/** Greedy line breaking. Returns the lines of every paragraph in order. */
export function breakLines(text, { maxWidth, font, measure = createEstimatingMeasurer(), language = 'zh-TW' }) {
  const lines = [];
  for (const paragraph of String(text ?? '').split(/\r?\n/)) {
    if (!paragraph.trim()) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const atom of atomsOf(paragraph, language)) {
      const candidate = line + atom;
      if (!line || measure(trimEnd(candidate), font) <= maxWidth) {
        line = candidate;
        if (measure(trimEnd(line), font) <= maxWidth) continue;
      } else {
        lines.push(trimEnd(line));
        line = atom.replace(/^[ \t]+/, '');
        if (measure(trimEnd(line), font) <= maxWidth) continue;
      }
      // A single atom wider than the line (a long URL or word): hard-break it.
      let piece = '';
      for (const grapheme of graphemes(line)) {
        if (piece && measure(trimEnd(piece + grapheme), font) > maxWidth) {
          lines.push(trimEnd(piece));
          piece = grapheme;
        } else {
          piece += grapheme;
        }
      }
      line = piece;
    }
    lines.push(trimEnd(line));
  }
  return lines;
}

/**
 * Picks the largest font size, from `font.size` down to `minSize`, at which
 * the text fits the box in at most `maxLines` lines. `overflow` is true when
 * even the minimum size does not fit; `shrinkRatio` feeds the quality check.
 */
export function fitText(text, { width, height = Infinity, font, minSize = font.size, maxLines = Infinity, lineHeight = 1.3, measure, language, step = 1 }) {
  const maxWidth = width * SAFETY_FACTOR;
  let last = null;
  for (let size = font.size; size >= minSize - 1e-9; size -= step) {
    const sized = { ...font, size };
    const lines = breakLines(text, { maxWidth, font: sized, measure, language });
    last = { size, lines };
    if (lines.length <= maxLines && lines.length * size * lineHeight <= height) {
      return { size, lines, overflow: false, shrinkRatio: size / font.size };
    }
  }
  return { size: last.size, lines: last.lines, overflow: true, shrinkRatio: last.size / font.size };
}

/**
 * Balanced wrapping for headings: keeps the line count of greedy wrapping but
 * narrows the measure until the lines are as even as possible, so a title
 * never ends with a lone character or word.
 */
export function balanceLines(text, { maxWidth, font, measure = createEstimatingMeasurer(), language }) {
  const greedy = breakLines(text, { maxWidth, font, measure, language });
  if (greedy.length < 2) return greedy;
  let low = maxWidth * 0.4;
  let high = maxWidth;
  let best = greedy;
  for (let iteration = 0; iteration < 14; iteration += 1) {
    const middle = (low + high) / 2;
    const lines = breakLines(text, { maxWidth: middle, font, measure, language });
    if (lines.length <= greedy.length) {
      best = lines;
      high = middle;
    } else {
      low = middle;
    }
  }
  return best;
}

/** True when the last line of a multi-line heading is a lone fragment. */
export function hasOrphanLine(lines, language = 'zh-TW') {
  if (!lines || lines.length < 2) return false;
  const last = lines[lines.length - 1].trim();
  if (!last) return false;
  if (CJK.test(last)) return graphemes(last.replace(/[\s\p{P}]/gu, '')).length <= 2;
  return !/\s/.test(last) && lines.length > 1 && !/^(?:zh|ja|ko)/.test(language);
}
