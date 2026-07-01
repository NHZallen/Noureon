import test from 'node:test';
import assert from 'node:assert/strict';

import { createDom } from './behaviours/helpers/create-dom.js';
import { createImageModeControls } from '../src/app/legacy-runtime/features/image-mode-controls.js';

test('image models replace council and learning with ratio and resolution controls', async () => {
  const { document, cleanup } = createDom(`
    <div id="file-options-popover">
      <button id="model-council-menu-btn"></button>
      <button id="learning-mode-btn"></button>
    </div>
  `);
  let conversation = { imageConfig: { aspectRatio: '16:9', resolution: '2K' } };
  let imageMode = true;
  const controls = createImageModeControls({
    document,
    getActiveConversation: () => conversation,
    getActiveModel: () => ({ outputModality: imageMode ? 'image' : 'text' }),
    modelGeneratesImages: model => model.outputModality === 'image',
    saveAppData: async () => {}
  });

  controls.sync();
  assert.equal(document.getElementById('model-council-menu-btn').style.display, 'none');
  assert.equal(document.getElementById('learning-mode-btn').style.display, 'none');
  assert.equal(document.getElementById('image-aspect-ratio-control').style.display, 'flex');
  assert.equal(document.getElementById('image-resolution-control').style.display, 'flex');
  assert.doesNotMatch(document.getElementById('image-aspect-ratio-select').className, /bg-\[var\(--input-field-bg\)\]/);
  assert.doesNotMatch(document.getElementById('image-resolution-select').className, /bg-\[var\(--input-field-bg\)\]/);
  assert.match(document.getElementById('image-aspect-ratio-control').textContent, /16:9/);
  assert.match(document.getElementById('image-resolution-control').textContent, /2K/);

  imageMode = false;
  controls.sync();
  assert.equal(document.getElementById('model-council-menu-btn').style.display, 'flex');
  assert.equal(document.getElementById('learning-mode-btn').style.display, 'flex');
  assert.equal(document.getElementById('image-aspect-ratio-control').style.display, 'none');
  assert.equal(document.getElementById('image-resolution-control').style.display, 'none');
  cleanup();
});

test('persists changed image settings on the conversation', async () => {
  const { window, document, cleanup } = createDom('<div id="file-options-popover"></div>');
  const conversation = {};
  let saves = 0;
  const controls = createImageModeControls({
    document,
    getActiveConversation: () => conversation,
    getActiveModel: () => ({ outputModality: 'image' }),
    modelGeneratesImages: () => true,
    saveAppData: async () => { saves += 1; }
  });
  controls.sync();
  const select = document.getElementById('image-aspect-ratio-select');
  select.value = '9:16';
  select.dispatchEvent(new window.Event('change', { bubbles: true }));
  await Promise.resolve();
  assert.equal(conversation.imageConfig.aspectRatio, '9:16');
  assert.equal(saves, 1);
  const quality = document.getElementById('image-quality-select');
  quality.value = 'high';
  quality.dispatchEvent(new window.Event('change', { bubbles: true }));
  await Promise.resolve();
  assert.equal(conversation.imageAdvancedConfig.quality, 'high');
  const providerOptions = document.getElementById('image-provider-options-input');
  providerOptions.value = '{"options":{"openai":{"guidance":3}}}';
  providerOptions.dispatchEvent(new window.Event('change', { bubbles: true }));
  await Promise.resolve();
  assert.deepEqual(conversation.imageAdvancedConfig.provider, {
    options: { openai: { guidance: 3 } }
  });
  assert.equal(document.getElementById('image-advanced-control').style.display, 'block');
  cleanup();
});
