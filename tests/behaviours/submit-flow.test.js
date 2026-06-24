import assert from 'node:assert/strict';
import test from 'node:test';

import { createSubmitInputPreparationLifecycle } from '../../src/app/legacy-runtime/features/submit-input-preparation-lifecycle.js';

const createSubmitHarness = ({ councilEnabled = false, messageValue = 'Hello' } = {}) => {
  const calls = [];
  const conversation = {
    archived: false,
    isTemporary: false,
    isWebSearchEnabled: false,
    messages: [],
    provider: 'gemini',
    unsentMessage: 'draft'
  };
  const elements = {
    messageInput: { value: messageValue }
  };
  let abortController = null;
  let updateSubmitButtonState;
  let generateTitleAndSummary;
  let shouldPerformWebSearch;
  let adjustTextareaHeight;
  let renderFilePreviews;

  const preparation = createSubmitInputPreparationLifecycle({
    elements,
    getAbortController: () => abortController,
    setAbortController: (value) => {
      abortController = value;
      calls.push(['setAbortController', Boolean(value)]);
    },
    createAbortController: () => ({ signal: { aborted: false } }),
    getUploadedFiles: () => [],
    setUploadedFiles: () => calls.push(['setUploadedFiles']),
    getActiveConversation: () => conversation,
    updateSubmitButtonState: (...args) => updateSubmitButtonState(...args),
    getCouncilValidation: () => ({ ok: true }),
    showNotification: () => {},
    renderCouncilControls: () => {},
    isCouncilEnabled: () => councilEnabled,
    getCouncilRuntimeTexts: () => ({ searchManualNotice: 'manual search required' }),
    addMessageToUI: (message, index, shouldSave) => {
      calls.push(['addMessageToUI', message.role, index, shouldSave]);
      if (shouldSave) conversation.messages.push(message);
      return {
        querySelector: () => ({ id: 'assistant-content' }),
        scrollIntoView: () => calls.push(['scrollIntoView'])
      };
    },
    renderHistorySidebar: () => {},
    getAutoNaming: () => false,
    generateTitleAndSummary: (...args) => generateTitleAndSummary(...args),
    saveAppData: async () => {},
    getAutoWebSearchEnabled: () => false,
    shouldPerformWebSearch: (...args) => shouldPerformWebSearch(...args),
    getAutoSearchNotice: () => 'auto search',
    renderInputIndicators: () => {},
    adjustTextareaHeight: (...args) => adjustTextareaHeight(...args),
    renderFilePreviews: (...args) => renderFilePreviews(...args),
    requestFrame: (callback) => callback()
  });

  updateSubmitButtonState = (isGenerating) => calls.push(['updateSubmitButtonState', isGenerating]);
  generateTitleAndSummary = () => calls.push(['generateTitleAndSummary']);
  shouldPerformWebSearch = async () => false;
  adjustTextareaHeight = () => calls.push(['adjustTextareaHeight']);
  renderFilePreviews = () => calls.push(['renderFilePreviews']);

  const submit = async () => {
    const prepared = await preparation.prepareSubmitResponse();
    if (!prepared.shouldContinue) return prepared;
    calls.push([prepared.responseUsesCouncil ? 'councilLifecycle' : 'singleModelLifecycle']);
    return prepared;
  };

  return {
    calls,
    conversation,
    get abortController() {
      return abortController;
    },
    submit
  };
};

test('single-model submit appends user/loading messages before lifecycle handoff', async () => {
  const harness = createSubmitHarness();

  const prepared = await harness.submit();

  assert.equal(prepared.shouldContinue, true);
  assert.equal(prepared.userMessage, 'Hello');
  assert.equal(prepared.contentDiv.id, 'assistant-content');
  assert.deepEqual(
    harness.calls.filter(([name]) => name === 'addMessageToUI' || name.endsWith('Lifecycle')),
    [
      ['addMessageToUI', 'user', 0, true],
      ['addMessageToUI', 'model', 1, false],
      ['singleModelLifecycle']
    ]
  );
});

test('empty submit does not enter generating state or response lifecycle', async () => {
  const harness = createSubmitHarness({ messageValue: '   ' });

  const prepared = await harness.submit();

  assert.deepEqual(prepared, { shouldContinue: false, reason: 'empty' });
  assert.equal(harness.abortController, null);
  assert.deepEqual(harness.calls, []);
});

test('valid council submit reaches council lifecycle handoff', async () => {
  const harness = createSubmitHarness({ councilEnabled: true });

  const prepared = await harness.submit();

  assert.equal(prepared.shouldContinue, true);
  assert.equal(prepared.responseUsesCouncil, true);
  assert.equal(harness.calls.some(([name]) => name === 'councilLifecycle'), true);
  assert.equal(harness.calls.some(([name]) => name === 'singleModelLifecycle'), false);
});
