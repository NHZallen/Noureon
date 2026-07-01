import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMessageRenderView } from '../src/app/legacy-runtime/features/message-markup-renderer.js';

const render = (message) => buildMessageRenderView({
  message,
  renderUserText: value => value,
  renderMarkdownWithFormulas: value => value,
  buildMediaAttachmentView: () => ({ html: '', previewMediaParts: [] }),
  formatTimestamp: () => '15:52',
  copyTitle: '複製'
});

test('renders durable generated images with download and edit actions', () => {
  const view = render({
    role: 'model',
    createdAt: '2026-07-01T15:52:00.000Z',
    parts: [{ generatedImage: {
      id: 'asset-1', storageKey: 'key', mediaType: 'image/png', size: 5, aspectRatio: '4:5'
    }}]
  });

  assert.match(view.messageHTML, /data-generated-image-id="asset-1"/);
  assert.match(view.messageHTML, /data-generated-image-download="asset-1"/);
  assert.match(view.messageHTML, /data-generated-image-edit="asset-1"/);
  assert.match(view.messageHTML, /data-generated-image-preview="asset-1"/);
  assert.match(view.messageHTML, /<svg/);
  assert.match(view.messageHTML, /aspect-ratio: 4 \/ 5/);
  assert.match(view.messageHTML, />編輯</);
  assert.equal(view.messageHTML.includes('指定編輯'), false);
  assert.equal(view.generatedImageAssets.length, 1);
  assert.equal(view.messageHTML.includes('copy-content-btn'), false);
});

test('renders an image-generation skeleton for loading messages', () => {
  const view = render({
    role: 'model',
    parts: [{ imageGenerationLoading: true, imageAspectRatio: '16:9' }],
    createdAt: '2026-07-01T15:52:00.000Z'
  });
  assert.match(view.messageHTML, /generated-image-skeleton/);
  assert.match(view.messageHTML, /data-image-generation-stage/);
  assert.match(view.messageHTML, /message-content/);
  assert.match(view.messageHTML, /aspect-ratio: 16 \/ 9/);
  assert.match(view.messageHTML, /image-message-stack/);
  assert.match(view.messageHTML, /正在建立圖像/);
});
