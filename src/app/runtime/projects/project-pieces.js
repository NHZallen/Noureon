// The passages of the files of the projects, as pieces for the vectors (memory-store/page-vectors.js; docs/superpowers/specs/2026-11-01-project-files-multimodal-design.md, R1): every source of
// every project that has a text (typed text, a text file, a PDF with a text layer, a Word, PowerPoint or Excel file) is cut into the same passages the search tool cuts it into
// (`projectPassages`), each with its id `src:<source>:<number>` and the hash of its text. The text of a file is read here the way the tools read it (project-files-access.js, loaded only when
// there is something to read). Page only.

import { mediaPieceHash, projectPassages } from '../../../data/project-files-tool.js';
import { pieceIdOf } from '../../../data/project-piece-id.js';
import { textHash } from '../memory-notes/vector-math.js';
import { PROJECT_SOURCE_FILE_BYTES_MAX } from './project-source-model.js';
import { makeEmbedThumbnail } from './project-picture-thumb.js';
import { getProjectFileStore } from './project-source-files.js';

/** The biggest picture that is made into vectors: the biggest file a project holds. (It is sent as a small copy, so its size is no obstacle; a source cannot be bigger anyway.) */
export const PROJECT_MEDIA_EMBED_BYTES_MAX = PROJECT_SOURCE_FILE_BYTES_MAX;

/** Whether a source is a picture the vectors take (a raster picture with a kept file), and whether it is small enough. */
export const pictureOf = (source) => {
  const mime = String(source?.file?.mimeType || '').toLowerCase();
  if (!source?.file?.hash || !mime.startsWith('image/') || mime.includes('svg')) return null;
  return { tooBig: (Number(source.file.size) || 0) > PROJECT_MEDIA_EMBED_BYTES_MAX };
};

/**
 * `getFolders()` gives the projects ([{ id, deletedAt, sources }]). `loadAccess()` resolves the module that knows how to read a source (project-files-access.js). Returns { pieces(), refresh() }:
 * `pieces()` is what the last `refresh()` made ([{ id, text, hash, kind: 'project', sourceId }]); a source that cannot be read now is left out (it is tried again at the next refresh).
 */
export function createProjectPieces({ getFolders, loadAccess = () => import('./project-files-access.js'), makeThumb = makeEmbedThumbnail, logger = console }) {
  let held = [];
  let refreshing = null;

  async function build() {
    const access = await loadAccess();
    const pieces = [];
    for (const folder of getFolders() || []) {
      if (!folder || folder.deletedAt) continue;
      const files = [];
      for (const source of Array.isArray(folder.sources) ? folder.sources : []) {
        // A picture is one piece (id `src:<source>:0`), made from the file itself: its bytes are read from the kept file when it is its turn (not all held here).
        const picture = pictureOf(source);
        if (picture && !picture.tooBig) {
          const name = String(source.file.name || source.title || '').replace(/\s+/g, ' ').trim().slice(0, 120);
          pieces.push({
            id: pieceIdOf(source.id, 0), text: `[image] ${name}`, hash: mediaPieceHash(source.file.hash), kind: 'project', sourceId: source.id,
            // The file is read and made small now (a copy of at most 1024 on the longest side); one that cannot be made small and cannot be sent as it is is marked: `unreadable`.
            loadMedia: async () => {
              try {
                const loaded = await getProjectFileStore()?.load(source.file);
                if (!loaded) return null;
                const small = await makeThumb({ mimeType: loaded.mimeType || source.file.mimeType, data: loaded.data });
                return small ? { mimeType: small.mimeType, data: small.data, kind: 'image' } : { unreadable: true };
              } catch { return null; }
            }
          });
          continue;
        }
        if (!access.searchableKindOf(source)) continue;
        try {
          const text = await access.sourceTextOf(source);
          if (String(text || '').trim()) files.push({ id: source.id, name: source.title || source.file?.name || '', text });
        } catch (error) {
          logger.warn?.('A file of a project could not be read for the vectors.', error?.message || error);
        }
      }
      for (const passage of projectPassages(files)) pieces.push({ id: passage.id, text: passage.text, hash: textHash(passage.text), kind: 'project', sourceId: passage.file.id });
    }
    held = pieces;
    return held;
  }

  return {
    pieces: () => held,
    /** Reads the sources again (one run at a time; a call while one runs waits for it). */
    refresh() {
      refreshing ||= build().finally(() => { refreshing = null; });
      return refreshing;
    }
  };
}
