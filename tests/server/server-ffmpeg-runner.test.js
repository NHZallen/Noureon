import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createServerMediaToolbox } from '../../server/ffmpeg-runner.js';

// The real ffmpeg of the machine (skipped where there is none): a clip is made, then cut the way the project files are.

const has = spawnSync('ffmpeg', ['-version']).status === 0;
const make = (args) => {
  const folder = mkdtempSync(join(tmpdir(), 'noureon-ffmpeg-test-'));
  const file = join(folder, 'clip.mp4');
  const done = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args, file]);
  assert.equal(done.status, 0, String(done.stderr));
  const bytes = new Uint8Array(readFileSync(file));
  rmSync(folder, { recursive: true, force: true });
  return bytes;
};

test('the server probes a clip, cuts a window of video and of sound, and takes a frame', { skip: !has }, async () => {
  const data = make(['-f', 'lavfi', '-i', 'testsrc=duration=35:size=160x120:rate=5', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=35', '-shortest', '-c:v', 'libx264', '-c:a', 'aac', '-pix_fmt', 'yuv420p']);
  const media = await createServerMediaToolbox().open({ data, name: 'clip.mp4', mime: 'video/mp4' });
  try {
    const probe = await media.probe();
    assert.equal(Math.round(probe.duration), 35);
    assert.equal(probe.hasVideo && probe.hasAudio, true);
    const video = await media.videoWindow(25);
    assert.equal(video.mimeType, 'video/mp4');
    assert.ok(video.data.byteLength > 500);
    const sound = await media.audioWindow(0);
    assert.equal(sound.mimeType, 'audio/wav');
    assert.equal(String.fromCharCode(...sound.data.subarray(0, 4)), 'RIFF');
    const frame = await media.frame(10);
    assert.equal(frame.mimeType, 'image/jpeg');
    assert.deepEqual([...frame.data.subarray(0, 2)], [0xff, 0xd8]);
  } finally {
    await media.close();
  }
});

test('a file that is not a video gives nothing and no error; a kind that may not be opened is refused', { skip: !has }, async () => {
  const toolbox = createServerMediaToolbox();
  const broken = await toolbox.open({ data: new Uint8Array(200).fill(7), name: 'broken.mp4', mime: 'video/mp4' });
  try {
    assert.deepEqual(await broken.probe(), { duration: 0, hasVideo: false, hasAudio: false, width: 0, height: 0 });
    assert.equal(await broken.videoWindow(0), null);
  } finally {
    await broken.close();
  }
  assert.equal(await toolbox.open({ data: new Uint8Array(10), name: 'list.m3u8' }), null);
});

test('without the program, opening a file fails loudly so that the caller can go on without', async () => {
  const media = await createServerMediaToolbox({ binary: '/no/such/ffmpeg' }).open({ data: new Uint8Array(4), name: 'a.mp3' });
  await assert.rejects(() => media.probe());
  await media.close();
});
