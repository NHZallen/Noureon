// Whisper run in this browser (docs/superpowers/specs/2026-11-02-chat-video-audio-design.md, §3): nothing of the sound leaves the device. The model (`onnx-community/whisper-base`, about 80 MB
// quantized) is fetched from Hugging Face the first time and kept by the browser; the library and its WebAssembly (about 10 MB) come from this site and are loaded only when the person picks
// this way of turning speech into text. It runs on the CPU in one thread (a page that is not isolated across origins has no shared memory for more). Page only.

import { samplesOfWav, whisperLanguageOf, WHISPER_MODEL } from './whisper-audio.js';

export { samplesOfWav, whisperLanguageOf, WHISPER_MODEL };

/** `onProgress({ status, file, progress })` is told while the model is fetched. Resolves `run({ mimeType, data }, { language }) -> text`; the model is loaded by the first call. */
export function createWhisperRunner({ onProgress = () => {}, loadLibrary = () => import('@huggingface/transformers'), loadAssets = () => import('./whisper-assets.js') } = {}) {
  let loading = null;
  const load = () => {
    loading ||= (async () => {
      const [library, assets] = await Promise.all([loadLibrary(), loadAssets()]);
      library.env.allowLocalModels = false;
      library.env.backends.onnx.wasm.numThreads = 1;
      library.env.backends.onnx.wasm.wasmPaths = { mjs: assets.ortMjs, wasm: assets.ortWasm };
      return library.pipeline('automatic-speech-recognition', WHISPER_MODEL, { dtype: 'q8', device: 'wasm', progress_callback: onProgress });
    })().catch((error) => { loading = null; throw error; });
    return loading;
  };
  return async ({ data }, { language = '' } = {}) => {
    const { samples } = samplesOfWav(data);
    const pipe = await load();
    const out = await pipe(samples, { chunk_length_s: 30, task: 'transcribe', return_timestamps: false, ...(whisperLanguageOf(language) ? { language: whisperLanguageOf(language) } : {}) });
    return String(Array.isArray(out) ? out.map((item) => item.text).join(' ') : out?.text || '');
  };
}
