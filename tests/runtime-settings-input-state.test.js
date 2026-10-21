import assert from 'node:assert/strict';
import test from 'node:test';

import { createSettingsAuthProviderLifecycle } from '../src/app/runtime/settings/settings-auth-provider-lifecycle.js';
import { createDependencies, createUpdateInputStateHarness, assertDisabledSubmitIcon, assertSendSubmitIcon, assertStopSubmitIcon } from './helpers/settings-lifecycle-harness.js';

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
  const lifecycle = createSettingsAuthProviderLifecycle(dependencies);

  assert.doesNotThrow(() => lifecycle.updateInputState());
  assert.equal(dependencies.elements.submitButton.disabled, true);
  assertDisabledSubmitIcon(dependencies.elements.submitButtonIcon.innerHTML);
});
