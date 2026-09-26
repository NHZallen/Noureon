import { hashFileBlock } from './file-block-protocol.js';
import { sanitizeFileName } from './file-name-policy.js';
import { isGeneratorAvailable, resolveFileType } from './file-type-registry.js';

// Rendered blocks are remembered by content hash so a click can find the exact
// source that produced the card without serializing it into the DOM. Message
// HTML is re-rendered on every streaming frame, and keeping large payloads out
// of attributes keeps those re-renders cheap.
const FILE_BLOCK_STORE = new Map();
const GENERATED_SIZES = new Map();

const CJK_CHARACTER = /[぀-ヿ㐀-䶿一-鿿가-힯豈-﫿]/gu;

function countLines(content) {
  if (!content) return 0;
  return content.split('\n').length;
}

function countWords(content) {
  const text = String(content || '')
    .replace(/^---\n[\s\S]*?\n---\n/, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`~|[\]()!-]/g, ' ');
  const cjk = text.match(CJK_CHARACTER)?.length || 0;
  const latinWords = text.replace(CJK_CHARACTER, ' ').split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
  return cjk + latinWords;
}

function countCsvRows(content) {
  const rows = String(content || '').split('\n').filter((line) => line.trim() !== '').length;
  return Math.max(0, rows - 1);
}

function resolveStats(type, content) {
  switch (type.family) {
    case 'word':
    case 'pdf':
      return { key: 'statWords', count: countWords(content) };
    case 'csv':
      return { key: 'statRows', count: countCsvRows(content) };
    case 'excel':
    case 'powerpoint':
    case 'blocked':
      return null;
    default:
      return { key: 'statLines', count: countLines(content) };
  }
}

function resolveState(type, block) {
  if (type.policy === 'block') return 'blocked';
  if (block.oversized) return 'too-large';
  if (!isGeneratorAvailable(type.generator)) return 'unavailable';
  if (block.complete !== true) return 'incomplete';
  return 'ready';
}

export function describeFileBlock(block) {
  const rawName = block.name || '';
  const fallbackExtension = block.extensionHint || (rawName ? '' : 'txt');
  const name = sanitizeFileName(rawName, { defaultExtension: fallbackExtension });
  const type = resolveFileType(name);
  const id = hashFileBlock(name, block.content);
  const descriptor = {
    id,
    name,
    extension: type.extension,
    family: type.family,
    generator: type.generator,
    mime: type.mime,
    policy: type.policy,
    language: type.language || '',
    bom: Boolean(type.bom),
    crlf: Boolean(type.crlf),
    content: block.content,
    complete: Boolean(block.complete),
    state: resolveState(type, block),
    stats: resolveStats(type, block.content)
  };
  return descriptor;
}

export function registerFileBlock(descriptor) {
  if (descriptor?.id) FILE_BLOCK_STORE.set(descriptor.id, descriptor);
  return descriptor;
}

// Every card in the DOM was produced by renderMarkdown in this session, which
// registered its descriptor first, so a lookup by id cannot miss.
export function getFileBlock(id) {
  return FILE_BLOCK_STORE.get(id) || null;
}

// Sizes are only known after a file has been generated once; remembering them
// lets a card that is re-rendered later (chat switch, re-open) keep showing it.
export function rememberGeneratedFileSize(id, bytes) {
  if (id && Number.isFinite(bytes)) GENERATED_SIZES.set(id, bytes);
}

export function getGeneratedFileSize(id) {
  return GENERATED_SIZES.get(id) ?? null;
}

export function clearFileBlockStore() {
  FILE_BLOCK_STORE.clear();
  GENERATED_SIZES.clear();
}
