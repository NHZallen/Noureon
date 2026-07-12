import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createDom } from './behaviours/helpers/create-dom.js';
import { createCouncilControlsLifecycle } from '../src/app/legacy-runtime/features/council-controls-lifecycle.js';

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
  { id: 'model-a', name: 'Model A', provider: 'alpha' },
  { id: 'model-b', name: 'Model B', provider: 'beta' }
];

const createHarness = (overrides = {}) => {
  const { document, cleanup } = createDom(`
    <div id="input-controls">
      <div id="file-input"></div>
    </div>
  `);
  const calls = [];
  const conversation = overrides.conversation ?? {
    archived: false,
    council: {
      enabled: true,
      mode: 'consensus',
      participantModelIds: ['model-a'],
      synthesizerModelId: 'model-b',
      showRawResponses: false,
      showComparisonTable: false
    },
    isWebSearchEnabled: false,
    model: 'model-a'
  };
  const config = { isLearningMode: false, uiLanguage: overrides.uiLanguage || 'en' };
  const lifecycle = createCouncilControlsLifecycle({
    closeAllPopovers: () => calls.push(['closeAllPopovers']),
    councilMaxModels: 4,
    document,
    escapeHTML,
    formatCouncilModelSummary: (models) => models.map((model) => model.name).join(', '),
    getActiveConversation: () => overrides.noConversation ? null : conversation,
    getConfig: () => config,
    getCouncilModelList: () => MODELS,
    getCouncilRuntimeTexts: () => ({
      comparisonToggle: 'Comparison',
      councilLocked: 'Council locked',
      searchEnabledNote: 'Search enabled',
      searchManualNotice: 'Search must be enabled manually'
    }),
    getCouncilTexts: () => ({
      consensus: 'Consensus',
      deliberation: 'Deliberation',
      disabled: 'Disabled',
      enable: 'Enable',
      participants: 'Participants',
      rawNotes: 'Raw',
      ready: 'Ready',
      required: 'Required',
      selectSynthesizer: 'Select synthesizer',
      synthesizer: 'Synthesizer',
      title: 'Council',
      tooMany: 'Too many'
    }),
    getCouncilValidation: () => ({ message: 'Ready', ok: true }),
    getI18n: () => overrides.i18n || ({ en: { done: 'Done', search: 'Search', webSearchNotAvailable: 'Unavailable' } }),
    getFileInputContainer: () => document.querySelector('#file-input'),
    getIsCouncilRunning: () => overrides.isCouncilRunning ?? false,
    getModelApiId: (model) => model.id,
    getModelFamilyKey: (model) => model.id,
    getModelFamilyName: (model) => model.name,
    getModelPriceLabel: () => '$1',
    getModelsByIds: (ids) => MODELS.filter((model) => ids.includes(model.id)),
    getProviderLabel: (provider) => provider.toUpperCase(),
    hasCouncilWebSearchAccess: () => true,
    modelSupportsDocumentUpload: () => false,
    modelSupportsVision: () => false,
    modelSupportsWebSearch: () => true,
    models: MODELS,
    normalizeConversationModel: () => MODELS[0],
    normalizeCouncilConfig: (value) => value,
    persistCouncilConfig: async () => calls.push(['persistCouncilConfig']),
    renderInputIndicators: () => calls.push(['renderInputIndicators']),
    requestFrame: (callback) => {
      calls.push(['requestFrame']);
      callback();
    },
    saveAppData: async () => calls.push(['saveAppData']),
    seedCouncilParticipants: () => calls.push(['seedCouncilParticipants']),
    showNotification: (message, type) => calls.push(['showNotification', message, type])
  });

  return { calls, cleanup, conversation, document, lifecycle };
};

test('renders council controls with participant, synthesizer, search, and status markup', () => {
  const { cleanup, document, lifecycle } = createHarness();
  try {
    lifecycle.renderCouncilControls();

    const container = document.querySelector('#model-council-control');
    assert.ok(container);
    assert.equal(container.previousElementSibling.id, 'file-input');
    assert.match(container.textContent, /Council/);
    assert.match(container.textContent, /Model A/);
    assert.match(container.textContent, /Model B/);
    assert.equal(container.querySelector('[data-council-participant="model-a"]').checked, true);
    assert.equal(container.querySelector('[data-council-synthesizer="model-b"]').checked, true);
    assert.ok(container.querySelector('#model-council-search-toggle'));
  } finally {
    cleanup();
  }
});

test('enable, mode, search, and model selection events preserve dependency handoffs', async () => {
  const { calls, cleanup, conversation, document, lifecycle } = createHarness();
  try {
    lifecycle.renderCouncilControls();
    document.querySelector('#model-council-enabled').click();
    await Promise.resolve();
    assert.equal(conversation.council.enabled, false);

    lifecycle.renderCouncilControls();
    document.querySelector('[data-council-mode="deliberation"]').click();
    document.querySelector('#model-council-search-toggle').click();
    const participant = document.querySelector('[data-council-participant="model-b"]');
    participant.checked = true;
    participant.dispatchEvent(new document.defaultView.Event('change'));
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(conversation.council.mode, 'deliberation');
    assert.equal(conversation.isWebSearchEnabled, true);
    assert.deepEqual(conversation.council.participantModelIds, ['model-a', 'model-b']);
    assert.ok(calls.some(([name]) => name === 'persistCouncilConfig'));
    assert.ok(calls.some(([name]) => name === 'saveAppData'));
    assert.ok(calls.some(([name]) => name === 'renderInputIndicators'));
  } finally {
    cleanup();
  }
});

test('missing conversation clears the council controls container', () => {
  const missingConversation = createHarness({ noConversation: true });
  try {
    missingConversation.lifecycle.renderCouncilControls();
    assert.equal(
      missingConversation.document.querySelector('#model-council-control').innerHTML,
      ''
    );
  } finally {
    missingConversation.cleanup();
  }
});

test('missing input controls remain a safe no-op boundary', () => {
  const lifecycle = createCouncilControlsLifecycle({
    document: {},
    getFileInputContainer: () => ({ parentElement: null })
  });

  assert.doesNotThrow(() => lifecycle.renderCouncilControls());
});

test('renders dynamic council metadata from the active locale', () => {
  const { cleanup, document, lifecycle } = createHarness({
    uiLanguage: 'ru',
    i18n: {
      ru: {
        capabilities: 'Возможности',
        document: 'Документы',
        done: 'Готово',
        price: 'Цена',
        provider: 'Поставщик',
        providers: 'поставщика',
        search: 'Поиск',
        searchModels: 'Поиск моделей',
        textOrFile: 'Текст / файл',
        vision: 'Зрение',
        webSearchNotAvailable: 'Недоступно'
      }
    }
  });
  try {
    lifecycle.renderCouncilControls();
    const container = document.querySelector('#model-council-control');
    assert.equal(container.querySelector('[data-council-model-search]').placeholder, 'Поиск моделей');
    assert.match(container.textContent, /Готово/);
    assert.match(container.textContent, /Цена/);
    assert.doesNotMatch(container.textContent, /Price|Search models|Done/);
  } finally {
    cleanup();
  }
});

test('file input container is read lazily from the injected getter', () => {
  const { document, cleanup } = createDom(`
    <div id="first-controls">
      <div id="first-input"></div>
    </div>
    <div id="second-controls">
      <div id="second-input"></div>
    </div>
  `);
  let fileInputContainer = document.querySelector('#first-input');
  const lifecycle = createCouncilControlsLifecycle({
    document,
    getActiveConversation: () => null,
    getFileInputContainer: () => fileInputContainer
  });

  try {
    fileInputContainer = document.querySelector('#second-input');
    lifecycle.renderCouncilControls();

    const container = document.querySelector('#model-council-control');
    assert.equal(container.previousElementSibling.id, 'second-input');
    assert.equal(document.querySelector('#first-controls #model-council-control'), null);
  } finally {
    cleanup();
  }
});

test('council controls source avoids provider parser, storage schema, package, and Vite coupling', () => {
  const source = readSource('src/app/legacy-runtime/features/council-controls-lifecycle.js');

  assert.match(source, /\bgetFileInputContainer\b/);
  assert.doesNotMatch(source, /\belements\b/);
  assert.doesNotMatch(source, /elements\.fileInputContainer/);

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
