import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import { createGeneratedImageInteractions } from '../src/app/runtime/images/generated-image-interactions.js';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const lightweightPng = 'data:image/png;base64,aGVsbG8=';

test('binds generated image preview and opens targeted editor controls', async () => {
  const window = new Window();
  const { document } = window;
  window.HTMLCanvasElement.prototype.getContext = () => ({
    clearRect: () => {},
    drawImage: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    getImageData: () => ({ data: new Uint8ClampedArray(4) })
  });
  const previews = [];
  const root = document.createElement('div');
  root.innerHTML = `
    <button data-generated-image-preview="asset-1"><img data-generated-image-id="asset-1"></button>
    <button data-generated-image-edit="asset-1"></button>`;
  document.body.appendChild(root);

  const lifecycle = createGeneratedImageInteractions({
    document,
    getImageDataUrl: async () => lightweightPng,
    openPreview: (media, sourceElement) => previews.push({ media, sourceElement }),
    attachAnnotatedImage: async () => {},
    getUiLanguage: () => 'zh-TW'
  });
  lifecycle.bind(root, [{ id: 'asset-1', mediaType: 'image/png' }]);

  root.querySelector('[data-generated-image-preview]').click();
  await flush();
  assert.equal(previews.length, 1);
  assert.equal(previews[0].media.src, lightweightPng);
  assert.equal(previews[0].sourceElement, root.querySelector('[data-generated-image-id]'));

  root.querySelector('[data-generated-image-edit]').click();
  await flush();
  const editor = document.querySelector('.generated-image-editor');
  assert.ok(editor);
  assert.equal(editor.classList.contains('generated-image-editor-enter'), true);
  assert.equal(editor.querySelectorAll('.generated-image-editor-color').length, 4);
  assert.ok(editor.querySelector('.generated-image-editor-eraser'));
  assert.ok(editor.querySelector('.generated-image-editor-eraser path[d="M22 21H7"]'));
  assert.equal(editor.querySelector('.generated-image-editor-size input').value, '14');
  assert.equal(editor.querySelectorAll('.generated-image-editor-history-btn').length, 3);
  assert.ok(editor.querySelector('.generated-image-editor-size-preview'));
  assert.ok(editor.querySelector('.generated-image-editor-confirm'));
  assert.ok(editor.querySelector('.generated-image-editor-confirm path[d="m5 12 4 4L19 6"]'));
  assert.equal(editor.querySelector('.media-lightbox-toolbar'), null);
  // The layout: the way out, the history and the confirm button in the top bar; in the footer the size (its round preview and the slider; a row on a phone,
  // the left edge on a wide screen) and the colours, a line and the eraser.
  assert.ok(editor.querySelector('.generated-image-editor-header .generated-image-editor-close'));
  assert.equal(editor.querySelectorAll('.generated-image-editor-header .generated-image-editor-history-btn').length, 3);
  assert.ok(editor.querySelector('.generated-image-editor-header .generated-image-editor-confirm'));
  assert.ok(editor.querySelector('.generated-image-editor-toolbar .generated-image-editor-size .generated-image-editor-size-preview'));
  assert.ok(editor.querySelector('.generated-image-editor-toolbar .generated-image-editor-size input[type="range"]'));
  assert.equal(editor.querySelectorAll('.generated-image-editor-toolbar .generated-image-editor-color').length, 4);
  assert.ok(editor.querySelector('.generated-image-editor-toolbar .generated-image-editor-divider'));
  assert.ok(editor.querySelector('.generated-image-editor-toolbar .generated-image-editor-eraser'));

  editor.querySelector('.generated-image-editor-close').click();
  assert.equal(document.querySelector('.generated-image-editor'), null);
  window.close();
});

test('the preview and the editor wait for their stylesheet, loaded once', async () => {
  const window = new Window();
  const { document } = window;
  window.HTMLCanvasElement.prototype.getContext = () => ({ clearRect: () => {}, drawImage: () => {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }) });
  const root = document.createElement('div');
  root.innerHTML = '<button data-generated-image-preview="asset-1"><img data-generated-image-id="asset-1"></button><button data-generated-image-edit="asset-1"></button>';
  document.body.appendChild(root);
  const previews = [];
  let loads = 0;
  let finish;
  const lifecycle = createGeneratedImageInteractions({
    document,
    getImageDataUrl: async () => lightweightPng,
    openPreview: (media) => previews.push(media),
    attachAnnotatedImage: async () => {},
    loadStyles: () => { loads += 1; return new Promise((resolve) => { finish = resolve; }); }
  });
  lifecycle.bind(root, [{ id: 'asset-1', mediaType: 'image/png' }]);

  root.querySelector('[data-generated-image-preview]').click();
  await flush();
  assert.equal(previews.length, 0, 'the preview waits for the stylesheet');
  finish();
  await flush();
  assert.equal(previews.length, 1);

  root.querySelector('[data-generated-image-edit]').click();
  await flush();
  assert.ok(document.querySelector('.generated-image-editor'));
  assert.equal(loads, 1, 'the stylesheet is loaded once');
});
