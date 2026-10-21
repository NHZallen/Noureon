// The shared harness of the settings, auth and provider lifecycle tests (tests/runtime-settings-*.test.js).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createSettingsAuthProviderLifecycle } from '../../src/app/runtime/settings/settings-auth-provider-lifecycle.js';

export const projectFile = (path) => new URL(`../../${path}`, import.meta.url);
export const readSource = (path) => readFileSync(projectFile(path), 'utf8');

export const getConstFunctionBody = (source, name) => {
  const marker = `const ${name} =`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${name} should exist`);
  const braceStart = source.indexOf('{', start);
  assert.notEqual(braceStart, -1, `${name} should have a body`);

  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const character = source[index];
    if (character === '{') depth += 1;
    if (character === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(braceStart, index + 1);
    }
  }
  throw new Error(`${name} body should close`);
};

export const assertMarkersInOrder = (source, markers, context) => {
  let cursor = -1;
  for (const marker of markers) {
    const next = source.indexOf(marker, cursor + 1);
    assert.notEqual(next, -1, `${context} should include ${marker}`);
    assert.ok(next > cursor, `${marker} should remain in order for ${context}`);
    cursor = next;
  }
};

export const createTrackedElement = (calls, name) => {
  const classes = new Set();
  const listeners = [];
  return {
    value: '',
    checked: false,
    disabled: false,
    innerHTML: '',
    textContent: '',
    style: {},
    dataset: {},
    listeners,
    classList: {
      add: (...tokens) => {
        calls.push(['class:add', name, ...tokens]);
        for (const token of tokens) classes.add(token);
      },
      remove: (...tokens) => {
        calls.push(['class:remove', name, ...tokens]);
        for (const token of tokens) classes.delete(token);
      },
      toggle: (token, force) => {
        calls.push(['class:toggle', name, token, force]);
        if (force === false) {
          classes.delete(token);
          return false;
        }
        if (force === true || !classes.has(token)) {
          classes.add(token);
          return true;
        }
        classes.delete(token);
        return false;
      },
      contains: (token) => classes.has(token)
    },
    addEventListener: (event, listener, options) => {
      calls.push(['listener', name, event, options]);
      listeners.push({ event, listener, options });
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    appendChild() {},
    remove() {},
    closest() { return null; },
    focus() {},
    hasClass: (token) => classes.has(token)
  };
};

// The stores of the shell (shell/shell-state.js) and the workspace, over one plain object a test can read and change.
export const storesOverState = (state) => ({
  runtimeConfigAccess: { getConfig: () => state.config, getUiLanguage: () => state.config.uiLanguage },
  runtimeAppDataStore: {
    getConversations: () => state.conversations,
    getFolders: () => state.folders,
    getAstras: () => state.astras,
    getPersonalMemories: () => state.personalMemories,
    getMemoryState: () => state.memoryState || {}
  },
  session: { getCurrentUser: () => state.currentUser, setCurrentUser: (user) => (state.currentUser = user) },
  uploads: {
    getUploadedFiles: () => state.uploadedFiles,
    setUploadedFiles: (files) => (state.uploadedFiles = files),
    clearUploadedFiles: () => { state.uploadedFiles = []; }
  },
  reply: {
    getAbortController: () => state.abortController,
    setAbortController: (controller) => { state.abortController = controller; },
    isCouncilRunning: () => Boolean(state.isCouncilRunning),
    setCouncilRunning: (running) => { state.isCouncilRunning = running; }
  },
  quote: { getQuoteReference: () => state.quoteReference || null, setQuoteReference: (reference) => { state.quoteReference = reference; } }
});

export const createDependencies = (overrides = {}) => {
  const calls = [];
  const state = {
    config: {
      uiLanguage: 'en',
      apiKeys: {},
      enabledModels: [],
      modelSettings: [],
      uiTheme: {},
      theme: 'dark',
      outputMode: 'realtime',
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
    ...storesOverState(state),
    initChatApp: () => calls.push(['initChatApp']),
    runtimeStorageAdapter: { clear: async () => calls.push('clear') },
    models: [],
    i18n,
    cheapModelId: 'cheap',
    councilResponseCharLimit: 1000,
    councilRetryDelayMs: 1,
    councilMaxModels: 3,
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

export const createUpdateInputStateHarness = (overrides = {}) => {
  const conversation = {
    id: 'conv-1',
    model: 'gemini',
    provider: 'gemini',
    archived: false,
    ...overrides.conversation
  };
  const { dependencies, calls, state } = createDependencies({
    getActiveConversation: () => conversation,
    normalizeConversationModel: (conv) => ({ provider: conv.provider || 'gemini', id: conv.model || 'gemini' }),
    getApiKeyForProvider: (provider) => (provider === 'gemini' ? 'gemini-key' : ''),
    conversationNeedsTavilySearch: () => false,
    getCouncilValidation: () => ({ ok: true }),
    isCouncilEnabled: () => false,
    ...overrides.dependencies
  });
  Object.assign(dependencies.i18n.en, {
    enterMessagePlaceholder: 'Type a message',
    enterApiKeyPlaceholder: 'Enter API key',
    viewingArchived: 'Viewing archived conversation'
  });
  dependencies.elements.messageInput.value = overrides.messageValue ?? 'hello';
  dependencies.elements.messageInput.placeholder = 'previous placeholder';
  dependencies.elements.messageInput.disabled = false;
  dependencies.elements.submitButton.disabled = false;
  dependencies.elements.submitButtonIcon.innerHTML = 'previous icon';
  if (overrides.uploadedFiles) state.uploadedFiles = overrides.uploadedFiles;
  if (overrides.abortController) state.abortController = overrides.abortController;

  return {
    lifecycle: createSettingsAuthProviderLifecycle(dependencies),
    dependencies,
    calls,
    state,
    conversation
  };
};

export const assertDisabledSubmitIcon = (iconHtml) => {
  assert.match(iconHtml, /<circle cx="12" cy="12" r="9">/);
  assert.match(iconHtml, /m5\.7 5\.7 12\.6 12\.6/);
};

export const assertSendSubmitIcon = (iconHtml) => {
  assert.match(iconHtml, /<path d="M12 19V5">/);
  assert.match(iconHtml, /<path d="m5 12 7-7 7 7">/);
};

export const assertStopSubmitIcon = (iconHtml) => {
  assert.match(iconHtml, /<rect x="3" y="3" width="18" height="18" rx="2" ry="2">/);
};
