import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createDom } from './behaviours/helpers/create-dom.js';
import { createSubmitInputCouncilLifecycle } from '../src/app/runtime/shell/submit-input-council-lifecycle.js';
import { storesOverState } from './helpers/settings-lifecycle-harness.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');
const noop = () => {};

function createElement() {
  return {
    children: [],
    classList: {
      add: noop,
      remove: noop,
      toggle: noop
    },
    dataset: {},
    disabled: false,
    innerHTML: '',
    style: {},
    textContent: '',
    value: '',
    addEventListener: noop,
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    click: noop,
    querySelector() {
      return createElement();
    },
    querySelectorAll() {
      return [];
    },
    remove: noop,
    scrollTo: noop
  };
}

function createDependencies(overrides = {}) {
  const elements = new Proxy({}, {
    get(target, key) {
      if (!(key in target)) target[key] = createElement();
      return target[key];
    }
  });
  const state = {
    config: {
      uiLanguage: 'en',
      isLearningMode: false,
      autoNaming: false,
      enableAutoWebSearch: false,
      memoryEnabled1: false,
      enableAutoMemory: false
    },
    conversations: [],
    astras: [],
    uploadedFiles: [],
    abortController: null,
    isCouncilRunning: false,
    isAutoScrolling: false
  };
  return {
    document: {
      createDocumentFragment: () => createElement(),
      createElement,
      getElementById: () => null,
      querySelector: () => createElement(),
      querySelectorAll: () => []
    },
    elements,
    updateInputState: noop,
    updateSubmitButtonState: noop,
    generateTitleAndSummary: noop,
    adjustTextareaHeight: noop,
    renderFilePreviews: noop,
    state,
    uploads: storesOverState(state).uploads,
    reply: storesOverState(state).reply,
    getConfig: () => state.config,
    getAstras: () => state.astras,
    models: [],
    i18n: { en: { errorPrefix: 'Error', autoSearchNotice: 'Auto search' } },
    getActiveConversation: () => null,
    normalizeConversationModel: (conversation) => conversation?.model || null,
    saveAppData: async () => {},
    saveConfig: async () => {},
    renderAll: noop,
    renderChat: noop,
    renderHistorySidebar: noop,
    addMessageToUI: noop,
    showNotification: noop,
    showCustomDialog: async () => true,
    ...overrides
  };
}

test('factory exports createSubmitInputCouncilLifecycle', () => {
  assert.equal(typeof createSubmitInputCouncilLifecycle, 'function');
});

test('the lifecycle does not reach into the legacy fragments or the virtual runtime', () => {
  const source = readSource('src/app/runtime/shell/submit-input-council-lifecycle.js');

  assert.doesNotMatch(source, /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-app/);
});

// A whole send on a real DOM: the message typed, the user and the reply messages drawn, the reply streamed by a fake model.
function createSubmitHarness({ stream, ...overrides } = {}) {
  const dom = createDom('<div id="message-list"></div><textarea id="message-input"></textarea>');
  const { document, window } = dom;
  const conversation = { id: 'c1', archived: false, isTemporary: false, messages: [], model: 'model-a', provider: 'test' };
  const state = { config: { uiLanguage: 'en', autoNaming: false }, uploadedFiles: [], abortController: null, isCouncilRunning: false };
  const stores = storesOverState(state);
  const messageList = document.getElementById('message-list');
  const messageInput = document.getElementById('message-input');
  const calls = [];
  const timers = new Set();
  const later = (callback, ms = 0) => {
    const id = setTimeout(() => { timers.delete(id); callback(Date.now()); }, ms);
    timers.add(id);
    return id;
  };
  const drawn = [];
  const lifecycle = createSubmitInputCouncilLifecycle({
    window,
    document,
    elements: { messageList, messageInput },
    uploads: stores.uploads,
    reply: stores.reply,
    models: [{ id: 'model-a', name: 'Model A', provider: 'test' }],
    i18n: { en: { errorPrefix: 'Error: ' } },
    getConfig: () => state.config,
    getOutputMode: () => 'realtime',
    getActiveConversation: () => conversation,
    normalizeConversationModel: () => ({ id: 'model-a', name: 'Model A', provider: 'test' }),
    saveAppData: async () => calls.push('saveAppData'),
    saveConfig: async () => {},
    renderHistorySidebar: () => {},
    renderChat: () => calls.push('renderChat'),
    updateSubmitButtonState: () => {},
    updateInputState: () => {},
    adjustTextareaHeight: () => {},
    renderFilePreviews: () => {},
    generateTitleAndSummary: () => {},
    addMessageToUI: (message, index, shouldSave) => {
      if (shouldSave) conversation.messages.push(message);
      const element = document.createElement('div');
      element.innerHTML = '<div class="message-content"></div>';
      messageList.appendChild(element);
      drawn.push({ message, element });
      return element;
    },
    buildSingleModelTranslatedRequestParts: async (parts) => parts,
    streamApiCall: (parts, onChunk, signal, forceWebSearch, options) => stream({ parts, onChunk, options, abort: () => state.abortController.abort() }),
    showNotification: () => {},
    showCustomDialog: async () => true,
    requestAnimationFrame: (callback) => later(callback),
    setTimeout: later,
    clearTimeout: (id) => { clearTimeout(id); timers.delete(id); },
    logger: { error: () => {}, warn: () => {}, log: () => {} },
    ...overrides
  });
  const send = async (text = 'Hello') => {
    messageInput.value = text;
    await lifecycle.handleFormSubmit({ preventDefault() {} });
  };
  const replyElement = () => drawn.find((item) => item.message.role === 'model')?.element;
  const cleanup = () => {
    timers.forEach((id) => clearTimeout(id));
    dom.cleanup();
  };
  return { conversation, messageList, calls, send, replyElement, cleanup };
}

test('a reply that drew on past conversations gets its sources added in place, without redrawing the chat', async () => {
  const refreshed = [];
  const harness = createSubmitHarness({
    stream: async ({ onChunk, options }) => {
      options.onMemoryContextResolved({ historyResults: [{ conversationId: 'older-chat' }] });
      onChunk('From before');
      return 'From before';
    },
    refreshMessageHistorySources: (element, message) => refreshed.push({ element, message })
  });
  try {
    await harness.send();

    const reply = harness.conversation.messages.at(-1);
    assert.equal(reply.parts[0].text, 'From before');
    assert.deepEqual(reply.metadata.historySourceConversationIds, ['older-chat']);
    assert.equal(refreshed.length, 1);
    assert.equal(refreshed[0].element, harness.replyElement());
    assert.equal(refreshed[0].message, reply);
    assert.equal(harness.calls.includes('renderChat'), false);
  } finally {
    harness.cleanup();
  }
});

test('stopping before any answer removes the waiting reply; stopping once the answer is saved keeps it', async () => {
  const unanswered = createSubmitHarness({
    stream: async ({ abort }) => {
      abort();
      throw Object.assign(new Error('stopped'), { name: 'AbortError' });
    }
  });
  try {
    await unanswered.send();
    assert.deepEqual(unanswered.conversation.messages.map((message) => message.role), ['user']);
    assert.equal(unanswered.messageList.contains(unanswered.replyElement()), false);
  } finally {
    unanswered.cleanup();
  }

  const answered = createSubmitHarness({
    stream: async ({ onChunk, abort }) => {
      onChunk('Done');
      abort();
      return 'Done';
    }
  });
  try {
    await answered.send();
    assert.deepEqual(answered.conversation.messages.map((message) => message.role), ['user', 'model']);
    assert.equal(answered.messageList.contains(answered.replyElement()), true);
  } finally {
    answered.cleanup();
  }
});

test('a quoted passage is sent with the question and the quote is cleared', async () => {
  const quote = { text: 'the quoted words' };
  const quoteCalls = [];
  let sentParts = null;
  const harness = createSubmitHarness({
    stream: async ({ parts, onChunk }) => {
      sentParts = parts;
      onChunk('Answer');
      return 'Answer';
    },
    getQuoteReference: () => quote,
    buildQuotedUserParts: (options) => {
      quoteCalls.push(['build', options.question, options.quoteReference ?? options.reference]);
      return [{ text: `QUOTE[${quote.text}] ${options.question}` }];
    },
    clearQuoteReference: () => quoteCalls.push(['clear'])
  });
  try {
    await harness.send('Why?');

    assert.deepEqual(harness.conversation.messages[0].parts, [{ text: 'QUOTE[the quoted words] Why?' }]);
    assert.deepEqual(sentParts, [{ text: 'QUOTE[the quoted words] Why?' }]);
    assert.equal(quoteCalls[0][0], 'build');
    assert.equal(quoteCalls[0][1], 'Why?');
    assert.ok(quoteCalls.some((call) => call[0] === 'clear'));
  } finally {
    harness.cleanup();
  }
});

test('factory validates required dependencies', () => {
  assert.throws(
    () => createSubmitInputCouncilLifecycle(),
    /missing dependency: document/
  );
});

test('factory requires the dialog used by first-selection model notices', () => {
  const dependencies = createDependencies();
  delete dependencies.showCustomDialog;

  assert.throws(
    () => createSubmitInputCouncilLifecycle(dependencies),
    /missing dependency: showCustomDialog/
  );
});

test('factory exposes submit, input, council, and streaming API', () => {
  const lifecycle = createSubmitInputCouncilLifecycle(createDependencies());

  for (const name of [
    'openCouncilPopoverFromAttachmentMenu',
    'ensureCouncilMenuButton',
    'updateFunctionButtonsState',
    'toggleLearningMode',
    'renderInputIndicators',
    'updateFileInputUI',
    'renderCouncilControls',
    'renderModelSwitcher',
    'typewriterStream',
    'renderIncrementalResponse',
    'playbackStreamingMarkdownResponse',
    'handleFormSubmit'
  ]) {
    assert.equal(typeof lifecycle[name], 'function', `${name} should be exposed`);
  }
});

test('factory keeps live state bridge for uploaded files and abort controller', () => {
  const dependencies = createDependencies();
  const lifecycle = createSubmitInputCouncilLifecycle(dependencies);

  dependencies.state.uploadedFiles = [{ name: 'before.txt' }];
  lifecycle.updateFileInputUI();

  assert.deepEqual(dependencies.state.uploadedFiles, [{ name: 'before.txt' }]);
  assert.equal(dependencies.state.abortController, null);
});

test('image generation mode exposes camera and image upload while hiding generic files', () => {
  const { document, cleanup } = createDom(`
    <div id="file-options-popover">
      <button id="camera-btn"></button>
      <button id="upload-image-btn"></button>
      <button id="upload-file-btn"></button>
      <div class="border-t"></div>
      <button id="web-search-popover-btn"></button>
      <button id="learning-mode-btn"></button>
    </div>
  `);
  const elements = {
    cameraBtn: document.getElementById('camera-btn'),
    uploadImageBtn: document.getElementById('upload-image-btn'),
    uploadFileBtn: document.getElementById('upload-file-btn'),
    webSearchPopoverBtn: document.getElementById('web-search-popover-btn'),
    learningModeBtn: document.getElementById('learning-mode-btn'),
    fileOptionsPopover: document.getElementById('file-options-popover')
  };
  const conversation = {
    archived: false,
    imageConfig: { aspectRatio: '1:1', resolution: '1K' },
    isWebSearchEnabled: false,
    model: 'openai/gpt-image-2.5-flare',
    provider: 'openrouter'
  };
  const model = {
    id: 'openai/gpt-image-2.5-flare',
    outputModality: 'image',
    provider: 'openrouter'
  };
  const lifecycle = createSubmitInputCouncilLifecycle(createDependencies({
    document,
    elements,
    getActiveConversation: () => conversation,
    normalizeConversationModel: () => model,
    hasSingleDocumentAccess: () => true,
    hasSingleWebSearchAccess: () => true,
    modelGeneratesImages: (candidate) => candidate?.outputModality === 'image',
    modelSupportsVision: (candidate) => candidate?.outputModality === 'image'
  }));

  lifecycle.updateFunctionButtonsState();

  assert.equal(elements.cameraBtn.style.display, 'flex');
  assert.equal(elements.uploadImageBtn.style.display, 'flex');
  assert.equal(elements.uploadFileBtn.style.display, 'none');
  assert.equal(elements.webSearchPopoverBtn.style.display, 'flex');
  assert.equal(elements.learningModeBtn.style.display, 'none');
  assert.equal(document.getElementById('model-council-menu-btn').style.display, 'none');
  assert.equal(document.getElementById('image-aspect-ratio-control').style.display, 'flex');
  assert.equal(document.getElementById('image-resolution-control').style.display, 'flex');

  cleanup();
});

test('learning mode with an active Noura explains the combined rules on both chips', () => {
  const { document, cleanup } = createDom(`
    <div class="input-wrapper">
      <div id="input-indicator-container"></div>
    </div>
  `);
  const conversation = { archived: false, astrasId: 'astra-1', model: 'model-a' };
  const config = { uiLanguage: 'en', isLearningMode: true };
  const dependencies = createDependencies({
    document,
    elements: { inputIndicatorContainer: document.getElementById('input-indicator-container') },
    getActiveConversation: () => conversation,
    getConfig: () => config,
    i18n: { en: {
      learningIndicator: 'Learning',
      closeLearning: 'Close learning',
      astrasActive: 'active',
      closeAstras: 'Close Noura',
      learningWithNouraNotice: 'Both rule sets are active; Learning Mode wins on conflict.'
    } }
  });
  dependencies.state.astras = [{ id: 'astra-1', name: 'Direct Coach' }];
  const lifecycle = createSubmitInputCouncilLifecycle(dependencies);

  lifecycle.renderInputIndicators();

  const learningChip = document.querySelector('#learning-mode-indicator .input-indicator-content');
  const astraChip = document.querySelector('#astras-input-indicator .input-indicator-content');
  assert.ok(learningChip, 'learning chip should render');
  assert.ok(astraChip, 'Noura chip should render');
  assert.equal(learningChip.getAttribute('title'), 'Both rule sets are active; Learning Mode wins on conflict.');
  assert.equal(astraChip.getAttribute('title'), 'Both rule sets are active; Learning Mode wins on conflict.');
  cleanup();
});

test('the combined-rules tooltip is absent when only one of the two is active', () => {
  const { document, cleanup } = createDom(`
    <div class="input-wrapper">
      <div id="input-indicator-container"></div>
    </div>
  `);
  const conversation = { archived: false, astrasId: null, model: 'model-a' };
  const config = { uiLanguage: 'en', isLearningMode: true };
  const lifecycle = createSubmitInputCouncilLifecycle(createDependencies({
    document,
    elements: { inputIndicatorContainer: document.getElementById('input-indicator-container') },
    getActiveConversation: () => conversation,
    getConfig: () => config,
    i18n: { en: {
      learningIndicator: 'Learning',
      closeLearning: 'Close learning',
      learningWithNouraNotice: 'Both rule sets are active; Learning Mode wins on conflict.'
    } }
  }));

  lifecycle.renderInputIndicators();

  const learningChip = document.querySelector('#learning-mode-indicator .input-indicator-content');
  assert.ok(learningChip, 'learning chip should render');
  assert.equal(learningChip.getAttribute('title'), null);
  cleanup();
});

test('a function indicator can be selected again while its previous instance is exiting', () => {
  const { document, cleanup } = createDom(`
    <div class="input-wrapper">
      <div id="message-input"></div>
      <div id="input-indicator-container"></div>
    </div>
  `);
  const conversation = {
    archived: false,
    isWebSearchEnabled: true,
    model: 'model-a'
  };
  let inlineSyncs = 0;
  const messageInput = document.getElementById('message-input');
  messageInput.syncInlineModeTokens = () => { inlineSyncs += 1; };
  const lifecycle = createSubmitInputCouncilLifecycle(createDependencies({
    document,
    elements: {
      inputIndicatorContainer: document.getElementById('input-indicator-container'),
      messageInput
    },
    getActiveConversation: () => conversation,
    getConfig: () => ({ uiLanguage: 'en', isLearningMode: false }),
    i18n: { en: { search: 'Search', closeSearchMode: 'Close search' } }
  }));

  lifecycle.renderInputIndicators();
  const firstIndicator = document.getElementById('search-indicator');
  assert.ok(firstIndicator);

  conversation.isWebSearchEnabled = false;
  lifecycle.renderInputIndicators();
  assert.equal(firstIndicator.classList.contains('exit'), true);

  conversation.isWebSearchEnabled = true;
  lifecycle.renderInputIndicators();
  const restoredIndicator = document.getElementById('search-indicator');
  assert.ok(restoredIndicator);
  assert.notEqual(restoredIndicator, firstIndicator);
  assert.equal(restoredIndicator.classList.contains('exit'), false);

  firstIndicator.dispatchEvent(new document.defaultView.Event('animationend'));
  assert.equal(document.getElementById('search-indicator'), restoredIndicator);
  assert.equal(inlineSyncs, 3);
  cleanup();
});

test('enabling learning mode with a Noura active explains the combination instead of the plain toast', async () => {
  const { document, cleanup } = createDom(`
    <div class="input-wrapper">
      <div id="input-indicator-container"></div>
      <div id="file-options-popover"></div>
    </div>
  `);
  const conversation = { archived: false, astrasId: 'astra-1', model: 'model-a' };
  const config = { uiLanguage: 'en', isLearningMode: false };
  const notifications = [];
  const dependencies = createDependencies({
    document,
    elements: {
      inputIndicatorContainer: document.getElementById('input-indicator-container'),
      fileOptionsPopover: document.getElementById('file-options-popover')
    },
    getActiveConversation: () => conversation,
    getConfig: () => config,
    showNotification: (message, type) => notifications.push({ message, type }),
    i18n: { en: {
      learningIndicator: 'Learning',
      closeLearning: 'Close learning',
      astrasActive: 'active',
      closeAstras: 'Close Noura',
      learningEnabled: 'Learning mode enabled',
      learningDisabled: 'Learning mode disabled',
      learningWithNouraNotice: 'Both rule sets are active; Learning Mode wins on conflict.'
    } }
  });
  dependencies.state.astras = [{ id: 'astra-1', name: 'Direct Coach' }];
  const lifecycle = createSubmitInputCouncilLifecycle(dependencies);

  await lifecycle.toggleLearningMode();
  assert.equal(config.isLearningMode, true);
  assert.equal(notifications.at(-1).message, 'Both rule sets are active; Learning Mode wins on conflict.');

  await lifecycle.toggleLearningMode();
  assert.equal(notifications.at(-1).message, 'Learning mode disabled');

  conversation.astrasId = null;
  await lifecycle.toggleLearningMode();
  assert.equal(notifications.at(-1).message, 'Learning mode enabled');
  cleanup();
});

test('council indicator close button updates the UI before persistence finishes', async () => {
  const { document, cleanup } = createDom(`
    <div class="input-wrapper">
      <div id="input-indicator-container"></div>
    </div>
  `);
  const conversation = {
    archived: false,
    council: {
      enabled: true,
      mode: 'consensus',
      participantModelIds: ['model-a', 'model-b']
    },
    model: 'model-a'
  };
  const config = {
    uiLanguage: 'en',
    isLearningMode: false,
    lastCouncilConfig: null,
    modelSettings: [{ id: 'model-a', hidden: false, order: 0 }]
  };
  let releaseAppSave;
  const appSavePending = new Promise((resolve) => { releaseAppSave = resolve; });
  let saveConfigCalls = 0;
  const inputUpdates = [];
  const lifecycle = createSubmitInputCouncilLifecycle(createDependencies({
    document,
    elements: {
      inputIndicatorContainer: document.getElementById('input-indicator-container'),
      modelSwitcherContainer: createElement()
    },
    models: [{ id: 'model-a', name: 'Model A', provider: 'test' }],
    getActiveConversation: () => conversation,
    getConfig: () => config,
    getCouncilSelectedModels: () => ({ council: conversation.council, participants: [], synthesizer: null }),
    getCouncilTexts: () => ({ title: 'Model Council', consensus: 'Consensus' }),
    getCouncilValidation: () => ({ ok: true, message: 'Ready' }),
    isCouncilEnabled: (candidate) => Boolean(candidate?.council?.enabled),
    normalizeCouncilConfig: (value) => ({ ...value }),
    cloneCouncilConfig: (value) => ({ ...value }),
    normalizeConversationModel: () => ({ id: 'model-a' }),
    saveAppData: () => appSavePending,
    saveConfig: async () => { saveConfigCalls += 1; },
    updateInputState: () => inputUpdates.push('updateInputState')
  }));

  lifecycle.renderInputIndicators();
  const closeButton = document.getElementById('close-model-council-btn-input');
  assert.ok(closeButton);
  assert.equal(closeButton.type, 'button');

  closeButton.click();

  assert.equal(conversation.council.enabled, false);
  assert.equal(document.getElementById('model-council-indicator'), null);
  assert.equal(document.querySelector('.input-wrapper').classList.contains('has-indicators'), false);
  assert.equal(saveConfigCalls, 0);
  assert.deepEqual(inputUpdates, ['updateInputState']);

  releaseAppSave();
  await appSavePending;
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(saveConfigCalls, 1);
  assert.equal(config.lastCouncilConfig.enabled, false);
  cleanup();
});
