import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { compressImage } from '../src/app/runtime/utils/image-compression.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

const withImageEnvironment = async ({
  width = 800,
  height = 600,
  fail = false,
  toDataURL = () => 'data:image/jpeg;base64,compressed'
}, callback) => {
  const originalImage = globalThis.Image;
  const originalDocument = globalThis.document;
  const drawCalls = [];
  const canvases = [];

  class FakeImage {
    set src(value) {
      this.source = value;
      this.width = width;
      this.height = height;
      queueMicrotask(() => {
        if (fail) this.onerror();
        else this.onload();
      });
    }
  }

  globalThis.Image = FakeImage;
  globalThis.document = {
    createElement(tagName) {
      assert.equal(tagName, 'canvas');
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => ({
          drawImage: (...args) => drawCalls.push(args)
        }),
        toDataURL
      };
      canvases.push(canvas);
      return canvas;
    }
  };

  try {
    await callback({ drawCalls, canvases });
  } finally {
    globalThis.Image = originalImage;
    globalThis.document = originalDocument;
  }
};

test('compressImage preserves GIF data without creating image or canvas work', async () => {
  const result = await compressImage('gif-data', 'image/gif');

  assert.deepEqual(result, {
    data: 'gif-data',
    mimeType: 'image/gif',
    ext: 'gif'
  });
});

test('compressImage resizes wide images and preserves PNG output behavior', async () => {
  await withImageEnvironment({
    width: 2400,
    height: 1200,
    toDataURL: (mimeType, quality) => {
      assert.equal(mimeType, 'image/png');
      assert.equal(quality, 0.7);
      return 'data:image/png;base64,resized-png';
    }
  }, async ({ drawCalls, canvases }) => {
    const result = await compressImage('source', 'image/png', 1200, 0.7);

    assert.deepEqual(result, {
      data: 'resized-png',
      mimeType: 'image/png',
      ext: 'png'
    });
    assert.equal(canvases[0].width, 1200);
    assert.equal(canvases[0].height, 600);
    assert.deepEqual(drawCalls[0].slice(1), [0, 0, 1200, 600]);
  });
});

test('compressImage converts other image types to JPEG', async () => {
  await withImageEnvironment({}, async () => {
    const result = await compressImage('source', 'image/bmp');

    assert.deepEqual(result, {
      data: 'compressed',
      mimeType: 'image/jpeg',
      ext: 'jpg'
    });
  });
});

test('compressImage preserves the legacy fallback when image loading fails', async () => {
  await withImageEnvironment({ fail: true }, async ({ canvases }) => {
    const result = await compressImage('original', 'image/custom');

    assert.deepEqual(result, {
      data: 'original',
      mimeType: 'image/custom',
      ext: 'custom'
    });
    assert.equal(canvases.length, 0);
  });
});

test('image compression module has no legacy fragment or virtual runtime dependency', () => {
  const source = readSource('src/app/runtime/utils/image-compression.js');

  assert.match(source, /export\s+function\s+compressImage/);
  assert.doesNotMatch(source, /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-app/);
});
