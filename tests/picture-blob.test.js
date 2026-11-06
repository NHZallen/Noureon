import assert from 'node:assert/strict';
import test from 'node:test';

import { createDom } from './behaviours/helpers/create-dom.js';
import { createMediaPreviewLifecycle } from '../src/app/runtime/messages/media-preview-lifecycle.js';
import { dataUrlToBlob, saveWithShareSheet } from '../src/app/runtime/images/picture-blob.js';

// The save, share and edit buttons of a picture: the page's policy refuses `fetch` of a data address (vercel.json: connect-src has no `data:`), so a picture is decoded, never fetched.

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('a data address becomes a Blob of its type and bytes without any request', async () => {
  const blob = dataUrlToBlob(PNG);
  assert.equal(blob.type, 'image/png');
  assert.equal(blob.size, 70);
  assert.deepEqual([...new Uint8Array(await blob.arrayBuffer()).slice(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
  assert.equal(await dataUrlToBlob('data:text/plain,hello%20world').text(), 'hello world');
  assert.equal(dataUrlToBlob('https://example.com/a.png'), null);
  assert.equal(dataUrlToBlob(''), null);
  assert.equal(dataUrlToBlob('data:image/png;base64,%%%'), null, 'bytes that are not base64 are no picture');
  assert.equal(dataUrlToBlob(undefined), null);
});

test('on an iPhone or iPad a save goes to the share sheet; anywhere else the link is left alone', () => {
  const blob = new Blob(['x'], { type: 'image/gif' });
  const shared = [];
  const phone = (userAgent, extra = {}) => ({ userAgent, platform: '', maxTouchPoints: 0, share: async (data) => { shared.push(data); }, canShare: () => true, ...extra });
  assert.equal(saveWithShareSheet({ blob, name: 'a.gif', navigator: phone('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) GSA/445') }), true);
  assert.equal(shared.length, 1);
  assert.equal(shared[0].files[0].name, 'a.gif');
  assert.equal(shared[0].files[0].type, 'image/gif');
  assert.equal(saveWithShareSheet({ blob, name: 'a.gif', navigator: phone('Mozilla/5.0 (Macintosh)', { platform: 'MacIntel', maxTouchPoints: 5 }) }), true, 'an iPad that says it is a Mac');
  assert.equal(saveWithShareSheet({ blob, name: 'a.gif', navigator: phone('Mozilla/5.0 (Windows NT 10.0) Chrome/120') }), false);
  assert.equal(saveWithShareSheet({ blob, name: 'a.gif', navigator: phone('Mozilla/5.0 (Macintosh)', { platform: 'MacIntel' }) }), false, 'a Mac with no touch');
  assert.equal(saveWithShareSheet({ blob, name: 'a.gif', navigator: phone('iPhone', { canShare: () => false }) }), false, 'a sheet that cannot take a file');
  assert.equal(saveWithShareSheet({ blob, name: 'a.gif', navigator: phone('iPhone', { share: undefined }) }), false);
  assert.equal(saveWithShareSheet({ blob: null, name: 'a.gif', navigator: phone('iPhone') }), false);
});

test('the preview shares the picture without fetching it, and has no Share button where nothing can be shared', async () => {
  const { window, document, cleanup } = createDom('<div></div>');
  try {
    const shared = [];
    const make = (navigator) => createMediaPreviewLifecycle({
      document, navigator, fetch: () => { throw new Error('a data address must not be fetched'); }, File: window.File, escapeHTML: (v) => String(v ?? ''), getInlineMediaSrc: (item) => item.src, getUiLanguage: () => 'en', logWarn: () => {}
    });
    make({ userAgent: 'x', share: async (data) => { shared.push(data); }, canShare: () => true }).openMediaPreview({ src: PNG, mimeType: 'image/png', name: 'a.png' });
    document.querySelector('.media-lightbox-share').click();
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(shared.length, 1);
    assert.equal(shared[0].files[0].name, 'a.png');
    document.querySelector('.media-lightbox').remove();
    make({ userAgent: 'x' }).openMediaPreview({ src: PNG, mimeType: 'image/png', name: 'a.png' });
    assert.equal(document.querySelector('.media-lightbox-share'), null, 'no sharing here, so no button that does nothing');
  } finally {
    cleanup();
  }
});
