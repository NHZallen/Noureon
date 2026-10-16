import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { createGeneratedImageActions } from '../src/app/runtime/legacy-core/generated-image-actions.js';
import { createGeneratedImageInteractions } from '../src/app/legacy-runtime/features/generated-image-interactions.js';
import { generatedImageIconButton } from '../src/app/legacy-runtime/features/generated-image-action-markup.js';
import i18n from '../src/data/i18n/index.js';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const IMAGE_MODEL = { id: 'black-forest-labs/flux-3-image', outputModality: 'image', supportedImageAspectRatios: ['1:1', '16:9', '9:16'] };
const TEXT_MODEL = { id: 'some/text-model' };

function actions(model = IMAGE_MODEL) {
  const log = { composer: [], notices: [], submitted: 0, saved: 0 };
  const conversation = { imageConfig: { aspectRatio: '1:1', resolution: '2K' } };
  const api = createGeneratedImageActions({
    getConversation: () => conversation,
    modelOf: () => model,
    modelGeneratesImages: (candidate) => candidate.outputModality === 'image',
    getText: (_key, fallback) => fallback,
    showNotification: (text, kind) => log.notices.push([text, kind]),
    saveAppData: async () => { log.saved += 1; },
    setComposer: (value) => log.composer.push(value),
    submit: async () => { log.submitted += 1; }
  });
  return { api, log, conversation };
}

test('remove from the picture sends the marked picture with a request to take the marked part out', async () => {
  const { api, log } = actions();
  await api.run({ kind: 'remove', dataUrl: 'data:image/png;base64,AAAA', descriptor: { id: 'a1', mediaType: 'image/png' } });
  assert.equal(log.submitted, 1);
  assert.match(log.composer[0].text, /Remove the marked part/);
  assert.deepEqual(log.composer[0].files.map((file) => [file.name, file.type, file.base64, file.targetedEdit]), [['astra-remove-a1.png', 'image/png', 'data:image/png;base64,AAAA', true]]);
});

test('changing the ratio saves the new ratio, sends that very picture as the reference and keeps the other settings', async () => {
  const { api, log, conversation } = actions();
  await api.run({ kind: 'resize', dataUrl: 'data:image/png;base64,BBBB', descriptor: { id: 'a2', mediaType: 'image/webp' }, ratio: '9:16' });
  assert.equal(conversation.imageConfig.aspectRatio, '9:16');
  assert.equal(conversation.imageConfig.resolution, '2K');
  assert.equal(log.saved, 1);
  assert.match(log.composer[0].text, /9:16 aspect ratio/);
  assert.deepEqual(log.composer[0].files.map((file) => [file.name, file.type, file.targetedEdit]), [['astra-resize-a2.png', 'image/webp', undefined]]);
  assert.equal(log.submitted, 1);
});

test('the ratios offered are the ones of the chosen model, and a text model gets a notice instead', () => {
  const image = actions();
  assert.deepEqual(image.api.ratios(), ['1:1', '16:9', '9:16']);
  assert.equal(image.api.canUse(), true);
  const text = actions(TEXT_MODEL);
  assert.equal(text.api.canUse(), false);
  assert.deepEqual(text.log.notices, [['Switch to a picture-making model first to use this.', 'warning']]);
});

test('the markup of the icon buttons has the hook the behaviour looks for, and the share button starts hidden', () => {
  const html = generatedImageIconButton('share', 'x"1', 'Share <it>', ' hidden');
  assert.match(html, /data-generated-image-share="x&quot;1"/);
  assert.match(html, /aria-label="Share &lt;it&gt;"/);
  assert.match(html, / hidden>/);
});

test('every language has the words of the new picture actions', () => {
  for (const language of ['zh-TW', 'en', 'fr', 'ru', 'es']) {
    for (const key of ['imageRemove', 'imageResize', 'imageShare', 'imageRemovePrompt', 'imageResizePrompt', 'imageActionNeedsModel', 'imageRatioMenu']) {
      assert.ok(String(i18n[language][key] || '').length > 3, `${language} ${key}`);
    }
    assert.match(i18n[language].imageResizePrompt, /\{ratio\}/, `${language} keeps the place of the ratio`);
  }
});

function pictureCard({ canShare = false, canUse = true } = {}) {
  const window = new Window();
  const { document } = window;
  window.HTMLCanvasElement.prototype.getContext = () => ({ clearRect() {}, drawImage() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }) });
  const root = document.createElement('div');
  root.innerHTML = `<img data-generated-image-id="p1">${['remove', 'resize', 'share'].map((kind) => generatedImageIconButton(kind, 'p1', kind, kind === 'share' ? ' hidden' : '')).join('')}`;
  document.body.appendChild(root);
  const sent = [];
  const shared = [];
  const lifecycle = createGeneratedImageInteractions({
    document,
    getImageDataUrl: async () => 'data:image/png;base64,aGVsbG8=',
    openPreview: () => {},
    attachAnnotatedImage: async () => {},
    onImageAction: async (action) => { sent.push(action); },
    canUseImageActions: () => canUse,
    getImageRatios: () => ['1:1', '16:9', '9:16'],
    getCurrentImageRatio: () => '16:9',
    getUiLanguage: () => 'en',
    getText: (key, fallback) => (key === 'imageRemove' ? 'Remove from the picture' : fallback),
    navigator: canShare ? { share: async (data) => { shared.push(data); }, canShare: () => true } : {},
    fetchImpl: async () => ({ blob: async () => ({ type: 'image/png', size: 5 }) }),
    FileCtor: class { constructor(parts, name, options) { this.name = name; this.type = options?.type; } }
  });
  lifecycle.bind(root, [{ id: 'p1', mediaType: 'image/png' }]);
  return { document, root, sent, shared };
}

test('remove opens the marking page for the picture, and its confirm button says what it does', async () => {
  const { document, root } = pictureCard();
  root.querySelector('[data-generated-image-remove]').click();
  await flush();
  const editor = document.querySelector('.generated-image-editor');
  assert.ok(editor, 'the page to mark the part to remove');
  assert.equal(editor.querySelector('.generated-image-editor-confirm').getAttribute('aria-label'), 'Remove from the picture');
});

test('without a picture-making model, remove and the ratio menu open nothing', async () => {
  const { document, root } = pictureCard({ canUse: false });
  root.querySelector('[data-generated-image-remove]').click();
  root.querySelector('[data-generated-image-resize]').click();
  await flush();
  assert.equal(document.querySelector('.generated-image-editor'), null);
  assert.equal(document.querySelector('.generated-image-ratio-menu'), null);
});

test('the ratio menu lists the ratios, marks the current one, sends the picture in the chosen one and closes', async () => {
  const { document, root, sent } = pictureCard();
  root.querySelector('[data-generated-image-resize]').click();
  await flush();
  const menu = document.querySelector('.generated-image-ratio-menu');
  assert.ok(menu);
  assert.deepEqual([...menu.querySelectorAll('[data-ratio]')].map((node) => node.dataset.ratio), ['1:1', '16:9', '9:16']);
  assert.equal(menu.querySelector('.is-current').dataset.ratio, '16:9');
  menu.querySelector('[data-ratio="9:16"]').click();
  await flush();
  assert.deepEqual(sent.map((action) => [action.kind, action.ratio, action.dataUrl]), [['resize', '9:16', 'data:image/png;base64,aGVsbG8=']]);
  assert.equal(document.querySelector('.generated-image-ratio-menu'), null);
});

test('the share button shows only where the device can share a picture, and shares the picture as a file', async () => {
  const without = pictureCard();
  assert.equal(without.root.querySelector('[data-generated-image-share]').hidden, true);
  const withShare = pictureCard({ canShare: true });
  const button = withShare.root.querySelector('[data-generated-image-share]');
  assert.equal(button.hidden, false);
  button.click();
  await flush();
  await flush();
  assert.equal(withShare.shared.length, 1);
  assert.equal(withShare.shared[0].files[0].name, 'noureon-generated-p1.png');
});
