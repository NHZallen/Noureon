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
  {
    id: 'nvidia-modern',
    provider: 'nvidia',
    apiId: 'legacy-nvidia-id',
    legacyIds: ['nvidia-older-id']
  }
];

const baseConfig = () => ({
  apiKeys: {
    gemini: 'gemini-default-key',
    openrouter: '',
    nvidia: '',
    tavily: ''
  },
  defaultModel: 'gemini-default',
    lastUsedModel: null,
    acknowledgedStealthModelTerms: [],
  outputMode: 'realtime',
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
  councilGroups: [],
  recentModelIds: [],
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
  assert.equal(canonicalizeModelId('nvidia-older-id'), 'nvidia-modern');
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

test('loaded config normalization strips retired apiKeys and preserves model/council validation', () => {
  const currentConfig = baseConfig();
  const savedConfig = {
    apiKeys: {
      gemini: 'saved-gemini',
      openrouter: { old: ' ', next: ' openrouter-key ' },
      nvidia: { primary: ' nvidia-key ' },
      tavily: 12
    },
    outputMode: 'unknown',
    tavilySearchDepth: 'advanced',
    defaultModel: 'missing-default',
    lastUsedModel: 'legacy-nvidia-id',
    acknowledgedStealthModelTerms: ['stealth/test-beta', '', 'stealth/test-beta', 42],
    memoryModelId: 'image-only',
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
    singleDocumentTranslatorModelId: 'missing-single',
    councilGroups: [
      { id: 'g1', name: '  Research  ', participantModelIds: ['legacy-nvidia-id', 'openrouter-pro', 'missing'], synthesizerModelId: 'gemini-default' },
      { id: 'g1', name: 'Same id', participantModelIds: [], synthesizerModelId: 'missing' },
      'not a group'
    ],
    recentModelIds: ['legacy-nvidia-id', 'missing', 'gemini-default', 'gemini-default']
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
  assert.deepEqual(normalized.apiKeys, currentConfig.apiKeys);
  assert.equal(normalized.outputMode, 'realtime');
  assert.equal(normalized.tavilySearchDepth, 'advanced');
  assert.equal(normalized.defaultModel, 'gemini-default');
  assert.equal(normalized.lastUsedModel, 'nvidia-modern');
  assert.equal(normalized.memoryModelId, 'gemini-default');
  assert.deepEqual(normalized.acknowledgedStealthModelTerms, ['stealth/test-beta']);
  assert.deepEqual(normalized.modelSettings.map(setting => [setting.id, setting.order, setting.hidden]), [
    ['gemini-default', 0, false],
    ['openrouter-pro', 1, false],
    ['nvidia-modern', 2, true]
  ]);
  assert.deepEqual(normalized.lastCouncilConfig, {
    enabled: true,
    mode: 'consensus',
    participantModelIds: ['nvidia-modern', 'openrouter-pro'],
    synthesizerModelId: null,
    showRawResponses: false,
    showComparisonTable: true
  });
  assert.deepEqual(normalized.councilGroups, [
    { id: 'g1', name: 'Research', participantModelIds: ['nvidia-modern', 'openrouter-pro'], synthesizerModelId: 'gemini-default' },
    { id: 'g1-x', name: 'Same id', participantModelIds: [], synthesizerModelId: null }
  ], 'saved groups keep known models only, and each id is its own');
  assert.deepEqual(normalized.recentModelIds, ['nvidia-modern', 'gemini-default']);
  assert.equal(normalized.councilTranslatorModelId, 'nvidia-modern');
  assert.equal(normalized.singleDocumentTranslatorModelId, 'openrouter-pro');
  assert.deepEqual(normalized.uiTheme, { mode: 'default', customColor: '#3b82f6' });
});

test('loaded config drops the retired wallpaper, adaptive colour and AI bubble colour settings', () => {
  const normalized = normalizeLoadedLegacyConfig({
    currentConfig: baseConfig(),
    savedConfig: {
      customWallpaper: 'data:image/jpeg;base64,AAAA',
      wallpaperBrightness: 'dark',
      aiBubbleColor: 'blue',
      uiTheme: {
        mode: 'adaptive',
        style: 'gradient',
        customColor: '#123456',
        adaptiveColor: '#abcdef',
        adaptivePalette: ['#111111', '#222222'],
        adaptiveGradient: 'linear-gradient(red, blue)'
      }
    },
    models: [{ id: 'gemini-default' }]
  });

  assert.equal('customWallpaper' in normalized, false);
  assert.equal('wallpaperBrightness' in normalized, false);
  assert.equal('aiBubbleColor' in normalized, false);
  assert.deepEqual(normalized.uiTheme, { mode: 'default', customColor: '#123456' });

  const custom = normalizeLoadedLegacyConfig({
    currentConfig: baseConfig(),
    savedConfig: { uiTheme: { mode: 'custom', customColor: '#654321' } },
    models: [{ id: 'gemini-default' }]
  });
  assert.deepEqual(custom.uiTheme, { mode: 'custom', customColor: '#654321' });
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
  assert.equal(normalized.memoryModelId, 'gemini-default');
  assert.deepEqual(normalized.modelSettings.map(setting => setting.id), [
    'gemini-default',
    'openrouter-pro',
    'nvidia-modern'
  ]);
});

test('unsupported saved Arabic UI and AI languages fall back to English', () => {
  const normalized = normalizeLoadedLegacyConfig({
    currentConfig: baseConfig(),
    savedConfig: { uiLanguage: 'ar', aiDefaultLanguage: 'ar' },
    models,
    councilTranslatorCandidates: [],
    singleTranslatorCandidates: []
  });

  assert.equal(normalized.uiLanguage, 'en');
  assert.equal(normalized.aiDefaultLanguage, 'en');

  const supported = normalizeLoadedLegacyConfig({
    currentConfig: baseConfig(),
    savedConfig: { uiLanguage: 'ru', aiDefaultLanguage: 'es' },
    models,
    councilTranslatorCandidates: [],
    singleTranslatorCandidates: []
  });
  assert.equal(supported.uiLanguage, 'ru');
  assert.equal(supported.aiDefaultLanguage, 'es');
});

test('config normalization module remains pure kernel logic', () => {
  const source = readSource('src/app/runtime/kernel/config-normalization.js');

  assert.doesNotMatch(source, /legacy-runtime\/fragments|virtual:legacy-app-runtime|config-store|runtimeConfigStore/);
  assert.doesNotMatch(source, /document|window|addEventListener|localStorage|sessionStorage|indexedDB|getItem|setItem|removeItem|openDB/);
  assert.doesNotMatch(source, /applyUiTheme|applyLanguage|showNotification|renderAll|initChatApp|initializeApp/);
});
