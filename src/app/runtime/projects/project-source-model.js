// The sources of a project (docs/superpowers/specs/2026-10-31-projects-design.md, §13): texts that are typed and files whose text was read. A source is { id, kind, title, mime, size, text,
// addedAt }; the list is a column of the folder, so it is synced with it. Pure: no window, no document, no browser storage (the sync and the server may use it).

export const PROJECT_SOURCES_MAX = 20;
/** The most characters of one source, and of all the sources of a project. */
export const PROJECT_SOURCE_CHARS_MAX = 100_000;
export const PROJECT_SOURCES_CHARS_MAX = 400_000;
export const PROJECT_SOURCE_TITLE_MAX = 120;

const KINDS = new Set(['text', 'file']);

/** One source in its fixed shape (so two pages that write it write the same), or null when it is not one. */
export function normalizeSource(value) {
  if (!value || typeof value !== 'object') return null;
  const id = String(value.id ?? '').trim();
  const text = typeof value.text === 'string' ? value.text.slice(0, PROJECT_SOURCE_CHARS_MAX) : '';
  if (!id || !text.trim()) return null;
  const kind = KINDS.has(value.kind) ? value.kind : 'text';
  const size = Number.isFinite(Number(value.size)) && Number(value.size) >= 0 ? Math.floor(Number(value.size)) : text.length;
  return {
    id: id.slice(0, 80),
    kind,
    title: String(value.title ?? '').replace(/\s+/g, ' ').trim().slice(0, PROJECT_SOURCE_TITLE_MAX),
    mime: String(value.mime ?? '').slice(0, 120),
    size,
    text,
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
