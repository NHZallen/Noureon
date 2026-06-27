import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createSettingsUpdateInputStateHelper } from '../src/app/runtime/legacy-core/settings-update-input-state-helper.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

const createHarness = (overrides = {}) => {
  const conversation = {
    id: 'conv-1',
    model: 'gemini',
    provider: 'gemini',
    archived: false,
    ...overrides.conversation
  };
  const elements = {
    messageInput: {
      value: overrides.messageValue ?? 'hello',
      disabled: false,
      placeholder: 'previous placeholder'
    },
    submitButton: {
      disabled: false
    },
    submitButtonIcon: {
      innerHTML: 'previous icon'
    },
    ...overrides.elements
  };
  const state = {
    abortController: overrides.abortController ?? null
  };
  const config = {
    uiLanguage: 'en',
    ...overrides.config
  };
  const helper = createSettingsUpdateInputStateHelper({
    elements,
    state,
    getConfig: () => config,
    getUploadedFiles: () => overrides.uploadedFiles ?? [],
    i18n: {
      en: {
        enterMessagePlaceholder: 'Type a message',
        enterApiKeyPlaceholder: 'Enter API key',
        viewingArchived: 'Viewing archived conversation'
      },
      ...overrides.i18n
    },
    getActiveConversation: () => overrides.activeConversation === null ? null : conversation,
    normalizeConversationModel: (conv) => ({ provider: conv.provider || 'gemini', id: conv.model || 'gemini' }),
    getApiKeyForProvider: (provider) => (provider === 'gemini' ? 'gemini-key' : ''),
    conversationNeedsTavilySearch: () => false,
    getCouncilValidation: () => ({ ok: true }),
    isCouncilEnabled: () => false,
    ...overrides.dependencies
  });

  return {
    helper,
    elements,
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

test('module exports createSettingsUpdateInputStateHelper', () => {
  assert.equal(typeof createSettingsUpdateInputStateHelper, 'function');
});

test('import is inert and avoids runtime wiring modules', () => {
  const source = readSource('src/app/runtime/legacy-core/settings-update-input-state-helper.js');

  assert.match(source, /export\s+function\s+createSettingsUpdateInputStateHelper/);
  assert.doesNotMatch(source, /runtime-entry|legacy-core\.js|bootstrap|sidebar/);
  assert.doesNotMatch(source, /saveConfig|showNotification|toggleModal|sensitive-config-store|api-key-input-intent/);
});

test('updateInputState disables submit when no conversation is active', () => {
  const { helper, elements } = createHarness({ activeConversation: null });

  helper.updateInputState();

  assert.equal(elements.messageInput.disabled, false);
  assert.equal(elements.messageInput.placeholder, 'previous placeholder');
  assert.equal(elements.submitButton.disabled, true);
  assertDisabledSubmitIcon(elements.submitButtonIcon.innerHTML);
});

test('updateInputState disables archived conversations without changing the icon', () => {
  const { helper, elements } = createHarness({
    conversation: { archived: true }
  });

  helper.updateInputState();

  assert.equal(elements.messageInput.disabled, true);
  assert.equal(elements.messageInput.placeholder, 'Viewing archived conversation');
  assert.equal(elements.submitButton.disabled, true);
  assert.equal(elements.submitButtonIcon.innerHTML, 'previous icon');
});

test('updateInputState disables input and submit when model provider key is missing', () => {
  const { helper, elements } = createHarness({
    dependencies: {
      getApiKeyForProvider: () => ''
    }
  });

  helper.updateInputState();

  assert.equal(elements.messageInput.disabled, true);
  assert.equal(elements.messageInput.placeholder, 'Enter API key');
  assert.equal(elements.submitButton.disabled, true);
  assertDisabledSubmitIcon(elements.submitButtonIcon.innerHTML);
});

test('updateInputState blocks submit but keeps input enabled when Tavily key is missing', () => {
  const { helper, elements } = createHarness({
    dependencies: {
      conversationNeedsTavilySearch: () => true,
      getApiKeyForProvider: (provider) => (provider === 'gemini' ? 'gemini-key' : '')
    }
  });

  helper.updateInputState();

  assert.equal(elements.messageInput.disabled, false);
  assert.equal(elements.messageInput.placeholder, 'Type a message');
  assert.equal(elements.submitButton.disabled, true);
  assertDisabledSubmitIcon(elements.submitButtonIcon.innerHTML);
});

test('updateInputState blocks council validation failures with validation message', () => {
  const { helper, elements } = createHarness({
    dependencies: {
      isCouncilEnabled: () => true,
      getCouncilValidation: () => ({ ok: false, reason: 'tooFewModels', message: 'Choose at least two models' })
    }
  });

  helper.updateInputState();

  assert.equal(elements.messageInput.disabled, false);
  assert.equal(elements.messageInput.placeholder, 'Choose at least two models');
  assert.equal(elements.submitButton.disabled, true);
  assertDisabledSubmitIcon(elements.submitButtonIcon.innerHTML);
});

test('updateInputState enables submit when content and key checks pass', () => {
  const { helper, elements } = createHarness();

  helper.updateInputState();

  assert.equal(elements.messageInput.disabled, false);
  assert.equal(elements.messageInput.placeholder, 'Type a message');
  assert.equal(elements.submitButton.disabled, false);
  assertSendSubmitIcon(elements.submitButtonIcon.innerHTML);
});

test('updateInputState enables submit for uploaded files without typed text', () => {
  const { helper, elements } = createHarness({
    messageValue: '',
    uploadedFiles: [{ name: 'note.txt' }]
  });

  helper.updateInputState();

  assert.equal(elements.submitButton.disabled, false);
  assertSendSubmitIcon(elements.submitButtonIcon.innerHTML);
});

test('updateInputState shows stop icon while generation is abortable', () => {
  const { helper, elements } = createHarness({
    messageValue: '',
    activeConversation: null,
    abortController: { abort() {} }
  });

  helper.updateInputState();

  assert.equal(elements.submitButton.disabled, false);
  assertStopSubmitIcon(elements.submitButtonIcon.innerHTML);
});

test('updateInputState remains safe with injected default DOM fallbacks', () => {
  const defaultElement = {
    value: '',
    disabled: false,
    placeholder: '',
    innerHTML: ''
  };
  const elements = new Proxy({}, {
    get(target, property) {
      if (!(property in target)) target[property] = { ...defaultElement };
      return target[property];
    }
  });
  const helper = createSettingsUpdateInputStateHelper({
    elements,
    state: { abortController: null },
    getConfig: () => ({ uiLanguage: 'en' }),
    getUploadedFiles: () => [],
    i18n: { en: {} },
    getActiveConversation: () => null,
    normalizeConversationModel: (conv) => conv,
    getApiKeyForProvider: () => '',
    conversationNeedsTavilySearch: () => false,
    getCouncilValidation: () => ({ ok: true }),
    isCouncilEnabled: () => false
  });

  assert.doesNotThrow(() => helper.updateInputState());
  assert.equal(elements.submitButton.disabled, true);
  assertDisabledSubmitIcon(elements.submitButtonIcon.innerHTML);
});
