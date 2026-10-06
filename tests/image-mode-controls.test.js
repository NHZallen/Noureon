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

test('the ratio menu offers only what the chosen model supports and moves an unsupported saved ratio to the nearest', () => {
  const { document, cleanup } = createDom('<div id="file-options-popover"><button id="learning-mode-btn"></button></div>');
  const conversation = { imageConfig: { aspectRatio: '1:8', resolution: '1K' } };
  let model = { outputModality: 'image', supportedImageAspectRatios: ['1:1', '2:3', '3:2', '9:16', '16:9'] };
  const controls = createImageModeControls({
    document,
    getActiveConversation: () => conversation,
    getActiveModel: () => model,
    modelGeneratesImages: () => true,
    saveAppData: async () => {}
  });
  controls.sync();
  const select = document.getElementById('image-aspect-ratio-select');
  const shown = () => Array.from(select.options).filter(option => !option.hidden && !option.disabled).map(option => option.value);
  assert.deepEqual(shown().sort(), ['1:1', '16:9', '2:3', '3:2', '9:16'].sort());
  assert.equal(select.value, '9:16', '1:8 is closest to 9:16');
  model = { outputModality: 'image' };
  controls.sync();
  assert.ok(shown().includes('21:9') && shown().includes('auto'), 'a model without a list is offered every ratio');
  cleanup();
});

test('the resolution control follows the model: only its tiers, moved to the nearest, and hidden when the model has none to choose', () => {
  const { document, cleanup } = createDom('<div id="file-options-popover"><button id="learning-mode-btn"></button></div>');
  const conversation = { imageConfig: { aspectRatio: '1:1', resolution: '4K' } };
  let model = { outputModality: 'image', supportedImageResolutions: ['1K'] };
  const controls = createImageModeControls({
    document,
    getActiveConversation: () => conversation,
    getActiveModel: () => model,
    modelGeneratesImages: () => true,
    saveAppData: async () => {}
  });
  controls.sync();
  const select = document.getElementById('image-resolution-select');
  const row = document.getElementById('image-resolution-control');
  assert.deepEqual(Array.from(select.options).filter(option => !option.hidden).map(option => option.value), ['1K']);
  assert.equal(select.value, '1K');
  assert.equal(row.style.display, 'flex');
  model = { outputModality: 'image', supportedImageResolutions: [] };
  controls.sync();
  assert.equal(row.style.display, 'none');
  assert.equal(document.getElementById('image-aspect-ratio-control').style.display, 'flex');
  model = { outputModality: 'image', supportedImageResolutions: ['512', '1K', '2K', '4K'] };
  controls.sync();
  assert.equal(row.style.display, 'flex');
  cleanup();
});

test('the council item stays hidden in a temporary chat when the controls refresh', () => {
  const { document, cleanup } = createDom('<div id="file-options-popover"><button id="model-council-menu-btn"></button><button id="learning-mode-btn"></button></div>');
  const conversation = { retentionMode: 'ephemeral' };
  const controls = createImageModeControls({
    document,
    getActiveConversation: () => conversation,
    getActiveModel: () => ({ outputModality: 'text' }),
    modelGeneratesImages: () => false,
    saveAppData: async () => {}
  });
  controls.sync();
  assert.equal(document.getElementById('model-council-menu-btn').style.display, 'none');
  assert.equal(document.getElementById('learning-mode-btn').style.display, 'flex', 'learning mode stays');
  conversation.retentionMode = 'persistent';
  controls.sync();
  assert.equal(document.getElementById('model-council-menu-btn').style.display, 'flex');
  cleanup();
});
