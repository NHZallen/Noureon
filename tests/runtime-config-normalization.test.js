import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  createModelIdCanonicalizer,
  normalizeApiKeyValue,
  normalizeCouncilConfig,
  normalizeLoadedLegacyConfig
} from '../src/app/runtime/kernel/config-normalization.js';

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const models = [
  { id: 'gemini-default', provider: 'gemini' },
  { id: 'openrouter-pro', provider: 'openrouter' },
  { id: 'nvidia-modern', provider: 'nvidia', apiId: 'legacy-nvidia-id' },
  { id: 'step-plan', provider: 'stepfun' }
];

const baseConfig = () => ({
  apiKeys: {
    gemini: 'gemini-default-key',
    openrouter: '',
    stepPlan: '',
    nvidia: '',
    tavily: ''
  },
  defaultModel: 'gemini-default',
  lastUsedModel: null,
  outputMode: 'typewriter',
  tavilySearchDepth: 'basic',
  modelSettings: [],
  uiTheme: {
    mode: 'default',
    style: 'single',
    customColor: '#3b82f6',
    adaptiveColor: '#3b82f6',
    adaptivePalette: [],
    adaptiveGradient: ''
  },
  lastCouncilConfig: {
    enabled: false,
    mode: 'consensus',
    participantModelIds: [],
    synthesizerModelId: null,
    showRawResponses: true,
    showComparisonTable: true
  },
  councilTranslatorModelId: null,
  singleDocumentTranslatorModelId: null
});

test('api key normalization preserves legacy string and object behavior', () => {
  assert.equal(normalizeApiKeyValue('  direct-key  '), 'direct-key');
  assert.equal(normalizeApiKeyValue({ first: ' ', second: ' object-key ' }), 'object-key');
  assert.equal(normalizeApiKeyValue({ first: '', second: 42 }), '');
  assert.equal(normalizeApiKeyValue(null), '');
});

test('model id canonicalizer preserves exact legacy nvidia apiId fallback', () => {
  const canonicalizeModelId = createModelIdCanonicalizer({ models });

  assert.equal(canonicalizeModelId('gemini-default'), 'gemini-default');
  assert.equal(canonicalizeModelId('legacy-nvidia-id'), 'nvidia-modern');
  assert.equal(canonicalizeModelId('unknown-model'), 'unknown-model');
  assert.equal(canonicalizeModelId(null), null);
});

test('council config normalization keeps defaults, canonical ids, uniqueness, and limits', () => {
  const canonicalizeModelId = createModelIdCanonicalizer({ models });

  assert.deepEqual(
    normalizeCouncilConfig({
      enabled: 1,
      mode: 'deliberation',
      participantModelIds: [
        'gemini-default',
        'legacy-nvidia-id',
        'gemini-default',
        'missing',
        'openrouter-pro'
      ],
      synthesizerModelId: 'legacy-nvidia-id',
      showRawResponses: false,
      showComparisonTable: false
    }, {
      models,
      maxCouncilModels: 2,
      canonicalizeModelId
    }),
    {
      enabled: true,
      mode: 'deliberation',
      participantModelIds: ['gemini-default', 'nvidia-modern'],
      synthesizerModelId: 'nvidia-modern',
      showRawResponses: false,
      showComparisonTable: false
    }
  );
});

test('loaded config normalization preserves merge precedence and model/council validation', () => {
  const currentConfig = baseConfig();
  const savedConfig = {
    apiKeys: {
      gemini: 'saved-gemini',
      openrouter: { old: ' ', next: ' openrouter-key ' },
      stepPlan: ' step-key ',
      nvidia: { primary: ' nvidia-key ' },
      tavily: 12
    },
    outputMode: 'unknown',
    tavilySearchDepth: 'advanced',
    defaultModel: 'missing-default',
    lastUsedModel: 'legacy-nvidia-id',
    modelSettings: [
      { id: 'legacy-nvidia-id', hidden: true, order: 4 },
      { id: 'missing', hidden: false, order: 0 },
      { id: 'gemini-default', hidden: false, order: 2 },
      { id: 'legacy-nvidia-id', hidden: false, order: 1 }
    ],
    uiTheme: {
      adaptivePalette: null,
      adaptiveGradient: null
    },
    lastCouncilConfig: {
      enabled: true,
      mode: 'bad-mode',
      participantModelIds: ['legacy-nvidia-id', 'openrouter-pro', 'openrouter-pro', 'missing'],
      synthesizerModelId: 'missing',
      showRawResponses: false
    },
    councilTranslatorModelId: 'missing-translator',
    singleDocumentTranslatorModelId: 'missing-single'
  };

  const normalized = normalizeLoadedLegacyConfig({
    currentConfig,
    savedConfig,
    models,
    maxCouncilModels: 5,
    councilTranslatorCandidates: [models[2]],
    singleTranslatorCandidates: [models[1]]
  });

  assert.notEqual(normalized, currentConfig);
  assert.equal(currentConfig.apiKeys.openrouter, '');
  assert.equal(savedConfig.apiKeys.openrouter.next, ' openrouter-key ');
  assert.deepEqual(normalized.apiKeys, {
    gemini: 'saved-gemini',
    openrouter: 'openrouter-key',
    stepPlan: 'step-key',
    nvidia: 'nvidia-key',
    tavily: ''
  });
  assert.equal(normalized.outputMode, 'typewriter');
  assert.equal(normalized.tavilySearchDepth, 'advanced');
  assert.equal(normalized.defaultModel, 'gemini-default');
  assert.equal(normalized.lastUsedModel, 'nvidia-modern');
  assert.deepEqual(normalized.modelSettings.map(setting => [setting.id, setting.order, setting.hidden]), [
    ['gemini-default', 0, false],
    ['openrouter-pro', 1, false],
    ['step-plan', 2, false],
    ['nvidia-modern', 3, true]
  ]);
  assert.deepEqual(normalized.lastCouncilConfig, {
    enabled: true,
    mode: 'consensus',
    participantModelIds: ['nvidia-modern', 'openrouter-pro'],
    synthesizerModelId: null,
    showRawResponses: false,
    showComparisonTable: true
  });
  assert.equal(normalized.councilTranslatorModelId, 'nvidia-modern');
  assert.equal(normalized.singleDocumentTranslatorModelId, 'openrouter-pro');
  assert.equal(normalized.uiTheme.style, 'single');
  assert.deepEqual(normalized.uiTheme.adaptivePalette, []);
  assert.equal(normalized.uiTheme.adaptiveGradient, '');
});

test('null saved config returns a normalized object without replacing current input identity', () => {
  const currentConfig = {
    ...baseConfig(),
    defaultModel: 'legacy-nvidia-id',
    lastUsedModel: 'missing',
    modelSettings: [{ id: 'legacy-nvidia-id', hidden: true, order: 7 }]
  };

  const normalized = normalizeLoadedLegacyConfig({
    currentConfig,
    savedConfig: null,
    models,
    maxCouncilModels: 5,
    councilTranslatorCandidates: [],
    singleTranslatorCandidates: []
  });

  assert.notEqual(normalized, currentConfig);
  assert.equal(currentConfig.defaultModel, 'legacy-nvidia-id');
  assert.equal(normalized.defaultModel, 'nvidia-modern');
  assert.equal(normalized.lastUsedModel, 'gemini-default');
  assert.deepEqual(normalized.modelSettings.map(setting => setting.id), [
    'gemini-default',
    'openrouter-pro',
    'step-plan',
    'nvidia-modern'
  ]);
});

test('config normalization module remains pure kernel logic', () => {
  const source = readSource('src/app/runtime/kernel/config-normalization.js');

  assert.doesNotMatch(source, /legacy-runtime\/fragments|virtual:legacy-app-runtime|config-store|runtimeConfigStore/);
  assert.doesNotMatch(source, /document|window|addEventListener|localStorage|sessionStorage|indexedDB|getItem|setItem|removeItem|openDB/);
  assert.doesNotMatch(source, /applyUiTheme|applyLanguage|showNotification|renderAll|initChatApp|initializeApp/);
});
