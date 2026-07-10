import assert from 'node:assert/strict';
import test from 'node:test';

import { createLegacyRuntimeContext } from '../../src/app/legacy-runtime/runtime/legacy-runtime-context.js';
import { buildQuotedUserParts } from '../../src/app/legacy-runtime/features/quote-inquiry-lifecycle.js';
import { createSubmitInputPreparationLifecycle } from '../../src/app/legacy-runtime/features/submit-input-preparation-lifecycle.js';

const createSubmitHarness = ({
  councilEnabled = false,
  messageValue = 'Hello',
  quoteReference = null,
  autoWebSearchEnabled = false,
  performWebSearch = async () => false
} = {}) => {
  const calls = [];
  const conversation = {
    archived: false,
    isTemporary: false,
    isWebSearchEnabled: false,
    messages: [],
    provider: 'gemini',
    unsentMessage: 'draft'
  };
  let activeQuoteReference = quoteReference;
  const elements = {
    messageInput: { value: messageValue }
  };
  let abortController = null;
  let updateSubmitButtonState;
  let generateTitleAndSummary;
  let shouldPerformWebSearch;
  let adjustTextareaHeight;
  let renderFilePreviews;
  const runtimeContext = createLegacyRuntimeContext();

  runtimeContext.registerLazyBinding('submit.updateSubmitButtonState', () => updateSubmitButtonState);
  runtimeContext.registerLazyBinding('submit.generateTitleAndSummary', () => generateTitleAndSummary);
  runtimeContext.registerLazyBinding('submit.shouldPerformWebSearch', () => shouldPerformWebSearch);
  runtimeContext.registerLazyBinding('submit.adjustTextareaHeight', () => adjustTextareaHeight);
  runtimeContext.registerLazyBinding('submit.renderFilePreviews', () => renderFilePreviews);

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
    updateSubmitButtonState: (...args) => runtimeContext.resolveBinding('submit.updateSubmitButtonState')(...args),
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
        scrollIntoView: () => calls.push(['scrollIntoView', message.role])
      };
    },
    renderHistorySidebar: () => {},
    getAutoNaming: () => false,
    generateTitleAndSummary: (...args) => runtimeContext.resolveBinding('submit.generateTitleAndSummary')(...args),
    saveAppData: async () => {},
    getAutoWebSearchEnabled: () => autoWebSearchEnabled,
    shouldPerformWebSearch: (...args) => runtimeContext.resolveBinding('submit.shouldPerformWebSearch')(...args),
    getAutoSearchNotice: () => 'auto search',
    renderInputIndicators: () => {},
    adjustTextareaHeight: (...args) => runtimeContext.resolveBinding('submit.adjustTextareaHeight')(...args),
    renderFilePreviews: (...args) => runtimeContext.resolveBinding('submit.renderFilePreviews')(...args),
    requestFrame: (callback) => callback(),
    getQuoteReference: () => activeQuoteReference,
    buildQuotedUserParts: (options) => buildQuotedUserParts({
      ...options,
      getText: (key, fallback) => ({
        quoteInquiryReferenceLabel: 'Quoted text',
        quoteInquiryQuestionLabel: 'User follow-up',
        quoteInquiryContextInstruction: 'Use this quote to answer the user.',
        quoteInquiryDefaultQuestion: 'Explain this.'
      })[key] || fallback
    }),
    clearQuoteReference: () => {
      activeQuoteReference = null;
      calls.push(['clearQuoteReference']);
    }
  });

  updateSubmitButtonState = (isGenerating) => calls.push(['updateSubmitButtonState', isGenerating]);
  generateTitleAndSummary = () => calls.push(['generateTitleAndSummary']);
  shouldPerformWebSearch = performWebSearch;
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
    get quoteReference() {
      return activeQuoteReference;
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

test('submit scrolls the user message before auto-search classification resolves', async () => {
  let resolveSearch;
  const harness = createSubmitHarness({
    autoWebSearchEnabled: true,
    performWebSearch: () => new Promise(resolve => { resolveSearch = resolve; })
  });

  const submitting = harness.submit();
  await Promise.resolve();
  const callsBeforeSearchResolution = [...harness.calls];
  resolveSearch(false);
  await submitting;

  assert.equal(
    callsBeforeSearchResolution.some(([name, role]) => name === 'scrollIntoView' && role === 'user'),
    true
  );
  assert.equal(
    callsBeforeSearchResolution.some(([name, role]) => name === 'addMessageToUI' && role === 'model'),
    false
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

test('quote inquiry submits the selected model text as structured context and clears the composer quote', async () => {
  const harness = createSubmitHarness({
    messageValue: 'What does this mean?',
    quoteReference: {
      text: 'This is the selected model response.',
      sourceMessageIndex: 3
    }
  });

  const prepared = await harness.submit();

  assert.equal(
    prepared.userMessage,
    'Use this quote to answer the user.\n\n【Quoted text】\n「This is the selected model response.」\n\n【User follow-up】\nWhat does this mean?'
  );
  assert.equal(prepared.userParts[0].quoteContext, true);
  assert.deepEqual(prepared.userParts[0].quoteReference, {
    text: 'This is the selected model response.',
    sourceMessageIndex: 3,
    sourceMessageId: null,
    sourceTextOffset: null
  });
  assert.deepEqual(prepared.userParts[1], {
    text: 'What does this mean?',
    displayText: 'What does this mean?'
  });
  assert.equal(harness.quoteReference, null);
  assert.equal(harness.calls.some(([name]) => name === 'clearQuoteReference'), true);
});
