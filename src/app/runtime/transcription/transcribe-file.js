// A recording, or the sound of a video, turned into a transcript with times (docs/superpowers/specs/2026-11-02-chat-video-audio-design.md, §3): the file is cut into pieces of a minute that do not
// overlap (the same 16 kHz mono WAV the vectors use), each is sent to the speech model, and the words are put together as lines `[12:30] words`, so that the model can tell where in the file
// something is said (and look at that second of a video with view_project_file). Pieces go three at a time. A piece that fails is left out, not the whole file; when none could be made the
// error is thrown. Page only: the cutting tool and the speech model are given.

import { AUDIO_WINDOW, formatTime } from '../../../data/project-media.js';

export const TRANSCRIPT = Object.freeze({ pieceSeconds: AUDIO_WINDOW.length, maxSeconds: 3600, parallel: 3 });
/** The most characters a transcript keeps (a source of a project keeps 100 000). */
export const TRANSCRIPT_CHARS_MAX = 100_000;

/** The seconds the pieces of a file that lasts `duration` start at. */
export const pieceStarts = (duration, { seconds = TRANSCRIPT.pieceSeconds, max = TRANSCRIPT.maxSeconds } = {}) => {
  const total = Math.min(Math.max(0, Number(duration) || 0), max);
  const out = [];
  for (let start = 0; start < total; start += seconds) out.push(start);
  return out;
};

/** The lines of a transcript: `[m:ss] words` for each piece that has words. */
export const transcriptLines = (pieces) => pieces.filter((piece) => piece.text).map((piece) => `[${formatTime(piece.start)}] ${piece.text}`).join('\n').slice(0, TRANSCRIPT_CHARS_MAX);

/**
 * `media` is what the toolbox opened (`audioWindow(start)`, `probe()`); `transcriber` is createTranscriber(...). Resolves { text (the lines), model, seconds (what was covered), failed (pieces left out) } or
 * { text: '' } when the file has no sound. `onProgress({ done, total })` is told after each piece.
 */
export async function transcribeMedia({ media, transcriber, duration = 0, language = '', signal, onProgress = () => {} }) {
  const probed = await media.probe();
  if (!probed.hasAudio) return { text: '', model: transcriber.model, seconds: 0, failed: 0 };
  const starts = pieceStarts(duration || probed.duration);
  const pieces = new Array(starts.length);
  let next = 0;
  let done = 0;
  let failed = 0;
  let lastError = null;
  const worker = async () => {
    while (next < starts.length && !signal?.aborted) {
      const index = next;
      next += 1;
      try {
        const cut = await media.audioWindow(starts[index]);
        const text = cut ? await transcriber.transcribe({ mimeType: cut.mimeType, data: cut.data }, { signal, language }) : '';
        pieces[index] = { start: starts[index], text };
      } catch (error) {
        if (signal?.aborted || error?.name === 'AbortError') throw error;
        failed += 1;
        lastError = error;
        pieces[index] = { start: starts[index], text: '' };
        // A key that is refused or a plan that is used up will not work for the rest: stop at once.
        if (error?.status === 401 || error?.status === 403 || error?.status === 402) throw error;
      }
      done += 1;
      onProgress({ done, total: starts.length });
    }
  };
  await Promise.all(Array.from({ length: Math.min(TRANSCRIPT.parallel, starts.length) }, worker));
  const text = transcriptLines(pieces.filter(Boolean));
  if (!text && failed && lastError) throw lastError;
  return { text, model: transcriber.model, seconds: Math.min(starts.length * TRANSCRIPT.pieceSeconds, TRANSCRIPT.maxSeconds), failed };
}
