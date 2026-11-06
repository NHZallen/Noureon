import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { decodeGif } from '../src/app/runtime/images/gif-frames.js';

// The frames of a GIF as the person sees them (images/gif-frames.js). The fixtures were written by Pillow (a: 4 frames with their own times; b: frames that change a part, transparent, disposal 2 and 3;
// c: one interlaced frame; d: 16 frames) and the expected pixels are what Pillow shows for the same frames, so a reader that follows the format has the same pixels.

const fixtures = JSON.parse(readFileSync(new URL('./fixtures-gif-frames.json', import.meta.url), 'utf8'));
const bytesOf = (name) => Buffer.from(fixtures[name].b64, 'base64');

for (const name of Object.keys(fixtures)) {
  test(`gif ${name}: every frame has the pixels and the time Pillow gives`, () => {
    const gif = decodeGif(bytesOf(name));
    assert.ok(gif, 'it can be read');
    const { points, expected } = fixtures[name];
    assert.equal(gif.frames.length, expected.length);
    gif.frames.forEach((frame, index) => {
      assert.equal(frame.rgba.length, gif.width * gif.height * 4);
      assert.equal(frame.delayMs, expected[index].delay ?? 100, 'a frame with no time of its own stays 100 ms');
      points.forEach(([x, y], k) => {
        const at = (y * gif.width + x) * 4;
        const got = [...frame.rgba.slice(at, at + 4)];
        const want = expected[index].px[k];
        if (want[3] === 0) assert.equal(got[3], 0, `frame ${index} (${x},${y}) is transparent`);
        else assert.deepEqual(got, want, `frame ${index} (${x},${y})`);
      });
    });
  });
}

test('what is not a GIF that can be read gives null, and never throws', () => {
  assert.equal(decodeGif(new Uint8Array([1, 2, 3])), null);
  assert.equal(decodeGif(new Uint8Array(0)), null);
  assert.equal(decodeGif(Buffer.from('GIF89a')), null);
  assert.equal(decodeGif(bytesOf('a').subarray(0, 40)), null, 'cut short');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  assert.equal(decodeGif(png), null);
  // bytes changed at random never make it throw
  const original = bytesOf('d');
  for (let round = 0; round < 300; round += 1) {
    const copy = Uint8Array.from(original);
    for (let k = 0; k < 4; k += 1) copy[Math.floor(((round * 7919 + k * 104729) % 1000003) / 1000003 * copy.length)] = (round * 31 + k * 17) & 255;
    decodeGif(copy);
  }
});
