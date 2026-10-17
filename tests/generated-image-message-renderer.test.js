import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMessageRenderView } from '../src/app/legacy-runtime/features/message-markup-renderer.js';

const render = (message) => buildMessageRenderView({
  message,
  renderUserText: value => value,
  renderMarkdownWithFormulas: value => value,
  buildMediaAttachmentView: () => ({ html: '', previewMediaParts: [] }),
  formatTimestamp: () => '15:52',
  copyTitle: '複製',
  labels: { edit: '編輯', imageCreating: '正在建立圖像', imagePreview: '預覽生成圖片', imageAlt: 'AI 生成圖片', imageDownloadOriginal: '下載原始圖片' }
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
  assert.match(view.messageHTML, /data-target-aspect-ratio="16:9"/);
  assert.match(view.messageHTML, /image-message-stack/);
  assert.match(view.messageHTML, /<span class="generated-image-wait-label"><\/span>/, "the words of the stage are put in by image-wait.js");
  assert.match(view.messageHTML, /<noureon-image-wait aria-hidden="true"><\/noureon-image-wait>/, 'the field of dots');
  assert.doesNotMatch(view.messageHTML, /generated-image-skeleton-shimmer/);
});

test('the place-holder keeps the time the picture was begun, for a picture found again after the page was closed', () => {
  const view = render({
    role: 'model',
    parts: [{ imageGenerationLoading: true, imageAspectRatio: '1:1', imageStartedAt: 1760000000000 }],
    createdAt: '2026-07-01T15:52:00.000Z'
  });
  assert.match(view.messageHTML, /<noureon-image-wait data-started="1760000000000"/);
});

test('several pictures of one reply are one set with a small picture for each; the waiting message shows a place-holder for each', () => {
  const picture = (id) => ({ generatedImage: { id, storageKey: `key-${id}`, mediaType: 'image/png', size: 5, aspectRatio: '1:1' } });
  const view = render({ role: 'model', createdAt: '2026-07-01T15:52:00.000Z', parts: [picture('p1'), picture('p2'), picture('p3')] });
  assert.equal((view.messageHTML.match(/data-generated-image-set/g) || []).length, 1);
  assert.equal((view.messageHTML.match(/class="generated-image-slide/g) || []).length, 3);
  assert.equal((view.messageHTML.match(/data-generated-image-thumb="/g) || []).length, 3);
  assert.equal((view.messageHTML.match(/data-generated-image-edit="/g) || []).length, 3, 'each picture keeps its own buttons');
  assert.equal(view.generatedImageAssets.length, 3);

  const one = render({ role: 'model', createdAt: '2026-07-01T15:52:00.000Z', parts: [picture('p1')] });
  assert.equal(one.messageHTML.includes('data-generated-image-set'), false, 'one picture is shown as before');

  const waiting = render({ role: 'model', parts: [{ imageGenerationLoading: true, imageAspectRatio: '1:1', imageCount: 4 }] });
  assert.equal((waiting.messageHTML.match(/generated-image-thumb-wait/g) || []).length, 4);
  assert.equal(render({ role: 'model', parts: [{ imageGenerationLoading: true, imageAspectRatio: '1:1' }] }).messageHTML.includes('generated-image-thumb-wait'), false);
});
