// The words said in the videos and recordings of the projects (docs/superpowers/specs/2026-11-02-chat-video-audio-design.md, §9): when speech to text is on, each video and recording a project keeps gets
// its transcript, one at a time in the background, and it is kept with the source (`source.transcript`, synced with the project). The files tools then search and read it like any text, and its lines
// `[m:ss] words` tell the model where to look in the video. A file that gave nothing (an error) is not tried again until the page is opened again. Page only.

import { timedMediaOf } from './project-pieces.js';

/**
 * `getFolders()` the projects; `getTranscription()` the speech to text of the page (runtime/transcription/page-transcription.js); `getStore()` the kept files; `setTranscript(projectId, sourceId, transcript)`
 * keeps the result. Returns { run() }: it resolves when everything that could be done was done; a call while one runs asks for another round after it.
 */
export function createProjectTranscripts({ getFolders, getTranscription, getStore, setTranscript, logger = console }) {
  const failed = new Set();
  let running = null;
  let again = false;
  let watching = null;

  const pending = () => {
    const out = [];
    for (const folder of getFolders() || []) {
      if (!folder || folder.deletedAt) continue;
      for (const source of Array.isArray(folder.sources) ? folder.sources : []) {
        if (timedMediaOf(source) && !source.transcript && !failed.has(source.file.hash)) out.push({ folderId: folder.id, source });
      }
    }
    return out;
  };

  async function round() {
    const transcription = getTranscription();
    // Turning speech to text on later starts the work then.
    if (transcription && watching !== transcription) { watching = transcription; transcription.subscribeSettings?.(() => { if (transcription.isEnabled()) void run(); }); }
    if (!transcription?.isEnabled()) return;
    for (const { folderId, source } of pending()) {
      if (!transcription.isEnabled()) return;
      try {
        const loaded = await getStore()?.load(source.file);
        if (!loaded) continue;
        const part = { inlineData: { mimeType: loaded.mimeType || source.file.mimeType, name: source.file.name || source.title || '', data: loaded.data } };
        if (!transcription.needs(part)) { failed.add(source.file.hash); continue; }
        await transcription.ensureParts([part]);
        if (part.transcript) await setTranscript(folderId, source.id, part.transcript);
        else failed.add(source.file.hash);
      } catch (error) {
        failed.add(source.file.hash);
        logger.warn?.('A video or a recording of a project could not be turned into text.', error?.message || error);
      }
    }
  }

  function run() {
    if (running) { again = true; return running; }
    running = (async () => {
      do {
        again = false;
        await round();
      } while (again);
    })().finally(() => { running = null; });
    return running;
  }

  return { run };
}
