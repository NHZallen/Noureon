import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createDom } from './behaviours/helpers/create-dom.js';
import { buildModelGroups, getCompanyLabel, getModelCompany } from '../src/app/ui/model-picker/model-picker-groups.js';
import {
  createModelSwitcherLifecycle,
  prepareModelSwitcherModels
} from '../src/app/legacy-runtime/features/model-switcher-lifecycle.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

const MODELS = [
  {
    id: 'gemini-pro',
    name: 'Gemini Pro',
    provider: 'gemini',
    descriptionKey: 'geminiPro',
    tier: ['paid']
  },
  {
    id: 'z-ai/model-a',
    name: 'Z.ai A',
    provider: 'openrouter',
    descriptionKey: 'zaiA',
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

test('prepares visible models with provider-specific company and tier metadata', () => {
  const result = prepareModelSwitcherModels({
    currentModelId: 'z-ai/model-a',
    getModelApiId: (model) => model.id,
    getModelTiers: (model) => model.tier || [],
    modelSettings: [
      { hidden: false, id: 'z-ai/model-a', order: 2 },
      { hidden: false, id: 'gemini-pro', order: 1 },
      { hidden: true, id: 'openai/beta', order: 3 }
    ],
    models: MODELS
  });

  assert.equal(result.currentModel.id, 'z-ai/model-a');
  assert.deepEqual(result.visibleModels.map((model) => model.id), ['z-ai/model-a', 'gemini-pro']);
  assert.equal(result.processedModels.find((model) => model.id === 'gemini-pro').company, 'google');
  assert.equal(result.processedModels.find((model) => model.id === 'z-ai/model-a').company, 'z-ai');
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

test('the header slot is cleared and the composer picker redrawn, so nothing is left of the old header menu', () => {
  const { document, cleanup } = createDom('<div id="model-switcher-container"><button id="current-model-btn">old</button></div>');
  const calls = [];
  try {
    const lifecycle = createModelSwitcherLifecycle({
      getModelSwitcherContainer: () => document.querySelector('#model-switcher-container'),
      renderCouncilControls: () => calls.push('renderCouncilControls')
    });
    lifecycle.renderModelSwitcher();
    assert.equal(document.querySelector('#model-switcher-container').innerHTML, '');
    assert.deepEqual(calls, ['renderCouncilControls']);
    assert.doesNotThrow(() => createModelSwitcherLifecycle().renderModelSwitcher());
  } finally {
    cleanup();
  }
});

test('the model list is grouped by company: the one in use first, beta models last, the rest by name', () => {
  const models = [
    { id: 'zeta/one', name: 'Zeta One', provider: 'openrouter' },
    { id: 'gemini-pro', name: 'Gemini Pro', provider: 'gemini' },
    { id: 'deepseek/v4', name: 'DeepSeek V4', provider: 'openrouter' },
    { id: 'nvidia/deepseek-ai/v4', apiId: 'deepseek-ai/v4', name: 'NVIDIA DeepSeek V4', provider: 'nvidia' },
    { id: 'lab/beta', name: 'Lab Beta', provider: 'openrouter', isBeta: true }
  ];
  const groups = buildModelGroups(models, {
    decorate: (model) => ({ id: model.id, name: model.name, company: getModelCompany(model) }),
    currentId: 'zeta/one',
    currentLabel: 'In use',
    betaLabel: 'Beta'
  });
  assert.deepEqual(groups.map((group) => group.label), ['In use', 'DeepSeek', 'Google', 'Beta']);
  assert.deepEqual(groups.find((group) => group.label === 'DeepSeek').models.map((model) => model.id), ['deepseek/v4', 'nvidia/deepseek-ai/v4'], 'the same maker across providers stays together');
  assert.equal(getCompanyLabel('x-ai'), 'xAI');
  assert.equal(getCompanyLabel('mistralai'), 'Mistral');
  assert.equal(getCompanyLabel('some-lab'), 'Some Lab');
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
