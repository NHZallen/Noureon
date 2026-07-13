import {
  createStableChunkId,
  DOCUMENT_EXTRACTION_VERSION,
  normalizeSourceLocator,
  sha256Hex
} from './document-schema.js';

export function estimateTokenCount(value = '') {
  const text = String(value || '');
  const cjk = (text.match(/[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/gu) || []).length;
  const remainder = Math.max(0, text.length - cjk);
  return cjk + Math.ceil(remainder / 4);
}

const splitParagraphs = text => String(text || '')
  .replace(/\r\n?/g, '\n')
  .split(/\n{2,}/)
  .map(value => value.trim())
  .filter(Boolean);

const tailByTokens = (text, overlapTokens) => {
  if (!overlapTokens) return '';
  const approximateCharacters = overlapTokens * 3;
  const tail = String(text || '').slice(-approximateCharacters);
  const firstBoundary = tail.search(/[\s\n。！？.!?]/u);
  return firstBoundary >= 0 ? tail.slice(firstBoundary + 1).trim() : tail.trim();
};

function splitByTokenLimit(text, maximumTokens) {
  const pieces = [];
  let remaining = String(text || '');
  while (remaining && estimateTokenCount(remaining) > maximumTokens) {
    let low = 1;
    let high = remaining.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (estimateTokenCount(remaining.slice(0, middle)) <= maximumTokens) low = middle;
      else high = middle - 1;
    }
    let boundary = low;
    const whitespace = remaining.slice(0, low).search(/\s+\S*$/u);
    if (whitespace > Math.floor(low * 0.6)) boundary = whitespace;
    pieces.push(remaining.slice(0, boundary));
    remaining = remaining.slice(boundary);
  }
  if (remaining) pieces.push(remaining);
  return pieces;
}

function chunkProse(section, { maximumTokens, overlapTokens }) {
  const paragraphs = splitParagraphs(section.text);
  if (!paragraphs.length) return [];
  const units = paragraphs.flatMap((paragraph, paragraphIndex) => {
    const separator = paragraphIndex > 0 ? '\n\n' : '';
    const limit = Math.max(1, maximumTokens - estimateTokenCount(separator));
    return splitByTokenLimit(paragraph, limit)
      .map((text, pieceIndex) => ({ text, separator: pieceIndex === 0 ? separator : '' }));
  });
  const chunks = [];
  let current = '';
  let currentOverlapCharacters = 0;
  for (const unit of units) {
    if (!current) {
      current = unit.text;
      continue;
    }
    const candidate = `${current}${unit.separator}${unit.text}`;
    if (estimateTokenCount(candidate) <= maximumTokens) {
      current = candidate;
      continue;
    }
    chunks.push({
      text: current,
      overlapCharacterCount: currentOverlapCharacters,
      sourceLocator: section.sourceLocator,
      chunkType: section.chunkType || 'prose',
      extraction: section.extraction
    });
    let overlap = tailByTokens(current, overlapTokens);
    while (overlap && estimateTokenCount(`${overlap}${unit.separator}${unit.text}`) > maximumTokens) {
      overlap = overlap.slice(Math.max(1, Math.ceil(overlap.length * 0.2)));
    }
    current = `${overlap}${unit.separator}${unit.text}`;
    currentOverlapCharacters = overlap.length;
  }
  if (current) chunks.push({
    text: current,
    overlapCharacterCount: currentOverlapCharacters,
    sourceLocator: section.sourceLocator,
    chunkType: section.chunkType || 'prose',
    extraction: section.extraction
  });
  return chunks;
}

function tableRowText(headers, row) {
  return headers.map((header, index) => `${header}: ${row[index] ?? ''}`).join(' | ');
}

const spreadsheetColumn = index => {
  let value = Number(index) + 1;
  let label = '';
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
};

function chunkTable(section, { maximumTokens }) {
  const headers = [...(section.headers || [])];
  const rows = [...(section.rows || [])];
  const chunks = [];
  let currentRows = [];
  let rowStart = Number(section.sourceLocator?.rowStart || 1);
  const flush = () => {
    if (!currentRows.length) return;
    const rowEnd = rowStart + currentRows.length - 1;
    const sourceLocator = {
      ...section.sourceLocator,
      rowStart,
      rowEnd
    };
    if (sourceLocator.type === 'xlsx'
      && Number.isInteger(sourceLocator.columnStart)
      && Number.isInteger(sourceLocator.columnEnd)) {
      sourceLocator.range = `${spreadsheetColumn(sourceLocator.columnStart)}${rowStart}:${spreadsheetColumn(sourceLocator.columnEnd)}${rowEnd}`;
    }
    chunks.push({
      chunkType: 'table',
      overlapCharacterCount: 0,
      headers,
      rows: currentRows,
      text: [`Columns: ${headers.join(' | ')}`, ...currentRows.map(row => tableRowText(headers, row))].join('\n'),
      sourceLocator: normalizeSourceLocator(sourceLocator)
    });
    rowStart = rowEnd + 1;
    currentRows = [];
  };
  for (const row of rows) {
    const candidate = [...currentRows, row];
    const text = [`Columns: ${headers.join(' | ')}`, ...candidate.map(value => tableRowText(headers, value))].join('\n');
    if (currentRows.length && estimateTokenCount(text) > maximumTokens) flush();
    currentRows.push(row);
  }
  flush();
  if (!chunks.length && headers.length) {
    chunks.push({
      chunkType: 'table', headers, rows: [], text: `Columns: ${headers.join(' | ')}`,
      overlapCharacterCount: 0,
      sourceLocator: normalizeSourceLocator(section.sourceLocator)
    });
  }
  return chunks;
}

export async function createDocumentChunks({
  documentHash,
  sections = [],
  extractionVersion = DOCUMENT_EXTRACTION_VERSION,
  maximumTokens = 800,
  overlapTokens = 100,
  cryptoProvider = globalThis.crypto
} = {}) {
  if (!documentHash) throw new TypeError('Document chunking requires documentHash.');
  const drafts = sections.flatMap((section, sectionIndex) => (section.chunkType === 'table'
    ? chunkTable(section, { maximumTokens })
    : chunkProse(section, { maximumTokens, overlapTokens }))
    .map(draft => ({ ...draft, sectionIndex })));
  const chunks = [];
  const characterCursors = new Map();
  for (let index = 0; index < drafts.length; index += 1) {
    const draft = drafts[index];
    const contentHash = await sha256Hex(draft.text, cryptoProvider);
    const sourceLocator = normalizeSourceLocator(draft.sourceLocator);
    const chunkId = await createStableChunkId({
      documentHash,
      extractionVersion,
      sourceLocator,
      contentHash
    }, cryptoProvider);
    const priorCursor = characterCursors.get(draft.sectionIndex) || 0;
    const uniqueLength = draft.text.length - Number(draft.overlapCharacterCount || 0);
    const characterStart = draft.chunkType === 'table'
      ? null
      : Math.max(0, priorCursor - Number(draft.overlapCharacterCount || 0));
    const characterEnd = draft.chunkType === 'table' ? null : priorCursor + uniqueLength;
    if (draft.chunkType !== 'table') characterCursors.set(draft.sectionIndex, characterEnd);
    chunks.push({
      ...draft,
      chunkId,
      documentHash,
      chunkIndex: index,
      totalChunks: drafts.length,
      contentHash,
      sourceLocator,
      tokenCount: estimateTokenCount(draft.text),
      characterStart,
      characterEnd,
      ocrConfidence: Number.isFinite(draft.extraction?.extractionConfidence)
        ? draft.extraction.extractionConfidence
        : null,
      confidenceSource: draft.extraction?.confidenceSource || 'unavailable',
      previousChunkId: null,
      nextChunkId: null
    });
  }
  for (let index = 0; index < chunks.length; index += 1) {
    chunks[index].previousChunkId = chunks[index - 1]?.chunkId || null;
    chunks[index].nextChunkId = chunks[index + 1]?.chunkId || null;
  }
  return chunks;
}
