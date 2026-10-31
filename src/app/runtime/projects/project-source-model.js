// The sources of a project (docs/superpowers/specs/2026-10-31-projects-design.md, §13): texts that are typed and files whose text was read. A source is { id, kind, title, mime, size, text,
// [file], addedAt } (`kind`: a typed text, a file whose text was read, or a picture; `file` is the original kept for a picture or a scan, given to a model that can see it); the list is a column of the folder, so it is synced with it. Pure: no window, no document, no browser storage (the sync and the server may use it).

export const PROJECT_SOURCES_MAX = 20;
/** The most characters of one source, and of all the sources of a project; and the most bytes of one kept original, and of all of them in a project. */
export const PROJECT_SOURCE_CHARS_MAX = 100_000;
export const PROJECT_SOURCES_CHARS_MAX = 400_000;
export const PROJECT_SOURCE_TITLE_MAX = 120;
export const PROJECT_SOURCE_FILE_BYTES_MAX = 20 * 1024 * 1024;
export const PROJECT_SOURCE_FILES_BYTES_MAX = 100 * 1024 * 1024;

const KINDS = new Set(['text', 'file', 'image']);

/** The original of a source kept as a file (a picture, a scan): its name, type, size, the hash of its bytes (the key where it is kept on this device) and, once it is in the cloud, where. */
export function normalizeSourceFile(value) {
  if (!value || typeof value !== 'object') return null;
  const hash = String(value.hash ?? '').trim();
  const mimeType = String(value.mimeType ?? '').slice(0, 120);
  if (!hash || !mimeType) return null;
  const size = Number.isFinite(Number(value.size)) && Number(value.size) >= 0 ? Math.floor(Number(value.size)) : 0;
  const file = { name: String(value.name ?? '').slice(0, 200), mimeType, size, hash: hash.slice(0, 80) };
  // The place in the cloud storage (a marker of src/app/sync/cloud-assets.js: a small object, not the bytes).
  if (value.asset && typeof value.asset === 'object' && !Array.isArray(value.asset)) file.asset = value.asset;
  return file;
}

/** One source in its fixed shape (so two pages that write it write the same), or null when it is not one: it has a text, or a file that is given to a model that sees. */
export function normalizeSource(value) {
  if (!value || typeof value !== 'object') return null;
  const id = String(value.id ?? '').trim();
  const text = typeof value.text === 'string' ? value.text.slice(0, PROJECT_SOURCE_CHARS_MAX) : '';
  const file = normalizeSourceFile(value.file);
  if (!id || (!text.trim() && !file)) return null;
  const kind = KINDS.has(value.kind) ? value.kind : 'text';
  const size = Number.isFinite(Number(value.size)) && Number(value.size) >= 0 ? Math.floor(Number(value.size)) : (file?.size || text.length);
  return {
    id: id.slice(0, 80),
    kind,
    title: String(value.title ?? '').replace(/\s+/g, ' ').trim().slice(0, PROJECT_SOURCE_TITLE_MAX),
    mime: String(value.mime ?? '').slice(0, 120),
    size,
    text: text.trim() ? text : '',
    ...(file ? { file } : {}),
    addedAt: typeof value.addedAt === 'string' ? value.addedAt : ''
  };
}

/** The list of sources of a folder: only valid ones, at most 20, and no more than the total of characters (the rest is left out). */
export function normalizeSources(list) {
  const out = [];
  let total = 0;
  for (const item of Array.isArray(list) ? list : []) {
    const source = normalizeSource(item);
    if (!source || out.some((entry) => entry.id === source.id)) continue;
    if (out.length >= PROJECT_SOURCES_MAX || total + source.text.length > PROJECT_SOURCES_CHARS_MAX) continue;
    total += source.text.length;
    out.push(source);
  }
  return out;
}

export const sourcesCharsOf = (list) => (Array.isArray(list) ? list : []).reduce((sum, source) => sum + String(source?.text || '').length, 0);

/** The bytes of the originals a project keeps. */
export const sourceFilesBytesOf = (list) => (Array.isArray(list) ? list : []).reduce((sum, source) => sum + (Number(source?.file?.size) || 0), 0);
