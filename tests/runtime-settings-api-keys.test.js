import assert from 'node:assert/strict';
import test from 'node:test';

import { createSettingsAuthProviderLifecycle } from '../src/app/runtime/settings/settings-auth-provider-lifecycle.js';
import { markApiKeyInputCleared, markApiKeyInputDirty, prepareApiKeyInput } from '../src/app/runtime/security/api-key-input-intent.js';
import { createDependencies } from './helpers/settings-lifecycle-harness.js';

test('saveSettings writes API keys through sensitive key callbacks before normal config save', async () => {
  const { dependencies, calls, state } = createDependencies({
    document: {
      body: { classList: { contains() { return false; } } },
      documentElement: { style: { setProperty: () => {} } },
      createElement: () => ({ value: '', dataset: {}, style: {}, classList: { add() {}, remove() {}, contains() { return false; } } }),
      getElementById: () => ({ value: '', dataset: {}, style: {}, classList: { add() {}, remove() {}, contains() { return false; } } }),
      querySelector: (selector) => {
        return null;
      },
      querySelectorAll: () => []
    },
    setApiKeyForProvider: (provider, value) => calls.push(['setApiKeyForProvider', provider, value]),
    saveSensitiveConfig: async () => calls.push('saveSensitiveConfig')
  });
  dependencies.elements.geminiApiKeyInput.value = ' gemini-key ';
  dependencies.elements.openrouterApiKeyInputAll.value = ' openrouter-key ';
  dependencies.elements.nvidiaApiKeyInput.value = ' nvidia-key ';
  dependencies.elements.tavilyApiKeyInput.value = ' tavily-key ';
  dependencies.elements.tavilySearchDepthSelect.value = 'advanced';
  dependencies.elements.autoWebSearchToggleSwitch.checked = true;
  dependencies.elements.autoNamingToggleSwitch.checked = true;
  dependencies.elements.memoryToggle1.checked = true;
  dependencies.elements.autoMemoryToggleSwitch.checked = true;
  dependencies.elements.uiLanguageSelect.value = 'en';
  dependencies.elements.aiLanguageSelect.value = 'en';
  dependencies.elements.enableUpdateNotificationsToggle.checked = true;
  state.config.theme = 'dark';
  dependencies.elements.uiColorOptions.dataset = {};

  const lifecycle = createSettingsAuthProviderLifecycle(dependencies);
  await lifecycle.saveSettings({ close: false, notify: false });

  assert.deepEqual(calls.filter((call) => Array.isArray(call) && call[0] === 'setApiKeyForProvider'), [
    ['setApiKeyForProvider', 'gemini', 'gemini-key'],
    ['setApiKeyForProvider', 'openrouter', 'openrouter-key'],
    ['setApiKeyForProvider', 'nvidia', 'nvidia-key'],
    ['setApiKeyForProvider', 'tavily', 'tavily-key']
  ]);
  assert.ok(calls.indexOf('saveSensitiveConfig') < calls.indexOf('saveConfig'));
  assert.deepEqual(state.config.apiKeys, {});
  assert.equal(state.config.outputMode, 'realtime');
  assert.equal(calls.includes('renderChat'), false);
});

test('setupSettingsModal displays masked API keys without putting raw secrets in value or dataset', () => {
  const rawKeys = {
    gemini: 'gemini-secret-value-abcd',
    openrouter: 'sk-or-v1-openrouter-secret-abcd'
  };
  const { dependencies } = createDependencies({
    getApiKeyForProvider: (provider) => rawKeys[provider] || '',
    document: {
      body: { classList: { contains() { return false; } } },
      documentElement: { style: { setProperty() {} } },
      createElement: () => ({ value: '', dataset: {}, style: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, addEventListener() {}, appendChild() {}, getBoundingClientRect: () => ({ bottom: 0, height: 0 }) }),
      createTextNode: (text) => ({ textContent: text }),
      getElementById: () => null,
      addEventListener() {},
      querySelector: () => ({ style: {}, classList: { add() {}, remove() {}, contains() { return false; } } }),
      querySelectorAll: () => []
    }
  });
  dependencies.elements.geminiApiKeyInput.id = 'gemini-api-key-input';
  dependencies.elements.openrouterApiKeyInputAll.id = 'openrouter-api-key-input-all';

  const lifecycle = createSettingsAuthProviderLifecycle(dependencies);
  lifecycle.setupSettingsModal();

  assert.notEqual(dependencies.elements.geminiApiKeyInput.value, rawKeys.gemini);
  assert.notEqual(dependencies.elements.openrouterApiKeyInputAll.value, rawKeys.openrouter);
  assert.equal(dependencies.elements.geminiApiKeyInput.value.includes('************'), true);
  assert.equal(JSON.stringify(dependencies.elements.geminiApiKeyInput.dataset).includes(rawKeys.gemini), false);
  assert.equal(JSON.stringify(dependencies.elements.openrouterApiKeyInputAll.dataset).includes(rawKeys.openrouter), false);
});

test('setupSettingsModal restores missing auto web search toggle control', () => {
  const insertedRows = [];
  let createdAutoSearchInput = null;
  const makeElement = (id = '') => ({
    id,
    value: '',
    checked: false,
    dataset: {},
    style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {},
    appendChild(child) { insertedRows.push(child); },
    after(child) { insertedRows.push(child); },
    querySelector(selector) {
      if (selector === '#auto-web-search-toggle-switch') {
        if (!createdAutoSearchInput) {
          createdAutoSearchInput = makeElement('auto-web-search-toggle-switch');
        }
        return createdAutoSearchInput;
      }
      return null;
    },
    querySelectorAll() { return []; },
    closest() { return makeElement('auto-naming-row'); },
    focus() {},
    getBoundingClientRect: () => ({ bottom: 0, height: 0 })
  });
  const namingInput = makeElement('auto-naming-toggle-switch');
  const accessibilitySection = makeElement('accessibility-section');
  accessibilitySection.querySelector = (selector) => {
    if (selector === '#auto-naming-toggle-switch') return namingInput;
    if (selector === '#auto-web-search-toggle-switch') return createdAutoSearchInput;
    return null;
  };
  const { dependencies } = createDependencies({
    document: {
      body: { classList: { contains() { return false; } } },
      documentElement: { style: { setProperty() {} } },
      createElement: () => makeElement(),
      createTextNode: (text) => ({ textContent: text }),
      getElementById: (id) => {
        if (id === 'auto-web-search-toggle-switch') return null;
        if (id === 'accessibility-section') return accessibilitySection;
        if (id === 'output-mode-setting-row') return makeElement('output-mode-setting-row');
        return makeElement(id);
      },
      addEventListener() {},
      querySelector: () => makeElement(),
      querySelectorAll: () => []
    }
  });

  const lifecycle = createSettingsAuthProviderLifecycle(dependencies);
  lifecycle.setupSettingsModal();

  assert.equal(insertedRows.length > 0, true);
  assert.equal(dependencies.elements.autoWebSearchToggleSwitch.id, 'auto-web-search-toggle-switch');
});

test('saveSettings preserves unchanged masked keys and never stores masked placeholders', async () => {
  const { dependencies, calls } = createDependencies({
    document: {
      body: { classList: { contains() { return false; } } },
      documentElement: { style: { setProperty: () => {} } },
      createElement: () => ({ value: '', dataset: {}, style: {}, classList: { add() {}, remove() {}, contains() { return false; } } }),
      getElementById: () => ({ value: '', dataset: {}, style: {}, classList: { add() {}, remove() {}, contains() { return false; } } }),
      querySelector: (selector) => {
        return null;
      },
      querySelectorAll: () => []
    },
    setApiKeyForProvider: (provider, value) => calls.push(['setApiKeyForProvider', provider, value]),
    saveSensitiveConfig: async () => calls.push('saveSensitiveConfig')
  });

  prepareApiKeyInput(dependencies.elements.geminiApiKeyInput, {
    provider: 'gemini',
    rawValue: 'gemini-secret-value-abcd'
  });
  dependencies.elements.tavilySearchDepthSelect.value = 'basic';
  dependencies.elements.uiLanguageSelect.value = 'en';
  dependencies.elements.aiLanguageSelect.value = 'en';
  dependencies.elements.uiColorOptions.dataset = {};

  const lifecycle = createSettingsAuthProviderLifecycle(dependencies);
  await lifecycle.saveSettings({ close: false, notify: false });

  assert.equal(calls.some((call) => Array.isArray(call) && call[0] === 'setApiKeyForProvider'), false);
  assert.equal(calls.includes('saveSensitiveConfig'), false);
  assert.equal(calls.includes('saveConfig'), true);
});

test('saveSettings writes new and cleared API key intents through sensitive callbacks', async () => {
  const { dependencies, calls } = createDependencies({
    document: {
      body: { classList: { contains() { return false; } } },
      documentElement: { style: { setProperty: () => {} } },
      createElement: () => ({ value: '', dataset: {}, style: {}, classList: { add() {}, remove() {}, contains() { return false; } } }),
      getElementById: () => ({ value: '', dataset: {}, style: {}, classList: { add() {}, remove() {}, contains() { return false; } } }),
      querySelector: (selector) => {
        return null;
      },
      querySelectorAll: () => []
    },
    setApiKeyForProvider: (provider, value) => calls.push(['setApiKeyForProvider', provider, value]),
    saveSensitiveConfig: async () => calls.push('saveSensitiveConfig')
  });
  prepareApiKeyInput(dependencies.elements.geminiApiKeyInput, { provider: 'gemini', rawValue: 'old-gemini-key' });
  dependencies.elements.geminiApiKeyInput.value = ' new-gemini-key ';
  markApiKeyInputDirty(dependencies.elements.geminiApiKeyInput);
  prepareApiKeyInput(dependencies.elements.nvidiaApiKeyInput, { provider: 'nvidia', rawValue: 'old-nvidia-key' });
  markApiKeyInputCleared(dependencies.elements.nvidiaApiKeyInput);
  dependencies.elements.tavilySearchDepthSelect.value = 'basic';
  dependencies.elements.uiLanguageSelect.value = 'en';
  dependencies.elements.aiLanguageSelect.value = 'en';
  dependencies.elements.uiColorOptions.dataset = {};

  const lifecycle = createSettingsAuthProviderLifecycle(dependencies);
  await lifecycle.saveSettings({ close: false, notify: false });

  assert.deepEqual(calls.filter((call) => Array.isArray(call) && call[0] === 'setApiKeyForProvider'), [
    ['setApiKeyForProvider', 'gemini', 'new-gemini-key'],
    ['setApiKeyForProvider', 'nvidia', '']
  ]);
  assert.ok(calls.indexOf('saveSensitiveConfig') < calls.indexOf('saveConfig'));
});

test('clear all API keys button clears sensitive store and saves without raw dataset secrets', async () => {
  const createdButtons = {};
  const wrapper = {
    classList: { add() {} },
    appendChild(button) { createdButtons[button.id] = button; },
    insertAdjacentElement(_position, button) { createdButtons[button.id] = button; }
  };
  const makeElement = (id = '') => ({
    id,
    value: '',
    dataset: {},
    style: {},
    classList: { add() {}, remove() {}, contains() { return false; } },
    listeners: {},
    addEventListener(type, listener) { this.listeners[type] = listener; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return wrapper; },
    appendChild(button) { createdButtons[button.id] = button; },
    getBoundingClientRect: () => ({ bottom: 0, height: 0 })
  });
  const { dependencies, calls } = createDependencies({
    getApiKeyForProvider: (provider) => `${provider}-secret-value-abcd`,
    clearSensitiveApiKeys: async () => calls.push('clearSensitiveApiKeys'),
    saveSensitiveConfig: async () => calls.push('saveSensitiveConfig'),
    document: {
      body: { classList: { contains() { return false; } } },
      documentElement: { style: { setProperty() {} } },
      createElement: () => makeElement(),
      createTextNode: (text) => ({ textContent: text }),
      getElementById: (id) => {
        if (id === 'accessibility-section' || id === 'output-mode-setting-row') return null;
        return id.endsWith('-clear-btn') || id === 'clear-all-api-keys-btn' ? null : makeElement(id);
      },
      addEventListener() {},
      querySelector: () => ({ style: {}, classList: { add() {}, remove() {}, contains() { return false; } } }),
      querySelectorAll: () => []
    }
  });
  dependencies.elements.geminiApiKeyInput = makeElement('gemini-api-key-input');
  dependencies.elements.openrouterApiKeyInputAll = makeElement('openrouter-api-key-input-all');

  const lifecycle = createSettingsAuthProviderLifecycle(dependencies);
  lifecycle.setupSettingsModal();
  await createdButtons['clear-all-api-keys-btn'].listeners.click({ preventDefault() {} });

  assert.deepEqual(calls.filter((call) => call === 'clearSensitiveApiKeys' || call === 'saveSensitiveConfig'), [
    'clearSensitiveApiKeys',
    'saveSensitiveConfig'
  ]);
  assert.equal(dependencies.elements.geminiApiKeyInput.value, '');
  assert.equal(JSON.stringify(dependencies.elements.geminiApiKeyInput.dataset).includes('gemini-secret-value-abcd'), false);
});
