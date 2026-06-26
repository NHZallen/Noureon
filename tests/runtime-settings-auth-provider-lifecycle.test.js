import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createLegacySettingsAuthProviderLifecycle } from '../src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js';
import {
  markApiKeyInputCleared,
  markApiKeyInputDirty,
  prepareApiKeyInput
} from '../src/app/runtime/security/api-key-input-intent.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

const createDependencies = (overrides = {}) => {
  const calls = [];
  const state = {
    config: {
      uiLanguage: 'en',
      apiKeys: {},
      enabledModels: [],
      modelSettings: [],
      uiTheme: {},
      theme: 'dark',
      aiBubbleColor: 'default',
      userBubbleColor: 'default',
      outputMode: 'typewriter',
      tavilySearchDepth: 'basic'
    },
    conversations: [],
    folders: [],
    astras: [],
    personalMemories: [],
    uploadedFiles: [],
    currentUser: null,
    abortController: null
  };
  const element = {
    value: '',
    checked: false,
    disabled: false,
    innerHTML: '',
    textContent: '',
    style: {},
    classList: {
      add() {},
      remove() {},
      toggle() {},
      contains() { return false; }
    },
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    appendChild() {},
    remove() {},
    closest() { return null; },
    focus() {}
  };
  const elements = new Proxy({}, {
    get(target, property) {
      if (!(property in target)) target[property] = { ...element, dataset: {} };
      return target[property];
    }
  });
  const i18n = {
    en: {
      deleteAllDataTitle: 'Delete all data',
      deleteAllDataMessage: 'Type DELETE',
      cancel: 'Cancel',
      confirmDelete: 'Delete',
      deleteAllDataSuccess: 'Deleted',
      deleteAllDataError: 'Delete failed',
      incorrectInput: 'Incorrect'
    },
    'zh-TW': {}
  };
  const dependencies = {
    window: { location: { reload: () => calls.push('reload') }, matchMedia: () => ({ matches: false }) },
    document: {
      createElement: () => ({ ...element, dataset: {} }),
      getElementById: () => ({ ...element, dataset: {} }),
      querySelector: () => null,
      querySelectorAll: () => []
    },
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    AbortSignal: { timeout: () => ({}) },
    requestAnimationFrame: (callback) => callback(),
    setTimeout: (callback, delay) => {
      calls.push(['timeout', delay]);
      callback();
      return 1;
    },
    console: { error: (...args) => calls.push(['error', ...args]) },
    elements,
    state,
    legacyRuntimeContext: {
      resolveBinding: (name) => {
        calls.push(['resolveBinding', name]);
        return () => calls.push(['binding', name]);
      }
    },
    runtimeStorageAdapter: { clear: async () => calls.push('clear') },
    models: [],
    i18n,
    cheapModelId: 'cheap',
    councilResponseCharLimit: 1000,
    councilRetryDelayMs: 1,
    councilMaxModels: 3,
    aiBubbleColors: { default: { dark: '#111111', light: '#eeeeee' } },
    userBubbleColors: { default: { dark: '#222222', light: '#dddddd' } },
    getActiveConversation: () => null,
    normalizeConversationModel: (model) => model,
    getModelApiId: (model) => model?.id || '',
    getApiKeyForProvider: () => '',
    getDefaultGenConfig: () => ({}),
    modelSupportsUploadedFile: () => false,
    modelSupportsVision: () => false,
    getErrorMessage: (error) => error?.message || String(error),
    readErrorBody: async () => '',
    getSingleDocumentTranslatorModel: () => null,
    modelUsesTavilySearch: () => false,
    getCouncilSelectedModels: () => [],
    getCouncilTexts: () => ({}),
    getCouncilRuntimeTexts: () => ({}),
    getCouncilAttachmentTranslationNeed: () => false,
    getCouncilTranslatorModel: () => null,
    getCouncilSharedSearchModel: () => null,
    modelUsesNativeWebSearch: () => false,
    modelSupportsDocumentUpload: () => false,
    conversationNeedsTavilySearch: () => false,
    getCouncilValidation: () => ({ ok: true }),
    isCouncilEnabled: () => false,
    renderHistorySidebar: () => calls.push('renderHistorySidebar'),
    conversationStateAccess: { getCurrentConversationId: () => null },
    getProviderLabel: () => '',
    getModelPriceLabel: () => '',
    getCouncilTranslatorCandidates: () => [],
    getSingleTranslatorCandidates: () => [],
    escapeHTML: (value) => String(value),
    hexToRgba: () => '',
    renderPersonalMemoryList: () => calls.push('renderPersonalMemoryList'),
    renderModelManagementUI: () => calls.push('renderModelManagementUI'),
    renderUiColorOptions: () => calls.push('renderUiColorOptions'),
    renderTrash: () => calls.push('renderTrash'),
    renderModelSwitcher: () => calls.push('renderModelSwitcher'),
    renderChat: () => calls.push('renderChat'),
    renderStore: () => calls.push('renderStore'),
    updateApiKeyWarningBadge: () => calls.push('updateApiKeyWarningBadge'),
    applyUiTheme: () => calls.push('applyUiTheme'),
    applyLanguage: () => calls.push('applyLanguage'),
    togglePinChat: () => calls.push('togglePinChat'),
    archiveChat: () => calls.push('archiveChat'),
    deleteChat: () => calls.push('deleteChat'),
    showRenameModal: () => calls.push('showRenameModal'),
    moveConversationToFolder: () => calls.push('moveConversationToFolder'),
    createNewFolder: () => calls.push('createNewFolder'),
    showCustomPrompt: async () => '',
    showCustomConfirm: async () => true,
    showCustomDialog: async () => 'DELETE',
    showNotification: (...args) => calls.push(['notification', ...args]),
    toggleModal: (...args) => calls.push(['toggleModal', ...args]),
    saveConfig: async () => calls.push('saveConfig'),
    saveAppData: async () => calls.push('saveAppData'),
    getUserKey: (username) => `user:${username}`,
    getItem: async () => null,
    setItem: async (...args) => calls.push(['setItem', ...args]),
    removeItem: async (...args) => calls.push(['removeItem', ...args]),
    verifyPasswordRecord: async () => false,
    upgradeLegacyPasswordRecord: async () => null,
    createPasswordRecord: async (username) => ({ username }),
    renderAll: () => calls.push('renderAll'),
    logger: { error: (...args) => calls.push(['loggerError', ...args]) },
    ...overrides
  };
  return { dependencies, calls, state };
};

test('factory exports createLegacySettingsAuthProviderLifecycle', () => {
  assert.equal(typeof createLegacySettingsAuthProviderLifecycle, 'function');
});

test('import is inert and module avoids fragments and virtual runtime', () => {
  const source = readSource('src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js');

  assert.match(source, /export\s+function\s+createLegacySettingsAuthProviderLifecycle/);
  assert.doesNotMatch(source, /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-app/);
});

test('factory validates required dependencies', () => {
  assert.throws(
    () => createLegacySettingsAuthProviderLifecycle(),
    /missing dependencies:/
  );
});

test('factory exposes settings auth provider lifecycle API', () => {
  const { dependencies } = createDependencies();
  const lifecycle = createLegacySettingsAuthProviderLifecycle(dependencies);

  for (const name of [
    'streamApiCall',
    'runModelCouncil',
    'callApiWithSchema',
    'shouldPerformWebSearch',
    'generateTitleAndSummary',
    'updateSubmitButtonState',
    'updateInputState',
    'setupSettingsModal',
    'saveSettings',
    'handleLogin',
    'handleLogout',
    'handleDeleteAllData',
    'setTheme',
    'updateThemeButtons',
    'setAiBubbleColor',
    'setUserBubbleColor',
    'createHistoryMenu'
  ]) {
    assert.equal(typeof lifecycle[name], 'function', `${name} should be exposed`);
  }
  assert.equal(typeof lifecycle.providerRequestSupport, 'object');
  assert.equal(typeof lifecycle.councilResponseLifecycle, 'object');
});

test('callApiWithSchema sends Gemini key through header instead of URL query', async () => {
  const requests = [];
  const { dependencies } = createDependencies({
    getApiKeyForProvider: (provider) => provider === 'gemini' ? 'gemini-secret-key' : '',
    fetch: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        json: async () => ({
          candidates: [
            { content: { parts: [{ text: '{"ok":true}' }] } }
          ]
        })
      };
    }
  });
  const lifecycle = createLegacySettingsAuthProviderLifecycle(dependencies);

  const result = await lifecycle.callApiWithSchema('Return JSON', {
    type: 'OBJECT',
    properties: { ok: { type: 'BOOLEAN' } }
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /\/cheap:generateContent$/);
  assert.equal(requests[0].url.includes('?key='), false);
  assert.equal(requests[0].url.includes('gemini-secret-key'), false);
  assert.deepEqual(requests[0].options.headers, {
    'Content-Type': 'application/json',
    'x-goog-api-key': 'gemini-secret-key'
  });
});

test('shouldPerformWebSearch sends Gemini key through header instead of URL query', async () => {
  const requests = [];
  const { dependencies } = createDependencies({
    getApiKeyForProvider: (provider) => provider === 'gemini' ? 'gemini-secret-key' : '',
    fetch: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        json: async () => ({
          candidates: [
            { content: { parts: [{ text: 'yes' }] } }
          ]
        })
      };
    }
  });
  const lifecycle = createLegacySettingsAuthProviderLifecycle(dependencies);

  const result = await lifecycle.shouldPerformWebSearch('Latest release notes?');

  assert.equal(result, true);
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /\/cheap:generateContent$/);
  assert.equal(requests[0].url.includes('?key='), false);
  assert.equal(requests[0].url.includes('gemini-secret-key'), false);
  assert.deepEqual(requests[0].options.headers, {
    'Content-Type': 'application/json',
    'x-goog-api-key': 'gemini-secret-key'
  });
});

test('delete-all path uses injected storage adapter and preserves reload ordering', async () => {
  const { dependencies, calls } = createDependencies();
  const lifecycle = createLegacySettingsAuthProviderLifecycle(dependencies);

  await lifecycle.handleDeleteAllData();

  assert.deepEqual(calls.slice(0, 4), [
    'clear',
    ['notification', 'Deleted', 'success'],
    ['timeout', 2000],
    'reload'
  ]);
});

test('saveSettings writes API keys through sensitive key callbacks before normal config save', async () => {
  const { dependencies, calls, state } = createDependencies({
    document: {
      body: { classList: { contains() { return false; } } },
      documentElement: { style: { setProperty: () => {} } },
      createElement: () => ({ value: '', dataset: {}, style: {}, classList: { add() {}, remove() {}, contains() { return false; } } }),
      getElementById: () => ({ value: '', dataset: {}, style: {}, classList: { add() {}, remove() {}, contains() { return false; } } }),
      querySelector: (selector) => {
        if (selector === 'input[name="color-theme"]:checked') return { value: 'dark' };
        if (selector === 'input[name="color-style"]:checked') return { value: 'single' };
        return null;
      },
      querySelectorAll: () => []
    },
    aiBubbleColors: { default: { dark: '#111111', light: '#eeeeee' } },
    userBubbleColors: { default: { dark: '#222222', light: '#dddddd' } },
    setApiKeyForProvider: (provider, value) => calls.push(['setApiKeyForProvider', provider, value]),
    saveSensitiveConfig: async () => calls.push('saveSensitiveConfig')
  });
  dependencies.elements.geminiApiKeyInput.value = ' gemini-key ';
  dependencies.elements.openrouterApiKeyInputAll.value = ' openrouter-key ';
  dependencies.elements.stepPlanApiKeyInput.value = ' step-key ';
  dependencies.elements.nvidiaApiKeyInput.value = ' nvidia-key ';
  dependencies.elements.tavilyApiKeyInput.value = ' tavily-key ';
  dependencies.elements.tavilySearchDepthSelect.value = 'advanced';
  dependencies.elements.autoWebSearchToggleSwitch.checked = true;
  dependencies.elements.outputModeSelect.value = 'realtime';
  dependencies.elements.autoNamingToggleSwitch.checked = true;
  dependencies.elements.memoryToggle1.checked = true;
  dependencies.elements.autoMemoryToggleSwitch.checked = true;
  dependencies.elements.uiLanguageSelect.value = 'en';
  dependencies.elements.aiLanguageSelect.value = 'en';
  dependencies.elements.enableUpdateNotificationsToggle.checked = true;
  state.config.theme = 'dark';
  state.config.aiBubbleColor = 'default';
  state.config.userBubbleColor = 'default';
  dependencies.elements.aiBubbleColorDropdown.querySelector = () => ({ dataset: { color: 'default' } });
  dependencies.elements.userBubbleColorDropdown.querySelector = () => ({ dataset: { color: 'default' } });
  dependencies.elements.customColorSwatches.querySelector = () => null;
  dependencies.elements.gradientSwatches.querySelector = () => null;

  const lifecycle = createLegacySettingsAuthProviderLifecycle(dependencies);
  await lifecycle.saveSettings({ close: false, notify: false });

  assert.deepEqual(calls.filter((call) => Array.isArray(call) && call[0] === 'setApiKeyForProvider'), [
    ['setApiKeyForProvider', 'gemini', 'gemini-key'],
    ['setApiKeyForProvider', 'openrouter', 'openrouter-key'],
    ['setApiKeyForProvider', 'stepPlan', 'step-key'],
    ['setApiKeyForProvider', 'nvidia', 'nvidia-key'],
    ['setApiKeyForProvider', 'tavily', 'tavily-key']
  ]);
  assert.ok(calls.indexOf('saveSensitiveConfig') < calls.indexOf('saveConfig'));
  assert.deepEqual(state.config.apiKeys, {});
  assert.equal(state.config.outputMode, 'realtime');
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

  const lifecycle = createLegacySettingsAuthProviderLifecycle(dependencies);
  lifecycle.setupSettingsModal();

  assert.notEqual(dependencies.elements.geminiApiKeyInput.value, rawKeys.gemini);
  assert.notEqual(dependencies.elements.openrouterApiKeyInputAll.value, rawKeys.openrouter);
  assert.equal(dependencies.elements.geminiApiKeyInput.value.includes('************'), true);
  assert.equal(JSON.stringify(dependencies.elements.geminiApiKeyInput.dataset).includes(rawKeys.gemini), false);
  assert.equal(JSON.stringify(dependencies.elements.openrouterApiKeyInputAll.dataset).includes(rawKeys.openrouter), false);
});

test('saveSettings preserves unchanged masked keys and never stores masked placeholders', async () => {
  const { dependencies, calls } = createDependencies({
    document: {
      body: { classList: { contains() { return false; } } },
      documentElement: { style: { setProperty: () => {} } },
      createElement: () => ({ value: '', dataset: {}, style: {}, classList: { add() {}, remove() {}, contains() { return false; } } }),
      getElementById: () => ({ value: '', dataset: {}, style: {}, classList: { add() {}, remove() {}, contains() { return false; } } }),
      querySelector: (selector) => {
        if (selector === 'input[name="color-theme"]:checked') return { value: 'dark' };
        if (selector === 'input[name="color-style"]:checked') return { value: 'single' };
        return null;
      },
      querySelectorAll: () => []
    },
    aiBubbleColors: { default: { dark: '#111111', light: '#eeeeee' } },
    userBubbleColors: { default: { dark: '#222222', light: '#dddddd' } },
    setApiKeyForProvider: (provider, value) => calls.push(['setApiKeyForProvider', provider, value]),
    saveSensitiveConfig: async () => calls.push('saveSensitiveConfig')
  });

  prepareApiKeyInput(dependencies.elements.geminiApiKeyInput, {
    provider: 'gemini',
    rawValue: 'gemini-secret-value-abcd'
  });
  dependencies.elements.tavilySearchDepthSelect.value = 'basic';
  dependencies.elements.outputModeSelect.value = 'typewriter';
  dependencies.elements.uiLanguageSelect.value = 'en';
  dependencies.elements.aiLanguageSelect.value = 'en';
  dependencies.elements.aiBubbleColorDropdown.querySelector = () => ({ dataset: { color: 'default' } });
  dependencies.elements.userBubbleColorDropdown.querySelector = () => ({ dataset: { color: 'default' } });
  dependencies.elements.customColorSwatches.querySelector = () => null;
  dependencies.elements.gradientSwatches.querySelector = () => null;

  const lifecycle = createLegacySettingsAuthProviderLifecycle(dependencies);
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
        if (selector === 'input[name="color-theme"]:checked') return { value: 'dark' };
        if (selector === 'input[name="color-style"]:checked') return { value: 'single' };
        return null;
      },
      querySelectorAll: () => []
    },
    aiBubbleColors: { default: { dark: '#111111', light: '#eeeeee' } },
    userBubbleColors: { default: { dark: '#222222', light: '#dddddd' } },
    setApiKeyForProvider: (provider, value) => calls.push(['setApiKeyForProvider', provider, value]),
    saveSensitiveConfig: async () => calls.push('saveSensitiveConfig')
  });
  prepareApiKeyInput(dependencies.elements.geminiApiKeyInput, { provider: 'gemini', rawValue: 'old-gemini-key' });
  dependencies.elements.geminiApiKeyInput.value = ' new-gemini-key ';
  markApiKeyInputDirty(dependencies.elements.geminiApiKeyInput);
  prepareApiKeyInput(dependencies.elements.stepPlanApiKeyInput, { provider: 'stepPlan', rawValue: 'old-step-key' });
  markApiKeyInputCleared(dependencies.elements.stepPlanApiKeyInput);
  dependencies.elements.tavilySearchDepthSelect.value = 'basic';
  dependencies.elements.outputModeSelect.value = 'typewriter';
  dependencies.elements.uiLanguageSelect.value = 'en';
  dependencies.elements.aiLanguageSelect.value = 'en';
  dependencies.elements.aiBubbleColorDropdown.querySelector = () => ({ dataset: { color: 'default' } });
  dependencies.elements.userBubbleColorDropdown.querySelector = () => ({ dataset: { color: 'default' } });
  dependencies.elements.customColorSwatches.querySelector = () => null;
  dependencies.elements.gradientSwatches.querySelector = () => null;

  const lifecycle = createLegacySettingsAuthProviderLifecycle(dependencies);
  await lifecycle.saveSettings({ close: false, notify: false });

  assert.deepEqual(calls.filter((call) => Array.isArray(call) && call[0] === 'setApiKeyForProvider'), [
    ['setApiKeyForProvider', 'gemini', 'new-gemini-key'],
    ['setApiKeyForProvider', 'stepPlan', '']
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

  const lifecycle = createLegacySettingsAuthProviderLifecycle(dependencies);
  lifecycle.setupSettingsModal();
  await createdButtons['clear-all-api-keys-btn'].listeners.click({ preventDefault() {} });

  assert.deepEqual(calls.filter((call) => call === 'clearSensitiveApiKeys' || call === 'saveSensitiveConfig'), [
    'clearSensitiveApiKeys',
    'saveSensitiveConfig'
  ]);
  assert.equal(dependencies.elements.geminiApiKeyInput.value, '');
  assert.equal(JSON.stringify(dependencies.elements.geminiApiKeyInput.dataset).includes('gemini-secret-value-abcd'), false);
});

test('source keeps settings save, login, and delete-all ownership', () => {
  const source = readSource('src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js');

  assert.match(source, /const\s+saveSettings\s*=\s*async\s*\(\{\s*close\s*=\s*true,\s*notify\s*=\s*true\s*\}\s*=\s*\{\}\)\s*=>\s*\{/);
  assert.match(source, /const\s+handleLogin\s*=\s*async\s*\(e\)\s*=>\s*\{/);
  assert.match(source, /const\s+handleLogout\s*=\s*async\s*\(\)\s*=>\s*\{/);
  assert.match(source, /const\s+handleDeleteAllData\s*=\s*async\s*\(\)\s*=>\s*\{/);
  assert.match(source, /await\s+runtimeStorageAdapter\.clear\(\)/);
  assert.match(source, /config\.uiLanguage\s*=\s*ALL_ELEMENTS\.uiLanguageSelect\.value/);
  assert.match(source, /await\s+saveSensitiveConfig\(\)/);
  assert.doesNotMatch(source, /config\.apiKeys\.gemini\s*=/);
  assert.match(source, /legacyRuntimeContext\.resolveBinding\('app\.initChatApp'\)\(\)/);
});
