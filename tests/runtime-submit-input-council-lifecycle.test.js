import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createDom } from './behaviours/helpers/create-dom.js';
import { createLegacySubmitInputCouncilLifecycle } from '../src/app/runtime/legacy-core/submit-input-council-lifecycle.js';

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
    legacyRuntimeContext: {
      resolveBinding: (name) => {
        if (name === 'input.updateInputState') return noop;
        if (name === 'submit.updateSubmitButtonState') return noop;
        return noop;
      }
    },
    state,
    models: [],
    i18n: { en: { errorPrefix: 'Error', autoSearchNotice: 'Auto search' } },
    getActiveConversation: () => null,
    normalizeConversationModel: (conversation) => conversation?.model || null,
    saveAppData: async () => {},
    saveConfig: async () => {},
    renderAll: noop,
    renderHistorySidebar: noop,
    addMessageToUI: noop,
    showNotification: noop,
    ...overrides
  };
}

test('factory exports createLegacySubmitInputCouncilLifecycle', () => {
  assert.equal(typeof createLegacySubmitInputCouncilLifecycle, 'function');
});

test('import is inert and module avoids fragments and virtual runtime', () => {
  const source = readSource('src/app/runtime/legacy-core/submit-input-council-lifecycle.js');

  assert.match(source, /export\s+function\s+createLegacySubmitInputCouncilLifecycle/);
  assert.doesNotMatch(source, /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-app/);
});

test('quote reference dependencies reach the real submit preparation lifecycle', () => {
  const source = readSource('src/app/runtime/legacy-core/submit-input-council-lifecycle.js');
  const preparationStart = source.indexOf('createSubmitInputPreparationLifecycle({');
  const preparationSource = source.slice(preparationStart, source.indexOf('\n  });', preparationStart));

  assert.match(source, /getQuoteReference\s*=\s*\(\)\s*=>\s*null/);
  assert.match(source, /buildQuotedUserParts\s*=\s*\(\{\s*question\s*\}\)/);
  assert.match(source, /clearQuoteReference\s*=\s*\(\)\s*=>\s*\{\}/);
  assert.match(preparationSource, /getQuoteReference/);
  assert.match(preparationSource, /buildQuotedUserParts/);
  assert.match(preparationSource, /clearQuoteReference/);
});

test('factory validates required dependencies', () => {
  assert.throws(
    () => createLegacySubmitInputCouncilLifecycle(),
    /missing dependency: document/
  );
});

test('factory exposes submit, input, council, and streaming API', () => {
  const lifecycle = createLegacySubmitInputCouncilLifecycle(createDependencies());

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
  const lifecycle = createLegacySubmitInputCouncilLifecycle(dependencies);

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
    model: 'openai/gpt-image-2',
    provider: 'openrouter'
  };
  const model = {
    id: 'openai/gpt-image-2',
    outputModality: 'image',
    provider: 'openrouter'
  };
  const lifecycle = createLegacySubmitInputCouncilLifecycle(createDependencies({
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
  const lifecycle = createLegacySubmitInputCouncilLifecycle(createDependencies({
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
    legacyRuntimeContext: {
      resolveBinding: (name) => name === 'input.updateInputState'
        ? () => inputUpdates.push(name)
        : noop
    }
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
  assert.deepEqual(inputUpdates, ['input.updateInputState']);

  releaseAppSave();
  await appSavePending;
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(saveConfigCalls, 1);
  assert.equal(config.lastCouncilConfig.enabled, false);
  cleanup();
});
