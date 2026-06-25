import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createLegacyRuntimeConfigStore } from '../src/app/runtime/kernel/config-store.js';
import { createRuntimeAppKernel } from '../src/app/runtime-app.js';

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const expectedConfig = (defaultModelId) => ({
  apiKeys: { gemini: '', openrouter: '', stepPlan: '', nvidia: '', tavily: '' },
  defaultModel: defaultModelId,
  theme: 'light',
  modelSettings: [],
  enableAutoWebSearch: false,
  tavilySearchDepth: 'basic',
  outputMode: 'typewriter',
  aiBubbleColor: 'default',
  userBubbleColor: 'default',
  autoNaming: true,
  lastUsedModel: null,
  memoryEnabled1: true,
  enableAutoMemory: true,
  customWallpaper: null,
  wallpaperBrightness: 'light',
  uiTheme: {
    mode: 'default',
    style: 'single',
    customColor: '#3b82f6',
    adaptiveColor: '#3b82f6',
    adaptivePalette: [],
    adaptiveGradient: ''
  },
  uiLanguage: 'zh-TW',
  aiDefaultLanguage: 'zh-TW',
  enableUpdateNotifications: true,
  lastSeenVersion: '',
  isLearningMode: false,
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

test('config store creates the complete legacy default config shape', () => {
  const store = createLegacyRuntimeConfigStore({ defaultModelId: 'model-default' });

  assert.deepEqual(store.getConfig(), expectedConfig('model-default'));
  assert.equal(Object.isFrozen(store.getConfig()), false);
});

test('config store instances keep fresh nested mutable defaults', () => {
  const first = createLegacyRuntimeConfigStore({ defaultModelId: 'first' });
  const second = createLegacyRuntimeConfigStore({ defaultModelId: 'second' });

  assert.notEqual(first.getConfig(), second.getConfig());
  assert.notEqual(first.getConfig().apiKeys, second.getConfig().apiKeys);
  assert.notEqual(first.getConfig().modelSettings, second.getConfig().modelSettings);
  assert.notEqual(first.getConfig().uiTheme, second.getConfig().uiTheme);
  assert.notEqual(first.getConfig().uiTheme.adaptivePalette, second.getConfig().uiTheme.adaptivePalette);
  assert.notEqual(first.getConfig().lastCouncilConfig, second.getConfig().lastCouncilConfig);
  assert.notEqual(
    first.getConfig().lastCouncilConfig.participantModelIds,
    second.getConfig().lastCouncilConfig.participantModelIds
  );
});

test('replaceConfig replaces without merging, cloning, or freezing', () => {
  const store = createLegacyRuntimeConfigStore({ defaultModelId: 'legacy' });
  const nextConfig = { uiLanguage: 'en', custom: true };

  assert.equal(store.replaceConfig(nextConfig), nextConfig);
  assert.equal(store.getConfig(), nextConfig);
  assert.deepEqual(store.getConfig(), { uiLanguage: 'en', custom: true });
  assert.equal(Object.isFrozen(nextConfig), false);
  assert.equal('theme' in store.getConfig(), false);
});

test('missing defaultModelId remains an explicit undefined injected value', () => {
  const store = createLegacyRuntimeConfigStore();

  assert.equal(store.getConfig().defaultModel, undefined);
});

test('non-live runtime app kernel exposes the config store with the injected model id', () => {
  const rootDocument = {
    getElementById: (id) => ({ id })
  };
  const kernel = createRuntimeAppKernel({
    rootDocument,
    defaultModelId: 'kernel-model'
  });

  assert.equal(kernel.configStore.getConfig().defaultModel, 'kernel-model');
  assert.equal(typeof kernel.configStore.replaceConfig, 'function');
});

test('config store source owns config pointers without runtime side effects', () => {
  const source = readSource('src/app/runtime/kernel/config-store.js');

  assert.match(source, /export\s+function\s+createLegacyRuntimeConfigStore/);
  assert.doesNotMatch(source, /(?:from|import)\s+['"][^'"]*(?:fragment|virtual:legacy-app-runtime|MODELS)/);
  assert.doesNotMatch(source, /document|window|addEventListener|localStorage|sessionStorage|indexedDB|fetch/);
  assert.doesNotMatch(source, /Object\.freeze|structuredClone|JSON\.parse|JSON\.stringify/);
});
