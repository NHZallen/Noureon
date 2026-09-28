// When the user picked a template in the composer, the decks in the reply
// must look like that template. Models sometimes write the preset and then
// override it with the design of an earlier file in the conversation, so the
// reply's .pptx specs are rewritten before the message is saved: the design
// becomes exactly the chosen preset. Only the accent colours survive, so "use
// that template, but in blue" still works. Word documents written with a
// document template chosen get the same treatment in their front matter.

import { parseHexColor } from './color.js';
import { parseRelaxedJson } from './relaxed-json.js';
import { scanFileBlocks } from '../file-block-protocol.js';

const FENCED = /^\s*(`{3,}|~{3,})[^\n]*\n([\s\S]*?)\n\1\s*$/;
const DESIGN_KEYS = ['design', 'theme', 'preset', 'template', 'style', 'designs'];
const KEPT = ['accent', 'accent2'];
// Front matter keys that describe the document, not its design.
const META_KEYS = new Set(['title', 'subtitle', 'author', 'date', 'footer', 'language', 'lang', 'slidenumbers', 'pagenumbers']);
const DOCUMENT_META_KEYS = new Set([...META_KEYS, 'toc', 'tableofcontents', 'orientation', 'pagesize', 'papersize', 'header']);
const fold = (key) => String(key).toLowerCase().replace(/[^a-z0-9]/g, '');

const keptColours = (design) => {
  const colours = {};
  if (design && typeof design === 'object' && !Array.isArray(design)) {
    for (const [key, value] of Object.entries(design)) {
      const kept = KEPT.find((name) => name === fold(key) || (name === 'accent' && ['primary', 'primarycolor', 'accentcolor', 'color', 'colour'].includes(fold(key))));
      const hex = kept && parseHexColor(value);
      if (hex && !colours[kept]) colours[kept] = hex;
    }
  }
  return colours;
};

function enforceJson(source, preset) {
  let value;
  try {
    ({ value } = parseRelaxedJson(source));
  } catch {
    return null;
  }
  const spec = Array.isArray(value) ? { slides: value } : value;
  if (!spec || typeof spec !== 'object') return null;
  const written = Object.entries(spec).find(([key]) => fold(key) === 'design' || fold(key) === 'theme')?.[1];
  const design = { preset, ...keptColours(written) };
  const rest = Object.fromEntries(Object.entries(spec).filter(([key]) => !DESIGN_KEYS.includes(fold(key))));
  return JSON.stringify({ design, ...rest }, null, 2);
}

function enforceMarkdown(source, preset, { metaKeys = META_KEYS, presetKey = 'preset' } = {}) {
  const match = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(source);
  const lines = match ? match[1].split('\n') : [];
  const colours = {};
  const kept = lines.filter((line) => {
    const pair = /^\s*([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!pair) return true;
    if (metaKeys.has(fold(pair[1]))) return true;
    const colour = KEPT.find((name) => name === fold(pair[1]));
    const hex = colour && parseHexColor(pair[2].trim().replace(/^(["'])(.*)\1$/, '$2'));
    if (hex) colours[colour] = hex;
    return false;
  });
  const design = [`${presetKey}: ${preset}`, ...Object.entries(colours).map(([key, hex]) => `${key}: ${hex}`)];
  const body = match ? source.slice(match[0].length) : source.replace(/^\n+/, '');
  return `---\n${[...kept, ...design].join('\n')}\n---\n${body}`;
}

/** A deck spec whose design is exactly `preset` (plus any accent colours). */
export function enforceTemplateInSpec(content, preset) {
  let source = String(content ?? '');
  const fenced = FENCED.exec(source);
  if (fenced) source = fenced[2];
  return /^\s*[{[]/.test(source) ? enforceJson(source.trim(), preset) : enforceMarkdown(source, preset);
}

/**
 * Rewrites every complete .pptx file block in a reply so it uses `preset`.
 * Returns the text unchanged when there is nothing to rewrite.
 */
export function enforceDeckTemplate(text, preset) {
  return rewriteFileBlocks(text, /\.pptx$/i, (content) => enforceTemplateInSpec(content, preset));
}

/** A Word document whose front matter names exactly the template `preset`. */
export function enforceTemplateInDocument(content, preset) {
  const source = String(content ?? '').replace(/\r\n?/g, '\n');
  return enforceMarkdown(source, preset, { metaKeys: DOCUMENT_META_KEYS, presetKey: 'template' });
}

/** Rewrites every complete Word or PDF file block in a reply to use `preset`. */
export function enforceDocumentTemplate(text, preset) {
  return rewriteFileBlocks(text, /\.(?:docx|pdf)$/i, (content) => enforceTemplateInDocument(content, preset));
}

function rewriteFileBlocks(text, extension, rewrite) {
  const source = String(text ?? '');
  const blocks = scanFileBlocks(source).filter((block) => block.complete && extension.test(String(block.name || '').trim()));
  let output = source;
  // From the last block backwards, so earlier offsets stay valid.
  for (const block of blocks.reverse()) {
    const content = rewrite(block.content);
    if (content === null || content === block.content) continue;
    const original = source.slice(block.start, block.end);
    const fence = '`'.repeat(Math.max(4, block.fence.length));
    const rewritten = `${fence}file ${String(block.name).trim()}\n${content}\n${fence}${original.endsWith('\n') ? '\n' : ''}`;
    output = `${output.slice(0, block.start)}${rewritten}${output.slice(block.end)}`;
  }
  return output;
}
