import assert from 'node:assert/strict';
import test from 'node:test';

import {
  audioWindows, createMediaToolbox, ffmpegArgs, formatTime, frameTimes, IN, inputKindOf, mediaKindOfMime, mediaPieceHash, OUT, parseProbe, placeOfPiece, suffixInfo, suffixOfPieceId, videoWindows, windowsOf, WINDOWS_MAX
} from '../src/data/project-media.js';
import { textHash } from '../src/app/runtime/memory-notes/vector-math.js';

// The windows, the names, the hashes and the commands the page and the server must agree on (docs/superpowers/specs/2026-11-01-project-files-multimodal-design.md, R5).

test('a video is cut into windows of 30 seconds that start every 25; the last one holds what is left; a short one is one window', () => {
  assert.deepEqual(videoWindows(12), [{ start: 0, end: 12 }]);
  assert.deepEqual(videoWindows(30), [{ start: 0, end: 30 }]);
  assert.deepEqual(videoWindows(70), [{ start: 0, end: 30 }, { start: 25, end: 55 }, { start: 50, end: 70 }]);
  // The tail that the window before already holds is not a window of its own.
  assert.deepEqual(videoWindows(52), [{ start: 0, end: 30 }, { start: 25, end: 52 }]);
  assert.deepEqual(videoWindows(0), []);
  assert.deepEqual(videoWindows(NaN), []);
  assert.deepEqual(audioWindows(130).map((window) => window.start), [0, 50, 100]);
  assert.equal(windowsOf(100_000, { length: 30, step: 25 }).length, WINDOWS_MAX, 'a file has at most so many windows');
});

test('the piece of a window says what it is, and the hash tells a vector made from this very window of this very file', () => {
  assert.deepEqual(suffixInfo('v25'), { kind: 'video', start: 25 });
  assert.deepEqual(suffixInfo('a100'), { kind: 'audio', start: 100 });
  assert.deepEqual(suffixInfo('p3'), { kind: 'scan', page: 3 });
  assert.deepEqual(suffixInfo('0'), { kind: 'other' });
  assert.deepEqual(suffixInfo('7'), { kind: 'other' });
  assert.equal(suffixOfPieceId('src:a:b:v25'), 'v25');
  assert.equal(mediaPieceHash('h1'), textHash('image|h1'), 'a picture keeps the hash of the first version');
  assert.equal(mediaPieceHash('h1', '0'), mediaPieceHash('h1'));
  assert.notEqual(mediaPieceHash('h1', 'v0'), mediaPieceHash('h1', 'v25'));
  assert.notEqual(mediaPieceHash('h1', 'v0'), mediaPieceHash('h2', 'v0'));
  assert.notEqual(mediaPieceHash('h1', 'v0'), mediaPieceHash('h1', 'a0'), 'a video and its sound are not the same piece');
});

test('where a piece is, in words for the model', () => {
  assert.equal(formatTime(65), '1:05');
  assert.equal(formatTime(3723), '1:02:03');
  assert.deepEqual(placeOfPiece('src:s:v25', 'video', 40), { at: 25, end: 40, time: '0:25–0:40' });
  assert.deepEqual(placeOfPiece('src:s:a50', 'audio'), { at: 50, end: 110, time: '0:50–1:50' });
  assert.deepEqual(placeOfPiece('src:s:p3', 'scan'), { page: 3 });
  assert.equal(placeOfPiece('src:s:v25', 'audio'), null);
});

test('the frames shown are spread over the video, or over 30 seconds from where the model says', () => {
  assert.deepEqual(frameTimes(80), [10, 30, 50, 70]);
  assert.deepEqual(frameTimes(80, 40), [43.8, 51.3, 58.8, 66.3]);
  assert.deepEqual(frameTimes(80, 70), [71.3, 73.8, 76.3, 78.8]);
  assert.deepEqual(frameTimes(0), [0]);
});

test('what ffmpeg says about a file is read: its length, and whether it has a picture and a sound (a cover is not a picture)', () => {
  const log = 'Input #0, mov,mp4, from \'x.mp4\':\n  Duration: 00:01:10.25, start: 0.000000, bitrate: 98 kb/s\n  Stream #0:0[0x1](und): Video: h264 (High), yuv420p, 320x240 [SAR 1:1 DAR 4:3], 10 fps\n  Stream #0:1[0x2](und): Audio: aac (LC), 44100 Hz, mono';
  assert.deepEqual(parseProbe(log), { duration: 70.25, hasVideo: true, hasAudio: true, width: 320, height: 240 });
  const song = 'Duration: 00:03:00.00, start: 0\n  Stream #0:0: Audio: mp3, 44100 Hz\n  Stream #0:1: Video: mjpeg, yuvj420p, 500x500 (attached pic)';
  assert.deepEqual(parseProbe(song), { duration: 180, hasVideo: false, hasAudio: true, width: 0, height: 0 });
  assert.deepEqual(parseProbe(''), { duration: 0, hasVideo: false, hasAudio: false, width: 0, height: 0 });
});

test('a file is opened only as the kind its name or type says, never as a playlist or anything that reads other files', () => {
  assert.equal(inputKindOf({ name: 'a.MP4' }).extension, 'mp4');
  assert.equal(inputKindOf({ name: 'noext', mime: 'audio/mpeg' }).extension, 'mp3');
  assert.equal(inputKindOf({ name: 'list.m3u8', mime: 'application/x-mpegURL' }), null);
  assert.equal(inputKindOf({ name: 'x.concat' }), null);
  assert.equal(inputKindOf({ name: 'movie.mkv' }).demuxers, 'matroska,webm');
  assert.equal(mediaKindOfMime('image/png'), 'image');
  assert.equal(mediaKindOfMime('image/svg+xml'), '');
  assert.equal(mediaKindOfMime('video/webm'), 'video');
  assert.equal(mediaKindOfMime('audio/mp4'), 'audio');
  assert.equal(mediaKindOfMime('application/pdf'), '');
  assert.ok(ffmpegArgs.videoWindow('mov,mp4,m4a,3gp,3g2,mj2', 25, 30).includes('-an'), 'a window of video has no sound; the sound is its own pieces');
  assert.ok(ffmpegArgs.audioWindow('wav', 0, 60).includes('-vn'));
  for (const args of [ffmpegArgs.probe('wav'), ffmpegArgs.frame('wav', 3)]) assert.ok(args.includes(IN));
  assert.ok(ffmpegArgs.frame('wav', 3).includes(OUT));
});

test('the toolbox opens a file with the runner it is given and gives the cuts back, or null when the runner made nothing', async () => {
  const seen = [];
  const toolbox = createMediaToolbox({
    open: async ({ data, extension }) => {
      seen.push({ open: extension, bytes: data.byteLength });
      return {
        run: async (args, { output }) => {
          seen.push({ output });
          return output === 'out.jpg' ? { ok: false, log: '', data: null } : { ok: true, log: 'Duration: 00:00:05.00', data: output ? new Uint8Array([1, 2, 3]) : null };
        },
        close: () => seen.push('closed')
      };
    }
  });
  assert.equal(await toolbox.open({ data: new Uint8Array(2), name: 'x.m3u8' }), null);
  const media = await toolbox.open({ data: new Uint8Array(9), name: 'clip.webm' });
  assert.equal((await media.probe()).duration, 5);
  assert.deepEqual(await media.videoWindow(0), { mimeType: 'video/mp4', data: new Uint8Array([1, 2, 3]) });
  assert.equal((await media.audioWindow(0)).mimeType, 'audio/wav');
  assert.equal(await media.frame(1), null);
  await media.close();
  assert.deepEqual(seen[0], { open: 'webm', bytes: 9 });
  assert.equal(seen.at(-1), 'closed');
});
