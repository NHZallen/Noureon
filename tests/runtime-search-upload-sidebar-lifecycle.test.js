import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createLegacySearchUploadSidebarLifecycle } from '../src/app/runtime/legacy-core/search-upload-sidebar-lifecycle.js';

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const noop = () => {};

function createClassList() {
  const values = new Set();
  return {
    values,
    add: (...names) => names.forEach((name) => values.add(name)),
    remove: (...names) => names.forEach((name) => values.delete(name)),
    toggle(name, force) {
      const enabled = force ?? !values.has(name);
      if (enabled) values.add(name);
      else values.delete(name);
    },
    contains: (name) => values.has(name)
  };
}

function createNode() {
  const listeners = new Map();
  const classList = createClassList();
  return {
    className: '',
    dataset: {},
    style: {},
    children: [],
    innerHTML: '',
    textContent: '',
    value: '',
    classList,
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    remove() {
      this.removed = true;
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    dispatch(type, event = {}) {
      return listeners.get(type)?.(event);
    },
    querySelector(selector) {
      if (selector === '.media-lightbox-share') return null;
      if (selector === 'video') return null;
      return null;
    },
    querySelectorAll() {
      return [];
    },
    closest() {
      return null;
    }
  };
}

function createHarness(overrides = {}) {
  const calls = [];
  let uploadedFiles = overrides.uploadedFiles ?? [];
  let sidebarOpen = overrides.sidebarOpen ?? false;
  const body = createNode();
  const inputWrapper = createNode();
  const createdNodes = [];
  const document = {
    body,
    fullscreenElement: null,
    createElement: () => {
      const node = createNode();
      createdNodes.push(node);
      return node;
    },
    querySelector(selector) {
      if (selector === '.input-wrapper') return inputWrapper;
      return null;
    },
    addEventListener: noop,
    removeEventListener: noop
  };
  class FileReaderFake {
    readAsDataURL(file) {
      this.onload?.({ target: { result: file.dataUrl || 'data:text/plain;base64,SGVsbG8=' } });
    }
  }
  const elements = {
    modalSearchInput: { value: 'hello' },
    modalSearchScopeSelect: { value: 'keyword-all' },
    searchResultsContainer: createNode(),
    searchModal: createNode(),
    openSearchBtn: createNode(),
    filePreviewContainer: createNode(),
    sidebar: createNode(),
    sidebarOverlay: createNode(),
    appContainer: createNode()
  };
  const config = { uiLanguage: 'en' };
  const conversations = overrides.conversations ?? [{
    id: 'conv-1',
    title: 'Hello chat',
    archived: false,
    deletedAt: null,
    isTemporary: false,
    messages: [{ role: 'user', parts: [{ text: 'This body says hello.' }] }]
  }];
  const lifecycle = createLegacySearchUploadSidebarLifecycle({
    window: { innerWidth: overrides.innerWidth ?? 1280 },
    document,
    navigator: {},
    fetch: async () => ({ blob: async () => ({}) }),
    File: class {},
    FileReaderCtor: FileReaderFake,
    ImageCtor: class {},
    elements,
    getConfig: () => config,
    getConversations: () => conversations,
    getUploadedFiles: () => uploadedFiles,
    setUploadedFiles: (files) => {
      calls.push(['setUploadedFiles', files.map((file) => file.name)]);
      uploadedFiles = files;
      return uploadedFiles;
    },
    getSidebarOpen: () => sidebarOpen,
    setSidebarOpen: (next) => {
      calls.push(['setSidebarOpen', next]);
      sidebarOpen = next;
      return sidebarOpen;
    },
    escapeHTML: (value) => String(value),
    renderUserText: (value) => value,
    renderMarkdownWithFormulas: (value) => value,
    loadChat: (...args) => calls.push(['loadChat', ...args]),
    toggleModal: (...args) => calls.push(['toggleModal', ...args]),
    callApiWithSchema: async () => [{ keyword: 'hello', weight: 10 }],
    resolveUploadUpdateInputState: () => calls.push(['updateInputState']),
    i18n: { en: { searchPrompt: 'Search', searching: 'Searching', noResultsFound: 'No results', view: 'View' } },
    randomUUID: () => 'file-id',
    scheduleTimeout: (callback) => {
      calls.push(['scheduleTimeout']);
      return callback;
    },
    clearScheduledTimeout: (timer) => calls.push(['clearScheduledTimeout', timer]),
    logger: { warn: (...args) => calls.push(['warn', ...args]) },
    ...overrides
  });
  return {
    calls,
    createdNodes,
    document,
    elements,
    inputWrapper,
    get uploadedFiles() {
      return uploadedFiles;
    },
    get sidebarOpen() {
      return sidebarOpen;
    },
    lifecycle
  };
}

test('factory is inert on import and validates required dependencies', () => {
  assert.throws(
    () => createLegacySearchUploadSidebarLifecycle(),
    /missing dependency: document/
  );
});

test('factory exposes search, upload, and sidebar lifecycle functions', () => {
  const { lifecycle } = createHarness();
  for (const name of [
    'performSearchAndRenderResults',
    'generateSearchKeywords',
    'calculateRelevanceScores',
    'renderFilePreviews',
    'removeFile',
    'handleFileSelection',
    'toggleSidebar'
  ]) {
    assert.equal(typeof lifecycle[name], 'function', `${name} should be exposed`);
  }
});

test('search path uses live conversations and closes sidebar through owner-local toggle', async () => {
  const harness = createHarness();
  await harness.lifecycle.performSearchAndRenderResults();

  assert.equal(harness.elements.searchResultsContainer.children.length, 1);
  const resultMarkup = harness.elements.searchResultsContainer.children[0].innerHTML;
  assert.match(resultMarkup, /conversation-search-chat-icon/);
  assert.match(resultMarkup, /l-.55 2.35 2.48-.88/);
  assert.doesNotMatch(resultMarkup, /L2 22/);
  harness.elements.searchResultsContainer.children[0].dispatch('click');
  assert.deepEqual(harness.calls.filter((call) => call[0] === 'loadChat'), [['loadChat', 'conv-1']]);
  assert.ok(harness.calls.some((call) => call[0] === 'setSidebarOpen' && call[1] === false));
  assert.ok(harness.calls.some((call) => call[0] === 'toggleModal' && call[1] === harness.elements.searchModal && call[2] === false));
});

test('search only includes conversations that have entered history', async () => {
  const searchable = {
    id: 'ready',
    title: 'Hello ready',
    archived: false,
    deletedAt: null,
    isTemporary: false,
    messages: [{ role: 'user', parts: [{ text: 'hello' }] }]
  };
  const excluded = [
    { ...searchable, id: 'temporary', title: 'Hello temporary', isTemporary: true },
    { ...searchable, id: 'archived', title: 'Hello archived', archived: true },
    { ...searchable, id: 'deleted', title: 'Hello deleted', deletedAt: '2026-07-30T00:00:00.000Z' }
  ];
  const harness = createHarness({ conversations: [searchable, ...excluded] });

  await harness.lifecycle.performSearchAndRenderResults();

  assert.equal(harness.elements.searchResultsContainer.children.length, 1);
  assert.equal(harness.elements.searchResultsContainer.children[0].dataset.id, 'ready');
});

test('title search keeps history-visible conversations searchable without message content', async () => {
  const harness = createHarness({
    conversations: [{
      id: 'metadata-only',
      title: 'Hello metadata',
      archived: false,
      deletedAt: null,
      isTemporary: false
    }]
  });
  harness.elements.modalSearchScopeSelect.value = 'keyword-title';

  await harness.lifecycle.performSearchAndRenderResults();

  assert.equal(harness.elements.searchResultsContainer.children.length, 1);
  assert.equal(harness.elements.searchResultsContainer.children[0].dataset.id, 'metadata-only');
});

test('natural search keeps ranking internal and renders the conversation icon without relevance labels', async () => {
  const harness = createHarness();
  harness.elements.modalSearchScopeSelect.value = 'natural';

  await harness.lifecycle.performSearchAndRenderResults();

  assert.equal(harness.elements.searchResultsContainer.children.length, 1);
  const resultMarkup = harness.elements.searchResultsContainer.children[0].innerHTML;
  assert.match(resultMarkup, /conversation-search-chat-icon/);
  assert.doesNotMatch(resultMarkup, /conversation-search-relevance|高相關|中相關|低相關/);
});

test('upload path uses live uploadedFiles bridge and preview callback', async () => {
  const harness = createHarness();
  const event = {
    target: {
      files: [{ name: 'note.txt', type: 'text/plain', size: 5 }],
      value: 'selected'
    }
  };

  harness.lifecycle.handleFileSelection(event);
  await Promise.resolve();

  assert.equal(event.target.value, '');
  assert.deepEqual(harness.uploadedFiles.map((file) => file.name), ['note.txt']);
  assert.ok(harness.calls.some((call) => call[0] === 'updateInputState'));
  assert.equal(harness.elements.filePreviewContainer.children.length, 1);
});

test('toggleSidebar preserves desktop and mobile class behavior through injected state', () => {
  const desktop = createHarness({ innerWidth: 1280 });
  desktop.lifecycle.toggleSidebar();
  assert.equal(desktop.sidebarOpen, true);
  assert.equal(desktop.elements.appContainer.classList.contains('sidebar-open'), true);
  desktop.lifecycle.toggleSidebar(false);
  assert.equal(desktop.elements.appContainer.classList.contains('sidebar-open'), false);

  const mobile = createHarness({ innerWidth: 390 });
  mobile.lifecycle.toggleSidebar(true);
  assert.equal(mobile.elements.sidebar.style.transform, 'translateX(0)');
  assert.equal(mobile.elements.sidebarOverlay.classList.contains('visible'), true);
  mobile.lifecycle.toggleSidebar(false);
  assert.equal(mobile.elements.sidebar.style.transform, 'translateX(-100%)');
  assert.equal(mobile.elements.sidebarOverlay.classList.contains('visible'), false);
});

test('module has no fragment or virtual runtime dependency', () => {
  const source = readSource('src/app/runtime/legacy-core/search-upload-sidebar-lifecycle.js');
  assert.doesNotMatch(source, /legacy-runtime\/fragments|virtual:legacy-app-runtime/);
});
