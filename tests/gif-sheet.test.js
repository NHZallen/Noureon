import assert from 'node:assert/strict';
import test from 'node:test';

import { createCanvas, loadImage } from '@napi-rs/canvas';

import { decodeGif } from '../src/app/runtime/images/gif-frames.js';
import { encodeGif } from '../src/app/runtime/images/gif-encode.js';
import { editGifSheet } from '../src/app/runtime/images/gif-frame-edit.js';
import { buildSheet, calibrateThreshold, changeMap, compositeChanges, markMask, resizeRgba, sheetLayout, sliceSheet } from '../src/app/runtime/images/gif-sheet.js';
import { pictureToFrame, rgbaToPng } from '../server/picture-frame.js';

// Editing every frame of a GIF at once (docs/superpowers/specs/2026-11-06-gpt-image-2-6-design.md §11).

const W = 64;
const H = 48;
const solid = (width, height, [r, g, b, a = 255]) => { const out = new Uint8ClampedArray(width * height * 4); for (let i = 0; i < out.length; i += 4) { out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = a; } return out; };
const paint = (rgba, width, x0, y0, w, h, [r, g, b]) => { for (let y = y0; y < y0 + h; y += 1) for (let x = x0; x < x0 + w; x += 1) { const at = (y * width + x) * 4; rgba[at] = r; rgba[at + 1] = g; rgba[at + 2] = b; } };
// A pig: pink body, a nose that moves a little in each frame, a dark eye.
const NOSE = [255, 150, 170];
const frameOf = (index) => { const f = solid(W, H, [250, 240, 200]); paint(f, W, 8, 8, 40, 30, [240, 190, 190]); paint(f, W, 30 + index * 2, 20, 10, 8, NOSE); paint(f, W, 14, 14, 4, 4, [30, 30, 30]); return f; };
const COUNT = 4;
const gifOf = () => {
  const bytes = encodeGif({ width: W, height: H, frames: Array.from({ length: COUNT }, (_, i) => ({ rgba: frameOf(i), delayMs: 100 })), loops: 0 });
  return `data:image/gif;base64,${Buffer.from(bytes).toString('base64')}`;
};

test('the layout is a grid that keeps the sheet within its limit', () => {
  const small = sheetLayout(4, 64, 48);
  assert.deepEqual([small.columns, small.rows, small.cellWidth, small.cellHeight], [2, 2, 64, 48]);
  const big = sheetLayout(16, 1000, 1000, 2048);
  assert.equal(big.columns * big.rows >= 16, true);
  assert.ok(big.width <= 2048 && big.height <= 2048);
  assert.equal(sheetLayout(2, 100, 100).count, 2);
});

test('a sheet cut up again gives the frames back, also when they were made smaller', () => {
  const frames = [0, 1, 2, 3].map(frameOf);
  const layout = sheetLayout(4, W, H);
  const back = sliceSheet(buildSheet(frames, layout, W, H), layout, W, H);
  back.forEach((cell, i) => assert.deepEqual([...cell], [...frames[i]]));
  const tight = sheetLayout(4, W, H, 64);
  assert.ok(tight.cellWidth < W);
  const shrunk = sliceSheet(buildSheet(frames, tight, W, H), tight, W, H);
  assert.equal(shrunk[0].length, frames[0].length);
  assert.equal(resizeRgba(frames[0], W, H, W, H), frames[0]);
});

test('only the places that changed are taken, and grain and a drift of colour are not', () => {
  const original = frameOf(0);
  const edited = Uint8ClampedArray.from(original);
  paint(edited, W, 30, 20, 10, 8, [60, 90, 255]);
  for (let i = 0; i < edited.length; i += 4) { edited[i] = Math.min(255, edited[i] + 3); edited[i + 2] = Math.max(0, edited[i + 2] - 3); }
  const map = changeMap(original, edited, W, H);
  const out = compositeChanges(original, edited, map, W, H, { threshold: 26 });
  const at = (x, y) => (y * W + x) * 4;
  assert.deepEqual([...out.slice(at(34, 24), at(34, 24) + 3)], [...edited.slice(at(34, 24), at(34, 24) + 3)], 'the nose is the new colour');
  assert.deepEqual([...out.slice(at(2, 2), at(2, 2) + 4)], [...original.slice(at(2, 2), at(2, 2) + 4)], 'a far place stays exactly as it was');
  assert.deepEqual([...out.slice(at(15, 15), at(15, 15) + 4)], [...original.slice(at(15, 15), at(15, 15) + 4)], 'the eye is untouched');
});

test('an edit of the whole picture is taken whole, and no change leaves the frame as it was', () => {
  const original = frameOf(1);
  const dark = Uint8ClampedArray.from(original);
  for (let i = 0; i < dark.length; i += 4) { dark[i] *= 0.4; dark[i + 1] *= 0.4; dark[i + 2] *= 0.4; }
  const whole = compositeChanges(original, dark, changeMap(original, dark, W, H), W, H, {});
  assert.deepEqual([...whole.slice(0, 3)], [...dark.slice(0, 3)]);
  const none = compositeChanges(original, original, changeMap(original, original, W, H), W, H, {});
  assert.deepEqual([...none], [...original]);
});

test('the transparency of a frame is kept', () => {
  const original = solid(8, 8, [10, 10, 10, 0]);
  const edited = solid(8, 8, [250, 250, 250, 255]);
  const out = compositeChanges(original, edited, changeMap(original, edited, 8, 8), 8, 8, {});
  assert.equal(out[3], 0);
});

test('the marks say how small a change is still a change', () => {
  const original = frameOf(0);
  const marked = Uint8ClampedArray.from(original);
  paint(marked, W, 30, 20, 10, 2, [255, 0, 0]);
  const mask = markMask(original, marked, W, H);
  assert.ok(mask && mask[(21 * W) + 34] === 1 && mask[(2 * W) + 2] === 0);
  assert.equal(markMask(original, original, W, H), null);
  const edited = Uint8ClampedArray.from(original);
  paint(edited, W, 30, 20, 10, 8, [200, 150, 190]); // a change of 55 / 0 / 20
  const map = changeMap(original, edited, W, H);
  const threshold = calibrateThreshold([map], [mask]);
  assert.ok(threshold <= 48 && threshold >= 12);
  assert.equal(calibrateThreshold([map], [null]), 26);
});

// A model that changes the nose to blue in every cell of the sheet it is given and drifts a little elsewhere, as the real ones do.
const makeModel = (asked) => async ({ inputReferences, prompt, config }) => {
  asked.push({ inputReferences, prompt, config });
  const picture = await loadImage(Buffer.from(inputReferences[0].split(',')[1], 'base64'));
  const canvas = createCanvas(picture.width, picture.height);
  const context = canvas.getContext('2d');
  context.drawImage(picture, 0, 0);
  const data = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < data.data.length; i += 4) {
    const r = data.data[i]; const g = data.data[i + 1]; const b = data.data[i + 2];
    if (Math.abs(r - NOSE[0]) < 12 && Math.abs(g - NOSE[1]) < 12 && Math.abs(b - NOSE[2]) < 12) { data.data[i] = 70; data.data[i + 1] = 100; data.data[i + 2] = 255; }
    else { data.data[i] = Math.min(255, r + 4); data.data[i + 1] = Math.max(0, g - 3); }
  }
  context.putImageData(data, 0, 0);
  return { images: [{ b64Json: canvas.toBuffer('image/png').toString('base64'), mediaType: 'image/png' }] };
};

test('every frame gets the change, the rest of each frame stays as it was, and the GIF keeps its time', async () => {
  const asked = [];
  const gifDataUrl = gifOf();
  const marked = Uint8ClampedArray.from(frameOf(2));
  paint(marked, W, 34, 18, 12, 2, [255, 0, 0]);
  const dataUrl = `data:image/png;base64,${(await rgbaToPng(marked, W, H)).b64Json}`;
  const result = await editGifSheet({
    edits: [{ index: 2, count: COUNT, dataUrl }], gifDataUrl, prompt: 'make the nose blue', modelInfo: { id: 'm', provider: 'openrouter' }, apiKey: 'k',
    generateImage: makeModel(asked), toFrame: pictureToFrame, toPng: rgbaToPng
  });
  assert.equal(asked.length, 1, 'one request for the whole GIF');
  assert.equal(asked[0].inputReferences.length, 2, 'the sheet and the marked frame');
  assert.match(asked[0].prompt, /^make the nose blue\n\nThe first picture is a contact sheet of the 4 frames/);
  assert.match(asked[0].prompt, /frame 3 with marks/);
  assert.equal(result.images[0].mediaType, 'image/gif');
  const gif = decodeGif(Uint8Array.from(Buffer.from(result.images[0].b64Json, 'base64')));
  assert.equal(gif.frames.length, COUNT);
  const original = decodeGif(Uint8Array.from(Buffer.from(gifDataUrl.split(',')[1], 'base64')));
  gif.frames.forEach((frame, index) => {
    assert.equal(frame.delayMs, original.frames[index].delayMs);
    const at = (x, y) => (y * W + x) * 4;
    const nose = [...frame.rgba.slice(at(34 + index * 2 - 2, 24), at(34 + index * 2 - 2, 24) + 3)];
    assert.ok(nose[2] > 200 && nose[0] < 120, `frame ${index + 1} has a blue nose: ${nose}`);
    assert.deepEqual([...frame.rgba.slice(at(2, 2), at(2, 2) + 3)], [...original.frames[index].rgba.slice(at(2, 2), at(2, 2) + 3)], 'the far corner is as it was');
    assert.deepEqual([...frame.rgba.slice(at(15, 15), at(15, 15) + 3)], [...original.frames[index].rgba.slice(at(15, 15), at(15, 15) + 3)], 'the eye is as it was');
  });
});

test('a GIF that is not in the conversation any more says so', async () => {
  await assert.rejects(() => editGifSheet({ edits: [{ index: 0, count: 4, dataUrl: 'data:image/png;base64,AA==' }], gifDataUrl: 'data:image/gif;base64,AAAA', prompt: 'x', modelInfo: {}, generateImage: async () => ({}), toFrame: pictureToFrame, toPng: rgbaToPng }), /no longer in this conversation/);
});
