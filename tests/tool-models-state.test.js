import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_IMAGE_PERMISSION, normalizeImagePermission, normalizePermissions, normalizeToolModel, normalizeToolModels } from '../src/data/tool-models.js';
import { getImagePermission, getImageToolModel, setImagePermission, setImageToolModel } from '../src/app/runtime/tool-models/tool-models-state.js';
import { normalizeLoadedLegacyConfig } from '../src/app/runtime/kernel/config-normalization.js';
import { digestSettings } from '../src/data/settings-merge.js';

// The models a text model may call and the permission for pictures: what the settings keep, and how a bad value is read.

test('a chosen model is a provider and an id, and anything else is none', () => {
  assert.deepEqual(normalizeToolModel({ provider: 'openrouter', id: 'openai/gpt-image-2.5-flare', extra: 1 }), { provider: 'openrouter', id: 'openai/gpt-image-2.5-flare' });
  for (const bad of [null, undefined, 'openrouter', 5, [], {}, { provider: 'openrouter' }, { id: 'x' }, { provider: '', id: 'x' }, { provider: 'a'.repeat(41), id: 'x' }, { provider: 'a', id: 'x'.repeat(201) }]) {
    assert.equal(normalizeToolModel(bad), null, JSON.stringify(bad));
  }
  assert.deepEqual(normalizeToolModels(undefined), { image: null });
  assert.deepEqual(normalizeToolModels({ image: { provider: 'gemini', id: 'm' }, other: 1 }), { image: { provider: 'gemini', id: 'm' } });
});

test('the permission for pictures is ask unless it says always', () => {
  assert.equal(DEFAULT_IMAGE_PERMISSION, 'ask');
  assert.equal(normalizeImagePermission('always'), 'always');
  for (const other of ['ask', 'never', '', null, undefined, 1]) assert.equal(normalizeImagePermission(other), 'ask');
  assert.deepEqual(normalizePermissions(null), { imageGeneration: 'ask' });
  assert.deepEqual(normalizePermissions({ imageGeneration: 'always' }), { imageGeneration: 'always' });
});

test('choosing the picture model changes the settings only when the choice is new', () => {
  const config = {};
  assert.equal(getImageToolModel(config), null);
  assert.equal(setImageToolModel(config, null), false, 'none stays none');
  assert.equal(setImageToolModel(config, { provider: 'openrouter', id: 'a' }), true);
  assert.deepEqual(config.toolModels, { image: { provider: 'openrouter', id: 'a' } });
  assert.equal(setImageToolModel(config, { provider: 'openrouter', id: 'a' }), false);
  assert.equal(setImageToolModel(config, { provider: 'openrouter', id: 'b' }), true);
  assert.equal(setImageToolModel(config, 'junk'), true, 'what is not a model is none');
  assert.equal(getImageToolModel(config), null);
});

test('the permission for pictures changes the settings only when the choice is new', () => {
  const config = {};
  assert.equal(getImagePermission(config), 'ask');
  assert.equal(setImagePermission(config, 'ask'), true, 'the first save writes the default down');
  assert.equal(setImagePermission(config, 'ask'), false);
  assert.equal(setImagePermission(config, 'always'), true);
  assert.deepEqual(config.permissions, { imageGeneration: 'always' });
  assert.equal(setImagePermission(config, 'whatever'), true, 'a bad word is the default');
  assert.equal(getImagePermission(config), 'ask');
});

test('the settings the page loads have both, whatever was saved', () => {
  const currentConfig = { apiKeys: {}, uiTheme: {}, toolModels: { image: null }, permissions: { imageGeneration: 'ask' } };
  const loaded = normalizeLoadedLegacyConfig({ currentConfig, savedConfig: { toolModels: { image: { provider: 'openrouter', id: 'a' } }, permissions: { imageGeneration: 'always' } } });
  assert.deepEqual(loaded.toolModels, { image: { provider: 'openrouter', id: 'a' } });
  assert.deepEqual(loaded.permissions, { imageGeneration: 'always' });
  const broken = normalizeLoadedLegacyConfig({ currentConfig, savedConfig: { toolModels: 'x', permissions: { imageGeneration: 3 } } });
  assert.deepEqual(broken.toolModels, { image: null });
  assert.deepEqual(broken.permissions, { imageGeneration: 'ask' });
});

test('both settings travel between devices key by key, like the other settings', () => {
  const digests = digestSettings({ toolModels: { image: null }, permissions: { imageGeneration: 'ask' } });
  assert.ok('toolModels' in digests && 'permissions' in digests);
  assert.notEqual(digestSettings({ permissions: { imageGeneration: 'always' } }).permissions, digests.permissions);
});
