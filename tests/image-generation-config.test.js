import test from 'node:test';
import assert from 'node:assert/strict';

import {
  IMAGE_GENERATION_MODEL_IDS,
  MODELS,
  modelGeneratesImages
} from '../src/app/runtime/legacy-core/model-registry.js';
import {
  DEFAULT_IMAGE_GENERATION_CONFIG,
  normalizeImageGenerationConfig
} from '../src/app/legacy-runtime/features/image-generation-config.js';

const EXPECTED_MODELS = [
  'openai/gpt-image-2',
  'google/gemini-3-pro-image',
  'google/gemini-3.1-flash-image',
  'google/gemini-3.1-flash-lite-image',
  'step-plan/step-image-edit-2'
];

test('registers the curated image generation models', () => {
  assert.deepEqual(IMAGE_GENERATION_MODEL_IDS, EXPECTED_MODELS);
  for (const id of EXPECTED_MODELS) {
    const model = MODELS.find(candidate => candidate.id === id);
    assert.ok(['openrouter', 'stepfun'].includes(model?.provider));
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
