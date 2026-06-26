import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createLegacyModelMemoryDashboardLifecycle } from '../src/app/runtime/legacy-core/model-memory-dashboard-lifecycle.js';

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

function createDetailsElement() {
  const content = {
    children: [],
    innerHTML: '',
    appendChild(child) {
      this.children.push(child);
    }
  };
  return {
    open: false,
    style: {},
    className: '',
    innerHTML: '',
    querySelector(selector) {
      if (selector === '.collapsible-content') return content;
      if (selector === 'summary') return { textContent: '' };
      return null;
    }
  };
}

function createHarness(overrides = {}) {
  const calls = [];
  const settingsContent = { scrollTop: 14 };
  const modelManagementList = {
    children: [],
    innerHTML: '',
    closest: () => settingsContent,
    querySelectorAll: () => [],
    appendChild(child) {
      this.children.push(child);
    }
  };
  const memoryCheckboxHandlers = [];
  const memoryDeleteHandlers = [];
  const personalMemoryList = {
    children: [],
    innerHTML: '',
    appendChild(child) {
      this.children.push(child);
    },
    querySelectorAll(selector) {
      if (selector === '.memory-enabled-checkbox') {
        return [{
          dataset: { id: 'memory-1' },
          addEventListener: (_event, handler) => memoryCheckboxHandlers.push(handler)
        }];
      }
      if (selector === '.delete-memory-btn') {
        return [{
          dataset: { id: 'memory-1' },
          addEventListener: (_event, handler) => memoryDeleteHandlers.push(handler)
        }];
      }
      return [];
    }
  };
  const elements = {
    modelManagementList,
    personalMemoryList,
    settingsModal: { classList: createClassList() },
    apiKeyWarningBadge: { classList: createClassList() },
    dataDashboardModal: { classList: createClassList() },
    totalConvStat: { textContent: '' },
    totalFolderStat: { textContent: '' },
    mostUsedModelStat: { textContent: '' }
  };
  const document = {
    createElement: (tag) => tag === 'details'
      ? createDetailsElement()
      : {
          className: '',
          innerHTML: '',
          dataset: {},
          addEventListener: noop,
          querySelector: () => null,
          querySelectorAll: () => []
        },
    getElementById: () => null
  };
  const config = {
    uiLanguage: 'zh-TW',
    defaultModel: 'model-a',
    modelSettings: [
      { id: 'model-a', order: 0, hidden: false },
      { id: 'model-b', order: 1, hidden: false }
    ]
  };
  let personalMemories = [
    { id: 'memory-1', content: 'Remember tea', enabled: true },
    { id: 'memory-2', content: 'Remember stars', enabled: true }
  ];
  const conversations = [
    { id: 'c1', model: 'model-a', deletedAt: null },
    { id: 'c2', model: 'model-b', deletedAt: null }
  ];
  const folders = [{ id: 'f1' }];
  const base = {
    Chart: class {},
    document,
    requestAnimationFrame: (callback) => callback(),
    crypto: { randomUUID: () => 'memory-new' },
    elements,
    getConfig: () => config,
    getConversations: () => conversations,
    getFolders: () => folders,
    getPersonalMemories: () => personalMemories,
    replacePersonalMemories(next) {
      calls.push(['replacePersonalMemories', next.map((memory) => memory.id)]);
      personalMemories = next;
      return personalMemories;
    },
    models: [
      { id: 'model-a', name: 'Model A', provider: 'gemini' },
      { id: 'model-b', name: 'Model B', provider: 'gemini' }
    ],
    i18n: { 'zh-TW': {} },
    getModelTiers: () => ['free'],
    getModelApiId: (model) => model.id,
    saveConfig: async () => calls.push(['saveConfig']),
    saveAppData: async () => calls.push(['saveAppData']),
    runtimeDialogCoordinator: {
      showNotification: (...args) => calls.push(['runtimeDialogCoordinator.showNotification', ...args])
    },
    showNotification: (...args) => calls.push(['showNotification', ...args]),
    showCustomConfirm: async () => true,
    toggleModal: (...args) => calls.push(['toggleModal', ...args]),
    callApiWithSchema: async () => [],
    getActiveConversation: () => conversations[0],
    normalizeConversationModel: (conversation) => base.models.find((model) => model.id === conversation.model),
    isCouncilEnabled: () => false,
    getCouncilValidation: () => ({ reason: '' }),
    getApiKeyForProvider: () => '',
    setupTimeAnalysis: () => calls.push(['setupTimeAnalysis']),
    console
  };
  const lifecycle = createLegacyModelMemoryDashboardLifecycle({ ...base, ...overrides });
  return {
    calls,
    config,
    elements,
    get personalMemories() {
      return personalMemories;
    },
    memoryDeleteHandlers,
    memoryCheckboxHandlers,
    lifecycle
  };
}

test('factory is inert on import and validates required dependencies', () => {
  assert.throws(
    () => createLegacyModelMemoryDashboardLifecycle(),
    /missing dependencies: document, elements/
  );
});

test('factory exposes model, memory, and dashboard lifecycle functions', () => {
  const { lifecycle } = createHarness();
  for (const name of [
    'renderModelManagementUI',
    'moveModelOrder',
    'renderPersonalMemoryList',
    'extractPersonalMemory',
    'updateApiKeyWarningBadge',
    'openDashboard',
    'renderModelUsageChart'
  ]) {
    assert.equal(typeof lifecycle[name], 'function', `${name} should be exposed`);
  }
});

test('model management render path uses injected config and model data', () => {
  const { elements, lifecycle } = createHarness();
  lifecycle.renderModelManagementUI();
  assert.equal(elements.modelManagementList.children.length, 1);
  assert.match(elements.modelManagementList.children[0].innerHTML, /collapsible-summary/);
});

test('model order path saves config, rerenders, and notifies in legacy order', async () => {
  const { calls, config, lifecycle } = createHarness();
  await lifecycle.moveModelOrder('model-b', 'up');
  assert.deepEqual(config.modelSettings.map((setting) => setting.id), ['model-b', 'model-a']);
  assert.deepEqual(calls.map((call) => call[0]), [
    'saveConfig',
    'runtimeDialogCoordinator.showNotification'
  ]);
});

test('personal memory delete uses injected replacement bridge before save and rerender', async () => {
  const harness = createHarness();
  const { calls, lifecycle, memoryDeleteHandlers } = harness;
  lifecycle.renderPersonalMemoryList();
  assert.equal(memoryDeleteHandlers.length, 1);
  await memoryDeleteHandlers[0]({ currentTarget: { dataset: { id: 'memory-1' } } });
  assert.deepEqual(harness.personalMemories.map((memory) => memory.id), ['memory-2']);
  assert.deepEqual(calls.map((call) => call[0]), [
    'replacePersonalMemories',
    'saveAppData'
  ]);
});

test('openDashboard updates stats and delegates to setupTimeAnalysis before opening modal', () => {
  const { calls, elements, lifecycle } = createHarness();
  lifecycle.openDashboard();
  assert.equal(elements.totalConvStat.textContent, 2);
  assert.equal(elements.totalFolderStat.textContent, 1);
  assert.equal(elements.mostUsedModelStat.textContent, 'Model B');
  assert.deepEqual(calls.map((call) => call[0]), ['setupTimeAnalysis', 'toggleModal']);
});

test('model memory dashboard module does not import fragments or virtual runtime', () => {
  const source = readSource('src/app/runtime/legacy-core/model-memory-dashboard-lifecycle.js');
  assert.match(source, /export\s+function\s+createLegacyModelMemoryDashboardLifecycle/);
  assert.doesNotMatch(source, /legacy-runtime\/fragments|virtual:legacy-app-runtime/);
});
