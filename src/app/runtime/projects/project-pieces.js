// The passages of the files of the projects, as pieces for the vectors (memory-store/page-vectors.js; docs/superpowers/specs/2026-11-01-project-files-multimodal-design.md, R1): every source of
// every project that has a text (typed text, a text file, a PDF with a text layer, a Word, PowerPoint or Excel file) is cut into the same passages the search tool cuts it into
// (`projectPassages`), each with its id `src:<source>:<number>` and the hash of its text. The text of a file is read here the way the tools read it (project-files-access.js, loaded only when
// there is something to read). Page only.

import { projectPassages } from '../../../data/project-files-tool.js';
import { textHash } from '../memory-notes/vector-math.js';

/**
 * `getFolders()` gives the projects ([{ id, deletedAt, sources }]). `loadAccess()` resolves the module that knows how to read a source (project-files-access.js). Returns { pieces(), refresh() }:
 * `pieces()` is what the last `refresh()` made ([{ id, text, hash, kind: 'project', sourceId }]); a source that cannot be read now is left out (it is tried again at the next refresh).
 */
export function createProjectPieces({ getFolders, loadAccess = () => import('./project-files-access.js'), logger = console }) {
  let held = [];
  let refreshing = null;

  async function build() {
    const access = await loadAccess();
    const pieces = [];
    for (const folder of getFolders() || []) {
      if (!folder || folder.deletedAt) continue;
      const files = [];
      for (const source of Array.isArray(folder.sources) ? folder.sources : []) {
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
