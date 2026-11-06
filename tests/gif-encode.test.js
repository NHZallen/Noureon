import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { decodeGif } from '../src/app/runtime/images/gif-frames.js';
import { encodeGif, quantizeFrame } from '../src/app/runtime/images/gif-encode.js';
import { closestAspectRatio, editGifFrames, frameInstruction } from '../src/app/runtime/images/gif-frame-edit.js';

// A GIF written from frames (images/gif-encode.js) is read back by images/gif-frames.js (which matches Pillow), and Pillow opened one written by this encoder (checked by hand on 2026-11-06: the size, the 5 frames,
// their times and the loop). A frame edited in the editor of a picture is put back in its GIF (images/gif-frame-edit.js, Allen's choice B).

const fixtures = JSON.parse(readFileSync(new URL('./fixtures-gif-frames.json', import.meta.url), 'utf8'));
const bytesOf = (name) => Buffer.from(fixtures[name].b64, 'base64');

test('the frames of a GIF written again are the same pixels, times and number of frames', () => {
  for (const name of ['a', 'b', 'd']) {
    const first = decodeGif(bytesOf(name));
    const again = decodeGif(encodeGif({ width: first.width, height: first.height, frames: first.frames, loops: first.loops }));
    assert.equal(again.frames.length, first.frames.length, name);
    again.frames.forEach((frame, index) => {
      assert.equal(frame.delayMs, first.frames[index].delayMs);
      // a pixel with no colour stays without; the others are the same (there are few colours: nothing is reduced)
      for (let at = 0; at < first.width * first.height; at += 1) {
        if (first.frames[index].rgba[at * 4 + 3] < 128) assert.ok(frame.rgba[at * 4 + 3] < 128, `${name} frame ${index} pixel ${at} stays clear`);
        else assert.deepEqual([...frame.rgba.slice(at * 4, at * 4 + 4)], [...first.frames[index].rgba.slice(at * 4, at * 4 + 4)], `${name} frame ${index} pixel ${at}`);
      }
    });
  }
});

test('a frame with more than 256 colours is reduced to a palette that follows it closely; one with few colours is kept exactly', () => {
  const width = 100;
  const height = 80;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) rgba.set([x * 2, y * 3, (x + y) & 255, 255], (y * width + x) * 4);
  const reduced = quantizeFrame(rgba, width, height);
  assert.ok(reduced.palette.length / 3 <= 256);
  assert.equal(reduced.transparent, -1);
  const back = decodeGif(encodeGif({ width, height, frames: [{ rgba, delayMs: 100 }] })).frames[0].rgba;
  let error = 0;
  for (let at = 0; at < width * height; at += 1) for (let c = 0; c < 3; c += 1) error += Math.abs(back[at * 4 + c] - rgba[at * 4 + c]);
  assert.ok(error / (width * height * 3) < 6, `the mean error per channel is small (${(error / (width * height * 3)).toFixed(2)})`);
  const flat = new Uint8ClampedArray(4 * 4 * 4);
  for (let at = 0; at < 16; at += 1) flat.set(at < 8 ? [10, 20, 30, 255] : [0, 0, 0, 0], at * 4);
  const kept = quantizeFrame(flat, 4, 4);
  assert.equal(kept.transparent, 1);
  assert.deepEqual(kept.palette.slice(0, 3), [10, 20, 30]);
});

test('the shape asked of the model is the one of the frames, or the nearest it takes', () => {
  assert.equal(closestAspectRatio(512, 512), '1:1');
  assert.equal(closestAspectRatio(480, 320), '3:2');
  assert.equal(closestAspectRatio(320, 480), '2:3');
  assert.equal(closestAspectRatio(1600, 900), '16:9');
  assert.equal(closestAspectRatio(480, 320, ['1:1', '16:9', '9:16']), '16:9', 'only the shapes the model takes');
  assert.match(frameInstruction(2, 9), /frame 3 of 9 of an animation/);
});

test('an edited frame takes the place of its frame; the other frames stay as they were', async () => {
  const gifUrl = `data:image/gif;base64,${fixtures.d.b64}`;
  const original = decodeGif(bytesOf('d'));
  const requests = [];
  const generateImage = async (request) => { requests.push(request); return { images: [{ b64Json: Buffer.from(`new-${requests.length}`).toString('base64'), mediaType: 'image/png' }] }; };
  const marker = (n) => { const rgba = new Uint8ClampedArray(16 * 16 * 4); for (let at = 0; at < 256; at += 1) rgba.set([n, n, n, 255], at * 4); return rgba; };
  const result = await editGifFrames({
    edits: [{ index: 3, count: 16, dataUrl: 'data:image/png;base64,AAA' }, { index: 9, count: 16, dataUrl: 'data:image/png;base64,BBB' }],
    gifDataUrl: gifUrl, prompt: 'remove the waves', modelInfo: { id: 'gpt-image-2.6-flare', provider: 'openai', supportedImageAspectRatios: [] }, apiKey: 'k', generateImage,
    toFrame: async (picture) => marker(picture.b64Json === Buffer.from('new-1').toString('base64') ? 77 : 99)
  });
  assert.equal(requests.length, 2, 'one request for each marked frame');
  assert.deepEqual(requests.map((request) => request.inputReferences), [['data:image/png;base64,AAA'], ['data:image/png;base64,BBB']]);
  assert.match(requests[0].prompt, /^remove the waves\n\nThis picture is frame 4 of 16 of an animation/);
  assert.deepEqual([requests[0].config.aspectRatio, requests[0].config.n], ['1:1', 1]);
  assert.equal(result.images[0].mediaType, 'image/gif');
  const bytes = Buffer.from(result.images[0].b64Json, 'base64');
  const after = decodeGif(bytes);
  assert.equal(after.frames.length, 16);
  assert.deepEqual([...after.frames[3].rgba.slice(0, 4)], [77, 77, 77, 255], 'frame 4 is the edited one');
  assert.deepEqual([...after.frames[9].rgba.slice(0, 4)], [99, 99, 99, 255]);
  for (const index of [0, 1, 2, 4, 5, 8, 15]) assert.deepEqual([...after.frames[index].rgba], [...original.frames[index].rgba], `frame ${index + 1} is untouched`);
  await assert.rejects(() => editGifFrames({ edits: [{ index: 0, count: 5, dataUrl: 'x' }], gifDataUrl: gifUrl, prompt: 'p', modelInfo: {}, apiKey: 'k', generateImage }), /no longer in this conversation/);
  await assert.rejects(() => editGifFrames({ edits: [{ index: 0, count: 16, dataUrl: 'x' }], gifDataUrl: '', prompt: 'p', modelInfo: {}, apiKey: 'k', generateImage }), /no longer in this conversation/);
});
