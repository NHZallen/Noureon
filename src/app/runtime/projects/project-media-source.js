// The videos, recordings and scanned PDFs of the projects as pieces for the vectors (docs/superpowers/specs/2026-11-01-project-files-multimodal-design.md, R6 to R8): a video becomes windows of 30
// seconds (and its sound windows of 60), a recording windows of 60, a scanned PDF one picture for each page (at most 200). How long a file is (or how many pages) is found the first time with ffmpeg
// (ffmpeg.wasm, loaded then: about 30 MB, never at the start) or pdf.js, and remembered by the hash of the file. A piece is cut only when its turn comes (loadMedia), from one open copy of the file
// that is kept for the pieces that follow. Nothing here runs unless the person turned the vectors on. Page only.

import { audioSuffix, audioWindows, formatTime, mediaPieceHash, pageSuffix, SCAN_PAGES_MAX, videoSuffix, videoWindows } from '../../../data/project-media.js';
import { pieceIdOf } from '../../../data/project-piece-id.js';
import { getProjectFileStore } from './project-source-files.js';

const INFO_KEY = 'noureon.projectMedia.info.v1';
const INFO_MAX = 400;

export const fromBase64 = (data) => Uint8Array.from(atob(data), (character) => character.charCodeAt(0));
export function bytesToBase64(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

/** What was found about files, by their hash: { d: seconds, v: has a picture, a: has a sound, n: pages, f: cannot be read }. Kept in the browser (a short list). */
export function createMediaInfoStore({ storage = () => globalThis.localStorage } = {}) {
  let table = null;
  const load = () => {
    if (table) return table;
    try { table = JSON.parse(storage()?.getItem(INFO_KEY) || '{}') || {}; } catch { table = {}; }
    return table;
  };
  return {
    get: (hash) => load()[hash] || null,
    set(hash, info) {
      const all = load();
      delete all[hash];
      all[hash] = info;
      for (const key of Object.keys(all).slice(0, Math.max(0, Object.keys(all).length - INFO_MAX))) delete all[key];
      try { storage()?.setItem(INFO_KEY, JSON.stringify(all)); } catch { /* The next time it is found again. */ }
    }
  };
}
export const sharedMediaInfo = createMediaInfoStore();

export const defaultToolbox = async () => (await import('./ffmpeg-wasm.js')).mediaToolbox;
export const defaultOpenPdf = async (bytes) => {
  const [{ openPdfPages }, { browserPdfCanvasFactory }, { loadPagePdfjs }] = await Promise.all([import('../../../data/project-pdf-page.js'), import('./project-pdf-canvas.js'), import('./project-pdfjs-page.js')]);
  return openPdfPages({ pdfjs: loadPagePdfjs(), bytes, canvasFactory: browserPdfCanvasFactory() });
};

/**
 * Returns { piecesFor(source, kind), stateOf(sourceId), release() }. `kind` is 'video', 'audio' or 'scan'. `piecesFor` resolves the pieces of the source ([] when its length is not known yet or it cannot be
 * read: `stateOf` then says 'pending' or 'failed'). Each piece has `loadMedia()`, which cuts it when its turn comes.
 */
export function createMediaSources({ getStore = getProjectFileStore, getToolbox = defaultToolbox, openPdf = defaultOpenPdf, info = sharedMediaInfo, logger = console } = {}) {
  const states = new Map();
  let open = null; // The one file kept open: { sourceId, kind, handle }.

  const closeOpen = async () => {
    const current = open;
    open = null;
    try { await current?.handle?.close?.(); } catch { /* Gone already. */ }
  };

  const bytesOf = async (source) => {
    const loaded = await getStore()?.load(source.file);
    return loaded ? fromBase64(loaded.data) : null;
  };

  // The open copy of a file (a video or a recording through ffmpeg, a scan through pdf.js); the one before is closed.
  async function handleFor(source, kind) {
    if (open?.sourceId === source.id && open.kind === kind) return open.handle;
    await closeOpen();
    const bytes = await bytesOf(source);
    if (!bytes) return null;
    const handle = kind === 'scan'
      ? await openPdf(bytes)
      : await (await getToolbox()).open({ data: bytes, name: source.file.name || source.title || '', mime: source.file.mimeType || '' });
    if (handle) open = { sourceId: source.id, kind, handle };
    return handle;
  }

  /** How long (or how many pages) a file is: from what was remembered, else by opening it. null: not known now (the file is not here, or the tool did not start). */
  async function infoOf(source, kind) {
    const known = info.get(source.file.hash);
    if (known) return known;
    try {
      const handle = await handleFor(source, kind === 'scan' ? 'scan' : 'media');
      if (!handle) return null;
      const found = kind === 'scan'
        ? { n: handle.pages }
        : await (async () => { const probed = await handle.probe(); return probed.duration > 0 ? { d: probed.duration, v: probed.hasVideo ? 1 : 0, a: probed.hasAudio ? 1 : 0 } : { f: 1 }; })();
      if (kind === 'scan' && !(found.n > 0)) found.f = 1;
      info.set(source.file.hash, found);
      return found;
    } catch (error) {
      logger.warn?.('A video, a recording or a scan of a project could not be opened for the vectors.', error?.message || error);
      states.set(source.id, 'failed');
      return null;
    }
  }

  const label = (source) => String(source.file?.name || source.title || '').replace(/\s+/g, ' ').trim().slice(0, 120);

  // The piece of one window or page: `cut` makes the file to send when its turn comes. A file that was read but gave nothing is marked (never tried again); one that could not be opened now is left.
  const pieceOf = (source, kindText, suffix, where, kind, cut) => ({
    id: pieceIdOf(source.id, suffix), text: `[${kindText}] ${label(source)} ${where}`, hash: mediaPieceHash(source.file.hash, suffix), kind: 'project', sourceId: source.id,
    loadMedia: async () => {
      try {
        const handle = await handleFor(source, kind === 'scan' ? 'scan' : 'media');
        if (!handle) return null;
        const made = await cut(handle);
        return made ? made : { unreadable: true };
      } catch (error) {
        logger.warn?.('A part of a file of a project could not be cut for the vectors.', error?.message || error);
        return null;
      }
    }
  });

  return {
    async piecesFor(source, kind) {
      states.delete(source.id);
      const found = await infoOf(source, kind);
      if (!found) { if (!states.has(source.id)) states.set(source.id, 'pending'); return []; }
      if (found.f) { states.set(source.id, 'failed'); return []; }
      const pieces = [];
      if (kind === 'scan') {
        for (let page = 1; page <= Math.min(found.n, SCAN_PAGES_MAX); page += 1) {
          pieces.push(pieceOf(source, 'scan', pageSuffix(page), `page ${page}`, 'scan', async (pdf) => {
            const drawn = await pdf.render(page);
            return { mimeType: drawn.mimeType, data: bytesToBase64(drawn.bytes), kind: 'image' };
          }));
        }
        return pieces;
      }
      if (kind === 'video' && found.v) {
        for (const window of videoWindows(found.d)) {
          pieces.push(pieceOf(source, 'video', videoSuffix(window.start), `${formatTime(window.start)}–${formatTime(window.end)}`, 'media', async (media) => {
            const made = await media.videoWindow(window.start);
            return made ? { mimeType: made.mimeType, data: bytesToBase64(made.data), kind: 'video' } : null;
          }));
        }
      }
      if (found.a) {
        for (const window of audioWindows(found.d)) {
          pieces.push(pieceOf(source, 'audio', audioSuffix(window.start), `${formatTime(window.start)}–${formatTime(window.end)}`, 'media', async (media) => {
            const made = await media.audioWindow(window.start);
            return made ? { mimeType: made.mimeType, data: bytesToBase64(made.data), kind: 'audio' } : null;
          }));
        }
      }
      if (!pieces.length) states.set(source.id, 'failed');
      return pieces;
    },
    /** 'pending' (not opened yet or not here), 'failed' (cannot be read), or '' for a source that has pieces or was not asked about. */
    stateOf: (sourceId) => states.get(sourceId) || '',
    /** Closes the file that was kept open. */
    release: closeOpen
  };
}
