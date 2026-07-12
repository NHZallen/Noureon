import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createSettingsApiKeyControls } from '../src/app/runtime/legacy-core/settings-api-key-controls.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

function createElement(id = '') {
  const listeners = {};
  const wrapper = {
    children: [],
    inserted: [],
    classList: {
      values: new Set(),
      add(name) { this.values.add(name); },
      contains(name) { return this.values.has(name); }
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    insertAdjacentElement(position, child) {
      this.inserted.push([position, child]);
      return child;
    }
  };
  return {
    id,
    value: '',
    dataset: {},
    listeners,
    wrapper,
    type: '',
    className: '',
    innerHTML: '',
    textContent: '',
    title: '',
    attributes: {},
    classList: {
      add() {},
      contains() { return false; }
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    getAttribute(name) {
      return this.attributes[name];
    },
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
    closest(selector) {
      return selector === 'div' ? wrapper : null;
    }
  };
}

function createHarness(overrides = {}) {
  const calls = [];
  const elements = {
    geminiApiKeyInput: createElement('gemini-api-key-input'),
    openrouterApiKeyInputAll: createElement('openrouter-api-key-input-all'),
    stepPlanApiKeyInput: createElement('step-plan-api-key-input'),
    nvidiaApiKeyInput: createElement('nvidia-api-key-input'),
    tavilyApiKeyInput: createElement('tavily-api-key-input')
  };
  const document = {
    created: [],
    byId: new Map(),
    createElement(tagName) {
      const element = createElement();
      element.tagName = tagName;
      this.created.push(element);
      return element;
    },
    getElementById(id) {
      return this.byId.get(id) || null;
    }
  };
  const controls = createSettingsApiKeyControls({
    document,
    elements,
    getApiKeyForProvider: (provider) => `${provider}-secret-value-abcd`,
    setApiKeyForProvider: (provider, value) => calls.push(['setApiKeyForProvider', provider, value]),
    mergeSensitiveApiKeys: (apiKeys) => calls.push(['mergeSensitiveApiKeys', apiKeys]),
    clearSensitiveApiKeys: async () => calls.push('clearSensitiveApiKeys'),
    saveSensitiveConfig: async () => calls.push('saveSensitiveConfig'),
    ...overrides.dependencies
  });
  return { controls, calls, elements, document };
}

test('module exports createSettingsApiKeyControls and imports inertly', () => {
  assert.equal(typeof createSettingsApiKeyControls, 'function');
  const source = readSource('src/app/runtime/legacy-core/settings-api-key-controls.js');

  assert.doesNotMatch(source, /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-entry|legacy-core\.js/);
});

test('factory validates required dependencies', () => {
  assert.throws(
    () => createSettingsApiKeyControls(),
    /missing dependencies/
  );
});

test('prepareApiKeyInputsForSettings displays masked values without raw stored keys', () => {
  const { controls, elements } = createHarness();

  controls.prepareApiKeyInputsForSettings();

  assert.notEqual(elements.geminiApiKeyInput.value, 'gemini-secret-value-abcd');
  assert.match(elements.geminiApiKeyInput.value, /\*+/);
  assert.equal(JSON.stringify(elements.geminiApiKeyInput.dataset).includes('gemini-secret-value-abcd'), false);
  assert.equal(elements.stepPlanApiKeyInput.dataset.apiKeyProvider, 'stepPlan');
  assert.equal(elements.stepPlanApiKeyInput.value.includes('stepfun-secret-value-abcd'), false);
});

test('unchanged masked placeholder produces no sensitive write', async () => {
  const { controls, calls } = createHarness();

  controls.prepareApiKeyInputsForSettings();
  await controls.persistApiKeyInputIntents();

  assert.deepEqual(calls, []);
});

test('typed new key writes the sensitive store through the provider callback', async () => {
  const { controls, calls, elements } = createHarness();

  controls.prepareApiKeyInputsForSettings();
  elements.geminiApiKeyInput.value = 'new-gemini-key';
  elements.geminiApiKeyInput.listeners.input();
  await controls.persistApiKeyInputIntents();

  assert.deepEqual(calls, [
    ['setApiKeyForProvider', 'gemini', 'new-gemini-key'],
    'saveSensitiveConfig'
  ]);
});

test('cleared input writes an empty key for that provider', async () => {
  const { controls, calls, elements } = createHarness();

  controls.prepareApiKeyInputsForSettings();
  elements.tavilyApiKeyInput.value = '';
  elements.tavilyApiKeyInput.listeners.input();
  await controls.persistApiKeyInputIntents();

  assert.deepEqual(calls, [
    ['setApiKeyForProvider', 'tavily', ''],
    'saveSensitiveConfig'
  ]);
});

test('clear single provider button clears the matching provider and saves', async () => {
  const { controls, calls, elements } = createHarness();

  controls.ensureApiKeyInputSecurityControls();
  const clearButton = elements.geminiApiKeyInput.wrapper.children.find(child => child.className === 'api-key-clear-btn');
  await clearButton.listeners.click({ preventDefault() {} });

  assert.deepEqual(calls, [
    ['setApiKeyForProvider', 'gemini', ''],
    'saveSensitiveConfig'
  ]);
  assert.equal(elements.geminiApiKeyInput.value, '');
  assert.equal(JSON.stringify(elements.geminiApiKeyInput.dataset).includes('secret-value'), false);
});

test('visibility button reveals stored API key without placing raw key in dataset', () => {
  const { controls, elements } = createHarness();

  controls.prepareApiKeyInputsForSettings();
  const visibilityButton = elements.geminiApiKeyInput.wrapper.children.find(child => child.className === 'api-key-visibility-btn');
  visibilityButton.listeners.click({ preventDefault() {} });

  assert.equal(elements.geminiApiKeyInput.type, 'text');
  assert.equal(elements.geminiApiKeyInput.value, 'gemini-secret-value-abcd');
  assert.equal(visibilityButton.getAttribute('aria-pressed'), 'true');
  assert.equal(JSON.stringify(elements.geminiApiKeyInput.dataset).includes('gemini-secret-value-abcd'), false);

  visibilityButton.listeners.click({ preventDefault() {} });

  assert.equal(elements.geminiApiKeyInput.type, 'password');
  assert.notEqual(elements.geminiApiKeyInput.value, 'gemini-secret-value-abcd');
  assert.match(elements.geminiApiKeyInput.value, /\*+/);
});

test('visibility button keeps a newly typed API key editable and persistable', async () => {
  const { controls, calls, elements } = createHarness();

  controls.prepareApiKeyInputsForSettings();
  elements.geminiApiKeyInput.value = 'new-gemini-key';
  elements.geminiApiKeyInput.listeners.input();
  const visibilityButton = elements.geminiApiKeyInput.wrapper.children.find(child => child.className === 'api-key-visibility-btn');
  visibilityButton.listeners.click({ preventDefault() {} });
  visibilityButton.listeners.click({ preventDefault() {} });
  await controls.persistApiKeyInputIntents();

  assert.equal(elements.geminiApiKeyInput.type, 'password');
  assert.equal(elements.geminiApiKeyInput.value, 'new-gemini-key');
  assert.deepEqual(calls, [
    ['setApiKeyForProvider', 'gemini', 'new-gemini-key'],
    'saveSensitiveConfig'
  ]);
});

test('clear all button clears all providers and saves', async () => {
  const { controls, calls, elements } = createHarness();

  controls.prepareApiKeyInputsForSettings();
  const clearAllButton = elements.tavilyApiKeyInput.wrapper.inserted[0][1];
  await clearAllButton.listeners.click({ preventDefault() {} });

  assert.deepEqual(calls, [
    'clearSensitiveApiKeys',
    'saveSensitiveConfig'
  ]);
  assert.equal(elements.geminiApiKeyInput.value, '');
  assert.equal(elements.openrouterApiKeyInputAll.value, '');
  assert.equal(elements.stepPlanApiKeyInput.value, '');
  assert.equal(elements.nvidiaApiKeyInput.value, '');
  assert.equal(elements.tavilyApiKeyInput.value, '');
});

test('model settings explain the session-only API key boundary', () => {
  const { controls, elements } = createHarness();

  controls.ensureApiKeyInputSecurityControls();

  const notice = elements.tavilyApiKeyInput.wrapper.inserted
    .map(([, element]) => element)
    .find(element => element.id === 'api-key-session-only-notice');
  assert.ok(notice);
  assert.match(notice.textContent, /目前瀏覽器工作階段/);
  assert.match(notice.textContent, /無法防止目前頁面中的惡意程式碼讀取/);
});
