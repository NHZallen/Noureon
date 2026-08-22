import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  CHEAP_MODEL_ID,
  COUNCIL_MAX_MODELS,
  COUNCIL_MIN_MODELS,
  MODELS,
  createLegacyModelRegistry,
  getModelApiId,
  getModelReasoningConfig,
  getDefaultReasoningLabel,
  getReasoningEffortLabel,
  getModelTiers,
  getProviderLabel,
  modelSupportsReasoningSelection,
  modelSupportsDocumentUpload,
  modelSupportsVision,
  normalizeReasoningEffort
} from '../src/app/runtime/legacy-core/model-registry.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

test('model registry exports the canonical model inventory', () => {
  assert.ok(Array.isArray(MODELS));
  assert.ok(MODELS.length > 0);
  assert.ok(MODELS.some((model) => model.id === 'gemini-3.7-flash' && model.provider === 'gemini'));
  assert.ok(MODELS.some((model) => model.id === 'gemini-3.5-flash-lite' && model.provider === 'gemini'));
  assert.ok(MODELS.some((model) => model.id === 'moonshotai/kimi-k3' && model.provider === 'openrouter'));
  assert.ok(MODELS.some((model) => model.id === 'poolside/laguna-s-2.1:free' && model.provider === 'openrouter'));
  assert.ok(MODELS.some((model) => model.id === 'anthropic/claude-opus-5' && model.provider === 'openrouter'));
  assert.equal(MODELS.some((model) => model.id === 'anthropic/claude-opus-4.8'), false);
  assert.ok(MODELS.some((model) => model.id === 'nvidia/nemotron-3.5-lightning:free' && model.provider === 'openrouter'));
  assert.ok(MODELS.some((model) => model.id === 'nvidia/deepseek-ai/deepseek-v4-flash-0731'
    && model.apiId === 'deepseek-ai/deepseek-v4-flash-0731'
    && model.provider === 'nvidia'));
  assert.equal(MODELS.some((model) => model.id === 'nvidia/deepseek-ai/deepseek-v4-flash'), false);
  assert.ok(MODELS.some((model) => model.id === 'deepseek/deepseek-v4-flash-0731' && model.provider === 'openrouter'));
  assert.ok(MODELS.some((model) => model.id === 'deepseek/deepseek-v4-flash-vision-exp' && model.provider === 'openrouter' && model.outputPricePerMillion === 1.32));
  assert.ok(MODELS.some((model) => model.id === 'deepseek/deepseek-v4-pro-0813' && model.provider === 'openrouter'));
  assert.ok(MODELS.some((model) => model.id === 'qwen/qwen3.7-flash' && model.provider === 'openrouter'));
  assert.ok(MODELS.some((model) => model.id === 'qwen/qwen3.8-max' && model.provider === 'openrouter'));
  assert.ok(MODELS.some((model) => model.id === 'z-ai/glm-5.3' && model.provider === 'openrouter'));
  assert.ok(MODELS.some((model) => model.id === 'stealth/ox-alpha'
    && model.provider === 'openrouter'
    && model.isBeta === true
    && model.requiresStealthTermsAcknowledgement === true
    && model.stealthTermsAcknowledgementId === 'stealth/ox-alpha@stealth-terms-v1'
    && model.outputPricePerMillion === 0));
  assert.ok(MODELS.some((model) => model.provider === 'openrouter'));
  assert.ok(MODELS.some((model) => model.id === 'x-ai/grok-4.6' && model.provider === 'openrouter'));
  assert.equal(MODELS.some((model) => model.provider === 'stepfun'), false);
  assert.equal(MODELS.some((model) => model.id.startsWith('xiaomi/')), false);
  assert.ok(MODELS.some((model) => model.provider === 'nvidia'));
  assert.ok(MODELS.some((model) => model.id === CHEAP_MODEL_ID));
  assert.equal(CHEAP_MODEL_ID, 'gemini-3.5-flash-lite');
});

test('model registry preserves provider labels and API id aliases', () => {
  const nvidiaModel = MODELS.find((model) => model.id === 'nvidia/z-ai/glm-5.2');

  assert.equal(getProviderLabel('gemini'), 'Gemini');
  assert.equal(getProviderLabel('openrouter'), 'OpenRouter');
  assert.equal(getProviderLabel('nvidia'), 'NVIDIA');
  assert.equal(getProviderLabel('tavily'), 'Tavily');
  assert.equal(getModelApiId(nvidiaModel), 'z-ai/glm-5.2');
});

test('model registry preserves vision and document capability behavior', () => {
  const geminiModel = MODELS.find((model) => model.id === 'gemini-3.7-flash');
  const geminiLiteModel = MODELS.find((model) => model.id === 'gemini-3.5-flash-lite');
  const kimiK3Model = MODELS.find((model) => model.id === 'moonshotai/kimi-k3');
  const lagunaModel = MODELS.find((model) => model.id === 'poolside/laguna-s-2.1:free');
  const opus5Model = MODELS.find((model) => model.id === 'anthropic/claude-opus-5');
  const openRouterVisionModel = MODELS.find((model) => model.id === 'openai/gpt-5.5');
  const openRouterGpt56Models = ['openai/gpt-5.6-luna', 'openai/gpt-5.6-terra', 'openai/gpt-5.6-sol']
    .map((id) => MODELS.find((model) => model.id === id));
  const openRouterGrokVisionModel = MODELS.find((model) => model.id === 'x-ai/grok-4.6');
  const deepseekVisionModel = MODELS.find((model) => model.id === 'deepseek/deepseek-v4-flash-vision-exp');
  const oxAlphaModel = MODELS.find((model) => model.id === 'stealth/ox-alpha');
  const openRouterTextModel = MODELS.find((model) => model.id === 'deepseek/deepseek-v4-flash-0731');
  const nvidiaDeepseekTextModel = MODELS.find((model) => model.id === 'nvidia/deepseek-ai/deepseek-v4-flash-0731');
  const nvidiaTextModel = MODELS.find((model) => model.id === 'nvidia/z-ai/glm-5.2');
  const nvidiaVisionModel = MODELS.find((model) => model.id === 'nvidia/moonshotai/kimi-k2.6');

  assert.equal(modelSupportsVision(geminiModel), true);
  assert.equal(modelSupportsVision(geminiLiteModel), true);
  assert.equal(modelSupportsVision(kimiK3Model), true);
  assert.equal(modelSupportsVision(lagunaModel), false);
  assert.equal(modelSupportsVision(opus5Model), true);
  assert.equal(modelSupportsVision(openRouterVisionModel), true);
  assert.ok(openRouterGpt56Models.every(modelSupportsVision));
  assert.equal(modelSupportsVision(openRouterGrokVisionModel), true);
  assert.equal(modelSupportsVision(deepseekVisionModel), true);
  assert.equal(modelSupportsVision(oxAlphaModel), true);
  assert.equal(modelSupportsVision(openRouterTextModel), false);
  assert.equal(modelSupportsVision(nvidiaDeepseekTextModel), false);
  assert.equal(modelSupportsVision(nvidiaVisionModel), true);
  assert.equal(modelSupportsVision(nvidiaTextModel), false);

  assert.equal(modelSupportsDocumentUpload(geminiModel), true);
  assert.equal(modelSupportsDocumentUpload(geminiLiteModel), true);
  assert.equal(modelSupportsDocumentUpload(openRouterGrokVisionModel), true);
  assert.equal(modelSupportsDocumentUpload(openRouterTextModel), true);
  assert.equal(modelSupportsDocumentUpload(nvidiaVisionModel), false);
});

test('model registry exposes precise reasoning depth options for supported models only', () => {
  const deepseekModel = MODELS.find((model) => model.id === 'deepseek/deepseek-v4-pro-0813');
  const grokModel = MODELS.find((model) => model.id === 'x-ai/grok-4.6');
  const openAiModel = MODELS.find((model) => model.id === 'openai/gpt-5.5');
  const gpt56Model = MODELS.find((model) => model.id === 'openai/gpt-5.6-sol');
  const imageModel = MODELS.find((model) => model.id === 'google/gemini-3.1-flash-image');
  const geminiFlashModel = MODELS.find((model) => model.id === 'gemini-3.7-flash');
  const geminiFlashLiteModel = MODELS.find((model) => model.id === 'gemini-3.5-flash-lite');
  const kimiK3Model = MODELS.find((model) => model.id === 'moonshotai/kimi-k3');
  const opus5Model = MODELS.find((model) => model.id === 'anthropic/claude-opus-5');
  const deepseekVisionModel = MODELS.find((model) => model.id === 'deepseek/deepseek-v4-flash-vision-exp');
  const oxAlphaModel = MODELS.find((model) => model.id === 'stealth/ox-alpha');
  const nvidiaDeepseekModel = MODELS.find((model) => model.id === 'nvidia/deepseek-ai/deepseek-v4-flash-0731');

  assert.deepEqual(getModelReasoningConfig(deepseekModel)?.options, ['low', 'high', 'max']);
  assert.equal(normalizeReasoningEffort(deepseekModel, 'max'), 'max');
  assert.equal(getReasoningEffortLabel('xhigh', 'zh-TW'), '超高');

  assert.deepEqual(getModelReasoningConfig(grokModel)?.options, ['low', 'medium', 'high', 'xhigh']);
  assert.equal(normalizeReasoningEffort(grokModel, 'max'), 'high');

  assert.deepEqual(getModelReasoningConfig(openAiModel)?.options, ['none', 'low', 'medium', 'high', 'xhigh']);
  assert.equal(normalizeReasoningEffort(openAiModel, 'none'), 'none');
  assert.deepEqual(getModelReasoningConfig(gpt56Model)?.options, ['none', 'low', 'medium', 'high', 'xhigh', 'max']);
  assert.equal(normalizeReasoningEffort(gpt56Model, 'max'), 'max');
  assert.equal(getReasoningEffortLabel('none', 'zh-TW'), '快速模式');

  assert.deepEqual(getModelReasoningConfig(imageModel)?.options, ['minimal', 'high']);
  assert.deepEqual(getModelReasoningConfig(geminiFlashModel)?.options, ['low', 'medium', 'high']);
  assert.equal(getModelReasoningConfig(geminiFlashLiteModel)?.defaultEffort, 'minimal');
  assert.deepEqual(getModelReasoningConfig(kimiK3Model)?.options, ['low', 'high', 'max']);
  assert.deepEqual(getModelReasoningConfig(opus5Model)?.options, ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.equal(getModelReasoningConfig(opus5Model)?.defaultEffort, 'high');
  assert.deepEqual(getModelReasoningConfig(deepseekVisionModel)?.options, ['low', 'high', 'max']);
  assert.equal(getModelReasoningConfig(deepseekVisionModel)?.defaultEffort, 'high');
  assert.deepEqual(getModelReasoningConfig(oxAlphaModel)?.options, ['low', 'high', 'max']);
  assert.equal(getModelReasoningConfig(oxAlphaModel)?.defaultEffort, 'max');
  assert.deepEqual(getModelReasoningConfig(nvidiaDeepseekModel)?.options, ['none', 'high', 'max']);
  assert.equal(getModelReasoningConfig(nvidiaDeepseekModel)?.defaultEffort, 'high');
  assert.equal(getReasoningEffortLabel('minimal', 'zh-TW'), '極低');
});

test('reasoning labels support Russian and Spanish', () => {
  assert.equal(getReasoningEffortLabel('high', 'ru'), 'Высокий');
  assert.equal(getReasoningEffortLabel('high', 'es'), 'Alto');
  assert.equal(getDefaultReasoningLabel('ru'), 'По умолчанию');
  assert.equal(getDefaultReasoningLabel('es'), 'Predeterminado');
});

test('model registry leaves excluded models on default reasoning', () => {
  const excludedIds = [
    'anthropic/claude-haiku-4.5',
    'google/gemini-3-pro-image',
    'minimax/minimax-m3',
    'poolside/laguna-s-2.1:free',
    'nvidia/nemotron-3.5-lightning:free',
    'qwen/qwen3.7-flash',
    'qwen/qwen3.7-plus',
    'openai/gpt-image-2'
  ];

  for (const id of excludedIds) {
    const model = MODELS.find((candidate) => candidate.id === id);
    assert.equal(modelSupportsReasoningSelection(model), false, `${id} should not be selectable`);
    assert.equal(getModelReasoningConfig(model), null, `${id} should use the provider default`);
  }
});

test('model registry keeps council and translator helpers live-config backed', () => {
  const state = {
    config: {
      modelSettings: [
        { id: 'openai/gpt-5.5', hidden: false, order: 2 },
        { id: 'gemini-3.7-flash', hidden: false, order: 1 },
        { id: 'deepseek/deepseek-v4-flash-0731', hidden: true, order: 0 }
      ],
      councilTranslatorModelId: 'openai/gpt-5.5',
      singleDocumentTranslatorModelId: 'gemini-3.1-pro-preview'
    }
  };
  const registry = createLegacyModelRegistry({
    getConfig: () => state.config,
    normalizeConversationModel: (conversation) => MODELS.find((model) => model.id === conversation.model)
  });

  assert.equal(COUNCIL_MIN_MODELS, 2);
  assert.equal(COUNCIL_MAX_MODELS, 5);
  assert.deepEqual(registry.getVisibleCouncilModels().map((model) => model.id), [
    'gemini-3.7-flash',
    'openai/gpt-5.5'
  ]);
  assert.equal(registry.getCouncilTranslatorModel()?.id, 'openai/gpt-5.5');
  assert.equal(registry.getSingleDocumentTranslatorModel()?.id, 'gemini-3.1-pro-preview');

  state.config.councilTranslatorModelId = 'missing-model';
  assert.equal(registry.getCouncilTranslatorModel()?.id, 'gemini-3.7-flash');
});

test('model registry import is inert and independent from retired runtime fragments', () => {
  const source = readSource('src/app/runtime/legacy-core/model-registry.js');

  assert.doesNotMatch(source, /virtual:legacy-app-runtime|legacy-runtime\/fragments/);
  assert.doesNotMatch(source, /runtime-entry|legacy-app\.js|document\.querySelector|indexedDB|localStorage|sessionStorage/);
});
