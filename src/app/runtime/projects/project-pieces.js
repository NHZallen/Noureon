// The passages of the files of the projects, as pieces for the vectors (memory-store/page-vectors.js; docs/superpowers/specs/2026-11-01-project-files-multimodal-design.md, R1): every source of
// every project that has a text (typed text, a text file, a PDF with a text layer, a Word, PowerPoint or Excel file) is cut into the same passages the search tool cuts it into
// (`projectPassages`), each with its id `src:<source>:<number>` and the hash of its text. The text of a file is read here the way the tools read it (project-files-access.js, loaded only when
// there is something to read). Page only.

import { ensureConversationsLoaded } from '../kernel/on-demand-loading.js';
import { mediaKindOfMime } from '../../../data/project-media.js';

import { mediaPieceHash, projectPassages } from '../../../data/project-files-tool.js';
import { CHAT_VIDEO_PREFIX, pieceIdOf } from '../../../data/project-piece-id.js';
import { textHash } from '../memory-notes/vector-math.js';
import { PROJECT_SOURCE_FILE_BYTES_MAX, transcriptSourcesOf } from './project-source-model.js';
import { makeEmbedThumbnail } from './project-picture-thumb.js';
import { createMediaSources } from './project-media-source.js';
import { getProjectFileStore } from './project-source-files.js';

/** The biggest picture that is made into vectors: the biggest file a project holds. (It is sent as a small copy, so its size is no obstacle; a source cannot be bigger anyway.) */
export const PROJECT_MEDIA_EMBED_BYTES_MAX = PROJECT_SOURCE_FILE_BYTES_MAX;

/** Whether a source is a picture the vectors take (a raster picture with a kept file), and whether it is small enough. */
export const pictureOf = (source) => {
  const mime = String(source?.file?.mimeType || '').toLowerCase();
  if (!source?.file?.hash || !mime.startsWith('image/') || mime.includes('svg')) return null;
  return { tooBig: (Number(source.file.size) || 0) > PROJECT_MEDIA_EMBED_BYTES_MAX };
};

/** 'video' or 'audio' for a source that is a kept video or recording of a size the vectors take, else ''. (A scanned PDF is found by reading it.) */
export const timedMediaOf = (source) => {
  const kind = mediaKindOfMime(source?.file?.mimeType);
  return source?.file?.hash && (kind === 'video' || kind === 'audio') && (Number(source.file.size) || 0) <= PROJECT_MEDIA_EMBED_BYTES_MAX ? kind : '';
};

/**
 * `getFolders()` gives the projects ([{ id, deletedAt, sources }]); `getConversations()` the conversations, whose videos (attached to a message and already measured by chat-video.js: `part.mediaInfo`)
 * are cut into windows like the videos of a project, under the id `att-<hash>` that the tool gives them. `loadAccess()` resolves the module that knows how to read a source (project-files-access.js). Returns { pieces(), refresh() }:
 * `pieces()` is what the last `refresh()` made ([{ id, text, hash, kind: 'project', sourceId }]); a source that cannot be read now is left out (it is tried again at the next refresh).
 */
/** The videos attached to messages that have been measured, as sources the windows are cut from: [{ source, data (base64) }], once for each file. */
export function chatVideoSourcesOf(conversations) {
  const found = new Map();
  for (const conversation of conversations || []) {
    if (!conversation?.id || conversation.deletedAt || conversation.isTemporary || conversation.retentionMode === 'ephemeral') continue;
    for (const message of conversation.messages || []) {
      if (message?.role !== 'user') continue;
      for (const part of Array.isArray(message.parts) ? message.parts : []) {
        const inline = part?.inlineData;
        const hash = part?.mediaInfo?.hash;
        if (!inline || typeof inline.data !== 'string' || !inline.data || !hash || !(part.mediaInfo.duration > 0) || mediaKindOfMime(inline.mimeType) !== 'video') continue;
        const size = Math.floor(inline.data.length * 0.75);
        const id = `${CHAT_VIDEO_PREFIX}${hash.slice(0, 16)}`;
        if (size > PROJECT_MEDIA_EMBED_BYTES_MAX || found.has(id)) continue;
        const name = String(inline.name || 'video').replace(/\s+/g, ' ').trim().slice(0, 120) || 'video';
        found.set(id, { source: { id, title: name, file: { hash, name, mimeType: inline.mimeType, size } }, data: inline.data });
      }
    }
  }
  return [...found.values()];
}

export function createProjectPieces({ getFolders, getConversations = () => [], loadAccess = () => import('./project-files-access.js'), makeThumb = makeEmbedThumbnail, media = null, chatMedia = null, logger = console }) {
  const sources = media || createMediaSources({ logger });
  // The videos of the messages are read from the messages themselves (not from the kept files of a project): by the hash of the file.
  const attached = new Map();
  const chatSources = chatMedia || createMediaSources({ getStore: () => ({ load: async (file) => (attached.has(file.hash) ? { data: attached.get(file.hash), mimeType: file.mimeType } : null) }), logger });
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
        // A video or a recording: windows (found with ffmpeg the first time, when the person turned the vectors on).
        const timed = timedMediaOf(source);
        if (timed) { pieces.push(...await sources.piecesFor(source, timed)); continue; }
        const textKind = access.searchableKindOf(source);
        if (!textKind) continue;
        try {
          const text = await access.sourceTextOf(source);
          if (String(text || '').trim()) files.push({ id: source.id, name: source.title || source.file?.name || '', text });
          // A PDF with no text layer is a scan: a picture for each page.
          else if (textKind === 'pdf' && source.file?.hash && (Number(source.file.size) || 0) <= PROJECT_MEDIA_EMBED_BYTES_MAX) pieces.push(...await sources.piecesFor(source, 'scan'));
        } catch (error) {
          logger.warn?.('A file of a project could not be read for the vectors.', error?.message || error);
        }
      }
      // The transcripts of the videos and recordings are texts of their own (project-source-model.js): passages like any file's.
      for (const source of transcriptSourcesOf(folder.sources)) files.push({ id: source.id, name: source.title, text: source.text });
      for (const passage of projectPassages(files)) pieces.push({ id: passage.id, text: passage.text, hash: textHash(passage.text), kind: 'project', sourceId: passage.file.id });
    }
    // The videos attached to the messages (at most one request's worth of windows each, like a video of a project).
    attached.clear();
    // A conversation kept only as a stub says in its flags whether it has a video; those are brought in (one at a time would do, they are let go of again after).
    await ensureConversationsLoaded((getConversations() || []).filter((conversation) => conversation?.__stub && conversation.__flags?.video).map((conversation) => conversation.id)).catch((error) => logger.warn?.('The conversations with videos could not be read.', error));
    for (const { source, data } of chatVideoSourcesOf(getConversations())) {
      attached.set(source.file.hash, data);
      try { pieces.push(...await chatSources.piecesFor(source, 'video')); } catch (error) { logger.warn?.('A video of a message could not be cut for the vectors.', error?.message || error); }
    }
    held = pieces;
    return held;
  }

  return {
    pieces: () => held,
    /** 'pending' or 'failed' for a video, a recording or a scan that has no pieces (yet), else ''. */
    stateOf: (sourceId) => sources.stateOf(sourceId) || chatSources.stateOf(sourceId),
    /** Lets go of the file that was kept open for the cuts. */
    release: async () => { await sources.release(); await chatSources.release(); attached.clear(); },
    /** Reads the sources again (one run at a time; a call while one runs waits for it). */
    refresh() {
      refreshing ||= build().finally(() => { refreshing = null; });
      return refreshing;
    }
  };
}
