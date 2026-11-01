// Videos, recordings and scanned PDFs of a project as pieces for the search by meaning (docs/superpowers/specs/2026-11-01-project-files-multimodal-design.md, §10 and R5 to R8): the model of the
// vectors takes a short video (up to 120 seconds), a short sound (up to 80 seconds) and a picture, so a long file is cut into overlapping windows that are sent one by one, and a scanned PDF is
// sent page by page as pictures. This module is what the page (which makes the vectors) and the server (which finds them and shows the frames) both need and must agree on: the windows, the names
// of the pieces, the hashes that say a vector is the one of this very window, the ffmpeg commands, and how the answer of `ffmpeg -i` is read. The cutting itself is done by an ffmpeg that is
// given to `createMediaToolbox` (the server runs the program, the page runs ffmpeg.wasm). Pure: no window, no document, no browser storage.

import { textHash } from '../app/runtime/memory-notes/vector-math.js';

/** Changes whenever the way a file is cut changes, so that the vectors made the old way are made again. */
export const MEDIA_SCHEME = 1;
/** A video is cut into windows of 30 seconds that start every 25 (5 seconds overlap); a sound into windows of 60 that start every 50. At most WINDOWS_MAX windows of a file. */
export const VIDEO_WINDOW = Object.freeze({ length: 30, step: 25 });
export const AUDIO_WINDOW = Object.freeze({ length: 60, step: 50 });
export const WINDOWS_MAX = 120;
/** The most pages of a scanned PDF that are made into vectors. */
export const SCAN_PAGES_MAX = 200;
/** How many frames the model is shown for one look at a video, and over how many seconds when it says where. */
export const VIEW_FRAMES = 4;
export const VIEW_SPAN = 30;
export const FRAME_WIDTH = 768;

const SUFFIX = /^([va])(\d+)$|^p(\d+)$/;
const KIND_OF_LETTER = Object.freeze({ v: 'video', a: 'audio', p: 'scan' });

/** 'image', 'video', 'audio' or '' for a file of a project (a picture the vectors take is a raster one). */
export function mediaKindOfMime(mime = '') {
  const type = String(mime || '').toLowerCase();
  if (type.startsWith('image/')) return type.includes('svg') ? '' : 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  return '';
}

/** The windows of a file that lasts `duration` seconds: [{ start, end }] (whole seconds for the start). */
export function windowsOf(duration, { length, step } = VIDEO_WINDOW, max = WINDOWS_MAX) {
  const total = Number(duration);
  if (!Number.isFinite(total) || total <= 0) return [];
  const out = [];
  for (let start = 0; start < total && out.length < max; start += step) {
    // A last window that holds only what the one before it already holds (the overlap) is not a window of its own.
    if (out.length && total - start <= length - step) break;
    out.push({ start, end: Math.min(total, start + length) });
  }
  return out;
}
export const videoWindows = (duration) => windowsOf(duration, VIDEO_WINDOW);
export const audioWindows = (duration) => windowsOf(duration, AUDIO_WINDOW);

export const videoSuffix = (start) => `v${Math.max(0, Math.floor(start))}`;
export const audioSuffix = (start) => `a${Math.max(0, Math.floor(start))}`;
export const pageSuffix = (page) => `p${Math.max(1, Math.floor(page))}`;

/** What the end of a piece id says: { kind: 'video' | 'audio' | 'scan' | 'other', start (seconds) | page }. 'other' is a passage of a text or a picture (a plain number). */
export function suffixInfo(suffix) {
  const match = SUFFIX.exec(String(suffix ?? ''));
  if (!match) return { kind: 'other' };
  if (match[3] !== undefined) return { kind: 'scan', page: Number(match[3]) };
  return { kind: KIND_OF_LETTER[match[1]], start: Number(match[2]) };
}
/** The part after the last colon of a piece id (`src:<source>:<suffix>`). */
export const suffixOfPieceId = (id) => String(id ?? '').slice(String(id ?? '').lastIndexOf(':') + 1);

/**
 * The hash a piece of a file carries: of the file (the hash of its bytes), what part of it and how it is cut, so that the page that makes the vector and the server that finds it agree without
 * the bytes. With no `suffix` it is the picture of the first version (one piece, `src:<source>:0`), which keeps the vectors already made.
 */
export function mediaPieceHash(fileHash, suffix = '') {
  const info = suffixInfo(suffix);
  if (info.kind === 'other') return textHash(`image|${String(fileHash || '')}`);
  return textHash(`${info.kind}|${String(fileHash || '')}|${suffix}|${MEDIA_SCHEME}`);
}

/** "1:05" or "1:02:03" for a number of seconds. */
export function formatTime(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = String(total % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}

/** Where a piece of a video or a sound is, for the model: { at (seconds), end, time: "0:25–0:55" }; `duration` (when known) cuts the end. */
export function placeOfPiece(pieceId, kind, duration = 0) {
  const info = suffixInfo(suffixOfPieceId(pieceId));
  if (info.kind !== kind) return null;
  if (kind === 'scan') return { page: info.page };
  const length = (kind === 'audio' ? AUDIO_WINDOW : VIDEO_WINDOW).length;
  const end = duration > 0 ? Math.min(duration, info.start + length) : info.start + length;
  return { at: info.start, end, time: `${formatTime(info.start)}–${formatTime(end)}` };
}

/** The seconds at which the model is shown frames of a video: spread over the whole video, or over the VIEW_SPAN seconds from `at`. */
export function frameTimes(duration, at = null) {
  const total = Math.max(0, Number(duration) || 0);
  const from = at === null || at === undefined || !Number.isFinite(Number(at)) ? 0 : Math.min(Math.max(0, Number(at)), Math.max(0, total - 1));
  const span = at === null || at === undefined ? total : Math.min(VIEW_SPAN, Math.max(0, total - from));
  if (span <= 0) return [from];
  return Array.from({ length: VIEW_FRAMES }, (_, index) => Math.round((from + (span * (index + 0.5)) / VIEW_FRAMES) * 10) / 10);
}

// ---- ffmpeg

/** Which demuxers a file may be opened with, by its extension: never the ones that read other files or addresses (playlists), whatever the content says. '' when the kind is not allowed. */
const DEMUXERS = Object.freeze({
  mp4: 'mov,mp4,m4a,3gp,3g2,mj2', m4v: 'mov,mp4,m4a,3gp,3g2,mj2', mov: 'mov,mp4,m4a,3gp,3g2,mj2', m4a: 'mov,mp4,m4a,3gp,3g2,mj2', '3gp': 'mov,mp4,m4a,3gp,3g2,mj2',
  webm: 'matroska,webm', mkv: 'matroska,webm', mka: 'matroska,webm', avi: 'avi', flv: 'flv', wmv: 'asf', wma: 'asf', asf: 'asf',
  mp3: 'mp3', wav: 'wav', flac: 'flac', ogg: 'ogg', oga: 'ogg', ogv: 'ogg', opus: 'ogg', aac: 'aac', aif: 'aiff', aiff: 'aiff', amr: 'amr',
  mpg: 'mpeg,mpegts', mpeg: 'mpeg,mpegts', ts: 'mpegts'
});
const MIME_EXTENSION = Object.freeze({
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'video/x-matroska': 'mkv', 'video/x-msvideo': 'avi', 'video/mpeg': 'mpg', 'video/3gpp': '3gp', 'video/ogg': 'ogv', 'video/x-flv': 'flv', 'video/x-ms-wmv': 'wmv',
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/flac': 'flac', 'audio/x-flac': 'flac', 'audio/ogg': 'ogg', 'audio/opus': 'opus', 'audio/webm': 'webm', 'audio/aiff': 'aiff', 'audio/x-aiff': 'aiff', 'audio/amr': 'amr', 'audio/x-ms-wma': 'wma'
});

/** { extension, demuxers } for a file, or null when ffmpeg is not to open it. The extension of the name is taken first, else the one of the type. */
export function inputKindOf({ name = '', mime = '' } = {}) {
  const fromName = /\.([a-z0-9]{1,5})$/i.exec(String(name || ''))?.[1]?.toLowerCase();
  const extension = DEMUXERS[fromName] ? fromName : MIME_EXTENSION[String(mime || '').toLowerCase().split(';')[0].trim()];
  return extension && DEMUXERS[extension] ? { extension, demuxers: DEMUXERS[extension] } : null;
}

export const IN = '{in}';
export const OUT = '{out}';
const quiet = ['-hide_banner', '-nostdin'];

/** What the ffmpeg commands are made of; `{in}` and `{out}` are the files, set by the runner. */
export const ffmpegArgs = Object.freeze({
  probe: (demuxers) => [...quiet, '-f', demuxers, '-i', IN],
  videoWindow: (demuxers, start, length) => [...quiet, '-loglevel', 'error', '-ss', String(start), '-t', String(length), '-f', demuxers, '-i', IN, '-an', '-vf', 'fps=2,scale=-2:min(480\\,ih)', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '32', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-y', OUT],
  audioWindow: (demuxers, start, length) => [...quiet, '-loglevel', 'error', '-ss', String(start), '-t', String(length), '-f', demuxers, '-i', IN, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-f', 'wav', '-y', OUT],
  frame: (demuxers, at) => [...quiet, '-loglevel', 'error', '-ss', String(at), '-f', demuxers, '-i', IN, '-frames:v', '1', '-vf', `scale=min(${FRAME_WIDTH}\\,iw):-2`, '-q:v', '4', '-f', 'image2', '-y', OUT]
});

/** What the answer of `ffmpeg -i file` says: { duration (seconds), hasVideo, hasAudio, width, height }. A cover picture of a recording is not a video. */
export function parseProbe(log) {
  const text = String(log ?? '');
  const time = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(text);
  const streams = text.split('\n').filter((line) => /Stream #\d+:\d+/.test(line));
  const video = streams.find((line) => /\bVideo:/.test(line) && !/attached pic/.test(line));
  const size = video ? /,\s*(\d{2,5})x(\d{2,5})/.exec(video) : null;
  return {
    duration: time ? Number(time[1]) * 3600 + Number(time[2]) * 60 + Number(time[3]) : 0,
    hasVideo: Boolean(video),
    hasAudio: streams.some((line) => /\bAudio:/.test(line)),
    width: size ? Number(size[1]) : 0,
    height: size ? Number(size[2]) : 0
  };
}

/**
 * `open({ data (Uint8Array), name, extension })` is given by the ffmpeg of the place (server/ffmpeg-runner.js, runtime/projects/ffmpeg-wasm.js) and resolves a session
 * `{ run(args, { output }) -> { ok, log, data (Uint8Array | null) }, close() }` in which `{in}` is the file and `{out}` the output. The toolbox is what the project files ask of it.
 * `toolbox.open({ data, name, mime })` resolves null when the file is not of a kind ffmpeg may open, else { probe(), videoWindow(start), audioWindow(start), frame(at), close() };
 * every cut resolves { mimeType, data (Uint8Array) } or null.
 */
export function createMediaToolbox({ open }) {
  return {
    async open({ data, name = '', mime = '' }) {
      const kind = inputKindOf({ name, mime });
      if (!kind) return null;
      const session = await open({ data, name, extension: kind.extension });
      const cut = async (args, mimeType, output) => {
        const made = await session.run(args, { output });
        return made?.ok && made.data?.byteLength ? { mimeType, data: made.data } : null;
      };
      return {
        async probe() {
          const made = await session.run(ffmpegArgs.probe(kind.demuxers), { output: null });
          return parseProbe(made?.log);
        },
        videoWindow: (start) => cut(ffmpegArgs.videoWindow(kind.demuxers, start, VIDEO_WINDOW.length), 'video/mp4', 'out.mp4'),
        audioWindow: (start) => cut(ffmpegArgs.audioWindow(kind.demuxers, start, AUDIO_WINDOW.length), 'audio/wav', 'out.wav'),
        frame: (at) => cut(ffmpegArgs.frame(kind.demuxers, at), 'image/jpeg', 'out.jpg'),
        close: () => session.close?.()
      };
    }
  };
}
