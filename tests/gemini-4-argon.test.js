import assert from 'node:assert/strict';
import test from 'node:test';

import { createStreamApiCall } from '../src/app/legacy-runtime/features/stream-api-call.js';
import { normalizeLoadedLegacyConfig } from '../src/app/runtime/kernel/config-normalization.js';
import {
  GEMINI_DOCUMENT_MODELS,
  MODELS,
  getCanonicalModelId,
  getModelApiId,
  getModelReasoningConfig,
  modelSupportsToolCalling,
  modelSupportsUploadedFile,
  modelSupportsVision,
  normalizeReasoningEffort
} from '../src/app/runtime/legacy-core/model-registry.js';
import i18n from '../src/data/i18n.js';

const native = MODELS.find((model) => model.id === 'gemini-4-argon');
const viaOpenRouter = MODELS.find((model) => model.id === 'google/gemini-4-argon');

test('Gemini 4 Argon replaces Gemini 3.1 Pro Preview, natively and on OpenRouter: the same name, the same abilities', () => {
  assert.ok(native && viaOpenRouter);
  assert.deepEqual([native.provider, viaOpenRouter.provider], ['gemini', 'openrouter']);
  assert.equal(native.name, 'Gemini 4 Argon');
  assert.equal(viaOpenRouter.name, native.name, 'the same name: the row says where it comes from');
  assert.equal(MODELS.some((model) => /3\.1-pro/.test(model.id)), false, 'the old model is gone from the list');
  for (const model of [native, viaOpenRouter]) {
    assert.equal(modelSupportsVision(model), true, `${model.id} takes pictures`);
    assert.equal(modelSupportsToolCalling(model), true, `${model.id} calls tools`);
    assert.equal(model.releasedAt, 20261013);
  }
  assert.ok(GEMINI_DOCUMENT_MODELS.includes('gemini-4-argon'), 'PDF and files go to the model itself');
  assert.equal(modelSupportsUploadedFile(native, { type: 'application/pdf' }), true);
  assert.equal(modelSupportsUploadedFile(viaOpenRouter, { type: 'application/pdf' }), true);
});

test('what was chosen under the name of Gemini 3.1 Pro Preview is Gemini 4 Argon now, the translator of documents included', () => {
  assert.equal(getCanonicalModelId('gemini-3.1-pro-preview'), 'gemini-4-argon');
  assert.equal(getCanonicalModelId('google/gemini-3.1-pro-preview'), 'google/gemini-4-argon');

  const normalized = normalizeLoadedLegacyConfig({
    currentConfig: { apiKeys: {}, uiTheme: {}, modelSettings: [] },
    savedConfig: { defaultModel: 'gemini-3.1-pro-preview', lastUsedModel: 'google/gemini-3.1-pro-preview', singleDocumentTranslatorModelId: 'gemini-3.1-pro-preview', councilTranslatorModelId: 'google/gemini-3.1-pro-preview', modelSettings: [{ id: 'gemini-3.1-pro-preview', hidden: true, order: 0 }] },
    models: MODELS,
    councilTranslatorCandidates: [MODELS[0], native, viaOpenRouter],
    singleTranslatorCandidates: [MODELS[0], native, viaOpenRouter]
  });
  assert.equal(normalized.defaultModel, 'gemini-4-argon');
  assert.equal(normalized.lastUsedModel, 'google/gemini-4-argon');
  assert.equal(normalized.singleDocumentTranslatorModelId, 'gemini-4-argon', 'not replaced by the first model of the list');
  assert.equal(normalized.councilTranslatorModelId, 'google/gemini-4-argon');
  assert.deepEqual(normalized.modelSettings.find((setting) => setting.id === 'gemini-4-argon'), { id: 'gemini-4-argon', hidden: true, order: 0 });
});

test('the thinking of Gemini 4 Argon: medium by default (what Google says), nothing to turn it off, and no low through OpenRouter', () => {
  for (const [model, options] of [[native, ['low', 'medium', 'high']], [viaOpenRouter, ['medium', 'high']]]) {
    const config = getModelReasoningConfig(model);
    assert.deepEqual([config.options, config.defaultEffort], [options, 'medium'], model.id);
    assert.equal(normalizeReasoningEffort(model, 'minimal'), 'medium', 'minimal is not a level of this model');
    assert.equal(normalizeReasoningEffort(model, 'high'), 'high');
  }
  assert.equal(normalizeReasoningEffort(native, 'low'), 'low');
  assert.equal(normalizeReasoningEffort(viaOpenRouter, 'low'), 'medium', 'a low chosen before falls back to the default');
  assert.equal(getModelReasoningConfig(native).providerParameter, 'geminiThinkingLevel');
  assert.equal(getModelReasoningConfig(viaOpenRouter).providerParameter, 'openrouterReasoningEffort');
});

test('the price is told in each language, with the day it changes', () => {
  for (const language of ['zh-TW', 'en', 'fr', 'ru', 'es']) {
    const text = i18n[language].model_gemini_4_argon_desc_tier_paid;
    assert.match(text, /10/, `${language} the price in force`);
    assert.match(text, /20/, `${language} the price after`);
    assert.match(text, /30/, `${language} the day`);
    assert.equal(i18n[language].model_gemini_3_1_pro_preview_desc_tier_paid, undefined, `${language} the text of the old model is gone`);
  }
});

const sent = async (model, { effort, search = false } = {}) => {
  const requests = [];
  const streamApiCall = createStreamApiCall({
    getActiveConversation: () => ({ id: 'c', model: model.id, messages: [{ role: 'user', parts: [{ text: 'Hi' }] }], genConfig: { temperature: 0.4, topP: 0.8, maxTokens: null }, isWebSearchEnabled: search, reasoningEffort: effort }),
    normalizeConversationModel: () => model,
    getModelApiId,
    getApiKeyForProvider: () => 'key',
    getDefaultGenConfig: () => ({ temperature: 0.7, topP: 0.95, maxTokens: null }),
    getConfig: () => ({ aiDefaultLanguage: 'en', uiLanguage: 'en', isLearningMode: false, memoryEnabled1: false }),
    getAstras: () => [],
    getPersonalMemories: () => [],
    modelSupportsUploadedFile,
    modelSupportsVision,
    getModelReasoningConfig,
    normalizeReasoningEffort,
    fetchImpl: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      return { ok: true, status: 200, body: new ReadableStream({ start(controller) { controller.close(); } }) };
    }
  });
  await streamApiCall([{ text: 'Hi' }], () => {}, undefined, false, { onReasoning: () => {} });
  return requests[0];
};

test('the request to Gemini 4 Argon: its model, a level of thinking from the list (medium when none is chosen), no temperature or topP, the summaries of the thinking asked for', async () => {
  const defaulted = await sent(native);
  assert.match(defaulted.url, /models\/gemini-4-argon:streamGenerateContent/);
  assert.equal(defaulted.body.generationConfig.thinkingConfig.thinkingLevel, 'medium');
  assert.equal(defaulted.body.generationConfig.thinkingConfig.includeThoughts, true);
  assert.equal('temperature' in defaulted.body.generationConfig || 'topP' in defaulted.body.generationConfig, false);
  assert.equal((await sent(native, { effort: 'high' })).body.generationConfig.thinkingConfig.thinkingLevel, 'high');
  assert.deepEqual((await sent(native, { search: true })).body.tools, [{ googleSearch: {} }]);

  const openRouter = await sent(viaOpenRouter, { effort: 'high' });
  assert.equal(openRouter.body.model, 'google/gemini-4-argon');
  assert.equal(openRouter.body.reasoning.effort, 'high');
  assert.equal((await sent(viaOpenRouter)).body.reasoning.effort, 'medium');
});
