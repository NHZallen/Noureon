// ffmpeg in the browser (ffmpeg.wasm), for the videos and recordings of a project (docs/superpowers/specs/2026-11-01-project-files-multimodal-design.md, R5): the same commands as the server's
// (src/data/project-media.js), run on a copy of the file in the memory of a worker. The program and its worker (about 30 MB of WebAssembly) are fetched the first time a video or a
// recording has to be cut, never at the start of the page: this module is itself loaded by a dynamic import. One command runs at a time (the library has one instance). Page only.

import { FFmpeg } from '@ffmpeg/ffmpeg';
import coreURL from '@ffmpeg/core?url';
import wasmURL from '@ffmpeg/core/wasm?url';
import { createMediaToolbox, IN, OUT } from '../../../data/project-media.js';

export const WASM_RUN_MS = 120_000;
const LOG_CHARS = 20_000;

let instance = null;
let loading = null;
let tail = Promise.resolve();
let log = '';

async function engine() {
  if (instance) return instance;
  loading ||= (async () => {
    const ffmpeg = new FFmpeg();
    ffmpeg.on('log', ({ message }) => { if (log.length < LOG_CHARS) log += `${message}\n`; });
    await ffmpeg.load({ coreURL, wasmURL });
    instance = ffmpeg;
    return ffmpeg;
  })().catch((error) => { loading = null; throw error; });
  return loading;
}

/** Runs `job(ffmpeg)` after the ones before it (one command at a time). */
const alone = (job) => {
  const result = tail.then(async () => job(await engine()));
  tail = result.catch(() => {});
  return result;
};

/** The toolbox of the page (see createMediaToolbox): `open` copies the file into the worker; `close` removes the copy. */
export const mediaToolbox = createMediaToolbox({
  async open({ data, extension }) {
    const input = `in-${Math.random().toString(36).slice(2, 10)}.${extension}`;
    await alone((ffmpeg) => ffmpeg.writeFile(input, data));
    let counter = 0;
    return {
      run: (args, { output } = {}) => alone(async (ffmpeg) => {
        log = '';
        const file = output ? `${input}-${(counter += 1)}-${output}` : null;
        const filled = args.map((part) => (part === IN ? input : part === OUT ? file : part));
        if (!file) filled.push('-f', 'null', '-t', '0', '-');
        let code = 1;
        const began = Date.now();
        let broken = false;
        try {
          code = await ffmpeg.exec(filled, WASM_RUN_MS);
        } catch {
          broken = true;
        }
        // A command that ran out of time (or broke) leaves the worker in an unknown state: it is made again the next time.
        if (broken || Date.now() - began >= WASM_RUN_MS - 1000) { try { ffmpeg.terminate(); } catch { /* Gone already. */ } instance = null; loading = null; }
        let bytes = null;
        if (file && code === 0) {
          try { bytes = await ffmpeg.readFile(file); } catch { bytes = null; }
          try { await ffmpeg.deleteFile(file); } catch { /* Not there. */ }
        }
        return { ok: file ? code === 0 : true, log, data: bytes instanceof Uint8Array ? bytes : null };
      }),
      close: () => alone(async (ffmpeg) => { try { await ffmpeg.deleteFile(input); } catch { /* Gone already. */ } }).catch(() => {})
    };
  }
});
