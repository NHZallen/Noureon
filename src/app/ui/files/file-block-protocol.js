// Parses the ```file <name> fenced-block protocol directly from the model's raw
// Markdown source. This must run before marked: a document body commonly
// contains its own ``` code blocks, and CommonMark would close a three-backtick
// outer fence at the first inner fence. Scanning the source lets us apply a
// nesting heuristic that tolerates models which forget to use four backticks.

import { getFileExtension, isKnownFileExtension } from './file-type-registry.js';

export const FILE_BLOCK_TOKEN_PATTERN = /NOURA_FILE_TOKEN_(\d+)_END/;
export const FILE_BLOCK_TOKEN_GLOBAL_PATTERN = /NOURA_FILE_TOKEN_(\d+)_END/g;

// Hard ceiling on a single block. Larger payloads are rejected rather than
// handed to a generator that would hold several copies in memory.
export const MAX_FILE_BLOCK_CHARACTERS = 2_000_000;

const FILE_OPENING_PATTERN = /^( {0,3})(`{3,}|~{3,})[ \t]*file(?=$|[\s:=])(.*)$/i;
const ANY_OPENING_PATTERN = /^( {0,3})(`{3,}|~{3,})(.*)$/;
const PARTIAL_FILE_OPENING_PATTERN = /^ {0,3}(`{3,}|~{3,})[ \t]*(?:f(?:i(?:l(?:e)?)?)?)?[ \t]*$/i;
const HEADER_NAME_PATTERN = /^\s*(?:file\s*name|filename|name|檔名|文件名|檔案名稱|nom|nombre|имя)\s*[:：=]\s*(.+?)\s*$/i;

function getSourceLines(source) {
  const lines = [];
  let start = 0;
  while (start < source.length) {
    const newline = source.indexOf('\n', start);
    const end = newline < 0 ? source.length : newline + 1;
    lines.push({
      start,
      end,
      text: source.slice(start, end).replace(/\n$/, '').replace(/\r$/, '')
    });
    start = end;
  }
  return lines;
}

const isFenceOnlyLine = (text, fenceChar, minimumLength) => {
  const match = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(text);
  return Boolean(match && match[1][0] === fenceChar && match[1].length >= minimumLength);
};

const isInfoFenceLine = (text, fenceChar) => {
  const match = ANY_OPENING_PATTERN.exec(text);
  if (!match || match[2][0] !== fenceChar) return false;
  const info = match[3].trim();
  // A backtick fence cannot carry backticks in its info string (CommonMark).
  return Boolean(info) && !(fenceChar === '`' && info.includes('`'));
};

function unquote(value) {
  const trimmed = String(value || '').trim();
  const quoted = /^(["'“”‘’「『])(.*)(["'“”‘’」』])$/.exec(trimmed);
  return quoted ? quoted[2].trim() : trimmed;
}

// Accepts `file name.ext`, `file:name.ext`, `file=name.ext`,
// `file name="name.ext"`, `file filename='name.ext'` and a bare extension
// such as `file docx`.
export function parseFileInfoString(info = '') {
  let rest = String(info || '').trim().replace(/^[:=]\s*/, '');
  const attribute = /(?:^|\s)(?:file)?name\s*=\s*("[^"]*"|'[^']*'|\S+)/i.exec(rest);
  if (attribute) rest = attribute[1];
  const name = unquote(rest);
  if (!name) return { name: '', extensionHint: '' };
  if (!name.includes('.') && isKnownFileExtension(name)) {
    return { name: '', extensionHint: name.toLowerCase() };
  }
  return { name, extensionHint: '' };
}

// When the info string carries no name, models often put it on the first line
// of the body instead ("name: report.docx"), optionally followed by "---".
function extractHeaderName(content) {
  const lines = content.split('\n');
  const firstIndex = lines.findIndex((line) => line.trim() !== '');
  if (firstIndex < 0) return null;
  const match = HEADER_NAME_PATTERN.exec(lines[firstIndex]);
  if (!match || !getFileExtension(unquote(match[1]))) return null;
  let bodyStart = firstIndex + 1;
  if (lines[bodyStart]?.trim() === '---' && lines[bodyStart + 1] !== undefined) {
    // A lone separator directly after the header belongs to the header, unless
    // it opens a YAML front matter block (a second --- appears later).
    const closesFrontMatter = lines.slice(bodyStart + 1).some((line) => line.trim() === '---');
    if (!closesFrontMatter) bodyStart += 1;
  }
  return { name: unquote(match[1]), content: lines.slice(bodyStart).join('\n') };
}

function finishBlock(source, block) {
  const rawContent = source.slice(block.contentStart, block.contentEnd);
  let content = rawContent.replace(/\r\n?/g, '\n');
  const { name: infoName, extensionHint } = parseFileInfoString(block.info);
  let name = infoName;
  if (!name) {
    const header = extractHeaderName(content);
    if (header) {
      name = header.name;
      content = header.content;
    }
  }
  if (content.endsWith('\n')) content = content.slice(0, -1);
  return {
    start: block.start,
    end: block.end,
    fence: block.fence,
    name,
    extensionHint,
    content,
    complete: block.complete,
    oversized: content.length > MAX_FILE_BLOCK_CHARACTERS
  };
}

/**
 * Finds every ```file block in Markdown source. Ordinary fenced code blocks
 * are skipped so that a model explaining the protocol inside ```markdown is
 * not mistaken for a real file.
 */
export function scanFileBlocks(text = '') {
  const source = String(text || '');
  if (!/file/i.test(source)) return [];
  const lines = getSourceLines(source);
  const blocks = [];
  let ordinaryFence = null;
  let active = null;

  for (const line of lines) {
    if (active) {
      const fenceChar = active.fence[0];
      if (isFenceOnlyLine(line.text, fenceChar, active.fence.length)) {
        if (active.depth > 0) {
          active.depth -= 1;
          continue;
        }
        blocks.push(finishBlock(source, {
          ...active,
          contentEnd: line.start,
          end: line.end,
          complete: true
        }));
        active = null;
        continue;
      }
      // Nesting heuristic: only a three-character outer fence can be closed
      // early by an inner fence of the same length, so only then do inner
      // "```lang" openings need to be balanced by their own closing fence.
      if (active.fence.length === 3 && isInfoFenceLine(line.text, fenceChar)) {
        active.depth += 1;
      }
      continue;
    }

    if (ordinaryFence) {
      if (isFenceOnlyLine(line.text, ordinaryFence[0], ordinaryFence.length)) ordinaryFence = null;
      continue;
    }

    const fileOpening = FILE_OPENING_PATTERN.exec(line.text);
    if (fileOpening && !(fileOpening[2][0] === '`' && fileOpening[3].includes('`'))) {
      active = {
        start: line.start,
        contentStart: line.end,
        fence: fileOpening[2],
        info: fileOpening[3],
        depth: 0
      };
      continue;
    }

    const opening = ANY_OPENING_PATTERN.exec(line.text);
    if (opening && !(opening[2][0] === '`' && opening[3].includes('`'))) {
      ordinaryFence = opening[2];
    }
  }

  if (active) {
    blocks.push(finishBlock(source, {
      ...active,
      contentEnd: source.length,
      end: source.length,
      complete: false
    }));
  }
  return blocks;
}

/**
 * Replaces each file block with a paragraph token that survives marked,
 * DOMPurify and formula extraction, so the renderer can swap in a card.
 */
export function extractFileBlocks(text = '') {
  const source = String(text || '');
  const blocks = scanFileBlocks(source);
  if (blocks.length === 0) return { text: source, blocks };

  let output = '';
  let cursor = 0;
  blocks.forEach((block, index) => {
    output += source.slice(cursor, block.start);
    output += `\n\nNOURA_FILE_TOKEN_${index}_END\n\n`;
    cursor = block.end;
  });
  output += source.slice(cursor);
  return { text: output, blocks };
}

/**
 * Streaming support: returns the unfinished file block at the end of the
 * streamed text, or a partially typed opening fence ("``" / "```fi").
 */
export function findTrailingStreamingFileBlock(text = '') {
  const source = String(text || '');
  const blocks = scanFileBlocks(source);
  const last = blocks.at(-1);
  if (last && !last.complete) {
    return { prefix: source.slice(0, last.start), block: last, partialOpening: false };
  }

  const lastNewline = source.lastIndexOf('\n');
  const lastLine = source.slice(lastNewline + 1);
  if (lastLine && PARTIAL_FILE_OPENING_PATTERN.test(lastLine) && /f/i.test(lastLine)) {
    return { prefix: source.slice(0, lastNewline + 1), block: null, partialOpening: true };
  }
  return null;
}

export function hasFileBlocks(text = '') {
  return scanFileBlocks(text).length > 0;
}

// 53-bit FNV-1a variant over UTF-16 code units: fast, deterministic and good
// enough to key an in-memory cache of rendered blocks.
export function hashFileBlock(name = '', content = '') {
  const input = `${name}\u0000${content}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ code, 0x5bd1e995) >>> 0;
  }
  return `${h1.toString(36)}${(h2 & 0x1fffff).toString(36)}${input.length.toString(36)}`;
}
