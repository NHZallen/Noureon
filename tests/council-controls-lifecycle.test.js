import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createDom } from './behaviours/helpers/create-dom.js';
import { createCouncilControlsLifecycle } from '../src/app/legacy-runtime/features/council-controls-lifecycle.js';
import { MODEL_PICKER_LANGUAGES, MODEL_PICKER_TEXT_KEYS, modelPickerText } from '../src/app/ui/model-picker/model-picker-texts.js';

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
  { id: 'model-a', name: 'Model A', provider: 'gemini', descriptionKey: 'desc_a', tier: ['paid'] },
  { id: 'model-b', name: 'Model B', provider: 'openrouter', descriptionKey: 'desc_b', tier: ['free'] },
  { id: 'vendor/model-c', name: 'Model C', provider: 'openrouter', descriptionKey: 'desc_c', tier: ['paid'] },
  { id: 'beta-d', name: 'Model D', provider: 'openrouter', descriptionKey: 'desc_d', isBeta: true, tier: [] }
];
const REASONING = { options: ['low', 'medium', 'high'], defaultEffort: 'medium' };

const createHarness = (overrides = {}) => {
  const { document, cleanup } = createDom(`
    <div id="input-controls">
      <div id="file-input"></div>
      <button id="voice"></button>
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
  const config = {
    isLearningMode: false,
    uiLanguage: overrides.uiLanguage || 'en',
    modelSettings: MODELS.map((model, order) => ({ id: model.id, order, hidden: false })),
    acknowledgedStealthModelTerms: []
  };
  const lifecycle = createCouncilControlsLifecycle({
    closeAllPopovers: () => {
      calls.push(['closeAllPopovers']);
      document.querySelectorAll('.popover.visible').forEach((popover) => popover.classList.remove('visible'));
    },
    councilMaxModels: 4,
    document,
    escapeHTML,
    getActiveConversation: () => overrides.noConversation ? null : conversation,
    getComposerAnchor: () => (overrides.noAnchor ? null : document.querySelector('#voice')),
    getConfig: () => config,
    getCouncilModelList: () => MODELS.filter((model) => !model.isBeta),
    getCouncilRuntimeTexts: () => ({
      comparisonToggle: 'Comparison',
      councilLocked: 'Council locked',
      searchEnabledNote: 'Search enabled',
      searchManualNotice: 'Search must be enabled manually'
    }),
    getCouncilTexts: () => ({
      consensus: 'Consensus',
      deliberation: 'Discussion',
      rawNotes: 'Raw',
      ready: 'Ready',
      required: 'Required',
      selectSynthesizer: 'Select synthesizer',
      title: 'Council',
      tooMany: 'Too many'
    }),
    getCouncilValidation: () => ({ message: 'Choose members', ok: overrides.valid ?? true }),
    getI18n: () => overrides.i18n || ({ en: { desc_a: 'Paid: $1', desc_b_tier_free: 'Free tier' } }),
    getFileInputContainer: () => document.querySelector('#file-input'),
    getIsCouncilRunning: () => overrides.isCouncilRunning ?? false,
    getModelApiId: (model) => model.id,
    getModelReasoningConfig: (model) => (model?.id === 'model-a' && !overrides.noReasoning ? REASONING : null),
    getModelRetirementLabel: () => '',
    getModelTiers: (model) => model.tier || [],
    getModelsByIds: (ids) => MODELS.filter((model) => ids.includes(model.id)),
    getProviderLabel: (provider) => provider.toUpperCase(),
    getReasoningEffortLabel: (value) => ({ low: 'Low', medium: 'Medium', high: 'High' }[value] || value),
    getSingleDocumentTranslatorModel: () => null,
    hasCouncilWebSearchAccess: () => true,
    isImageConversation: () => Boolean(overrides.image),
    modelSupportsDocumentUpload: () => false,
    modelSupportsVision: (model) => model.provider === 'gemini',
    modelSupportsWebSearch: () => true,
    models: MODELS,
    normalizeConversationModel: () => MODELS[0],
    normalizeCouncilConfig: (value = {}) => ({ enabled: false, mode: 'consensus', participantModelIds: [], ...value }),
    normalizeReasoningEffort: (model, value) => (REASONING.options.includes(value) ? value : REASONING.defaultEffort),
    persistCouncilConfig: async () => calls.push(['persistCouncilConfig']),
    renderInputIndicators: () => calls.push(['renderInputIndicators']),
    renderSidebar: () => calls.push(['renderSidebar']),
    requestFrame: (callback) => callback(),
    saveAppData: async () => calls.push(['saveAppData']),
    saveConfig: async () => calls.push(['saveConfig']),
    seedCouncilParticipants: (target) => {
      calls.push(['seedCouncilParticipants']);
      if (!target.council.participantModelIds?.length) target.council.participantModelIds = ['model-a'];
    },
    showCustomDialog: async () => true,
    showNotification: (message, type) => calls.push(['showNotification', message, type])
  });
  return { calls, cleanup, config, conversation, document, lifecycle };
};

const settle = async () => {
  for (let index = 0; index < 4; index += 1) await Promise.resolve();
};

const singleConversation = (extra = {}) => ({
  archived: false,
  council: { enabled: false, mode: 'consensus', participantModelIds: [], synthesizerModelId: '' },
  isWebSearchEnabled: false,
  model: 'model-a',
  ...extra
});

test('the composer button names the model, or the council, and sits before the send controls', () => {
  const single = createHarness({ conversation: singleConversation() });
  try {
    single.lifecycle.renderCouncilControls();
    const container = single.document.querySelector('#model-council-control');
    assert.equal(container.nextElementSibling.id, 'voice');
    const trigger = container.querySelector('#model-picker-btn');
    assert.equal(trigger.querySelector('.mp-trigger-name').textContent, 'Model A');
    assert.equal(trigger.querySelector('.mp-trigger-effort'), null, 'how deeply it thinks has its own button');
    assert.equal(trigger.getAttribute('aria-expanded'), 'false');
    const depth = container.querySelector('#model-depth-btn');
    assert.equal(depth.querySelector('.mp-depth-trigger-value').textContent, 'Medium');
    assert.equal(depth.textContent.trim(), 'Medium', 'the button says only the level, without a label');
    assert.match(depth.title, /Thinking: Medium/, 'the words are its tooltip');
    assert.equal(depth.nextElementSibling.id, 'model-depth-popover', 'with its own small panel');
    assert.equal(trigger.nextElementSibling.id, 'model-picker-popover');
  } finally {
    single.cleanup();
  }
  const council = createHarness();
  try {
    council.lifecycle.renderCouncilControls();
    const trigger = council.document.querySelector('#model-picker-btn');
    assert.equal(trigger.querySelector('.mp-trigger-name').textContent, 'Council · 1');
    assert.equal(trigger.querySelector('.mp-trigger-effort'), null);
    assert.equal(council.document.querySelector('#model-depth-btn'), null, 'a council has no single level to set');
  } finally {
    council.cleanup();
  }
});

test('a single model is chosen from one searchable list grouped by company, the one in use first', () => {
  const { cleanup, document, lifecycle } = createHarness({ conversation: singleConversation() });
  try {
    lifecycle.renderCouncilControls();
    const panel = document.querySelector('#model-picker-popover');
    const titles = [...panel.querySelectorAll('.mp-group-title')].map((node) => node.textContent);
    assert.deepEqual(titles, ['In use', 'Model B', 'Vendor', 'Beta models']);
    const rows = [...panel.querySelectorAll('[data-mp-model]')].map((node) => node.dataset.mpModel);
    assert.deepEqual(rows.sort(), ['beta-d', 'model-a', 'model-b', 'vendor/model-c']);
    assert.equal(panel.querySelector('[data-mp-model="model-a"]').classList.contains('is-selected'), true);
    assert.match(panel.querySelector('[data-mp-model="model-a"]').textContent, /GEMINI · Vision · Search/);
    assert.doesNotMatch(panel.querySelector('[data-mp-model="model-a"]').textContent, /Paid/, 'two lines a row, so more models fit');
    assert.match(panel.querySelector('[data-mp-model="model-a"]').title, /Paid: \$1/, 'the price and notes are its tooltip');
    assert.match(panel.querySelector('[data-mp-model="model-b"]').textContent, /Free/);
    assert.match(panel.querySelector('[data-mp-model="model-b"]').title, /Free tier/);
    assert.equal(panel.querySelector('[data-mp-depth]'), null, 'the thinking control is not in the model list');
    assert.equal(panel.querySelector('[data-mp-search]').placeholder, 'Search models');
  } finally {
    cleanup();
  }
});

test('typing in the search box narrows the list and says so when nothing is left', () => {
  const { cleanup, document, lifecycle } = createHarness({ conversation: singleConversation() });
  try {
    lifecycle.renderCouncilControls();
    const panel = document.querySelector('#model-picker-popover');
    const search = panel.querySelector('[data-mp-search]');
    search.value = 'model c';
    search.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }));
    const shown = [...panel.querySelectorAll('[data-mp-model]')].filter((row) => !row.hidden).map((row) => row.dataset.mpModel);
    assert.deepEqual(shown, ['vendor/model-c']);
    assert.equal(panel.querySelector('[data-mp-empty]').hidden, true);
    search.value = 'zzz';
    search.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }));
    assert.equal(panel.querySelector('[data-mp-empty]').hidden, false);
    assert.equal([...panel.querySelectorAll('[data-mp-group]')].every((group) => group.hidden), true);
  } finally {
    cleanup();
  }
});

test('choosing a model saves it with its default thinking level and closes the panel', async () => {
  const { calls, cleanup, config, conversation, document, lifecycle } = createHarness({ conversation: singleConversation({ reasoningEffort: 'high' }) });
  try {
    lifecycle.renderCouncilControls();
    document.querySelector('#model-picker-btn').click();
    assert.equal(document.querySelector('#model-picker-popover').classList.contains('visible'), true);
    document.querySelector('[data-mp-model="model-b"]').click();
    await settle();
    assert.equal(conversation.model, 'model-b');
    assert.equal(conversation.provider, 'openrouter');
    assert.equal(conversation.reasoningEffort, undefined, 'a model without levels keeps none');
    assert.equal(config.lastUsedModel, 'model-b');
    assert.ok(calls.some(([name]) => name === 'saveAppData'));
    assert.ok(calls.some(([name]) => name === 'saveConfig'));
    assert.ok(calls.some(([name]) => name === 'renderInputIndicators'));
    assert.equal(document.querySelector('#model-picker-popover').classList.contains('visible'), false);
  } finally {
    cleanup();
  }
});

test('a model that needs its terms accepted is chosen once they are, and remembered', async () => {
  const { cleanup, conversation, config, document, lifecycle } = createHarness({ conversation: singleConversation() });
  MODELS[1].requiresStealthTermsAcknowledgement = true;
  try {
    lifecycle.renderCouncilControls();
    const trigger = document.querySelector('#model-picker-btn');
    trigger.click();
    document.querySelector('[data-mp-model="model-b"]').click();
    await settle();
    assert.equal(conversation.model, 'model-b', 'the harness dialog accepts');
    assert.deepEqual(config.acknowledgedStealthModelTerms, ['model-b'], 'remembered so it is asked once');
  } finally {
    delete MODELS[1].requiresStealthTermsAcknowledgement;
    cleanup();
  }
});

test('how deeply it thinks is a slider with a dot for each of the model\'s own levels: the thumb jumps from dot to dot, and the level is kept when it is let go', async () => {
  const { calls, cleanup, conversation, document, lifecycle } = createHarness({ conversation: singleConversation({ reasoningEffort: 'medium' }) });
  const buzzes = [];
  try {
    lifecycle.renderCouncilControls();
    Object.defineProperty(document.defaultView.navigator, 'vibrate', { configurable: true, value: (ms) => buzzes.push(ms) });
    const slider = document.querySelector('[data-mp-depth-input]');
    const wrap = document.querySelector('[data-mp-slider]');
    assert.equal(slider.type, 'range');
    assert.equal(slider.max, '2');
    assert.equal(slider.getAttribute('step'), '1', 'the browser puts the thumb on a level, never between');
    assert.equal(slider.value, '1');
    assert.equal(document.querySelectorAll('.mp-dot').length, 3, 'a dot for each level');
    assert.equal(document.querySelectorAll('.mp-dot.is-default').length, 1, 'the model\'s own default is marked');
    assert.equal(document.querySelector('[data-mp-depth-value]').textContent, 'Medium');
    assert.deepEqual([...document.querySelectorAll('.mp-depth-ends span')].map((node) => node.textContent), ['Faster', 'Smarter']);
    assert.equal(wrap.style.getPropertyValue('--mp-p'), '0.5000');

    // Moving: each dot passed is a step, named at once, and ticks where the device can.
    slider.value = '2';
    slider.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }));
    assert.equal(Number(wrap.style.getPropertyValue('--mp-p')), 1);
    assert.equal(document.querySelector('[data-mp-depth-value]').textContent, 'High');
    assert.equal(conversation.reasoningEffort, 'medium', 'nothing saved until it is let go');
    slider.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }));
    assert.equal(buzzes.length, 1, 'one tick for the one step, none for staying on it');

    // Let go: that level is kept, and the panel is not redrawn under the thumb.
    const depthPanel = document.querySelector('#model-depth-popover');
    assert.ok(depthPanel.contains(slider), 'the slider is in the thinking panel');
    slider.dispatchEvent(new document.defaultView.Event('change', { bubbles: true }));
    await settle();
    assert.equal(conversation.reasoningEffort, 'high');
    assert.ok(calls.some(([name]) => name === 'saveAppData'));
    assert.equal(document.querySelector('.mp-depth-trigger-value').textContent, 'High');
    assert.equal(document.querySelector('#model-depth-popover'), depthPanel);

    slider.value = '0';
    slider.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }));
    slider.dispatchEvent(new document.defaultView.Event('change', { bubbles: true }));
    await settle();
    assert.equal(conversation.reasoningEffort, 'low');
    assert.equal(document.querySelector('[data-mp-depth-value]').textContent, 'Low');
  } finally {
    cleanup();
  }
});

test('the arrow keys move the thinking slider one level at a time, and Home and End go to the ends', async () => {
  const { cleanup, conversation, document, lifecycle } = createHarness({ conversation: singleConversation({ reasoningEffort: 'medium' }) });
  try {
    lifecycle.renderCouncilControls();
    const slider = document.querySelector('[data-mp-depth-input]');
    const press = (key) => slider.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    press('ArrowRight');
    await settle();
    assert.equal(conversation.reasoningEffort, 'high');
    press('ArrowRight');
    await settle();
    assert.equal(conversation.reasoningEffort, 'high', 'stops at the last level');
    press('ArrowLeft');
    await settle();
    assert.equal(conversation.reasoningEffort, 'medium');
    press('Home');
    await settle();
    assert.equal(conversation.reasoningEffort, 'low');
    press('End');
    await settle();
    assert.equal(conversation.reasoningEffort, 'high');
    assert.equal(document.querySelector('[data-mp-depth-value]').textContent, 'High');
  } finally {
    cleanup();
  }
  const none = createHarness({ conversation: singleConversation(), noReasoning: true });
  try {
    none.lifecycle.renderCouncilControls();
    assert.equal(none.document.querySelector('[data-mp-depth]'), null, 'no slider for a model that has no levels');
  } finally {
    none.cleanup();
  }
});

test('switching to the council enables it with members chosen for you', async () => {
  const { calls, cleanup, conversation, document, lifecycle } = createHarness({ conversation: singleConversation() });
  try {
    lifecycle.renderCouncilControls();
    document.querySelector('[data-mp-tab="council"]').click();
    await settle();
    assert.equal(conversation.council.enabled, true);
    assert.ok(calls.some(([name]) => name === 'seedCouncilParticipants'));
    assert.ok(calls.some(([name]) => name === 'persistCouncilConfig'));
    assert.ok(calls.some(([name, message]) => name === 'showNotification' && message === 'Search must be enabled manually'));
    conversation.council.enabled = true;
    lifecycle.renderCouncilControls();
    document.querySelector('[data-mp-tab="single"]').click();
    await settle();
    assert.equal(conversation.council.enabled, false);
  } finally {
    cleanup();
  }
});

test('the council page shows members as removable tags, who combines them, and how they work', async () => {
  const { cleanup, conversation, document, lifecycle } = createHarness();
  conversation.council.participantModelIds = ['model-a', 'vendor/model-c'];
  try {
    lifecycle.renderCouncilControls();
    const panel = document.querySelector('#model-picker-popover');
    assert.deepEqual([...panel.querySelectorAll('.mp-chip-name')].map((node) => node.textContent), ['Model A', 'Model C']);
    assert.equal(panel.querySelector('.mp-count').textContent, '2/4');
    assert.match(panel.querySelector('[data-mp-open="combiner"]').textContent, /Model B/);
    assert.equal(panel.querySelector('[data-mp-mode="consensus"]').getAttribute('aria-checked'), 'true');
    assert.match(panel.querySelector('[data-mp-mode="deliberation"]').textContent, /Discussion/);
    assert.ok(panel.querySelector('[data-mp-open="members"]'), 'a way to add a model');
    assert.equal(panel.querySelector('.mp-status').textContent.startsWith('Ready'), true);

    panel.querySelector('[data-mp-remove="vendor/model-c"]').click();
    await settle();
    assert.deepEqual(conversation.council.participantModelIds, ['model-a']);
    document.querySelector('[data-mp-mode="deliberation"]').click();
    await settle();
    assert.equal(conversation.council.mode, 'deliberation');
  } finally {
    cleanup();
  }
});

test('members and the combining model are picked from the same searchable list', async () => {
  const { calls, cleanup, conversation, document, lifecycle } = createHarness();
  try {
    lifecycle.renderCouncilControls();
    document.querySelector('#model-picker-btn').click();
    document.querySelector('[data-mp-open="members"]').click();
    let panel = document.querySelector('#model-picker-popover');
    assert.equal(panel.querySelector('.mp-view').dataset.mpView, 'members');
    assert.match(panel.querySelector('.mp-pick-title').textContent, /Choose members \(1\/4\)/);
    assert.equal(panel.querySelector('[data-mp-member="model-a"]').checked, true);
    const member = panel.querySelector('[data-mp-member="vendor/model-c"]');
    member.checked = true;
    member.dispatchEvent(new document.defaultView.Event('change', { bubbles: true }));
    await settle();
    assert.deepEqual(conversation.council.participantModelIds, ['model-a', 'vendor/model-c']);
    assert.ok(calls.some(([name]) => name === 'persistCouncilConfig'));

    document.querySelector('[data-mp-back]').click();
    assert.equal(document.querySelector('.mp-view').dataset.mpView, 'main');
    document.querySelector('[data-mp-open="combiner"]').click();
    panel = document.querySelector('#model-picker-popover');
    assert.equal(panel.querySelector('[data-mp-combiner="model-b"]').checked, true);
    const combiner = panel.querySelector('[data-mp-combiner="vendor/model-c"]');
    combiner.checked = true;
    combiner.dispatchEvent(new document.defaultView.Event('change', { bubbles: true }));
    await settle();
    assert.equal(conversation.council.synthesizerModelId, 'vendor/model-c');
    assert.equal(document.querySelector('.mp-view').dataset.mpView, 'main', 'back on the council page once one is chosen');
  } finally {
    cleanup();
  }
});

test('a full council cannot take another member, and says so', async () => {
  const { calls, cleanup, conversation, document, lifecycle } = createHarness();
  conversation.council.participantModelIds = ['model-a', 'model-b', 'vendor/model-c', 'beta-d'];
  try {
    lifecycle.renderCouncilControls();
    assert.equal(document.querySelector('[data-mp-open="members"]'), null, 'nothing left to add');
    assert.equal(document.querySelector('.mp-count').textContent, '4/4');
    assert.equal(calls.length, 0);
  } finally {
    cleanup();
  }
});

test('the extra options are switches, and search only appears where the model can use it', async () => {
  const { cleanup, conversation, document, lifecycle } = createHarness();
  try {
    lifecycle.renderCouncilControls();
    const raw = document.querySelector('[data-mp-raw]');
    raw.checked = true;
    raw.dispatchEvent(new document.defaultView.Event('change', { bubbles: true }));
    await settle();
    assert.equal(conversation.council.showRawResponses, true);
    document.querySelector('[data-mp-comparison]').checked = true;
    document.querySelector('[data-mp-comparison]').dispatchEvent(new document.defaultView.Event('change', { bubbles: true }));
    await settle();
    assert.equal(conversation.council.showComparisonTable, true);
    const search = document.querySelector('[data-mp-search-toggle]');
    search.checked = true;
    search.dispatchEvent(new document.defaultView.Event('change', { bubbles: true }));
    await settle();
    assert.equal(conversation.isWebSearchEnabled, true);
  } finally {
    cleanup();
  }
});

test('while the council runs nothing can be changed, and the panel says why', async () => {
  const { calls, cleanup, conversation, document, lifecycle } = createHarness({ isCouncilRunning: true });
  try {
    lifecycle.renderCouncilControls();
    const panel = document.querySelector('#model-picker-popover');
    assert.equal(panel.querySelector('.mp-status').textContent, 'The council is running. Changes wait until it finishes.');
    assert.equal(panel.querySelector('[data-mp-mode="deliberation"]').disabled, true);
    assert.equal(panel.querySelector('[data-mp-tab="single"]').disabled, true);
    const raw = panel.querySelector('[data-mp-raw]');
    raw.checked = true;
    raw.dispatchEvent(new document.defaultView.Event('change', { bubbles: true }));
    await settle();
    assert.equal(conversation.council.showRawResponses, false);
    assert.ok(calls.some(([name, message]) => name === 'showNotification' && message === 'Council locked'));
  } finally {
    cleanup();
  }
});

test('the council page is left out for image models and while Learning mode is on', () => {
  const image = createHarness({ conversation: singleConversation(), image: true });
  try {
    image.lifecycle.renderCouncilControls();
    assert.equal(image.document.querySelector('.mp-tabs'), null);
  } finally {
    image.cleanup();
  }
  const learning = createHarness({ conversation: singleConversation() });
  try {
    learning.config.isLearningMode = true;
    learning.lifecycle.renderCouncilControls();
    assert.equal(learning.document.querySelector('.mp-tabs'), null);
  } finally {
    learning.cleanup();
  }
});

test('an archived conversation cannot change its model', () => {
  const { cleanup, document, lifecycle } = createHarness({ conversation: singleConversation({ archived: true }) });
  try {
    lifecycle.renderCouncilControls();
    assert.equal(document.querySelector('#model-picker-btn').disabled, true);
    assert.equal(document.querySelector('[data-mp-depth-input]').disabled, true);
  } finally {
    cleanup();
  }
});

test('the menu item opens the panel on the council page', async () => {
  const { conversation, cleanup, document, lifecycle } = createHarness({ conversation: singleConversation() });
  try {
    assert.equal(await lifecycle.openModelPicker({ council: true }), true);
    assert.equal(conversation.council.enabled, true);
    assert.equal(document.querySelector('#model-picker-popover').classList.contains('visible'), true);
    assert.equal(document.querySelector('#model-picker-btn').getAttribute('aria-expanded'), 'true');
  } finally {
    cleanup();
  }
});

test('Escape clears a search, then closes the panel', () => {
  const { cleanup, document, lifecycle } = createHarness({ conversation: singleConversation() });
  try {
    lifecycle.renderCouncilControls();
    document.querySelector('#model-picker-btn').click();
    const search = document.querySelector('[data-mp-search]');
    search.value = 'model c';
    search.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }));
    const escape = () => search.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    escape();
    assert.equal(search.value, '');
    assert.equal(document.querySelector('#model-picker-popover').classList.contains('visible'), true);
    escape();
    assert.equal(document.querySelector('#model-picker-popover').classList.contains('visible'), false);
  } finally {
    cleanup();
  }
});

test('missing conversation clears the picker', () => {
  const missing = createHarness({ noConversation: true });
  try {
    missing.lifecycle.renderCouncilControls();
    assert.equal(missing.document.querySelector('#model-council-control').innerHTML, '');
  } finally {
    missing.cleanup();
  }
});

test('missing input controls remain a safe no-op boundary', () => {
  const lifecycle = createCouncilControlsLifecycle({
    document: {},
    getFileInputContainer: () => ({ parentElement: null })
  });
  assert.doesNotThrow(() => lifecycle.renderCouncilControls());
});

test('the button goes after the attach button where there is no send control to sit before, and the container is read lazily', () => {
  const { document, cleanup } = createDom(`
    <div id="first-controls"><div id="first-input"></div></div>
    <div id="second-controls"><div id="second-input"></div></div>
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
    lifecycle.renderCouncilControls();
    const container = document.querySelector('#model-council-control');
    assert.equal(container.previousElementSibling.id, 'second-input');
    assert.equal(document.querySelector('#first-controls #model-council-control'), null);
  } finally {
    cleanup();
  }
});

test('every word in the picker exists in all five languages', () => {
  assert.deepEqual([...MODEL_PICKER_LANGUAGES], ['zh-TW', 'en', 'fr', 'ru', 'es']);
  for (const language of MODEL_PICKER_LANGUAGES) {
    for (const key of MODEL_PICKER_TEXT_KEYS) {
      const text = modelPickerText(language, key, { n: 2, name: 'X', level: 'Y' });
      assert.notEqual(text, key, `${language} ${key}`);
      assert.doesNotMatch(text, /\{\w+\}/, `${language} ${key} has a placeholder left`);
    }
  }
  assert.notEqual(modelPickerText('zh-TW', 'tabCouncil'), modelPickerText('en', 'tabCouncil'));
});

test('the picker is written for the panel, not the old header menu, and stays clear of storage and providers', () => {
  const source = readSource('src/app/legacy-runtime/features/council-controls-lifecycle.js');
  assert.match(source, /\bgetFileInputContainer\b/);
  assert.doesNotMatch(source, /\belements\b/);
  for (const forbidden of ['TextDecoder', 'response.body', 'streamApiCall', 'indexedDB', 'localStorage', 'sessionStorage', 'virtual:legacy-app-runtime', 'vite.config', 'package.json', 'REFACTOR_PLAN']) {
    assert.equal(source.includes(forbidden), false, `source should not include ${forbidden}`);
  }
});

// The panel is redrawn by the submit cleanup after every message. That is skipped when
// nothing would change; these pin that it is skipped, and that it is not when something visible is.
test('an unchanged re-render reuses the existing panel instead of rebuilding it', () => {
  const { cleanup, document, lifecycle } = createHarness();
  try {
    lifecycle.renderCouncilControls();
    const container = document.querySelector('#model-council-control');
    const first = container.querySelector('#model-picker-popover');
    lifecycle.renderCouncilControls();
    lifecycle.renderCouncilControls();
    assert.equal(container.querySelector('#model-picker-popover'), first);
  } finally {
    cleanup();
  }
});

test('a change the user can see still rebuilds the panel', () => {
  const { cleanup, conversation, document, lifecycle } = createHarness();
  try {
    lifecycle.renderCouncilControls();
    const container = document.querySelector('#model-council-control');
    const first = container.querySelector('#model-picker-popover');
    conversation.council.enabled = false;
    lifecycle.renderCouncilControls();
    assert.notEqual(container.querySelector('#model-picker-popover'), first);
    assert.equal(container.querySelector('.mp-trigger').classList.contains('is-council'), false);
  } finally {
    cleanup();
  }
});

test('closing the panel from outside is picked up by the next render', () => {
  const { cleanup, document, lifecycle } = createHarness();
  try {
    lifecycle.renderCouncilControls();
    const container = document.querySelector('#model-council-control');
    container.querySelector('#model-picker-btn').click();
    const panel = container.querySelector('#model-picker-popover');
    assert.ok(panel.classList.contains('visible'));
    assert.equal(container.querySelector('#model-picker-btn').getAttribute('aria-expanded'), 'true');
    // closeAllPopovers strips the class straight off the node, without a render.
    panel.classList.remove('visible');
    lifecycle.renderCouncilControls();
    assert.equal(container.querySelector('#model-picker-btn').getAttribute('aria-expanded'), 'false');
    assert.equal(container.querySelector('#model-picker-popover').classList.contains('visible'), false);
    container.querySelector('#model-picker-btn').click();
    assert.equal(container.querySelector('#model-picker-popover').classList.contains('visible'), true, 'and it opens again');
  } finally {
    cleanup();
  }
});

// The page closes popovers on a click outside them by asking whether the clicked node is inside
// the picker. Opening the panel redraws it, which removes the clicked button first, so that
// question would answer "no" and shut the panel at once. The picker keeps such clicks to itself.
test('a click that redraws the panel does not reach the page\'s click-outside handler', () => {
  const { cleanup, document, lifecycle } = createHarness({ conversation: singleConversation() });
  const seen = [];
  try {
    lifecycle.renderCouncilControls();
    document.addEventListener('click', (event) => seen.push(event.target.id || event.target.className));
    document.querySelector('#model-picker-btn').click();
    assert.equal(document.querySelector('#model-picker-popover').classList.contains('visible'), true);
    document.querySelector('[data-mp-tab="council"]');
    assert.deepEqual(seen, [], 'the page never sees the click');
  } finally {
    cleanup();
  }
});

// In a new chat the composer sits mid-screen, so the panel that opens upward from it has less
// room than its usual height; it must stay inside the window, with the list scrolling instead.
test('the panel is kept inside the window: no taller than the room above its button', () => {
  const { cleanup, document, lifecycle } = createHarness({ conversation: singleConversation() });
  try {
    const win = document.defaultView;
    Object.defineProperty(win, 'innerWidth', { configurable: true, value: 1200 });
    win.HTMLElement.prototype.getBoundingClientRect = function rect() {
      return { top: this.id === 'model-picker-btn' ? 500 : 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
    };
    lifecycle.renderCouncilControls();
    assert.equal(document.querySelector('#model-picker-popover').style.maxHeight, '476px');
    win.HTMLElement.prototype.getBoundingClientRect = function rect() {
      return { top: this.id === 'model-picker-btn' ? 900 : 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
    };
    document.querySelector('#model-picker-btn').click();
    assert.equal(document.querySelector('#model-picker-popover').style.maxHeight, '640px', 'never taller than the panel\'s usual height');
    Object.defineProperty(win, 'innerWidth', { configurable: true, value: 400 });
    win.dispatchEvent(new win.Event('resize'));
    lifecycle.renderCouncilControls();
    document.querySelector('#model-picker-btn').click();
    document.querySelector('#model-picker-btn').click();
    assert.equal(document.querySelector('#model-picker-popover').style.maxHeight, '', 'a phone\'s sheet is sized by the stylesheet');
  } finally {
    cleanup();
  }
});

test('how deeply it thinks has its own button and panel, and only one of the two panels is open at a time', () => {
  const { cleanup, document, lifecycle } = createHarness({ conversation: singleConversation({ reasoningEffort: 'medium' }) });
  try {
    lifecycle.renderCouncilControls();
    const modelPanel = () => document.querySelector('#model-picker-popover');
    const depthPanel = () => document.querySelector('#model-depth-popover');
    assert.equal(depthPanel().classList.contains('visible'), false);
    document.querySelector('#model-depth-btn').click();
    assert.equal(depthPanel().classList.contains('visible'), true);
    assert.equal(modelPanel().classList.contains('visible'), false);
    assert.equal(document.querySelector('#model-depth-btn').getAttribute('aria-expanded'), 'true');
    assert.ok(depthPanel().querySelector('[data-mp-depth-input]'));
    assert.equal(depthPanel().querySelector('[data-mp-scroll]'), null, 'no model list in the small panel');

    document.querySelector('#model-picker-btn').click();
    assert.equal(modelPanel().classList.contains('visible'), true);
    assert.equal(depthPanel().classList.contains('visible'), false, 'opening one closes the other');
    document.querySelector('#model-depth-btn').click();
    document.querySelector('#model-depth-btn').click();
    assert.equal(depthPanel().classList.contains('visible'), false, 'and the button toggles it');
  } finally {
    cleanup();
  }
});

test('Escape closes the thinking panel and returns to its button', () => {
  const { cleanup, document, lifecycle } = createHarness({ conversation: singleConversation() });
  try {
    lifecycle.renderCouncilControls();
    document.querySelector('#model-depth-btn').click();
    const slider = document.querySelector('[data-mp-depth-input]');
    slider.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    assert.equal(document.querySelector('#model-depth-popover').classList.contains('visible'), false);
    assert.equal(document.querySelector('#model-depth-btn').getAttribute('aria-expanded'), 'false');
  } finally {
    cleanup();
  }
});

test('the thinking button is left out where there is no level to set', () => {
  const none = createHarness({ conversation: singleConversation(), noReasoning: true });
  try {
    none.lifecycle.renderCouncilControls();
    assert.equal(none.document.querySelector('#model-depth-btn'), null);
    assert.equal(none.document.querySelector('#model-depth-popover'), null);
  } finally {
    none.cleanup();
  }
});

test('moving to another page of the panel eases in: forward from the right, back from the left, and single/council fades', async () => {
  const { cleanup, document, lifecycle } = createHarness();
  try {
    lifecycle.renderCouncilControls();
    document.querySelector('#model-picker-btn').click();
    assert.equal(document.querySelector('.mp-view').classList.contains('is-enter'), false, 'opening the panel is not a page change');
    document.querySelector('[data-mp-open="members"]').click();
    assert.equal(document.querySelector('.mp-view').classList.contains('is-enter'), true);
    document.querySelector('[data-mp-back]').click();
    assert.equal(document.querySelector('.mp-view').classList.contains('is-back'), true);
    document.querySelector('[data-mp-tab="single"]').click();
    await settle();
    assert.equal(document.querySelector('.mp-view').classList.contains('is-fade'), true);
    lifecycle.renderCouncilControls();
    assert.equal(document.querySelector('.mp-view').classList.contains('is-fade'), true, 'an unchanged redraw leaves it alone');
  } finally {
    cleanup();
  }
});
