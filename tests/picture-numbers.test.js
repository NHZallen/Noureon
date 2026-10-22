import assert from 'node:assert/strict';
import test from 'node:test';

import { createDom } from './behaviours/helpers/create-dom.js';
import { attachedPictureNumbers, drawnPictureNumbers, listPictures } from '../src/data/conversation-pictures.js';
import { createUploadedFilePreviewLifecycle } from '../src/app/runtime/features/uploaded-file-preview-lifecycle.js';
import { createMediaAttachmentRenderer } from '../src/app/runtime/messages/media-attachment-renderer.js';
import { buildMessageRenderView } from '../src/app/runtime/messages/message-markup-renderer.js';
import { pictureNumberHTML, setPictureNumber } from '../src/app/ui/files/picture-number.js';
import { syncPictureNumbers } from '../src/app/runtime/tool-models/picture-numbers.js';

const png = (name, data = 'abc') => ({ name, mimeType: 'image/png', data });

test('the pictures of a message are counted in their order from 1; other files are not pictures', () => {
  assert.deepEqual(attachedPictureNumbers([png('a.png'), { name: 'n.pdf', mimeType: 'application/pdf', data: 'x' }, png('b.png'), { mimeType: 'image/png', data: 'x', name: '' }, png('c.png')]), [1, 0, 2, 0, 3]);
  assert.deepEqual(attachedPictureNumbers([]), []);
  assert.deepEqual(drawnPictureNumbers([{ id: 'a' }, { id: 'b' }, {}]), [1, 2, 0]);
});

test('each message counts from 1 again, as the model is told', () => {
  const history = [
    { role: 'user', parts: [{ text: 'draw' }] },
    { role: 'model', parts: [{ text: 'ok' }, { generatedImage: { id: 'g1' } }, { generatedImage: { id: 'g2' } }, { generatedImage: { id: 'g3' } }] },
    { role: 'user', parts: [{ inlineData: png('kettle.jpg') }] },
    { role: 'model', parts: [{ generatedImage: { id: 'h1' } }, { generatedImage: { id: 'h2' } }, { generatedImage: { id: 'h3' } }, { generatedImage: { id: 'h4' } }] }
  ];
  const numbers = listPictures({ history, current: [{ inlineData: png('sofa.jpg') }] }).map((picture) => `${picture.round}${picture.source[0]}${picture.number}`);
  assert.deepEqual(numbers, ['1g1', '1g2', '1g3', '2u1', '2g1', '2g2', '2g3', '2g4', '3u1']);
});

test('the chip is a digit only, and is put in, changed and taken away', () => {
  assert.equal(pictureNumberHTML(0), '');
  assert.equal(pictureNumberHTML(3), '<span class="picture-number" aria-hidden="true">3</span>');
  const dom = createDom('<div id="host"></div>');
  try {
    const host = dom.document.getElementById('host');
    setPictureNumber(dom.document, host, 2);
    setPictureNumber(dom.document, host, 2);
    assert.equal(host.querySelectorAll('.picture-number').length, 1);
    setPictureNumber(dom.document, host, 1);
    assert.equal(host.querySelector('.picture-number').textContent, '1');
    setPictureNumber(dom.document, host, 0);
    assert.equal(host.querySelector('.picture-number'), null);
  } finally {
    dom.cleanup();
  }
});

test('a sent message shows the numbers of its pictures, and the other files none', () => {
  const { buildMediaAttachmentView } = createMediaAttachmentRenderer({ escapeHTML: (value) => String(value) });
  const view = buildMediaAttachmentView([{ ...png('a.png'), mimeType: 'image/png' }, { name: 'n.pdf', mimeType: 'application/pdf', data: 'x' }, png('b.png')]);
  assert.deepEqual([...view.html.matchAll(/class="picture-number" aria-hidden="true">(\d+)</g)].map((match) => match[1]), ['1', '2']);
});

test('the pictures a reply drew show 1, 2, 3 in the reply, whatever the earlier replies had', () => {
  const picture = (id) => ({ generatedImage: { id, storageKey: id, mediaType: 'image/png', size: 1, aspectRatio: '1:1' } });
  const view = buildMessageRenderView({
    message: { role: 'model', parts: [{ text: 'Here' }, picture('a'), picture('b'), picture('c'), picture('d')], createdAt: '2026-06-24T10:30:00.000Z' },
    renderUserText: (text) => text,
    renderMarkdownWithFormulas: (text) => text,
    buildMediaAttachmentView: () => ({ html: '', previewMediaParts: [] }),
    formatTimestamp: () => '',
    copyTitle: 'Copy'
  });
  assert.deepEqual([...view.messageHTML.matchAll(/class="picture-number" aria-hidden="true">(\d+)</g)].map((match) => match[1]), ['1', '2', '3', '4']);
});

test('the box shows the number the picture will have, and closes up when one is taken away', () => {
  const dom = createDom('<div class="input-wrapper"></div><div id="previews"></div>');
  try {
    let files = [
      { id: 'a', name: 'a.png', type: 'image/png', base64: 'data:image/png;base64,abc' },
      { id: 'd', name: 'doc.pdf', type: 'application/pdf', base64: 'data:application/pdf;base64,x' },
      { id: 'b', name: 'b.png', type: 'image/png', base64: 'data:image/png;base64,def' },
      { id: 'c', name: 'c.png', type: 'image/png', base64: 'data:image/png;base64,ghi' }
    ];
    const lifecycle = createUploadedFilePreviewLifecycle({
      document: dom.document,
      getFiles: () => files,
      setFiles: (next) => { files = next; },
      getContainer: () => dom.document.querySelector('#previews'),
      getInputWrapper: () => dom.document.querySelector('.input-wrapper'),
      openMediaPreview: () => {},
      updateInputState: () => {}
    });
    lifecycle.renderFilePreviews();
    const shown = () => [...dom.document.querySelectorAll('.file-preview-item')].map((card) => card.querySelector('.picture-number')?.textContent || '-');
    assert.deepEqual(shown(), ['1', '2', '3', '-']);
    files = files.filter((file) => file.id !== 'a');
    lifecycle.renderFilePreviews();
    assert.deepEqual(shown(), ['1', '2', '-'].slice(0, dom.document.querySelectorAll('.file-preview-item').length), 'the numbers close up');
  } finally {
    dom.cleanup();
  }
});

test('the numbers are shown only while a picture model is chosen', () => {
  const dom = createDom('<div></div>');
  try {
    const root = dom.document.documentElement;
    assert.equal(syncPictureNumbers(root, { toolModels: { image: { provider: 'openrouter', id: 'openai/gpt-image-2.5-flare' } } }), true);
    assert.equal(root.getAttribute('data-picture-numbers'), 'on');
    assert.equal(syncPictureNumbers(root, { toolModels: { image: null } }), false);
    assert.equal(root.hasAttribute('data-picture-numbers'), false);
  } finally {
    dom.cleanup();
  }
});
