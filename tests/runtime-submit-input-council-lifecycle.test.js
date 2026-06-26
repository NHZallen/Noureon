import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

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
