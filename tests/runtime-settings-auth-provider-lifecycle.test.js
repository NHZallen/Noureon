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

const getConstFunctionBody = (source, name) => {
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

const assertMarkersInOrder = (source, markers, context) => {
  let cursor = -1;
  for (const marker of markers) {
    const next = source.indexOf(marker, cursor + 1);
    assert.notEqual(next, -1, `${context} should include ${marker}`);
    assert.ok(next > cursor, `${marker} should remain in order for ${context}`);
    cursor = next;
  }
};

const createTrackedElement = (calls, name) => {
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
    aiBubbleColors: { default: {light: '#eeeeee'} },
    userBubbleColors: { default: {light: '#dddddd'} },
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

const createUpdateInputStateHarness = (overrides = {}) => {
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
    lifecycle: createLegacySettingsAuthProviderLifecycle(dependencies),
    dependencies,
    calls,
    state,
    conversation
  };
};

const assertDisabledSubmitIcon = (iconHtml) => {
  assert.match(iconHtml, /<circle cx="12" cy="12" r="9">/);
  assert.match(iconHtml, /m5\.7 5\.7 12\.6 12\.6/);
};

const assertSendSubmitIcon = (iconHtml) => {
  assert.match(iconHtml, /<path d="M12 19V5">/);
  assert.match(iconHtml, /<path d="m5 12 7-7 7 7">/);
};

const assertStopSubmitIcon = (iconHtml) => {
  assert.match(iconHtml, /<rect x="3" y="3" width="18" height="18" rx="2" ry="2">/);
};

test('factory exports createLegacySettingsAuthProviderLifecycle', () => {
  assert.equal(typeof createLegacySettingsAuthProviderLifecycle, 'function');
});

test('import is inert and module avoids fragments and virtual runtime', () => {
  const source = readSource('src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js');

  assert.match(source, /export\s+function\s+createLegacySettingsAuthProviderLifecycle/);
  assert.doesNotMatch(source, /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-app/);
});

test('structured provider helpers are composed through injected key access', () => {
  const source = readSource('src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js');

  assert.match(source, /import\s+\{\s*createSettingsProviderStructuredHelpers\s*\}\s+from\s+['"]\.\/settings-provider-structured-helpers\.js['"]/);
  assert.match(source, /const\s+structuredHelpers\s*=\s*createSettingsProviderStructuredHelpers\(\{/);
  assert.match(source, /getApiKeyForProvider,/);
  assert.match(source, /readErrorBody,/);
  assert.match(source, /cheapModelId:\s*CHEAP_MODEL_ID/);
  assert.match(source, /callApiWithSchema,\s*\n\s*shouldPerformWebSearch/);
});

test('history menu helper is composed while preserving lifecycle alias', () => {
  const source = readSource('src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js');

  assert.match(source, /import\s+\{\s*createSettingsHistoryMenuHelper\s*\}\s+from\s+['"]\.\/settings-history-menu-helper\.js['"]/);
  assert.match(source, /const\s+historyMenuHelper\s*=\s*createSettingsHistoryMenuHelper\(\{/);
  assert.match(source, /getConversations:\s*\(\)\s*=>\s*conversations/);
  assert.match(source, /getFolders:\s*\(\)\s*=>\s*folders/);
  assert.match(source, /showRenameModal,/);
  assert.match(source, /moveConversationToFolder,/);
  assert.match(source, /createHistoryMenu\s*\n?\s*\}\s*=\s*historyMenuHelper/);
  assert.doesNotMatch(source, /const\s+createHistoryMenu\s*=\s*\(convId,\s*targetButton\)\s*=>\s*\{/);
});

test('API key controls are composed through the extracted helper', () => {
  const source = readSource('src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js');

  assert.match(source, /import\s+\{\s*createSettingsApiKeyControls\s*\}\s+from\s+['"]\.\/settings-api-key-controls\.js['"]/);
  assert.match(source, /const\s+apiKeyControls\s*=\s*createSettingsApiKeyControls\(\{/);
  assert.match(source, /elements:\s*ALL_ELEMENTS/);
  assert.match(source, /getApiKeyForProvider,/);
  assert.match(source, /setApiKeyForProvider,/);
  assert.match(source, /clearSensitiveApiKeys,/);
  assert.match(source, /prepareApiKeyInputsForSettings,\s*\n\s*persistApiKeyInputIntents/);
  assert.doesNotMatch(source, /const\s+getApiKeyInputDescriptors\s*=/);
  assert.doesNotMatch(source, /const\s+createApiKeyClearButton\s*=/);
});

test('output and translator controls are composed through the extracted helper', () => {
  const source = readSource('src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js');
  const controlsSource = readSource('src/app/runtime/legacy-core/settings-output-translator-controls.js');

  assert.match(
    source,
    /import\s+\{\s*createSettingsOutputTranslatorControls\s*\}\s+from\s+['"]\.\/settings-output-translator-controls\.js['"]/
  );
  assert.match(source, /const\s+outputTranslatorControls\s*=\s*createSettingsOutputTranslatorControls\(\{/);
  assert.match(source, /elements:\s*ALL_ELEMENTS/);
  assert.match(source, /getOutputMode,/);
  assert.match(source, /getCouncilTranslatorCandidates,/);
  assert.match(source, /getSingleTranslatorCandidates,/);
  assert.match(source, /ensureCouncilTranslatorSettingsControls\(\);/);
  assert.match(source, /ensureOutputModeSettingsControls\(\);/);
  assert.match(source, /renderTranslatorModelPickers\(\);/);
  assert.match(source, /syncOutputModeSettingsControls\(\);/);
  assert.doesNotMatch(source, /const\s+renderTranslatorModelPicker\s*=/);
  assert.doesNotMatch(source, /const\s+renderTranslatorModelPickers\s*=/);
  assert.doesNotMatch(source, /const\s+ensureOutputModeSettingsControls\s*=/);
  assert.doesNotMatch(source, /const\s+ensureCouncilTranslatorSettingsControls\s*=/);
  assert.match(controlsSource, /export\s+function\s+createSettingsOutputTranslatorControls/);
  assert.match(controlsSource, /const\s+renderTranslatorModelPicker\s*=/);
  assert.match(controlsSource, /const\s+renderTranslatorModelPickers\s*=/);
  assert.match(controlsSource, /const\s+ensureOutputModeSettingsControls\s*=/);
  assert.match(controlsSource, /const\s+ensureCouncilTranslatorSettingsControls\s*=/);
});

test('theme and bubble controls are composed through the extracted helper', () => {
  const source = readSource('src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js');
  const controlsSource = readSource('src/app/runtime/legacy-core/settings-theme-bubble-controls.js');

  assert.match(
    source,
    /import\s+\{\s*createSettingsThemeBubbleControls\s*\}\s+from\s+['"]\.\/settings-theme-bubble-controls\.js['"]/
  );
  assert.match(source, /const\s+themeBubbleControls\s*=\s*createSettingsThemeBubbleControls\(\{/);
  assert.match(source, /elements:\s*ALL_ELEMENTS/);
  assert.match(source, /aiBubbleColors:\s*AI_BUBBLE_COLORS/);
  assert.match(source, /userBubbleColors:\s*USER_BUBBLE_COLORS/);
  assert.match(source, /setAiBubbleColor,\s*\n\s*setUserBubbleColor,\s*\n\s*renderAiBubbleColorDropdown,\s*\n\s*renderUserBubbleColorDropdown,/);
  assert.doesNotMatch(source, /const\s+renderAiBubbleColorDropdown\s*=\s*\(\)\s*=>/);
  assert.doesNotMatch(source, /const\s+renderUserBubbleColorDropdown\s*=\s*\(\)\s*=>/);
  assert.doesNotMatch(source, /const\s+setTheme\s*=\s*async/);
  assert.doesNotMatch(source, /const\s+updateThemeButtons\s*=\s*\(\)\s*=>/);
  assert.match(controlsSource, /export\s+function\s+createSettingsThemeBubbleControls/);
  assert.match(controlsSource, /const\s+renderBubbleColorDropdown\s*=/);
  assert.match(controlsSource, /const\s+setTheme\s*=\s*async/);
  assert.match(controlsSource, /const\s+updateThemeButtons\s*=/);
});

test('mobile settings shell is composed through the extracted helper', () => {
  const source = readSource('src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js');
  const helperSource = readSource('src/app/runtime/legacy-core/settings-mobile-shell-helper.js');

  assert.match(
    source,
    /import\s+\{\s*createSettingsMobileShellHelper\s*\}\s+from\s+['"]\.\/settings-mobile-shell-helper\.js['"]/
  );
  assert.match(source, /const\s+mobileShellHelper\s*=\s*createSettingsMobileShellHelper\(\{/);
  assert.match(source, /elements:\s*ALL_ELEMENTS/);
  assert.match(source, /handleLogout:\s*\(\.\.\.args\)\s*=>\s*handleLogout\(\.\.\.args\)/);
  assert.match(source, /ensureSettingsMobileShell,\s*\n\s*renderSettingsMobileList,\s*\n\s*clearSettingsMobileViewTransition,/);
  assert.match(source, /showSettingsMobileList,\s*\n\s*openSettingsMobileSection,\s*\n\s*isMobileSettingsViewport/);
  assert.doesNotMatch(source, /const\s+renderSettingsMobileList\s*=\s*\(\)\s*=>/);
  assert.doesNotMatch(source, /const\s+ensureSettingsMobileShell\s*=\s*\(\)\s*=>/);
  assert.doesNotMatch(source, /const\s+showSettingsMobileList\s*=\s*\(\{\s*animate\s*=\s*true\s*\}\s*=\s*\{\}\)\s*=>/);
  assert.doesNotMatch(source, /const\s+openSettingsMobileSection\s*=\s*\(sectionName\)\s*=>/);
  assert.match(helperSource, /export\s+function\s+createSettingsMobileShellHelper/);
  assert.match(helperSource, /const\s+renderSettingsMobileList\s*=/);
  assert.match(helperSource, /const\s+ensureSettingsMobileShell\s*=/);
  assert.match(helperSource, /const\s+showSettingsMobileList\s*=/);
  assert.match(helperSource, /const\s+openSettingsMobileSection\s*=/);
});

test('desktop settings section navigation is composed through the extracted helper', () => {
  const source = readSource('src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js');
  const helperSource = readSource('src/app/runtime/legacy-core/settings-desktop-section-helper.js');

  assert.match(
    source,
    /import\s+\{\s*createSettingsDesktopSectionHelper\s*\}\s+from\s+['"]\.\/settings-desktop-section-helper\.js['"]/
  );
  assert.match(source, /const\s+desktopSectionHelper\s*=\s*createSettingsDesktopSectionHelper\(\{/);
  assert.match(source, /isMobileSettingsViewport,/);
  assert.match(source, /showSettingsMobileList,/);
  assert.match(source, /clearSettingsMobileViewTransition/);
  assert.match(source, /const\s+navItems\s*=\s*bindDesktopSettingsSections\(\);/);
  assert.match(source, /activateDefaultDesktopSettingsSection\(navItems\);\s*syncSettingsSectionForViewport\(navItems\);/);
  assert.match(source, /syncSettingsSectionForViewport\(navItems\);/);
  assert.match(source, /const\s+ensureUserSettingsNavigationShell\s*=\s*\(\)\s*=>/);
  assert.match(source, /ensureSettingsMobileShell\(\);\s*ensureUserSettingsNavigationShell\(\);\s*ensureAutoWebSearchSettingsControl\(\);/);
  assert.doesNotMatch(source, /item\.dataset\.settingsDesktopBound\s*=\s*'true'/);
  assert.doesNotMatch(source, /item\.addEventListener\('click',\s*\(\)\s*=>\s*\{/);
  assert.doesNotMatch(source, /const\s+activeNavItem\s*=\s*ALL_ELEMENTS\.settingsNav\.querySelector/);
  assert.match(helperSource, /export\s+function\s+createSettingsDesktopSectionHelper/);
  assert.match(helperSource, /const\s+bindDesktopSettingsSections\s*=/);
  assert.match(helperSource, /const\s+syncSettingsSectionForViewport\s*=/);
  assert.match(helperSource, /settingsDesktopBound/);
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

test('settings config proxy reads and mutates the latest state config pointer', async () => {
  const { dependencies, calls, state } = createDependencies({
    document: {
      body: { classList: { contains: () => false } },
      documentElement: {
        classList: { toggle() {} },
        style: { setProperty() {} }
      },
      createElement: () => ({ value: '', dataset: {}, style: {}, classList: { add() {}, remove() {}, contains() { return false; } } }),
      getElementById: () => ({ value: '', dataset: {}, style: {}, classList: { add() {}, remove() {}, contains() { return false; } } }),
      querySelector: () => null,
      querySelectorAll: () => []
    }
  });
  dependencies.elements.settingsModal.classList.contains = (name) => name === 'hidden';
  const staleConfig = state.config;
  const lifecycle = createLegacySettingsAuthProviderLifecycle(dependencies);
  const replacement = {
    ...staleConfig,
    tavilySearchDepth: 'advanced',
    theme: 'dark'
  };

  state.config = replacement;

  assert.equal(lifecycle.getTavilySearchDepth(), 'advanced');
  await lifecycle.setTheme('light');
  assert.equal('theme' in replacement, false);
  assert.equal(staleConfig.theme, 'dark');
  assert.equal(calls.includes('saveConfig'), true);
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

test('generateTitleAndSummary keeps conversation side effects in lifecycle', async () => {
  const requests = [];
  const conversation = {
    id: 'conv-1',
    title: 'Old title',
    summary: '',
    isNaming: true,
    messages: [
      { role: 'user', parts: [{ text: 'What is the capital of France?' }] },
      { role: 'model', parts: [{ text: 'Paris.' }] }
    ]
  };
  const { dependencies, calls } = createDependencies({
    getApiKeyForProvider: (provider) => provider === 'gemini' ? 'gemini-secret-key' : '',
    fetch: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        json: async () => ({
          candidates: [
            { content: { parts: [{ text: '{"title":"France","summary":"Asked about Paris"}' }] } }
          ]
        })
      };
    },
    conversationStateAccess: { getCurrentConversationId: () => 'conv-1' }
  });
  dependencies.elements.headerTitle.textContent = '';
  const lifecycle = createLegacySettingsAuthProviderLifecycle(dependencies);

  await lifecycle.generateTitleAndSummary(conversation);

  assert.equal(conversation.title, 'France');
  assert.equal(conversation.summary, 'Asked about Paris');
  assert.equal(conversation.isNaming, false);
  assert.equal(dependencies.elements.headerTitle.textContent, 'France');
  assert.deepEqual(calls.filter((call) => call === 'saveAppData' || call === 'renderHistorySidebar'), [
    'saveAppData',
    'renderHistorySidebar'
  ]);
  assert.equal(requests[0].url.includes('?key='), false);
  assert.equal(requests[0].options.headers['x-goog-api-key'], 'gemini-secret-key');
});

test('updateInputState disables submit and preserves input state when no conversation is active', () => {
  const { lifecycle, dependencies } = createUpdateInputStateHarness({
    dependencies: { getActiveConversation: () => null },
    messageValue: 'ready'
  });

  lifecycle.updateInputState();

  assert.equal(dependencies.elements.messageInput.disabled, false);
  assert.equal(dependencies.elements.messageInput.placeholder, 'previous placeholder');
  assert.equal(dependencies.elements.submitButton.disabled, true);
  assertDisabledSubmitIcon(dependencies.elements.submitButtonIcon.innerHTML);
});

test('updateInputState disables archived conversations without changing the existing icon', () => {
  const { lifecycle, dependencies } = createUpdateInputStateHarness({
    conversation: { archived: true },
    messageValue: 'archived text'
  });

  lifecycle.updateInputState();

  assert.equal(dependencies.elements.messageInput.disabled, true);
  assert.equal(dependencies.elements.messageInput.placeholder, 'Viewing archived conversation');
  assert.equal(dependencies.elements.submitButton.disabled, true);
  assert.equal(dependencies.elements.submitButtonIcon.innerHTML, 'previous icon');
});

test('updateInputState disables input and submit when the model provider key is missing', () => {
  const { lifecycle, dependencies } = createUpdateInputStateHarness({
    dependencies: { getApiKeyForProvider: () => '' },
    messageValue: 'needs key'
  });

  lifecycle.updateInputState();

  assert.equal(dependencies.elements.messageInput.disabled, true);
  assert.equal(dependencies.elements.messageInput.placeholder, 'Enter API key');
  assert.equal(dependencies.elements.submitButton.disabled, true);
  assertDisabledSubmitIcon(dependencies.elements.submitButtonIcon.innerHTML);
});

test('updateInputState blocks submit but keeps input enabled when Tavily key is missing for search', () => {
  const { lifecycle, dependencies } = createUpdateInputStateHarness({
    dependencies: {
      conversationNeedsTavilySearch: () => true,
      getApiKeyForProvider: (provider) => (provider === 'gemini' ? 'gemini-key' : '')
    },
    messageValue: 'search this'
  });

  lifecycle.updateInputState();

  assert.equal(dependencies.elements.messageInput.disabled, false);
  assert.equal(dependencies.elements.messageInput.placeholder, 'Type a message');
  assert.equal(dependencies.elements.submitButton.disabled, true);
  assertDisabledSubmitIcon(dependencies.elements.submitButtonIcon.innerHTML);
});

test('updateInputState blocks council validation failures with the validation message', () => {
  const { lifecycle, dependencies } = createUpdateInputStateHarness({
    dependencies: {
      isCouncilEnabled: () => true,
      getCouncilValidation: () => ({ ok: false, reason: 'tooFewModels', message: 'Select more council models' })
    },
    messageValue: 'council prompt'
  });

  lifecycle.updateInputState();

  assert.equal(dependencies.elements.messageInput.disabled, false);
  assert.equal(dependencies.elements.messageInput.placeholder, 'Select more council models');
  assert.equal(dependencies.elements.submitButton.disabled, true);
  assertDisabledSubmitIcon(dependencies.elements.submitButtonIcon.innerHTML);
});

test('updateInputState enables submit when content, model key, and search/council checks pass', () => {
  const { lifecycle, dependencies } = createUpdateInputStateHarness({
    messageValue: 'send this'
  });

  lifecycle.updateInputState();

  assert.equal(dependencies.elements.messageInput.disabled, false);
  assert.equal(dependencies.elements.messageInput.placeholder, 'Type a message');
  assert.equal(dependencies.elements.submitButton.disabled, false);
  assertSendSubmitIcon(dependencies.elements.submitButtonIcon.innerHTML);
});

test('updateInputState enables submit for uploaded files without typed text', () => {
  const { lifecycle, dependencies } = createUpdateInputStateHarness({
    messageValue: '   ',
    uploadedFiles: [{ id: 'file-1' }]
  });

  lifecycle.updateInputState();

  assert.equal(dependencies.elements.submitButton.disabled, false);
  assertSendSubmitIcon(dependencies.elements.submitButtonIcon.innerHTML);
});

test('updateInputState shows stop icon while generation is abortable', () => {
  const { lifecycle, dependencies } = createUpdateInputStateHarness({
    abortController: { abort() {} },
    messageValue: ''
  });

  lifecycle.updateInputState();

  assert.equal(dependencies.elements.submitButton.disabled, false);
  assertStopSubmitIcon(dependencies.elements.submitButtonIcon.innerHTML);
});

test('updateInputState remains safe with the default injected DOM element fallbacks', () => {
  const { dependencies } = createDependencies({
    getActiveConversation: () => null
  });
  const lifecycle = createLegacySettingsAuthProviderLifecycle(dependencies);

  assert.doesNotThrow(() => lifecycle.updateInputState());
  assert.equal(dependencies.elements.submitButton.disabled, true);
  assertDisabledSubmitIcon(dependencies.elements.submitButtonIcon.innerHTML);
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

test('login success preserves auth storage, visibility transitions, and init handoff', async () => {
  const { dependencies, calls, state } = createDependencies();
  const authContainer = createTrackedElement(calls, 'authContainer');
  const appContainer = createTrackedElement(calls, 'appContainer');
  const event = { preventDefault: () => calls.push('preventDefault') };
  dependencies.elements.usernameInput.value = ' alice ';
  dependencies.elements.passwordInput.value = 'correct-password';
  dependencies.elements.authContainer = authContainer;
  dependencies.elements.appContainer = appContainer;
  dependencies.createPasswordRecord = async (username, password) => {
    calls.push(['createPasswordRecord', username, password]);
    return { username, passwordHash: 'new-hash' };
  };

  const lifecycle = createLegacySettingsAuthProviderLifecycle(dependencies);
  await lifecycle.handleLogin(event);

  assert.deepEqual(calls.filter((call) => call === 'preventDefault'), ['preventDefault']);
  assert.deepEqual(calls.filter((call) => Array.isArray(call) && call[0] === 'createPasswordRecord'), [
    ['createPasswordRecord', 'alice', 'correct-password']
  ]);
  assert.deepEqual(calls.filter((call) => Array.isArray(call) && call[0] === 'setItem'), [
    ['setItem', 'user:alice', JSON.stringify({ username: 'alice', passwordHash: 'new-hash' })],
    ['setItem', 'chat_storageOwnerUser', 'alice'],
    ['setItem', 'chat_lastUser', 'alice']
  ]);
  assert.deepEqual(state.currentUser, { username: 'alice', passwordHash: 'new-hash' });
  assert.equal(authContainer.hasClass('visible'), false);
  assert.equal(authContainer.hasClass('fade-out'), true);
  assert.equal(appContainer.hasClass('hidden'), false);
  assert.equal(appContainer.hasClass('visible'), true);
  assert.equal(authContainer.listeners[0]?.event, 'transitionend');
  assert.deepEqual(calls.slice(-2), [
    ['resolveBinding', 'app.initChatApp'],
    ['binding', 'app.initChatApp']
  ]);
});

test('login failure keeps failure path isolated and does not initialize app', async () => {
  const { dependencies, calls, state } = createDependencies({
    getItem: async (key) => {
      calls.push(['getItem', key]);
      return JSON.stringify({ username: 'alice', passwordHash: 'old-hash' });
    },
    verifyPasswordRecord: async (password, record) => {
      calls.push(['verifyPasswordRecord', password, record.username]);
      return false;
    }
  });
  dependencies.elements.usernameInput.value = 'alice';
  dependencies.elements.passwordInput.value = 'wrong-password';

  const lifecycle = createLegacySettingsAuthProviderLifecycle(dependencies);
  await lifecycle.handleLogin({ preventDefault: () => calls.push('preventDefault') });

  assert.equal(state.currentUser, null);
  assert.deepEqual(calls.filter((call) => Array.isArray(call) && call[0] === 'setItem'), []);
  assert.equal(calls.some((call) => Array.isArray(call) && call[0] === 'notification' && call[2] === 'error'), true);
  assert.equal(calls.some((call) => Array.isArray(call) && call[0] === 'resolveBinding' && call[1] === 'app.initChatApp'), false);
  assert.equal(calls.includes('renderAll'), false);
});

test('logout confirm accepted clears last user and reloads', async () => {
  const { dependencies, calls } = createDependencies({
    showCustomConfirm: async () => {
      calls.push('confirmLogout');
      return true;
    },
    removeItem: async (...args) => calls.push(['removeItem', ...args])
  });
  const lifecycle = createLegacySettingsAuthProviderLifecycle(dependencies);

  await lifecycle.handleLogout();

  assert.deepEqual(calls, [
    'confirmLogout',
    ['removeItem', 'chat_lastUser'],
    'reload'
  ]);
});

test('logout confirm rejected does not clear storage or reload', async () => {
  const { dependencies, calls } = createDependencies({
    showCustomConfirm: async () => {
      calls.push('confirmLogout');
      return false;
    },
    removeItem: async (...args) => calls.push(['removeItem', ...args])
  });
  const lifecycle = createLegacySettingsAuthProviderLifecycle(dependencies);

  await lifecycle.handleLogout();

  assert.deepEqual(calls, ['confirmLogout']);
});

test('delete-all confirm accepted clears storage, notifies, and reloads after delay', async () => {
  const { dependencies, calls } = createDependencies({
    showCustomDialog: async (options) => {
      calls.push(['dialog', options.input.type, options.buttons.length]);
      return 'DELETE';
    }
  });
  const lifecycle = createLegacySettingsAuthProviderLifecycle(dependencies);

  await lifecycle.handleDeleteAllData();

  assert.deepEqual(calls, [
    ['dialog', 'text', 2],
    'clear',
    ['notification', 'Deleted', 'success'],
    ['timeout', 2000],
    'reload'
  ]);
});

test('delete-all confirm rejected does not clear storage or reload', async () => {
  const { dependencies, calls } = createDependencies({
    showCustomDialog: async () => {
      calls.push('dialog');
      return null;
    }
  });
  const lifecycle = createLegacySettingsAuthProviderLifecycle(dependencies);

  await lifecycle.handleDeleteAllData();

  assert.deepEqual(calls, ['dialog']);
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
    aiBubbleColors: { default: {light: '#eeeeee'} },
    userBubbleColors: { default: {light: '#dddddd'} },
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

  const lifecycle = createLegacySettingsAuthProviderLifecycle(dependencies);
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
      if (selector === '.custom-output-mode-select') return makeElement('custom-output-mode-select');
      if (selector === '#output-mode-label' || selector === 'p') return makeElement(selector);
      if (selector === '[data-output-mode-option="typewriter"]') return makeElement('typewriter-output-mode');
      if (selector === '[data-output-mode-option="realtime"]') return makeElement('realtime-output-mode');
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

  const lifecycle = createLegacySettingsAuthProviderLifecycle(dependencies);
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
        if (selector === 'input[name="color-theme"]:checked') return { value: 'dark' };
        if (selector === 'input[name="color-style"]:checked') return { value: 'single' };
        return null;
      },
      querySelectorAll: () => []
    },
    aiBubbleColors: { default: {light: '#eeeeee'} },
    userBubbleColors: { default: {light: '#dddddd'} },
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
    aiBubbleColors: { default: {light: '#eeeeee'} },
    userBubbleColors: { default: {light: '#dddddd'} },
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

test('source keeps settings save ownership and composes auth actions helper', () => {
  const source = readSource('src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js');
  const authActionsHelperSource = readSource('src/app/runtime/legacy-core/settings-auth-actions-helper.js');
  const apiKeyControlsSource = readSource('src/app/runtime/legacy-core/settings-api-key-controls.js');
  const saveSettingsHelperSource = readSource('src/app/runtime/legacy-core/settings-save-settings-helper.js');
  const handleLoginBody = getConstFunctionBody(authActionsHelperSource, 'handleLogin');
  const handleLogoutBody = getConstFunctionBody(authActionsHelperSource, 'handleLogout');
  const handleDeleteAllDataBody = getConstFunctionBody(authActionsHelperSource, 'handleDeleteAllData');

  assert.match(source, /const\s+saveSettings\s*=\s*async\s*\(\{\s*close\s*=\s*true,\s*notify\s*=\s*true\s*\}\s*=\s*\{\}\)\s*=>\s*\{/);
  assert.match(source, /import\s+\{\s*createSettingsAuthActionsHelper\s*\}\s+from\s+['"]\.\/settings-auth-actions-helper\.js['"]/);
  assert.match(source, /const\s+authActionsHelper\s*=\s*createSettingsAuthActionsHelper\(\{/);
  assert.match(source, /loadConfig,/);
  assert.match(source, /loadAppData,/);
  assert.match(source, /applyCustomWallpaper,/);
  assert.match(source, /handleLogin,\s*\n\s*handleLogout,\s*\n\s*handleDeleteAllData\s*\n?\}\s*=\s*authActionsHelper/);
  assert.doesNotMatch(source, /const\s+handleLogin\s*=\s*async\s*\(e\)\s*=>\s*\{/);
  assert.doesNotMatch(source, /const\s+handleLogout\s*=\s*async\s*\(\)\s*=>\s*\{/);
  assert.doesNotMatch(source, /const\s+handleDeleteAllData\s*=\s*async\s*\(\)\s*=>\s*\{/);
  assert.match(authActionsHelperSource, /await\s+runtimeStorageAdapter\.clear\(\)/);
  assert.match(source, /collectSettingsSaveFormValues\(\{/);
  assert.doesNotMatch(source, /config\.uiLanguage\s*=\s*ALL_ELEMENTS\.uiLanguageSelect\.value/);
  assert.match(source, /await\s+persistApiKeyInputIntents\(\)/);
  assert.match(apiKeyControlsSource, /await\s+saveSensitiveConfig\(\)/);
  assert.doesNotMatch(saveSettingsHelperSource, /saveConfig|persistApiKeyInputIntents|saveSensitiveConfig|showNotification|toggleModal/);
  assert.doesNotMatch(saveSettingsHelperSource, /sensitive-config-store|api-key-input-intent/);
  assert.doesNotMatch(saveSettingsHelperSource, /handleLogin|handleLogout|handleDeleteAllData|authContainer|appContainer|chat_lastUser|runtimeStorageAdapter\.clear|window\.location\.reload|initChatApp/);
  assert.doesNotMatch(source, /config\.apiKeys\.gemini\s*=/);
  assert.match(authActionsHelperSource, /legacyRuntimeContext\.resolveBinding\('app\.initChatApp'\)\(\)/);
  assertMarkersInOrder(handleLoginBody, [
    'await setItem(\'chat_lastUser\', username);',
    'await loadConfig();',
    'await loadAppData();',
    'applyCustomWallpaper();',
    'applyUiTheme();',
    'elements.authContainer.classList.remove(\'visible\');',
    'elements.authContainer.classList.add(\'fade-out\');',
    'elements.appContainer.classList.remove(\'hidden\');',
    'requestAnimationFrame(() =>',
    'elements.authContainer.addEventListener(\'transitionend\'',
    'legacyRuntimeContext.resolveBinding(\'app.initChatApp\')();'
  ], 'handleLogin success transition and init handoff');
  assertMarkersInOrder(handleLogoutBody, [
    'await showCustomConfirm',
    'await removeItem(\'chat_lastUser\');',
    'window.location.reload();'
  ], 'handleLogout confirm clear reload path');
  assertMarkersInOrder(handleDeleteAllDataBody, [
    'const confirmation = await showCustomDialog',
    'if (confirmation === \'DELETE\')',
    'await runtimeStorageAdapter.clear();',
    'showNotification',
    'setTimeout(() =>',
    'window.location.reload();'
  ], 'handleDeleteAllData clear notify reload path');
});

test('source composes updateInputState through the extracted helper', () => {
  const source = readSource('src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js');

  assert.match(source, /import\s+\{\s*createSettingsUpdateInputStateHelper\s*\}\s+from\s+['"]\.\/settings-update-input-state-helper\.js['"]/);
  assert.match(source, /const\s+updateInputStateHelper\s*=\s*createSettingsUpdateInputStateHelper\(\{/);
  assert.match(source, /updateInputState\s*\n?\}\s*=\s*updateInputStateHelper/);
  assert.doesNotMatch(source, /const\s+updateInputState\s*=\s*\(\)\s*=>\s*\{/);
  assertMarkersInOrder(source, [
    'createSettingsUpdateInputStateHelper({',
    'elements: ALL_ELEMENTS',
    'getConfig: () => config',
    'getUploadedFiles: () => uploadedFiles',
    'getActiveConversation',
    'normalizeConversationModel',
    'getApiKeyForProvider',
    'conversationNeedsTavilySearch',
    'getCouncilValidation',
    'isCouncilEnabled',
    'const updateSubmitButtonState = (isGenerating) =>'
  ], 'updateInputState helper composition');
});
