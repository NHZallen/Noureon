// Markdown fallback for presentations. Small models write Markdown far more
// reliably than JSON, so a deck may be written as:
//
//   ---                      front matter: title, author, date, footer,
//   title: …                 language, preset and any design parameter
//   preset: consulting
//   ---
//   # Deck title             first # → cover (next paragraph = subtitle)
//   # Section                later # → section slide
//   ## Slide title           ## → content slide; its layout is inferred
//   - bullets | table | ```chart | > quote | ![alt](upload:1)
//   Notes: speaker notes     a paragraph starting with Notes:/備註：
//   ---                      a rule starts a new untitled slide
//
// The result is a raw spec object for normalizeDocumentSpec().

import { marked } from 'marked';
import { parseRelaxedJson } from './relaxed-json.js';

const META_KEYS = new Set(['title', 'subtitle', 'author', 'date', 'footer', 'language', 'lang', 'slidenumbers', 'pagenumbers']);
// "Notes:" in the five UI languages (備註、备注、講者備註、remarques, заметки, notas).
const NOTES_WORDS = ['notes?', 'speaker\\s*notes', '備註', '备注', '講者備註', 'remarques?', 'notes\\s*de\\s*l.orateur', 'заметки', 'notas'];
const NOTES_PREFIX = new RegExp(`^(?:${NOTES_WORDS.join('|')})\\s*[:\uFF1A]\\s*`, 'i');
const IMAGE_ONLY = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/;
const ATTRIBUTION = /^\s*(?:[\u2014\u2013-]{1,2}|\u2015)\s*(.+)$/;

function parseFrontMatter(source) {
  const match = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(source);
  if (!match) return { fields: {}, body: source };
  const fields = {};
  match[1].split('\n').forEach((line) => {
    const pair = /^\s*([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!pair) return;
    let value = pair[2].trim().replace(/^(["'])(.*)\1$/, '$2');
    if (/^\[.*\]$/.test(value)) value = value.slice(1, -1).split(',').map((item) => item.trim().replace(/^(["'])(.*)\1$/, '$2')).filter(Boolean);
    else if (/^(?:true|yes|on)$/i.test(value)) value = true;
    else if (/^(?:false|no|off)$/i.test(value)) value = false;
    fields[pair[1]] = value;
  });
  return { fields, body: source.slice(match[0].length) };
}

// Keeps our **emphasis**; drops other inline Markdown down to its text.
const inlineText = (value) => String(value ?? '')
  .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/`([^`]+)`/g, '$1')
  .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1$2')
  .replace(/(^|\W)_([^_\n]+)_(?=\W|$)/g, '$1$2')
  .replace(/~~([^~]+)~~/g, '$1')
  .trim();

function listItems(token) {
  return token.items.map((item) => {
    const nested = (item.tokens || []).find((child) => child.type === 'list');
    const ownText = (item.tokens || []).filter((child) => child.type !== 'list').map((child) => child.text ?? '').join(' ');
    return { text: inlineText(ownText || item.text), children: nested ? nested.items.map((child) => inlineText(child.text)) : [] };
  });
}

function tableOf(token) {
  return {
    columns: token.header.map((cell) => inlineText(cell.text)),
    rows: token.rows.map((row) => row.map((cell) => inlineText(cell.text))),
    align: token.align.map((align) => align || 'left')
  };
}

function quoteOf(token) {
  const lines = String(token.text || '').split('\n').map((line) => line.trim()).filter(Boolean);
  const last = lines.length > 1 ? ATTRIBUTION.exec(lines[lines.length - 1]) : null;
  const quoteLines = last ? lines.slice(0, -1) : lines;
  const [attribution, ...role] = last ? last[1].split(/[,\uFF0C\u3001]\s*/) : [];
  return { quote: inlineText(quoteLines.join('\n')), attribution: inlineText(attribution || ''), role: inlineText(role.join(', ')) };
}

export function parseMarkdownDeck(source) {
  const { fields, body } = parseFrontMatter(String(source ?? '').replace(/\r\n?/g, '\n'));
  const spec = { design: {}, slides: [] };
  for (const [key, value] of Object.entries(fields)) {
    const folded = key.toLowerCase().replace(/[-_]/g, '');
    if (META_KEYS.has(folded)) spec[folded === 'lang' ? 'language' : folded === 'pagenumbers' ? 'slideNumbers' : folded === 'slidenumbers' ? 'slideNumbers' : folded] = value;
    else spec.design[key] = value;
  }

  let current = null;
  let sawCover = false;
  const start = (slide) => {
    current = slide;
    spec.slides.push(slide);
    return slide;
  };
  const ensure = () => current || start({});
  const appendBody = (slide, value) => {
    slide.body = slide.body ? `${slide.body}\n${value}` : value;
  };

  for (const token of marked.lexer(body)) {
    if (token.type === 'heading') {
      const title = inlineText(token.text);
      if (token.depth === 1) {
        start({ layout: sawCover || spec.slides.length ? 'section' : 'cover', title });
        sawCover = true;
      } else {
        start({ title });
      }
      continue;
    }
    if (token.type === 'hr') {
      current = null;
      continue;
    }
    if (token.type === 'space') continue;
    const slide = ensure();
    if (token.type === 'paragraph') {
      // Image lines may sit directly above or below text in one paragraph.
      const lines = String(token.text || '').split('\n');
      for (const line of lines) {
        const imageMatch = IMAGE_ONLY.exec(line.trim());
        if (!imageMatch) continue;
        const image = { src: imageMatch[2], alt: imageMatch[1] };
        if (slide.image || slide.images) (slide.images ||= [{ ...slide.image }]).push(image);
        else slide.image = image;
        if (slide.images) delete slide.image;
      }
      const value = lines.filter((line) => !IMAGE_ONLY.test(line.trim())).join('\n').trim();
      if (!value) continue;
      if (NOTES_PREFIX.test(value)) {
        slide.notes = [slide.notes, value.replace(NOTES_PREFIX, '')].filter(Boolean).join('\n');
      } else if ((slide.layout === 'cover' || slide.layout === 'section') && !slide.subtitle) {
        slide.subtitle = inlineText(value);
      } else {
        appendBody(slide, inlineText(value));
      }
    } else if (token.type === 'list') {
      slide.bullets = [...(slide.bullets || []), ...listItems(token)];
    } else if (token.type === 'table') {
      slide.table = tableOf(token);
    } else if (token.type === 'code' && /^chart$/i.test(token.lang || '')) {
      try {
        slide.chart = parseRelaxedJson(token.text).value;
      } catch {
        slide.chart = null;
      }
    } else if (token.type === 'blockquote') {
      Object.assign(slide, quoteOf(token));
    } else if (token.type === 'code') {
      appendBody(slide, token.text);
    } else if (token.text) {
      appendBody(slide, inlineText(token.text));
    }
  }

  for (const slide of spec.slides) {
    // A chart or table slide's prose is its takeaway or note, not bullets.
    if (slide.chart && slide.body) {
      slide.takeaway = slide.body;
      delete slide.body;
    }
    if (slide.images && !slide.layout) slide.layout = 'gallery';
  }
  return spec;
}
