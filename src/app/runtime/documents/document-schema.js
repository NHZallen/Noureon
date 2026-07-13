export const DOCUMENT_EXTRACTION_VERSION = 1;
export const DOCUMENT_INDEX_SCHEMA_VERSION = 1;

export const DOCUMENT_INDEX_STATUSES = Object.freeze([
  'pending',
  'extracting',
  'chunking',
  'embedding',
  'ready',
  'failed',
  'stale',
  'deleting'
]);

const asObject = value => value && typeof value === 'object' && !Array.isArray(value)
  ? value
  : {};

export function canonicalJSONStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(item => canonicalJSONStringify(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.keys(value)
      .sort()
      .filter(key => value[key] !== undefined)
      .map(key => `${JSON.stringify(key)}:${canonicalJSONStringify(value[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}
export async function sha256Hex(value, cryptoProvider = globalThis.crypto) {
  if (!cryptoProvider?.subtle) throw new Error('Web Crypto is required for document hashing.');
  const bytes = value instanceof Uint8Array
    ? value
    : value instanceof ArrayBuffer
      ? new Uint8Array(value)
      : new TextEncoder().encode(String(value ?? ''));
  const digest = await cryptoProvider.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function normalizeSourceLocator(locator = {}) {
  const source = asObject(locator);
  return Object.fromEntries(Object.entries(source)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([left], [right]) => left.localeCompare(right)));
}

export function formatSourceLocator(name, locator = {}) {
  const source = normalizeSourceLocator(locator);
  const filename = String(name || 'document');
  if (source.type === 'pdf') return `${filename}, page ${source.page}`;
  if (source.type === 'docx') {
    const heading = source.heading ? `, ${source.heading}` : '';
    const paragraphs = source.paragraphStart
      ? `, paragraphs ${source.paragraphStart}${source.paragraphEnd && source.paragraphEnd !== source.paragraphStart ? `-${source.paragraphEnd}` : ''}`
      : '';
    return `${filename}${heading}${paragraphs}`;
  }
  if (source.type === 'xlsx') return `${filename}, ${source.sheet || 'Sheet1'}!${source.range || '?'}`;
  if (source.type === 'pptx') return `${filename}, slide ${source.slide}${source.element ? `, ${source.element}` : ''}`;
  if (source.type === 'csv') {
    const rows = source.rowStart
      ? `rows ${source.rowStart}${source.rowEnd && source.rowEnd !== source.rowStart ? `-${source.rowEnd}` : ''}`
      : 'rows unknown';
    const columns = Array.isArray(source.columns) && source.columns.length
      ? `, columns: ${source.columns.join(', ')}`
      : '';
    return `${filename}, ${rows}${columns}`;
  }
  const lines = source.lineStart
    ? `, lines ${source.lineStart}${source.lineEnd && source.lineEnd !== source.lineStart ? `-${source.lineEnd}` : ''}`
    : '';
  return `${filename}${lines}`;
}

export async function createStableChunkId({
  documentHash,
  extractionVersion = DOCUMENT_EXTRACTION_VERSION,
  sourceLocator,
  contentHash
}, cryptoProvider = globalThis.crypto) {
  return sha256Hex(
    `${documentHash}${extractionVersion}${canonicalJSONStringify(normalizeSourceLocator(sourceLocator))}${contentHash}`,
    cryptoProvider
  );
}

export function createDocumentStorageKey({ userId, documentHash, extractionVersion = DOCUMENT_EXTRACTION_VERSION }) {
  if (!userId || !documentHash) throw new TypeError('Document storage keys require userId and documentHash.');
  return `${encodeURIComponent(String(userId))}:${documentHash}:v${extractionVersion}`;
}
