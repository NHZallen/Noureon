import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import { createGeneratedImageInteractions } from '../src/app/legacy-runtime/features/generated-image-interactions.js';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

test('binds generated image preview and opens targeted editor controls', async () => {
  const window = new Window();
  const { document } = window;
  const previews = [];
  const root = document.createElement('div');
  root.innerHTML = `
    <button data-generated-image-preview="asset-1"></button>
    <button data-generated-image-edit="asset-1"></button>`;
  document.body.appendChild(root);

  const lifecycle = createGeneratedImageInteractions({
    document,
    getImageDataUrl: async () => 'data:image/png;base64,aGVsbG8=',
    openPreview: media => previews.push(media),
    attachAnnotatedImage: async () => {},
    getUiLanguage: () => 'zh-TW'
  });
  lifecycle.bind(root, [{ id: 'asset-1', mediaType: 'image/png' }]);

  root.querySelector('[data-generated-image-preview]').click();
  await flush();
  assert.equal(previews.length, 1);
  assert.equal(previews[0].src, 'data:image/png;base64,aGVsbG8=');

  root.querySelector('[data-generated-image-edit]').click();
  await flush();
  const editor = document.querySelector('.generated-image-editor');
  assert.ok(editor);
  assert.equal(editor.querySelectorAll('.generated-image-editor-color').length, 5);
  assert.ok(editor.querySelector('.generated-image-editor-eraser'));
  assert.ok(editor.querySelector('.generated-image-editor-confirm'));
  assert.equal(editor.querySelector('.media-lightbox-toolbar'), null);

  editor.querySelector('.generated-image-editor-close').click();
  assert.equal(document.querySelector('.generated-image-editor'), null);
  window.close();
});

