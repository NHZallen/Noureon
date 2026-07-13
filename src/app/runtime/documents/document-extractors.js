const TEXT_MIME_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'application/json',
  'application/ld+json',
  'application/javascript',
  'application/typescript',
  'application/xml',
  'text/xml',
  'text/css',
  'text/html'
]);

const extensionOf = name => String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || '';

export function base64ToBytes(value = '') {
  const normalized = String(value || '').replace(/^data:[^,]*,/, '');
  if (typeof atob === 'function') {
    const binary = atob(normalized);
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  }
  return new Uint8Array(Buffer.from(normalized, 'base64'));
}

const normalizeNewlines = value => String(value || '').replace(/\r\n?/g, '\n');

function textSections(text, type = 'text') {
  const lines = normalizeNewlines(text).split('\n');
  return [{
    chunkType: type,
    text: lines.join('\n'),
    sourceLocator: { type: 'text', lineStart: 1, lineEnd: Math.max(1, lines.length) }
  }];
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const input = normalizeNewlines(text);
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += character;
  }
  row.push(field);
  if (row.length > 1 || row[0] !== '' || rows.length === 0) rows.push(row);
  return rows;
}

function csvSection(text) {
  const rows = parseCsv(text);
  const headers = (rows[0] || []).map((value, index) => String(value || `column_${index + 1}`));
  return [{
    chunkType: 'table',
    headers,
    rows: rows.slice(1),
    text: '',
    sourceLocator: {
      type: 'csv',
      rowStart: rows.length > 1 ? 2 : 1,
      rowEnd: Math.max(1, rows.length),
      columns: headers
    }
  }];
}

export function supportsNativeDocumentExtraction({ mimeType = '', name = '' } = {}) {
  const mime = String(mimeType || '').toLowerCase();
  const extension = extensionOf(name);
  return TEXT_MIME_TYPES.has(mime)
    || mime.includes('csv')
    || mime === 'application/pdf'
    || mime.includes('wordprocessingml.document')
    || mime.includes('spreadsheetml.sheet')
    || mime.includes('presentationml.presentation')
    || ['txt', 'md', 'markdown', 'json', 'csv', 'js', 'ts', 'jsx', 'tsx', 'css', 'html', 'xml', 'yaml', 'yml', 'py', 'java', 'c', 'cpp', 'h', 'sql', 'sh', 'ps1', 'pdf', 'docx', 'xlsx', 'pptx'].includes(extension);
}

export async function extractNativeDocument({
  mimeType = '',
  name = 'document',
  data,
  ocrPage = null,
  signal,
  resumeState = null,
  onCheckpoint = null
} = {}) {
  if (!data) throw new TypeError('Document extraction requires attachment bytes.');
  const mime = String(mimeType || '').toLowerCase();
  const extension = extensionOf(name);
  if (!supportsNativeDocumentExtraction({ mimeType, name })) {
    return { supported: false, name, mimeType, sections: [], warnings: ['unsupported-format'] };
  }
  const bytes = base64ToBytes(data);
  if (mime === 'application/pdf' || extension === 'pdf') {
    const { extractPdfDocument } = await import('./pdf-document-extractor.js');
    return extractPdfDocument({ bytes, name, ocrPage, signal, resumeState, onCheckpoint });
  }
  if (mime.includes('wordprocessingml.document') || extension === 'docx') {
    const { extractOfficeDocumentInWorker } = await import('./document-parser-worker-client.js');
    return extractOfficeDocumentInWorker({ kind: 'docx', bytes, name, signal });
  }
  if (mime.includes('spreadsheetml.sheet') || extension === 'xlsx') {
    const { extractOfficeDocumentInWorker } = await import('./document-parser-worker-client.js');
    return extractOfficeDocumentInWorker({ kind: 'xlsx', bytes, name, signal });
  }
  if (mime.includes('presentationml.presentation') || extension === 'pptx') {
    const { extractOfficeDocumentInWorker } = await import('./document-parser-worker-client.js');
    return extractOfficeDocumentInWorker({ kind: 'pptx', bytes, name, signal });
  }
  const text = normalizeNewlines(new TextDecoder('utf-8', { fatal: false }).decode(bytes));
  if (mime.includes('csv') || extension === 'csv') {
    return { supported: true, name, mimeType, method: 'csv-native', sections: csvSection(text), warnings: [] };
  }
  if (mime.includes('json') || extension === 'json') {
    try {
      JSON.parse(text);
      return { supported: true, name, mimeType, method: 'json-native', sections: textSections(text, 'code'), warnings: [] };
    } catch {
      return { supported: true, name, mimeType, method: 'json-native', sections: textSections(text, 'code'), warnings: ['invalid-json'] };
    }
  }
  return { supported: true, name, mimeType, method: 'text-native', sections: textSections(text), warnings: [] };
}
