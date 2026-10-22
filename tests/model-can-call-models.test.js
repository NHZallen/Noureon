import assert from 'node:assert/strict';
import test from 'node:test';

import { MODELS, TOOL_CALLING_MODEL_IDS, modelCanCallModels, modelSupportsToolCalling, modelSupportsVision } from '../src/app/runtime/shell/model-registry.js';
import { modelPickerText } from '../src/app/ui/model-picker/model-picker-texts.js';

// A text model may call another model (draw a picture with the one the person chose) only when it can be given a tool and can look at a picture.

test('a model that takes tools and pictures can call models', () => {
  const model = MODELS.find((candidate) => modelSupportsToolCalling(candidate) && modelSupportsVision(candidate));
  assert.ok(model, 'the registry has at least one such model');
  assert.equal(modelCanCallModels(model), true);
});

test('a model that takes no tools, a picture model, or nothing cannot call models', () => {
  // Gemini models look at pictures; one that is not on the list of models that take tools cannot call models.
  const noTools = { id: 'a-model-that-takes-no-tools', provider: 'gemini' };
  assert.equal(modelSupportsVision(noTools), true);
  assert.equal(modelCanCallModels(noTools), false);
  const pictureModel = MODELS.find((candidate) => candidate.outputModality === 'image');
  assert.equal(modelCanCallModels(pictureModel), false);
  assert.equal(modelCanCallModels(null), false);
  assert.equal(modelCanCallModels(undefined), false);
});

test('a model that takes tools but cannot look at a picture cannot call models', () => {
  const toolsOnly = MODELS.filter((candidate) => modelSupportsToolCalling(candidate) && !modelSupportsVision(candidate));
  toolsOnly.forEach((model) => assert.equal(modelCanCallModels(model), false, model.id));
});

test('every model that can call models is in the list of models that take tools', () => {
  for (const model of MODELS.filter(modelCanCallModels)) assert.ok(TOOL_CALLING_MODEL_IDS.includes(model.id), model.id);
});

test('the ability has a name in the five languages of the model picker', () => {
  const names = ['zh-TW', 'en', 'fr', 'ru', 'es'].map((language) => modelPickerText(language, 'callsModels'));
  names.forEach((name) => assert.ok(name && name !== 'callsModels', name));
  assert.equal(new Set(names).size, 5, 'one for each language');
});
