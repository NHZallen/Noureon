import test from 'node:test';
import assert from 'node:assert/strict';

import {
  IMAGE_GENERATION_MODEL_IDS,
  MODELS,
  modelGeneratesImages
} from '../src/app/runtime/legacy-core/model-registry.js';
import {
  DEFAULT_IMAGE_GENERATION_CONFIG,
  IMAGE_ASPECT_RATIOS,
  normalizeImageGenerationConfig,
  resolveSupportedAspectRatio,
  resolveSupportedResolution
} from '../src/app/legacy-runtime/features/image-generation-config.js';

const EXPECTED_MODELS = [
  'openai/gpt-image-2.5-flare',
  'openai/gpt-image-2.5-sunburst',
  'google/gemini-nano-banana-2.1'
];

test('registers the curated image generation models', () => {
  assert.deepEqual(IMAGE_GENERATION_MODEL_IDS, EXPECTED_MODELS);
  for (const id of EXPECTED_MODELS) {
    const model = MODELS.find(candidate => candidate.id === id);
    assert.equal(model?.provider, 'openrouter');
    assert.equal(model?.outputModality, 'image');
    assert.equal(modelGeneratesImages(model), true);
  }
});

test('normalizes image settings to safe supported values', () => {
  assert.deepEqual(DEFAULT_IMAGE_GENERATION_CONFIG, {
    aspectRatio: '1:1',
    resolution: '1K'
  });
  assert.deepEqual(normalizeImageGenerationConfig({
    aspectRatio: '16:9',
    resolution: '2K'
  }), {
    aspectRatio: '16:9',
    resolution: '2K'
  });
  assert.deepEqual(normalizeImageGenerationConfig({
    aspectRatio: 'nope',
    resolution: '16K'
  }), DEFAULT_IMAGE_GENERATION_CONFIG);
});

test('every image model lists the ratios it accepts, 1:1 first, each one a ratio the app can draw', () => {
  const byId = (id) => MODELS.find(model => model.id === id).supportedImageAspectRatios;
  for (const id of EXPECTED_MODELS) {
    const ratios = byId(id);
    assert.ok(Array.isArray(ratios) && ratios.length > 0, id);
    assert.equal(ratios[0], '1:1', id);
    for (const ratio of ratios) assert.ok(IMAGE_ASPECT_RATIOS.includes(ratio), `${id} ${ratio}`);
  }
  assert.deepEqual(byId('google/gemini-nano-banana-2.1'), ['1:1', '1:4', '4:1', '1:8', '8:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9']);
  assert.ok(!byId('openai/gpt-image-2.5-flare').includes('4:5'), 'GPT Image has no 4:5');
  assert.ok(!byId('openai/gpt-image-2.5-sunburst').includes('1:4'));
});

test('a ratio the model lacks moves to the nearest one it has', () => {
  const gpt = ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16', '21:9'];
  assert.equal(resolveSupportedAspectRatio('16:9', gpt), '16:9');
  assert.equal(resolveSupportedAspectRatio('4:5', gpt), '3:4');
  assert.equal(resolveSupportedAspectRatio('1:4', gpt), '9:16');
  assert.equal(resolveSupportedAspectRatio('8:1', gpt), '21:9');
  assert.equal(resolveSupportedAspectRatio('auto', gpt), '1:1');
  assert.equal(resolveSupportedAspectRatio('9:21', ['1:1', '2:3', '9:16']), '9:16');
  assert.equal(resolveSupportedAspectRatio('1:8', undefined), '1:8', 'without a list everything is allowed');
});

test('every image model lists its resolutions', () => {
  const byId = (id) => MODELS.find(model => model.id === id).supportedImageResolutions;
  assert.deepEqual(byId('google/gemini-nano-banana-2.1'), ['1K', '2K', '4K'], 'no 512 size');
  assert.deepEqual(byId('openai/gpt-image-2.5-flare'), ['1K', '2K', '4K']);
  assert.deepEqual(byId('openai/gpt-image-2.5-sunburst'), ['1K', '2K', '4K']);
});

test('a resolution the model lacks moves to the nearest tier it has', () => {
  assert.equal(resolveSupportedResolution('2K', ['1K', '2K', '4K']), '2K');
  assert.equal(resolveSupportedResolution('512', ['1K', '2K', '4K']), '1K');
  assert.equal(resolveSupportedResolution('4K', ['1K']), '1K');
  assert.equal(resolveSupportedResolution('2K', ['1K', '4K']), '1K', 'a tie goes to the smaller tier');
  assert.equal(resolveSupportedResolution('2K', []), '', 'a model that sets its own size gets none');
  assert.equal(resolveSupportedResolution('2K', undefined), '2K');
});

test('the three earlier OpenRouter Gemini image models are replaced by Nano Banana 2.1: saved chats and settings move over, a saved 512 size becomes 1K', async () => {
  const { createModelIdCanonicalizer } = await import('../src/app/runtime/kernel/config-normalization.js');
  const canonical = createModelIdCanonicalizer({ models: MODELS });
  for (const oldId of ['google/gemini-3.1-flash-image', 'google/gemini-3.1-flash-lite-image', 'google/gemini-3-pro-image']) {
    assert.equal(MODELS.some(model => model.id === oldId), false, `${oldId} left the list`);
    assert.equal(canonical(oldId), 'google/gemini-nano-banana-2.1', oldId);
  }
  const model = MODELS.find(candidate => candidate.id === 'google/gemini-nano-banana-2.1');
  assert.equal(resolveSupportedResolution('512', model.supportedImageResolutions), '1K');
  assert.equal(resolveSupportedAspectRatio('9:21', model.supportedImageAspectRatios), '9:16');
});
