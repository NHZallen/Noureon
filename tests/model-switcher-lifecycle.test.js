import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createDom } from './behaviours/helpers/create-dom.js';
import {
  createModelSwitcherLifecycle,
  prepareModelSwitcherModels
} from '../src/app/legacy-runtime/features/model-switcher-lifecycle.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

const escapeHTML = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[char]));

const MODELS = [
  {
    id: 'gemini-pro',
    name: 'Gemini Pro',
    provider: 'gemini',
    descriptionKey: 'geminiPro',
    tier: ['paid']
  },
  {
    id: 'stepfun/model-a',
    name: 'Step A',
    provider: 'stepfun',
    descriptionKey: 'stepA',
    tier: ['free']
  },
  {
    id: 'openai/beta',
    name: 'OpenAI Beta',
    provider: 'openrouter',
    descriptionKey: 'betaModel',
    isBeta: true,
    tier: ['paid']
  }
];

const SORTED_MODELS = [
  { id: 'luna', name: 'Luna', provider: 'openrouter', tier: ['paid'], releasedAt: 20260709, outputPricePerMillion: 6 },
  { id: 'terra', name: 'Terra', provider: 'openrouter', tier: ['paid'], releasedAt: 20260709, outputPricePerMillion: 15 },
  { id: 'sol', name: 'Sol', provider: 'openrouter', tier: ['paid'], releasedAt: 20260709, outputPricePerMillion: 30 },
  { id: 'older', name: 'Older', provider: 'openrouter', tier: ['paid'] }
];

const createHarness = (overrides = {}) => {
  const { document, window, cleanup } = createDom(`
    <div id="model-switcher-container"></div>
    <div id="model-council-popover" class="popover"></div>
    <button id="model-council-toggle-btn" aria-expanded="false"></button>
  `);
  const calls = [];
  const conversation = overrides.conversation ?? {
    archived: false,
    council: { enabled: false },
    model: 'stepfun/model-a',
    provider: 'stepfun'
  };
  const activeModels = overrides.models ?? MODELS;
  const config = {
    lastUsedModel: 'stepfun/model-a',
    modelSettings: overrides.modelSettings ?? [
      { hidden: false, id: 'stepfun/model-a', order: 1 },
      { hidden: false, id: 'gemini-pro', order: 2 },
      { hidden: false, id: 'openai/beta', order: 3 }
    ],
    uiLanguage: 'en'
  };
  const i18n = {
    en: {
      back: 'Back',
      betaModels: 'Beta models',
      betaModelsDesc: 'Preview models',
      categoryGeneral: 'General',
      categoryImageGeneration: 'Image generation',
      freeModels: 'Free models',
      paidModels: 'Paid models',
      search: 'Search',
      stepA_tier_free: 'Fast free model'
    },
    'zh-TW': {}
  };
  const lifecycle = createModelSwitcherLifecycle({
    closeAllPopovers: () => calls.push(['closeAllPopovers']),
    document,
    escapeHTML,
    getActiveConversation: () => conversation,
    getConfig: () => config,
    getCouncilModeLabel: () => 'Consensus',
    getCouncilSelectedModels: () => ({ council: conversation.council }),
    getCouncilTexts: () => ({ title: 'Council' }),
    getI18n: () => i18n,
    getModelApiId: (model) => model.id,
    getModelSwitcherContainer: () => document.querySelector('#model-switcher-container'),
    getModelRetirementLabel: (model) => model.retirement || '',
    getModelTiers: (model) => model.tier || [],
    getSingleDocumentTranslatorModel: () => null,
    isCouncilEnabled: (conv) => !!conv.council?.enabled,
    modelSupportsDocumentUpload: (model) => model.id === 'gemini-pro',
    modelSupportsVision: (model) => model.id === 'gemini-pro',
    modelSupportsWebSearch: (model) => model.provider === 'stepfun',
    models: activeModels,
    renderAll: () => calls.push(['renderAll']),
    renderCouncilControls: () => calls.push(['renderCouncilControls']),
    requestFrame: (callback) => {
      calls.push(['requestFrame']);
      callback();
    },
    saveAppData: async () => calls.push(['saveAppData']),
    saveConfig: async () => calls.push(['saveConfig']),
    window
  });

  return { calls, cleanup, config, conversation, document, lifecycle };
};

test('prepares visible models with provider-specific company and tier metadata', () => {
  const result = prepareModelSwitcherModels({
    currentModelId: 'stepfun/model-a',
    getModelApiId: (model) => model.id,
    getModelTiers: (model) => model.tier || [],
    modelSettings: [
      { hidden: false, id: 'stepfun/model-a', order: 2 },
      { hidden: false, id: 'gemini-pro', order: 1 },
      { hidden: true, id: 'openai/beta', order: 3 }
    ],
    models: MODELS
  });

  assert.equal(result.currentModel.id, 'stepfun/model-a');
  assert.deepEqual(result.visibleModels.map((model) => model.id), ['stepfun/model-a', 'gemini-pro']);
  assert.equal(result.processedModels.find((model) => model.id === 'gemini-pro').company, 'google');
  assert.equal(result.processedModels.find((model) => model.id === 'stepfun/model-a').company, 'stepfun');
  assert.deepEqual(result.betaModels.map((model) => model.id), ['openai/beta']);
});

test('sorts newer releases first and uses output price in descending order within a release', () => {
  const result = prepareModelSwitcherModels({
    currentModelId: 'older',
    getModelApiId: (model) => model.id,
    getModelTiers: (model) => model.tier || [],
    modelSettings: SORTED_MODELS.map((model, order) => ({ id: model.id, hidden: false, order })),
    models: SORTED_MODELS
  });

  assert.deepEqual(result.visibleModels.map((model) => model.id), ['sol', 'terra', 'luna', 'older']);
});

test('renders providers in the configured default order', () => {
  const models = [
    { id: 'step', name: 'Step', provider: 'stepfun', descriptionKey: 'stepA', tier: ['paid'] },
    { id: 'nvidia', name: 'NVIDIA', provider: 'nvidia', descriptionKey: 'stepA', tier: ['free'] },
    { id: 'router', name: 'Router', provider: 'openrouter', descriptionKey: 'stepA', tier: ['paid'] },
    { id: 'gemini', name: 'Gemini', provider: 'gemini', descriptionKey: 'stepA', tier: ['paid'] }
  ];
  const { cleanup, document, lifecycle } = createHarness({
    models,
    modelSettings: models.map((model, order) => ({ id: model.id, hidden: false, order }))
  });
  try {
    lifecycle.renderModelSwitcher();
    document.querySelector('#current-model-btn').click();
    assert.deepEqual(
      [...document.querySelectorAll('.provider-btn')].map((button) => button.dataset.provider),
      ['gemini', 'openrouter', 'nvidia', 'stepfun']
    );
  } finally {
    cleanup();
  }
});

test('sorts provider companies alphabetically', () => {
  const models = [
    { id: 'zeta/model', name: 'Zeta', provider: 'openrouter', descriptionKey: 'stepA', tier: ['paid'] },
    { id: 'alpha/model', name: 'Alpha', provider: 'openrouter', descriptionKey: 'stepA', tier: ['paid'] },
    { id: 'middle/model', name: 'Middle', provider: 'openrouter', descriptionKey: 'stepA', tier: ['paid'] }
  ];
  const { cleanup, document, lifecycle } = createHarness({
    models,
    modelSettings: models.map((model, order) => ({ id: model.id, hidden: false, order }))
  });
  try {
    lifecycle.renderModelSwitcher();
    document.querySelector('#current-model-btn').click();
    document.querySelector('[data-provider="openrouter"]').click();
    document.querySelector('[data-tier="paid"]').click();
    assert.deepEqual(
      [...document.querySelectorAll('.company-btn')].map((button) => button.dataset.company),
      ['alpha', 'middle', 'zeta']
    );
  } finally {
    cleanup();
  }
});

test('renders model switcher navigation and persists selected model', async () => {
  const { calls, cleanup, config, conversation, document, lifecycle } = createHarness();
  try {
    lifecycle.renderModelSwitcher();

    assert.match(document.querySelector('#current-model-btn').textContent, /Step A/);
    document.querySelector('#current-model-btn').click();
    assert.ok(document.querySelector('#model-options-popover').classList.contains('visible'));

    document.querySelector('[data-provider="gemini"]').click();
    document.querySelector('[data-tier="paid"]').click();
    document.querySelector('[data-model-id="gemini-pro"]').click();
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(conversation.model, 'gemini-pro');
    assert.equal(conversation.provider, 'gemini');
    assert.equal(config.lastUsedModel, 'gemini-pro');
    assert.deepEqual(calls.filter(([name]) => ['saveAppData', 'saveConfig', 'renderAll'].includes(name)), [
      ['saveAppData'],
      ['saveConfig'],
      ['renderAll']
    ]);
  } finally {
    cleanup();
  }
});

test('model switcher search filters models and persists selected result', async () => {
  const { calls, cleanup, config, conversation, document, lifecycle } = createHarness();
  try {
    lifecycle.renderModelSwitcher();

    document.querySelector('#current-model-btn').click();
    const searchInput = document.querySelector('#model-search-input');
    searchInput.value = 'gemini';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));

    const modelListView = document.querySelector('#model-list-view');
    assert.match(modelListView.textContent, /Search results/);
    assert.match(modelListView.textContent, /Gemini Pro/);
    assert.doesNotMatch(modelListView.textContent, /Step A/);
    assert.ok(!document.querySelector('#model-search-clear-btn').classList.contains('hidden'));

    document.querySelector('[data-model-id="gemini-pro"]').click();
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(conversation.model, 'gemini-pro');
    assert.equal(conversation.provider, 'gemini');
    assert.equal(config.lastUsedModel, 'gemini-pro');
    assert.deepEqual(calls.filter(([name]) => ['saveAppData', 'saveConfig', 'renderAll'].includes(name)), [
      ['saveAppData'],
      ['saveConfig'],
      ['renderAll']
    ]);
  } finally {
    cleanup();
  }
});

test('renders snake_case model categories with translated labels', () => {
  const imageModels = [
    ...MODELS,
    {
      id: 'openai/chat',
      name: 'OpenAI Chat',
      provider: 'openrouter',
      descriptionKey: 'openaiChat',
      tier: ['paid'],
      category: 'general'
    },
    {
      id: 'openai/image',
      name: 'OpenAI Image',
      provider: 'openrouter',
      descriptionKey: 'openaiImage',
      tier: ['paid'],
      category: 'image_generation'
    }
  ];
  const { cleanup, document, lifecycle } = createHarness({
    models: imageModels,
    modelSettings: imageModels.map((model, index) => ({
      hidden: false,
      id: model.id,
      order: index + 1
    }))
  });
  try {
    lifecycle.renderModelSwitcher();

    document.querySelector('#current-model-btn').click();
    document.querySelector('[data-provider="openrouter"]').click();
    document.querySelector('[data-tier="paid"]').click();
    document.querySelector('[data-company="openai"]').click();

    const labels = Array.from(document.querySelectorAll('#category-view .category-btn'))
      .map(button => button.textContent.trim());
    assert.ok(labels.includes('Image generation'));
    assert.ok(!labels.includes('image_generation'));
  } finally {
    cleanup();
  }
});

test('model switcher reads the container from the injected getter without an elements bundle', () => {
  const { cleanup, document, lifecycle } = createHarness();
  try {
    lifecycle.renderModelSwitcher();

    const container = document.querySelector('#model-switcher-container');
    assert.match(container.textContent, /Step A/);
  } finally {
    cleanup();
  }
});

test('council mode switcher button delegates to council controls without duplicating council rendering', () => {
  const { calls, cleanup, conversation, document, lifecycle } = createHarness({
    conversation: {
      archived: false,
      council: { enabled: true, mode: 'consensus' },
      model: 'stepfun/model-a',
      provider: 'stepfun'
    }
  });
  try {
    lifecycle.renderModelSwitcher();

    assert.match(document.querySelector('#current-model-btn').textContent, /Council/);
    document.querySelector('#current-model-btn').click();

    assert.deepEqual(calls.slice(0, 3), [
      ['renderCouncilControls'],
      ['closeAllPopovers'],
      ['requestFrame']
    ]);
    assert.ok(document.querySelector('#model-council-popover').classList.contains('visible'));
    assert.equal(document.querySelector('#model-council-toggle-btn').getAttribute('aria-expanded'), 'true');
    assert.equal(conversation.model, 'stepfun/model-a');
  } finally {
    cleanup();
  }
});

test('model switcher lifecycle source avoids provider parser, storage schema, package, and Vite coupling', () => {
  const source = readSource('src/app/legacy-runtime/features/model-switcher-lifecycle.js');

  assert.match(source, /\bgetModelSwitcherContainer\b/);
  assert.doesNotMatch(source, /\belements\b/);
  assert.doesNotMatch(source, /\bALL_ELEMENTS\b/);

  for (const forbidden of [
    'TextDecoder',
    'response.body',
    'streamApiCall',
    'indexedDB',
    'localStorage',
    'sessionStorage',
    'virtual:legacy-app-runtime',
    'vite.config',
    'package.json',
    'REFACTOR_PLAN'
  ]) {
    assert.equal(source.includes(forbidden), false, `source should not include ${forbidden}`);
  }
});
