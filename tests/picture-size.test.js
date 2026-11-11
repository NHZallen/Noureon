import assert from 'node:assert/strict';
import test from 'node:test';
import { deflateSync } from 'node:zlib';

import { pictureSizeOf, pictureSizeOfBase64, pictureSizeOfBlob } from '../src/app/ui/files/picture-size.js';

// The sizes are read from the first bytes of real files of each format (made here), so that a card can be the shape of its picture before the picture is decoded.

const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const png = (w, h) => Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...u32(w), ...u32(h), 8, 2, 0, 0, 0]);
const gif = (w, h) => Uint8Array.from([...Buffer.from('GIF89a'), w & 255, w >> 8, h & 255, h >> 8, 0, 0, 0]);
const jpeg = (w, h) => Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, ...Buffer.from('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xdb, 0, 4, 0, 0, 0xff, 0xc4, 0, 4, 0, 0, 0xff, 0xc0, 0, 17, 8, h >> 8, h & 255, w >> 8, w & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
const webpX = (w, h) => Uint8Array.from([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP'), ...Buffer.from('VP8X'), 10, 0, 0, 0, 0, 0, 0, 0, (w - 1) & 255, ((w - 1) >> 8) & 255, ((w - 1) >> 16) & 255, (h - 1) & 255, ((h - 1) >> 8) & 255, ((h - 1) >> 16) & 255]);
const webpL = (w, h) => { const bits = ((w - 1) | ((h - 1) << 14)) >>> 0; return Uint8Array.from([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP'), ...Buffer.from('VP8L'), 5, 0, 0, 0, 0x2f, bits & 255, (bits >>> 8) & 255, (bits >>> 16) & 255, (bits >>> 24) & 255]); };

test('the size of a PNG, GIF, JPEG and WebP is read from the header', () => {
  assert.deepEqual(pictureSizeOf(png(1024, 768)), { width: 1024, height: 768 });
  assert.deepEqual(pictureSizeOf(gif(480, 270)), { width: 480, height: 270 });
  assert.deepEqual(pictureSizeOf(jpeg(1600, 1200)), { width: 1600, height: 1200 });
  assert.deepEqual(pictureSizeOf(webpX(2048, 1024)), { width: 2048, height: 1024 });
  assert.deepEqual(pictureSizeOf(webpL(640, 480)), { width: 640, height: 480 });
});

test('a header that is not all there, a format that is not known and an empty size give nothing', () => {
  assert.equal(pictureSizeOf(png(10, 10).slice(0, 18)), null);
  assert.equal(pictureSizeOf(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])), null);
  assert.equal(pictureSizeOf(png(0, 10)), null);
  assert.equal(pictureSizeOf(new Uint8Array(0)), null);
  assert.equal(pictureSizeOf(null), null);
});

test('a JPEG whose tables come before the frame is read through them (the table marker is not the frame)', () => {
  const bytes = jpeg(300, 200);
  assert.deepEqual(pictureSizeOf(bytes), { width: 300, height: 200 });
});

test('the size is read from base64 text and from a Blob, and a text that is no picture gives nothing', async () => {
  assert.deepEqual(pictureSizeOfBase64(Buffer.from(png(800, 600)).toString('base64')), { width: 800, height: 600 });
  assert.equal(pictureSizeOfBase64('not base64 at all !!!'), null);
  assert.equal(pictureSizeOfBase64(''), null);
  assert.deepEqual(await pictureSizeOfBlob(new Blob([png(33, 44), deflateSync(Buffer.alloc(10))])), { width: 33, height: 44 });
  assert.equal(await pictureSizeOfBlob(null), null);
});
