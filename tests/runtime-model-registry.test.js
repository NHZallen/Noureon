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
  assert.ok(MODELS.some((model) => model.id === 'gemini-3.5-flash' && model.provider === 'gemini'));
  assert.ok(MODELS.some((model) => model.id === 'step-plan/step-3.7-flash' && model.provider === 'stepfun'));
  assert.ok(MODELS.some((model) => model.provider === 'openrouter'));
  assert.ok(MODELS.some((model) => model.provider === 'nvidia'));
  assert.ok(MODELS.some((model) => model.id === CHEAP_MODEL_ID));
});

test('model registry preserves provider labels and API id aliases', () => {
  const nvidiaModel = MODELS.find((model) => model.id === 'nvidia/qwen/qwen3.5-122b-a10b');
  const stepModel = MODELS.find((model) => model.id === 'step-plan/step-3.7-flash');

  assert.equal(getProviderLabel('gemini'), 'Gemini');
  assert.equal(getProviderLabel('openrouter'), 'OpenRouter');
  assert.equal(getProviderLabel('stepfun'), 'Step Plan');
  assert.equal(getProviderLabel('nvidia'), 'NVIDIA');
  assert.equal(getProviderLabel('tavily'), 'Tavily');
  assert.equal(getModelApiId(nvidiaModel), 'qwen/qwen3.5-122b-a10b');
  assert.equal(getModelApiId(stepModel), 'step-3.7-flash');
});

test('model registry preserves vision and document capability behavior', () => {
  const geminiModel = MODELS.find((model) => model.id === 'gemini-3.5-flash');
  const openRouterVisionModel = MODELS.find((model) => model.id === 'openai/gpt-5.5');
  const openRouterTextModel = MODELS.find((model) => model.id === 'deepseek/deepseek-v4-flash');
  const nvidiaTextModel = MODELS.find((model) => model.id === 'nvidia/z-ai/glm-5.2');
  const nvidiaVisionModel = MODELS.find((model) => model.id === 'nvidia/qwen/qwen3.5-122b-a10b');
  const stepVisionModel = MODELS.find((model) => model.id === 'step-plan/step-3.7-flash');

  assert.equal(modelSupportsVision(geminiModel), true);
  assert.equal(modelSupportsVision(openRouterVisionModel), true);
  assert.equal(modelSupportsVision(openRouterTextModel), false);
  assert.equal(modelSupportsVision(nvidiaVisionModel), true);
  assert.equal(modelSupportsVision(nvidiaTextModel), false);
  assert.equal(modelSupportsVision(stepVisionModel), true);

  assert.equal(modelSupportsDocumentUpload(geminiModel), true);
  assert.equal(modelSupportsDocumentUpload(openRouterTextModel), true);
  assert.equal(modelSupportsDocumentUpload(nvidiaVisionModel), false);
});

test('model registry exposes precise reasoning depth options for supported models only', () => {
  const deepseekModel = MODELS.find((model) => model.id === 'deepseek/deepseek-v4-pro');
  const openAiModel = MODELS.find((model) => model.id === 'openai/gpt-5.4');
  const imageModel = MODELS.find((model) => model.id === 'google/gemini-3.1-flash-image');

  assert.deepEqual(getModelReasoningConfig(deepseekModel)?.options, ['high', 'xhigh']);
  assert.equal(normalizeReasoningEffort(deepseekModel, 'max'), 'high');
  assert.equal(getReasoningEffortLabel('xhigh', 'zh-TW'), '超高');

  assert.deepEqual(getModelReasoningConfig(openAiModel)?.options, ['none', 'low', 'medium', 'high', 'xhigh']);
  assert.equal(normalizeReasoningEffort(openAiModel, 'none'), 'none');
  assert.equal(getReasoningEffortLabel('none', 'zh-TW'), '快速模式');

  assert.deepEqual(getModelReasoningConfig(imageModel)?.options, ['minimal', 'high']);
  assert.equal(getReasoningEffortLabel('minimal', 'zh-TW'), '低');
});

test('model registry leaves excluded models on default reasoning', () => {
  const excludedIds = [
    'step-plan/step-router-v1',
    'anthropic/claude-haiku-4.5',
    'google/gemini-3-pro-image',
    'minimax/minimax-m3',
    'moonshotai/kimi-k2.7-code',
    'moonshotai/kimi-k2.6',
    'qwen/qwen3.5-flash-02-23',
    'qwen/qwen3.7-plus',
    'qwen/qwen3.7-max',
    'xiaomi/mimo-v2.5',
    'xiaomi/mimo-v2.5-pro',
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
        { id: 'gemini-3.5-flash', hidden: false, order: 1 },
        { id: 'deepseek/deepseek-v4-flash', hidden: true, order: 0 }
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
    'gemini-3.5-flash',
    'openai/gpt-5.5'
  ]);
  assert.equal(registry.getCouncilTranslatorModel()?.id, 'openai/gpt-5.5');
  assert.equal(registry.getSingleDocumentTranslatorModel()?.id, 'gemini-3.1-pro-preview');

  state.config.councilTranslatorModelId = 'missing-model';
  assert.equal(registry.getCouncilTranslatorModel()?.id, 'gemini-3.5-flash');
});

test('model registry import is inert and independent from retired runtime fragments', () => {
  const source = readSource('src/app/runtime/legacy-core/model-registry.js');

  assert.doesNotMatch(source, /virtual:legacy-app-runtime|legacy-runtime\/fragments/);
  assert.doesNotMatch(source, /runtime-entry|legacy-app\.js|document\.querySelector|indexedDB|localStorage|sessionStorage/);
});
