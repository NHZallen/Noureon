import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createMediaAttachmentRenderer } from '../src/app/legacy-runtime/features/media-attachment-renderer.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');
const escapeHTML = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[char]));

const renderer = createMediaAttachmentRenderer({ escapeHTML });

test('resolves inline image and video sources with the legacy data URL format', () => {
  assert.equal(
    renderer.getInlineMediaSrc({ mimeType: 'image/png', data: 'abc' }),
    'data:image/png;base64,abc'
  );
  assert.equal(
    renderer.getInlineMediaSrc({ mimeType: 'video/mp4', data: 'def' }),
    'data:video/mp4;base64,def'
  );
  assert.equal(
    renderer.getInlineMediaSrc({ data: 'ghi' }),
    'data:application/octet-stream;base64,ghi'
  );
});

test('renders image and video preview buttons in source order with stable indexes', () => {
  const mediaParts = [
    { name: 'photo.png', mimeType: 'image/png', data: 'abc' },
    { name: 'clip.mp4', mimeType: 'video/mp4', data: 'def' }
  ];
  const view = renderer.buildMediaAttachmentView(mediaParts);
  const html = view.html;

  assert.deepEqual(view.previewMediaParts, mediaParts);
  assert.notEqual(view.previewMediaParts, mediaParts);
  assert.ok(html.indexOf('photo.png') < html.indexOf('clip.mp4'));
  assert.match(html, /class="message-media-thumb" data-media-index="0"/);
  assert.match(html, /<img src="data:image\/png;base64,abc"/);
  assert.match(html, /class="message-media-thumb message-media-video" data-media-index="1"/);
  assert.match(html, /<video src="data:video\/mp4;base64,def"/);
  assert.match(html, /class="message-media-play"/);
});

test('renders document, audio, and malformed metadata through the legacy file-chip branch', () => {
  const html = renderer.renderMediaAttachmentGrid([
    { name: 'report.pdf', mimeType: 'application/pdf', data: 'pdf' },
    { name: 'audio.mp3', mimeType: 'audio/mpeg', data: 'audio' },
    {}
  ]);

  assert.equal((html.match(/class="message-file-chip"/g) || []).length, 3);
  assert.match(html, />report\.pdf<\/span>/);
  assert.match(html, />audio\.mp3<\/span>/);
  assert.match(html, />application\/octet-stream<\/span>/);
});

test('preserves search and trash wrapper-part compatibility without implicit normalization', () => {
  const wrappedPart = {
    inlineData: { name: 'wrapped.png', mimeType: 'image/png', data: 'abc' }
  };
  const view = renderer.buildMediaAttachmentView([wrappedPart]);

  assert.deepEqual(view.previewMediaParts, [wrappedPart]);
  assert.match(view.html, /class="message-file-chip"/);
  assert.match(view.html, />application\/octet-stream<\/span>/);
  assert.doesNotMatch(view.html, /message-media-thumb/);
});

test('preserves single visual layout and empty media boundaries', () => {
  assert.equal(renderer.renderMediaAttachmentGrid(), '');
  assert.equal(renderer.renderMediaAttachmentGrid([]), '');
  assert.match(
    renderer.renderMediaAttachmentGrid([{ name: 'one.png', mimeType: 'image/png', data: 'abc' }]),
    /message-media-grid message-media-grid-single/
  );
  assert.doesNotMatch(
    renderer.renderMediaAttachmentGrid([{ name: 'one.pdf', mimeType: 'application/pdf', data: 'abc' }]),
    /message-media-grid-single/
  );
});

test('media attachment renderer source avoids DOM and runtime ownership', () => {
  const source = readSource('src/app/legacy-runtime/features/media-attachment-renderer.js');

  for (const token of [
    'document',
    'window',
    'globalThis',
    'fetch',
    'indexedDB',
    'localStorage',
    'sessionStorage',
    'addEventListener',
    'streamApiCall',
    'package.json',
    'vite.config',
    'virtual:legacy-app-runtime'
  ]) {
    assert.equal(source.includes(token), false, token);
  }
});
