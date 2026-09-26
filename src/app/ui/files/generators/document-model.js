// Turns a model-authored Markdown document into a format-neutral block model.
// The Word generator (and later the PDF generator) render this model, so both
// formats interpret front matter, math, page breaks and charts identically.

import { marked } from 'marked';
import { parseAndNormalizeChartSchema } from '../../charts/chart-schema.js';

// Characters that are illegal in XML 1.0 would make Office refuse the file.
// eslint-disable-next-line no-control-regex
const XML_INVALID_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
const PAGE_BREAK_LINE = /^[ \t]*(?:\\pagebreak|\\newpage|<!--\s*page\s*break\s*-->)[ \t]*$/gim;
const SAFE_LINK = /^(?:https?:\/\/|mailto:)/i;

const PAGE_BREAK_TOKEN = 'NOURAPAGEBREAKTOKEN';
const MATH_BLOCK_TOKEN = 'NOURAMATHBLOCK';
const MATH_INLINE_TOKEN = 'NOURAMATHINLINE';
const TOKEN_SUFFIX = 'X';

export const cleanDocumentText = (value) => String(value ?? '').replace(XML_INVALID_CHARACTERS, '');

const DEFAULT_META = Object.freeze({
  title: '',
  subtitle: '',
  author: '',
  date: '',
  toc: false,
  orientation: 'portrait',
  pageSize: 'A4',
  header: '',
  footer: '',
  pageNumbers: true
});

const PAGE_SIZES = new Set(['A3', 'A4', 'A5', 'B5', 'LETTER', 'LEGAL']);

function parseScalar(value) {
  const trimmed = String(value || '').trim();
  const unquoted = /^(["'])(.*)\1$/.exec(trimmed)?.[2] ?? trimmed;
  if (/^(?:true|yes|on)$/i.test(unquoted)) return true;
  if (/^(?:false|no|off)$/i.test(unquoted)) return false;
  return unquoted;
}

// A deliberately small YAML subset: `key: value` lines. Models rarely need
// more, and a real YAML parser would be a large dependency for no benefit.
export function parseFrontMatter(content = '') {
  const source = String(content || '').replace(/^﻿/, '');
  const match = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(source);
  if (!match) return { meta: { ...DEFAULT_META }, body: source };

  const raw = {};
  match[1].split('\n').forEach((line) => {
    const pair = /^\s*([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (pair) raw[pair[1].toLowerCase().replace(/[-_]/g, '')] = parseScalar(pair[2]);
  });

  const text = (key) => (typeof raw[key] === 'string' ? cleanDocumentText(raw[key]).slice(0, 300) : '');
  const pageSize = String(raw.pagesize || raw.papersize || '').toUpperCase();
  const meta = {
    ...DEFAULT_META,
    title: text('title'),
    subtitle: text('subtitle'),
    author: text('author'),
    date: typeof raw.date === 'string' ? text('date') : '',
    toc: raw.toc === true || raw.tableofcontents === true,
    orientation: /^landscape$/i.test(String(raw.orientation || '')) ? 'landscape' : 'portrait',
    pageSize: PAGE_SIZES.has(pageSize) ? pageSize : 'A4',
    header: text('header'),
    footer: text('footer'),
    pageNumbers: raw.pagenumbers !== false
  };
  return { meta, body: source.slice(match[0].length) };
}

// Math is lifted out before marked runs: TeX is full of characters Markdown
// treats as syntax (`_`, `*`, `\\`). Code spans and blocks are protected first
// so dollar signs inside code stay literal.
function protectMath(body, formulas) {
  const codeSegments = [];
  let text = body.replace(/(^|\n)(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\2[ \t]*(?=\n|$)|`+[^`\n]+`+/g, (segment) => {
    codeSegments.push(segment);
    return `NOURACODESEGMENT${codeSegments.length - 1}${TOKEN_SUFFIX}`;
  });

  const block = (_match, latex) => {
    formulas.push({ latex: latex.trim(), display: true });
    return `\n\n${MATH_BLOCK_TOKEN}${formulas.length - 1}${TOKEN_SUFFIX}\n\n`;
  };
  const inline = (_match, latex) => {
    formulas.push({ latex: latex.trim(), display: false });
    return `${MATH_INLINE_TOKEN}${formulas.length - 1}${TOKEN_SUFFIX}`;
  };
  text = text
    .replace(/\$\$([\s\S]+?)\$\$/g, block)
    .replace(/\\\[([\s\S]+?)\\\]/g, block)
    .replace(/\\\(([^\n]+?)\\\)/g, inline)
    .replace(/(?<![\\$\d])\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\d)/g, inline);

  return text.replace(/NOURACODESEGMENT(\d+)X/g, (_match, index) => codeSegments[Number(index)]);
}

const inlineTokenPattern = new RegExp(`${MATH_INLINE_TOKEN}(\\d+)${TOKEN_SUFFIX}`, 'g');
const CJK_CHARACTER = /[⺀-鿿가-힯豈-﫿＀-￯]/;

// A Markdown soft line break is a space between Latin words but nothing at all
// between CJK characters, otherwise Chinese paragraphs gain stray spaces.
function joinSoftBreaks(text) {
  return String(text).replace(/[ \t]*\n[ \t]*/g, (match, offset, source) => {
    const before = source[offset - 1] || '';
    const after = source[offset + match.length] || '';
    return CJK_CHARACTER.test(before) && CJK_CHARACTER.test(after) ? '' : ' ';
  });
}

function splitMathRuns(rawText, marks, formulas) {
  const text = joinSoftBreaks(rawText);
  const runs = [];
  let cursor = 0;
  let match;
  inlineTokenPattern.lastIndex = 0;
  while ((match = inlineTokenPattern.exec(text)) !== null) {
    if (match.index > cursor) runs.push({ ...marks, text: cleanDocumentText(text.slice(cursor, match.index)) });
    const formula = formulas[Number(match[1])];
    runs.push({ ...marks, math: formula?.latex || '' });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) runs.push({ ...marks, text: cleanDocumentText(text.slice(cursor)) });
  return runs;
}

const decodeEntities = (text) => String(text || '')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#39;|&#039;/g, "'")
  .replace(/&amp;/g, '&');

const HTML_MARKS = Object.freeze({
  b: 'bold', strong: 'bold', i: 'italic', em: 'italic', u: 'underline', s: 'strike', del: 'strike', strike: 'strike',
  sup: 'superscript', sub: 'subscript', code: 'code', kbd: 'code'
});

function inlineRuns(tokens = [], formulas, marks = {}) {
  const runs = [];
  const htmlMarks = { ...marks };
  for (const token of tokens) {
    switch (token.type) {
      case 'strong':
        runs.push(...inlineRuns(token.tokens, formulas, { ...htmlMarks, bold: true }));
        break;
      case 'em':
        runs.push(...inlineRuns(token.tokens, formulas, { ...htmlMarks, italic: true }));
        break;
      case 'del':
        runs.push(...inlineRuns(token.tokens, formulas, { ...htmlMarks, strike: true }));
        break;
      case 'codespan':
        runs.push({ ...htmlMarks, code: true, text: cleanDocumentText(decodeEntities(token.text)) });
        break;
      case 'br':
        runs.push({ ...htmlMarks, break: true });
        break;
      case 'link': {
        const href = SAFE_LINK.test(token.href || '') ? token.href : '';
        runs.push(...inlineRuns(token.tokens, formulas, { ...htmlMarks, ...(href ? { link: href } : {}) }));
        break;
      }
      case 'image':
        runs.push({ ...htmlMarks, italic: true, image: true, text: cleanDocumentText(token.text || token.title || '') });
        break;
      case 'html': {
        const tag = /^<\s*(\/)?\s*([a-z0-9]+)[^>]*?(\/)?\s*>$/i.exec(token.text.trim());
        if (!tag) break;
        const name = tag[2].toLowerCase();
        if (name === 'br') {
          runs.push({ ...htmlMarks, break: true });
        } else if (HTML_MARKS[name]) {
          htmlMarks[HTML_MARKS[name]] = !tag[1];
        }
        break;
      }
      case 'text':
      case 'escape':
        if (token.tokens?.length) runs.push(...inlineRuns(token.tokens, formulas, htmlMarks));
        else runs.push(...splitMathRuns(decodeEntities(token.text), htmlMarks, formulas));
        break;
      default:
        if (token.tokens?.length) runs.push(...inlineRuns(token.tokens, formulas, htmlMarks));
        else if (token.text) runs.push(...splitMathRuns(decodeEntities(token.text), htmlMarks, formulas));
    }
  }
  return mergeRuns(runs);
}

function mergeRuns(runs) {
  const merged = [];
  const sameMarks = (a, b) => ['bold', 'italic', 'strike', 'underline', 'code', 'link', 'superscript', 'subscript', 'image']
    .every((key) => Boolean(a[key]) === Boolean(b[key]) && (key !== 'link' || a.link === b.link));
  runs.forEach((run) => {
    if (run.text === '') return;
    const previous = merged.at(-1);
    if (previous && run.text !== undefined && previous.text !== undefined && !run.math && !previous.math && sameMarks(previous, run)) {
      previous.text += run.text;
    } else {
      merged.push({ ...run });
    }
  });
  return merged;
}

export const runsToPlainText = (runs = []) => runs
  .map((run) => (run.break ? '\n' : run.math !== undefined ? run.math : run.text || ''))
  .join('');

function blocksFromTokens(tokens = [], context) {
  const blocks = [];
  for (const token of tokens) {
    const block = blockFromToken(token, context);
    if (Array.isArray(block)) blocks.push(...block);
    else if (block) blocks.push(block);
  }
  return blocks;
}

function paragraphOrSpecial(runs, context) {
  const plain = runsToPlainText(runs).trim();
  if (plain === PAGE_BREAK_TOKEN) return { type: 'pagebreak' };
  const mathBlock = new RegExp(`^${MATH_BLOCK_TOKEN}(\\d+)${TOKEN_SUFFIX}$`).exec(plain);
  if (mathBlock) return { type: 'math', latex: context.formulas[Number(mathBlock[1])]?.latex || '' };
  if (runs.length === 0) return null;
  return { type: 'paragraph', runs };
}

function blockFromToken(token, context) {
  const { formulas } = context;
  switch (token.type) {
    case 'space':
      return null;
    case 'heading': {
      context.headingCount += 1;
      return {
        type: 'heading',
        level: Math.min(6, Math.max(1, token.depth)),
        runs: inlineRuns(token.tokens, formulas),
        anchor: `noureon_heading_${context.headingCount}`
      };
    }
    case 'paragraph':
      return paragraphOrSpecial(inlineRuns(token.tokens, formulas), context);
    case 'text':
      return paragraphOrSpecial(inlineRuns(token.tokens || [{ type: 'text', text: token.text }], formulas), context);
    case 'code': {
      const lang = String(token.lang || '').trim().toLowerCase();
      if (lang === 'chart' || lang === 'json') {
        const chart = parseAndNormalizeChartSchema(token.text);
        if (chart.ok) return { type: 'chart', chart: chart.chart };
      }
      return { type: 'code', lang, text: cleanDocumentText(token.text).replace(/\t/g, '    ') };
    }
    case 'blockquote':
      return { type: 'quote', blocks: blocksFromTokens(token.tokens, context) };
    case 'hr':
      return { type: 'rule' };
    case 'list':
      return {
        type: 'list',
        ordered: Boolean(token.ordered),
        start: Number.isFinite(Number(token.start)) && token.start !== '' ? Number(token.start) : 1,
        items: token.items.map((item) => ({
          checked: item.task ? Boolean(item.checked) : null,
          blocks: blocksFromTokens(item.tokens.filter((child) => child.type !== 'checkbox'), context)
        }))
      };
    case 'table':
      return {
        type: 'table',
        align: token.align.map((value) => value || 'left'),
        header: token.header.map((cell) => inlineRuns(cell.tokens, formulas)),
        rows: token.rows.map((row) => row.map((cell) => inlineRuns(cell.tokens, formulas)))
      };
    case 'html': {
      const text = cleanDocumentText(decodeEntities(token.text.replace(/<[^>]+>/g, ' '))).replace(/\s+/g, ' ').trim();
      if (/^<!--\s*page\s*break\s*-->$/i.test(token.text.trim())) return { type: 'pagebreak' };
      return text ? { type: 'paragraph', runs: [{ text }] } : null;
    }
    default:
      return token.text ? { type: 'paragraph', runs: [{ text: cleanDocumentText(token.text) }] } : null;
  }
}

/**
 * Builds the neutral document model for a Markdown file block.
 * The first level-1 heading becomes the document title when it is the only
 * one and no front matter title was given, matching how models write reports.
 */
export function buildDocumentModel(content = '') {
  const { meta, body } = parseFrontMatter(cleanDocumentText(String(content || '').replace(/\r\n?/g, '\n')));
  const formulas = [];
  const withBreaks = body.replace(PAGE_BREAK_LINE, `\n\n${PAGE_BREAK_TOKEN}\n\n`);
  const tokens = marked.lexer(protectMath(withBreaks, formulas), { gfm: true });
  const context = { formulas, headingCount: 0 };
  let blocks = blocksFromTokens(tokens, context);

  let title = meta.title;
  const topHeadings = blocks.filter((block) => block.type === 'heading' && block.level === 1);
  if (!title && topHeadings.length === 1 && blocks[0] === topHeadings[0]) {
    title = runsToPlainText(topHeadings[0].runs).trim();
    blocks = blocks.slice(1);
  }

  return { meta: { ...meta, title }, blocks };
}

export function collectHeadings(blocks, maxLevel = 3) {
  const headings = [];
  const visit = (list) => list.forEach((block) => {
    if (block.type === 'heading' && block.level <= maxLevel) headings.push(block);
    if (block.type === 'quote') visit(block.blocks);
  });
  visit(blocks);
  return headings;
}
