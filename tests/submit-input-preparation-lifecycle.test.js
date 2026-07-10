import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createSubmitInputPreparationLifecycle } from '../src/app/legacy-runtime/features/submit-input-preparation-lifecycle.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

const createLoadingMessageElement = (calls) => ({
  querySelector(selector) {
    calls.push(['querySelector', selector]);
    return { id: 'content-div' };
  },
  scrollIntoView(options) {
    calls.push(['scrollIntoView', options]);
  }
});

const createHarness = (overrides = {}) => {
  const calls = [];
  let abortController = overrides.abortController ?? null;
  let uploadedFiles = overrides.uploadedFiles ?? [];
  const conversation = overrides.conversation ?? {
    archived: false,
    isTemporary: false,
    isWebSearchEnabled: false,
    messages: [],
    provider: 'gemini',
    unsentMessage: 'draft'
  };
  const elements = {
    messageInput: { value: overrides.messageValue ?? 'Hello' }
  };

  const lifecycle = createSubmitInputPreparationLifecycle({
    elements,
    getAbortController: () => abortController,
    setAbortController: (value) => {
      abortController = value;
      calls.push(['setAbortController', value ? 'set' : null]);
    },
    createAbortController: () => ({ signal: { aborted: false } }),
    getUploadedFiles: () => uploadedFiles,
    setUploadedFiles: (files) => {
      uploadedFiles = files;
      calls.push(['setUploadedFiles', files.length]);
    },
    getActiveConversation: () => conversation,
    updateSubmitButtonState: (value) => calls.push(['updateSubmitButtonState', value]),
    getCouncilValidation: overrides.getCouncilValidation || (() => ({ ok: true })),
    showNotification: (message, type) => calls.push(['showNotification', message, type]),
    renderCouncilControls: () => calls.push(['renderCouncilControls']),
    isCouncilEnabled: overrides.isCouncilEnabled || (() => false),
    getCouncilRuntimeTexts: () => ({ searchManualNotice: 'manual search required' }),
    addMessageToUI: (message, index, shouldSave) => {
      calls.push(['addMessageToUI', message.role, index, shouldSave]);
      if (message.role === 'model') return createLoadingMessageElement(calls);
      conversation.messages.push(message);
      return {
        id: 'user-message',
        scrollIntoView(options) {
          calls.push(['scrollIntoView', options]);
        }
      };
    },
    renderHistorySidebar: () => calls.push(['renderHistorySidebar']),
    getAutoNaming: () => overrides.autoNaming ?? false,
    generateTitleAndSummary: (conv) => calls.push(['generateTitleAndSummary', conv === conversation]),
    saveAppData: async () => calls.push(['saveAppData']),
    getAutoWebSearchEnabled: () => overrides.autoWebSearch ?? false,
    shouldPerformWebSearch: overrides.shouldPerformWebSearch || (async () => false),
    canAutoEnableWebSearch: overrides.canAutoEnableWebSearch || (() => true),
    getAutoSearchNotice: () => 'auto search on',
    renderInputIndicators: () => calls.push(['renderInputIndicators']),
    adjustTextareaHeight: () => calls.push(['adjustTextareaHeight']),
    renderFilePreviews: () => calls.push(['renderFilePreviews']),
    requestFrame: (callback) => {
      calls.push(['requestFrame']);
      callback();
    }
  });

  return {
    calls,
    conversation,
    get abortController() {
      return abortController;
    },
    get uploadedFiles() {
      return uploadedFiles;
    },
    elements,
    lifecycle
  };
};

test('prepares user text, uploaded files, temporary conversation, auto search, and loading handoff', async () => {
  const harness = createHarness({
    autoNaming: true,
    autoWebSearch: true,
    conversation: {
      archived: false,
      isTemporary: true,
      isWebSearchEnabled: false,
      messages: [],
      provider: 'gemini',
      unsentMessage: 'draft'
    },
    shouldPerformWebSearch: async () => true,
    uploadedFiles: [{
      base64: 'data:image/png;base64,abc123',
      name: 'photo.png',
      size: 99,
      type: 'image/png'
    }]
  });

  const result = await harness.lifecycle.prepareSubmitResponse();

  assert.equal(result.shouldContinue, true);
  assert.equal(result.conversation, harness.conversation);
  assert.equal(result.userMessage, 'Hello');
  assert.deepEqual(result.userParts, [
    { text: 'Hello' },
    { inlineData: { data: 'abc123', mimeType: 'image/png', name: 'photo.png', size: 99 } }
  ]);
  assert.equal(result.userMessageObject.role, 'user');
  assert.deepEqual(result.contentDiv, { id: 'content-div' });
  assert.equal(harness.elements.messageInput.value, '');
  assert.deepEqual(harness.uploadedFiles, []);
  assert.equal(harness.conversation.isTemporary, false);
  assert.equal(harness.conversation.isNaming, true);
  assert.equal(harness.conversation.isWebSearchEnabled, true);
  assert.equal(harness.conversation.unsentMessage, '');
  assert.deepEqual(harness.calls.map(([name]) => name), [
    'setAbortController',
    'updateSubmitButtonState',
    'addMessageToUI',
    'requestFrame',
    'scrollIntoView',
    'setUploadedFiles',
    'adjustTextareaHeight',
    'renderFilePreviews',
    'renderHistorySidebar',
    'generateTitleAndSummary',
    'saveAppData',
    'showNotification',
    'renderInputIndicators',
    'addMessageToUI',
    'querySelector',
    'requestFrame',
    'scrollIntoView'
  ]);
});

test('prepares an edited message without clearing the composer draft or its attachments', async () => {
  const composerFile = {
    base64: 'data:image/png;base64,composer', name: 'composer.png', size: 3, type: 'image/png'
  };
  const editedFile = {
    base64: 'data:image/png;base64,edited', name: 'edited.png', size: 4, type: 'image/png'
  };
  const harness = createHarness({ messageValue: 'Keep this draft', uploadedFiles: [composerFile] });

  const result = await harness.lifecycle.prepareSubmitResponse({
    userMessage: 'Replacement message',
    uploadedFiles: [editedFile],
    preserveComposer: true
  });

  assert.equal(result.shouldContinue, true);
  assert.equal(result.userMessage, 'Replacement message');
  assert.equal(harness.elements.messageInput.value, 'Keep this draft');
  assert.deepEqual(harness.uploadedFiles, [composerFile]);
  assert.deepEqual(result.userParts, [
    { text: 'Replacement message' },
    { inlineData: { data: 'edited', mimeType: 'image/png', name: 'edited.png', size: 4 } }
  ]);
  assert.equal(harness.calls.some(([name]) => name === 'setUploadedFiles'), false);
});

test('auto web search can be enabled for Tavily-backed providers through the runtime predicate', async () => {
  for (const provider of ['openrouter', 'nvidia', 'stepfun']) {
    let checkedPrompt = '';
    const harness = createHarness({
      autoWebSearch: true,
      conversation: {
        archived: false,
        isTemporary: false,
        isWebSearchEnabled: false,
        messages: [],
        provider,
        unsentMessage: 'draft'
      },
      canAutoEnableWebSearch: (conversation) => conversation.provider === provider,
      shouldPerformWebSearch: async (prompt) => {
        checkedPrompt = prompt;
        return true;
      }
    });

    const result = await harness.lifecycle.prepareSubmitResponse();

    assert.equal(result.shouldContinue, true);
    assert.equal(checkedPrompt, 'Hello');
    assert.equal(harness.conversation.isWebSearchEnabled, true);
    assert.ok(harness.calls.some(call => call[0] === 'showNotification' && call[1] === 'auto search on'));
  }
});

test('clears the composer before the auto web search classifier resolves', async () => {
  let resolveClassifier;
  const classifierPending = new Promise((resolve) => {
    resolveClassifier = resolve;
  });
  const harness = createHarness({
    autoWebSearch: true,
    uploadedFiles: [{
      base64: 'data:image/png;base64,abc123', name: 'photo.png', size: 99, type: 'image/png'
    }],
    shouldPerformWebSearch: () => classifierPending
  });

  const submission = harness.lifecycle.prepareSubmitResponse();
  await Promise.resolve();

  assert.equal(harness.elements.messageInput.value, '');
  assert.deepEqual(harness.uploadedFiles, []);
  assert.deepEqual(harness.calls.map(([name]) => name), [
    'setAbortController',
    'updateSubmitButtonState',
    'addMessageToUI',
    'requestFrame',
    'scrollIntoView',
    'setUploadedFiles',
    'adjustTextareaHeight',
    'renderFilePreviews'
  ]);

  resolveClassifier(false);
  assert.equal((await submission).shouldContinue, true);
});

test('auto web search skips the classifier when the current model cannot use search', async () => {
  let classifierCalled = false;
  const harness = createHarness({
    autoWebSearch: true,
    canAutoEnableWebSearch: () => false,
    shouldPerformWebSearch: async () => {
      classifierCalled = true;
      return true;
    }
  });

  const result = await harness.lifecycle.prepareSubmitResponse();

  assert.equal(result.shouldContinue, true);
  assert.equal(classifierCalled, false);
  assert.equal(harness.conversation.isWebSearchEnabled, false);
});

test('preserves targeted edit metadata on annotated image attachments', () => {
  const harness = createHarness();
  assert.deepEqual(harness.lifecycle.buildUserParts('change the marked area', [{
    base64: 'data:image/png;base64,marked',
    name: 'targeted.png',
    size: 123,
    type: 'image/png',
    targetedEdit: true
  }]), [
    { text: 'change the marked area' },
    { inlineData: {
      data: 'marked',
      mimeType: 'image/png',
      name: 'targeted.png',
      size: 123,
      targetedEdit: true
    } }
  ]);
});

test('invalid council validation resets submit state and does not add messages', async () => {
  const harness = createHarness({
    getCouncilValidation: () => ({ ok: false, message: 'bad council' })
  });

  const result = await harness.lifecycle.prepareSubmitResponse();

  assert.deepEqual(result, { shouldContinue: false, reason: 'council-validation' });
  assert.equal(harness.abortController, null);
  assert.deepEqual(harness.conversation.messages, []);
  assert.deepEqual(harness.calls, [
    ['setAbortController', 'set'],
    ['updateSubmitButtonState', true],
    ['showNotification', 'bad council', 'warning'],
    ['setAbortController', null],
    ['updateSubmitButtonState', false],
    ['renderCouncilControls']
  ]);
});

test('empty, archived, and already-generating submissions remain no-op boundaries', async () => {
  const emptyHarness = createHarness({ messageValue: '', uploadedFiles: [] });
  assert.deepEqual(await emptyHarness.lifecycle.prepareSubmitResponse(), { shouldContinue: false, reason: 'empty' });
  assert.deepEqual(emptyHarness.calls, []);

  const archivedHarness = createHarness({ conversation: { archived: true, messages: [] } });
  assert.deepEqual(await archivedHarness.lifecycle.prepareSubmitResponse(), { shouldContinue: false, reason: 'archived' });
  assert.deepEqual(archivedHarness.calls, []);

  const generatingHarness = createHarness({ abortController: { signal: { aborted: false } } });
  assert.deepEqual(await generatingHarness.lifecycle.prepareSubmitResponse(), { shouldContinue: false, reason: 'already-generating' });
  assert.deepEqual(generatingHarness.calls, []);
});

test('submit preparation helper source avoids provider parser, storage schema, package, and Vite coupling', () => {
  const source = readSource('src/app/legacy-runtime/features/submit-input-preparation-lifecycle.js');

  for (const forbidden of [
    'TextDecoder',
    'response.body',
    'localStorage',
    'sessionStorage',
    'indexedDB',
    'streamApiCall',
    'virtual:legacy-app-runtime',
    'vite.config',
    'package.json',
    'REFACTOR_PLAN'
  ]) {
    assert.equal(source.includes(forbidden), false, `source should not include ${forbidden}`);
  }
});
