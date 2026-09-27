// Rich text for the layout engine: paragraphs of styled runs (`**strong**`
// emphasis), broken into lines with every run measured in its own font, and
// fitted to a box by shrinking.
//
// Fitting plans with 92% of the width (SAFETY_FACTOR) so PowerPoint never
// needs more lines than planned; the lines the preview draws are then broken
// again at the full width, which is how PowerPoint wraps the same text.

import { atomsOf, graphemes, SAFETY_FACTOR } from './text-layout.js';

const WHITESPACE_AT_END = /[ \t\u00A0\u2000-\u200A\u3000]$/;

/** Splits `**strong**` markers into runs; unbalanced markers stay literal. */
export function parseEmphasis(text) {
  const source = String(text ?? '');
  const runs = [];
  let last = 0;
  for (const match of source.matchAll(/\*\*([^*\n](?:[^\n]*?[^*\n])?)\*\*/g)) {
    if (match.index > last) runs.push({ text: source.slice(last, match.index) });
    runs.push({ text: match[1], strong: true });
    last = match.index + match[0].length;
  }
  if (last < source.length) runs.push({ text: source.slice(last) });
  return runs.filter((run) => run.text);
}

export const plainText = (runs) => runs.map((run) => run.text).join('');

function trimmedEnd(plain, start, end) {
  let position = end;
  while (position > start && WHITESPACE_AT_END.test(plain[position - 1])) position -= 1;
  return position;
}

/**
 * Greedy line breaking of styled runs. `fontOf(run)` returns the measurer
 * font for a run. Returns lines as { runs, width }, runs carrying their style.
 */
export function breakRichLines(runs, { maxWidth, fontOf, measure, language, coarse = false }) {
  const plain = plainText(runs);
  if (!plain.trim()) return [{ runs: [], width: 0 }];
  const bounds = [];
  let offset = 0;
  runs.forEach((run) => {
    bounds.push({ start: offset, end: offset + run.text.length, run });
    offset += run.text.length;
  });
  const pieces = (start, end) => bounds
    .filter((bound) => bound.end > start && bound.start < end)
    .map((bound) => ({ ...bound.run, text: plain.slice(Math.max(start, bound.start), Math.min(end, bound.end)) }));
  const widthOf = (start, end) => pieces(start, end).reduce((sum, piece) => sum + measure(piece.text, fontOf(piece)), 0);
  const makeLine = (start, end) => {
    const last = trimmedEnd(plain, start, end);
    return { runs: pieces(start, last), width: widthOf(start, last) };
  };

  const atoms = [];
  let position = 0;
  for (const text of atomsOf(plain, language, { coarse })) {
    atoms.push({ start: position, end: position + text.length });
    position += text.length;
  }

  const lines = [];
  let hardBroken = false;
  let lineStart = null;
  let fullWidth = 0;
  let lineEnd = 0;
  const hardBreak = () => {
    // One atom wider than the line (a long URL or word): split by grapheme.
    hardBroken = true;
    let pieceStart = lineStart;
    let cursor = lineStart;
    for (const grapheme of graphemes(plain.slice(lineStart, lineEnd))) {
      const next = cursor + grapheme.length;
      if (cursor > pieceStart && widthOf(pieceStart, trimmedEnd(plain, pieceStart, next)) > maxWidth) {
        lines.push(makeLine(pieceStart, cursor));
        pieceStart = cursor;
      }
      cursor = next;
    }
    lineStart = pieceStart;
    fullWidth = widthOf(lineStart, lineEnd);
  };
  for (const atom of atoms) {
    const atomWidth = widthOf(atom.start, atom.end);
    const trimmedWidth = widthOf(atom.start, trimmedEnd(plain, atom.start, atom.end));
    if (lineStart === null) {
      lineStart = atom.start;
      fullWidth = atomWidth;
    } else if (fullWidth + trimmedWidth <= maxWidth) {
      fullWidth += atomWidth;
    } else {
      lines.push(makeLine(lineStart, lineEnd));
      lineStart = atom.start;
      fullWidth = atomWidth;
    }
    lineEnd = atom.end;
    if (widthOf(lineStart, trimmedEnd(plain, lineStart, lineEnd)) > maxWidth) hardBreak();
  }
  if (lineStart !== null) lines.push(makeLine(lineStart, lineEnd));
  // Callers that prefer whole words check whether any atom had to be split.
  lines.hardBroken = hardBroken;
  return lines;
}

/**
 * Heading wrap: keeps the greedy line count but narrows the measure until
 * the lines are as even as possible (no lone character on the last line).
 */
export function balanceRichLines(runs, { maxWidth, fontOf, measure, language }) {
  const greedy = breakRichLines(runs, { maxWidth, fontOf, measure, language });
  if (greedy.length < 2) return greedy;
  // Prefer breaking only between whole words when that needs no extra line.
  const coarse = breakRichLines(runs, { maxWidth, fontOf, measure, language, coarse: true });
  const useCoarse = coarse.length <= greedy.length && !coarse.hardBroken;
  const options = { fontOf, measure, language, coarse: useCoarse };
  if (useCoarse && coarse.length < 2) return coarse;
  let low = maxWidth * 0.4;
  let high = maxWidth;
  let best = useCoarse ? coarse : greedy;
  for (let iteration = 0; iteration < 14; iteration += 1) {
    const middle = (low + high) / 2;
    const lines = breakRichLines(runs, { maxWidth: middle, ...options });
    if (lines.length <= greedy.length && !(useCoarse && lines.hardBroken)) {
      best = lines;
      high = middle;
    } else {
      low = middle;
    }
  }
  return best;
}

/**
 * Lays out paragraphs at one size. Each paragraph is
 *   { runs, scale = 1, indent = 0 (em), spaceBefore = 0 (em), weight?, color? }.
 * Heights use `lineHeight` × the paragraph's size per line.
 */
// A last line of one or two CJK characters (a widow) is pulled up by
// evening out the lines, keeping their number.
const CJK_TEXT = /[\u3400-\u9FFF\uF900-\uFAFF]/;
function isWidow(lines) {
  if (lines.length < 2) return false;
  const last = plainText(lines[lines.length - 1].runs).replace(/[sp{P}]/gu, '');
  return CJK_TEXT.test(last) && [...last].length <= 2;
}

function layoutParagraphs(paragraphs, { size, width, font, strongWeight, lineHeight, measure, language, factor, balance, widows }) {
  let height = 0;
  let lineCount = 0;
  const laid = paragraphs.map((paragraph, index) => {
    const paragraphSize = size * (paragraph.scale || 1);
    const base = { ...font, size: paragraphSize, weight: paragraph.weight ?? font.weight };
    const fontOf = (run) => (run.strong ? { ...base, weight: Math.max(base.weight, strongWeight) } : base);
    const indent = (paragraph.indent || 0) * paragraphSize;
    const maxWidth = Math.max(1, (width - indent) * factor);
    const breaker = balance ? balanceRichLines : breakRichLines;
    let lines = breaker(paragraph.runs, { maxWidth, fontOf, measure, language });
    if (widows && !balance && isWidow(lines)) lines = balanceRichLines(paragraph.runs, { maxWidth, fontOf, measure, language });
    const spaceBefore = index === 0 ? 0 : (paragraph.spaceBefore || 0) * paragraphSize;
    const top = height + spaceBefore;
    const lineStep = paragraphSize * lineHeight;
    height = top + lines.length * lineStep;
    lineCount += lines.length;
    return { ...paragraph, size: paragraphSize, indent, spaceBefore, top, lineStep, lines };
  });
  return { paragraphs: laid, height, lineCount };
}

/**
 * Picks the largest size, from `font.size` down to `minSize`, at which the
 * paragraphs fit `height` and `maxLines`. Returns the layout drawn at the full
 * width plus { size, height, overflow, shrinkRatio, lines, fitLines } where
 * `lines` are the drawn lines as plain text and `fitLines` the conservative
 * lines fitting was decided on. `drawFactor` narrows the drawn lines (text
 * written with explicit line breaks keeps a little room so PowerPoint never
 * wraps a line again); `widows` avoids one-character last lines in CJK.
 */
export function fitRichText(paragraphs, {
  width, height = Infinity, font, minSize = font.size, maxLines = Infinity, lineHeight = 1.3,
  measure, language, step = 1, strongWeight = 700, balance = false, drawFactor = 1, widows = false
}) {
  const options = { width, font, strongWeight, lineHeight, measure, language, balance, widows };
  let chosen = null;
  for (let size = font.size; size >= minSize - 1e-9; size -= step) {
    const planned = layoutParagraphs(paragraphs, { ...options, size, factor: SAFETY_FACTOR });
    chosen = { size, planned };
    if (planned.lineCount <= maxLines && planned.height <= height + 0.01) break;
  }
  if (!chosen) {
    chosen = { size: font.size, planned: layoutParagraphs(paragraphs, { ...options, size: font.size, factor: SAFETY_FACTOR }) };
  }
  const { size, planned } = chosen;
  const overflow = planned.lineCount > maxLines || planned.height > height + 0.01;
  // Draw with the full width, but never with more lines than were planned.
  const drawn = layoutParagraphs(paragraphs, { ...options, size, factor: drawFactor });
  const layout = drawn.lineCount <= planned.lineCount ? drawn : planned;
  return {
    size,
    paragraphs: layout.paragraphs,
    height: planned.height,
    drawnHeight: layout.height,
    overflow,
    shrinkRatio: size / font.size,
    lines: layout.paragraphs.flatMap((paragraph) => paragraph.lines.map((line) => plainText(line.runs))),
    fitLines: planned.paragraphs.flatMap((paragraph) => paragraph.lines.map((line) => plainText(line.runs)))
  };
}

