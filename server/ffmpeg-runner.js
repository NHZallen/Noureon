// ffmpeg on the server, for the videos, recordings and scans of a project (docs/superpowers/specs/2026-11-01-project-files-multimodal-design.md, R5): the program `ffmpeg` of the image
// is run on a file written to a folder of its own (removed at the end), with a time limit, and at most a few at a time. It is the `open` that `createMediaToolbox`
// (src/data/project-media.js) is given: the same commands run in the browser with ffmpeg.wasm. Without the program (a machine that has none) `open` throws and the callers go on without.

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMediaToolbox, IN, OUT } from '../src/data/project-media.js';

export const FFMPEG_LIMITS = Object.freeze({ runMs: 60_000, parallel: 2, logChars: 20_000 });

let running = 0;
const waiting = [];
const acquire = () => new Promise((resolve) => {
  if (running < FFMPEG_LIMITS.parallel) { running += 1; resolve(); } else waiting.push(resolve);
});
const release = () => {
  const next = waiting.shift();
  if (next) next(); else running -= 1;
};

/** Runs the program with `args`; resolves { code, log }. Never rejects for a program that fails (code != 0); rejects when it cannot be started. */
function spawnFfmpeg(binary, args, { signal, runMs }) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let log = '';
    child.stderr.on('data', (chunk) => { if (log.length < FFMPEG_LIMITS.logChars) log += chunk.toString('utf8'); });
    const stop = () => child.kill('SIGKILL');
    const timer = setTimeout(stop, runMs);
    signal?.addEventListener('abort', stop, { once: true });
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('close', (code) => { clearTimeout(timer); signal?.removeEventListener('abort', stop); resolve({ code, log }); });
  });
}

/** The toolbox of the server: `toolbox.open({ data, name, mime })` (see createMediaToolbox). `binary` is the program (the one in PATH by default). */
export function createServerMediaToolbox({ binary = process.env.FFMPEG_PATH || 'ffmpeg', signal, runMs = FFMPEG_LIMITS.runMs } = {}) {
  return createMediaToolbox({
    async open({ data, extension }) {
      const folder = await mkdtemp(join(tmpdir(), 'noureon-media-'));
      const input = join(folder, `in.${extension}`);
      try {
        await writeFile(input, data);
      } catch (error) {
        await rm(folder, { recursive: true, force: true });
        throw error;
      }
      let counter = 0;
      return {
        async run(args, { output } = {}) {
          const file = output ? join(folder, `${(counter += 1)}-${output}`) : null;
          const filled = args.map((part) => (part === IN ? input : part === OUT ? (file || '-') : part));
          // A command that has no output file (the probe) is given a null one: ffmpeg then only reads the file and says what it holds (and ends with an error, which is expected).
          if (!file) filled.push('-f', 'null', '-t', '0', '-');
          await acquire();
          try {
            const { code, log } = await spawnFfmpeg(binary, filled, { signal, runMs });
            const bytes = file && code === 0 ? await readFile(file).catch(() => null) : null;
            return { ok: file ? code === 0 : true, log, data: bytes ? new Uint8Array(bytes) : null };
          } finally {
            release();
          }
        },
        close: () => rm(folder, { recursive: true, force: true })
      };
    }
  });
}
