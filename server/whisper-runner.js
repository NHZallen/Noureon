// Whisper on the server (docs/superpowers/specs/2026-11-02-chat-video-audio-design.md, §3): the same model the browser runs (`onnx-community/whisper-base`, quantized) run with onnxruntime for Node, so
// that a reply the server makes can turn a recording into text when the page is closed. The model is loaded by the first piece and let go after a while of nothing to do (it holds about 700 MB);
// one piece is done at a time (it uses the processor). The model files are in the image (Dockerfile, `server/whisper-download.mjs`) and fetched when they are not. The sound is not kept.

import { DEFAULT_WHISPER_SIZE, samplesOfWav, whisperLanguageOf, whisperModelOf } from '../src/app/runtime/transcription/whisper-audio.js';
import { isSilent, runGuardedWhisper } from '../src/app/runtime/transcription/speech-guards.js';

export const WHISPER_SERVER = Object.freeze({ idleMs: 10 * 60_000, cacheDir: process.env.WHISPER_CACHE_DIR || '/app/.whisper' });

/** Resolves `run({ mimeType, data (Uint8Array) }, { language, size: 'base' | 'small' }) -> text`; `release()` lets the model go now. `loadLibrary` and `now`/`setTimer` are given by the tests. */
export function createServerWhisper({ loadLibrary = () => import('@huggingface/transformers'), cacheDir = WHISPER_SERVER.cacheDir, idleMs = WHISPER_SERVER.idleMs, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let loading = null;
  let loadedSize = '';
  let timer = null;
  let tail = Promise.resolve();
  // One size is held at a time (each is hundreds of MB): another size replaces it.
  const load = (size) => {
    if (loading && loadedSize !== size) release();
    loadedSize = size;
    loading ||= (async () => {
      const library = await loadLibrary();
      library.env.cacheDir = cacheDir;
      return library.pipeline('automatic-speech-recognition', whisperModelOf(size), { dtype: 'q8', device: 'cpu' });
    })().catch((error) => { loading = null; throw error; });
    return loading;
  };
  const release = () => {
    clearTimer(timer);
    timer = null;
    const held = loading;
    loading = null;
    void held?.then((pipe) => pipe?.dispose?.()).catch(() => {});
  };
  const run = ({ data }, { language = '', size = DEFAULT_WHISPER_SIZE } = {}) => {
    const job = tail.then(async () => {
      clearTimer(timer);
      const { samples } = samplesOfWav(data);
      // A silent piece does not even load the model.
      if (isSilent(samples)) { timer = setTimer(release, idleMs); timer.unref?.(); return ''; }
      const pipe = await load(size);
      try {
        return await runGuardedWhisper(pipe, samples, { chunk_length_s: 30, task: 'transcribe', return_timestamps: false, ...(whisperLanguageOf(language) ? { language: whisperLanguageOf(language) } : {}) });
      } finally {
        timer = setTimer(release, idleMs);
        timer.unref?.();
      }
    });
    tail = job.catch(() => {});
    return job;
  };
  run.release = release;
  return run;
}
