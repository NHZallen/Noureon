import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createLegacyBatchImportVoiceLifecycle } from '../src/app/runtime/legacy-core/batch-import-voice-lifecycle.js';

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const noop = () => {};

function createClassList() {
  const values = new Set();
  return {
    values,
    add: (...names) => names.forEach((name) => values.add(name)),
    remove: (...names) => names.forEach((name) => values.delete(name)),
    contains: (name) => values.has(name),
    toggle(name, force) {
      const enabled = force ?? !values.has(name);
      if (enabled) values.add(name);
      else values.delete(name);
    }
  };
}

function createNode() {
  const listeners = new Map();
  return {
    dataset: {},
    style: {},
    textContent: '',
    innerHTML: '',
    className: '',
    classList: createClassList(),
    children: [],
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    dispatch(type, event = {}) {
      return listeners.get(type)?.(event);
    },
    querySelectorAll(selector) {
      if (selector === 'button[data-folder-id]') {
        return this.children.filter((child) => child.dataset && Object.hasOwn(child.dataset, 'folderId'));
      }
      return [];
    }
  };
}

function createHarness(overrides = {}) {
  const calls = [];
  let currentUser = null;
  let config = { uiLanguage: 'en', ...(overrides.config || {}) };
  let conversations = overrides.conversations ?? [
    { id: 'c1', archived: false, deletedAt: null },
    { id: 'c2', archived: false, deletedAt: null }
  ];
  let folders = overrides.folders ?? [{ id: 'f1', name: 'Folder One' }];
  let astras = [];
  let personalMemories = [];
  let selectedConversationIds = overrides.selectedConversationIds ?? new Set(['c1']);
  let currentConversationId = overrides.currentConversationId ?? 'c1';
  let currentSpeechRecognition = null;
  let currentVoiceTarget = null;
  const batchMoveFolderList = createNode();
  const elements = {
    batchMoveFolderList,
    batchMoveModal: createNode(),
    voiceInputBtnMessage: createNode(),
    voiceInputBtnSearch: createNode(),
    messageInput: createNode(),
    modalSearchInput: createNode()
  };
  const document = {
    createElement: () => createNode()
  };
  const base = {
    document,
    window: {},
    navigator: {},
    URL: {},
    File: class {},
    JSZip: class {},
    elements,
    legacyRuntimeContext: {
      resolveBinding(name) {
        calls.push(['resolveBinding', name]);
        return noop;
      }
    },
    getConfig: () => config,
    getSensitiveApiKeys: () => ({ gemini: 'sensitive-gemini-key' }),
    mutateConfig: (mutator) => {
      if (typeof mutator === 'function') return mutator(config);
      Object.assign(config, mutator);
      return config;
    },
    mergeSensitiveApiKeys: (...args) => calls.push(['mergeSensitiveApiKeys', ...args]),
    getCurrentUser: () => currentUser,
    setCurrentUser: (nextUser) => {
      currentUser = nextUser;
      return currentUser;
    },
    getConversations: () => conversations,
    getFolders: () => folders,
    getAstras: () => astras,
    getPersonalMemories: () => personalMemories,
    replaceAllAppData: (nextAppData) => {
      calls.push(['replaceAllAppData']);
      conversations = nextAppData.conversations || [];
      folders = nextAppData.folders || [];
      astras = nextAppData.astras || [];
      personalMemories = nextAppData.personalMemories || [];
      return { conversations, folders, astras, personalMemories };
    },
    replaceFolders: (nextFolders) => {
      folders = nextFolders;
      return folders;
    },
    replacePersonalMemories: (nextPersonalMemories) => {
      personalMemories = nextPersonalMemories;
      return personalMemories;
    },
    getSelectedConversationIds: () => selectedConversationIds,
    conversationStateAccess: {
      getCurrentConversationId: () => currentConversationId,
      setCurrentConversationId: (nextId) => {
        calls.push(['setCurrentConversationId', nextId]);
        currentConversationId = nextId;
      }
    },
    runtimeDialogCoordinator: {
      showNotification: (...args) => calls.push(['runtimeDialogCoordinator.showNotification', ...args])
    },
    saveAppData: async (...args) => calls.push(['saveAppData', ...args]),
    saveConfig: async () => calls.push(['saveConfig']),
    saveSensitiveConfig: async () => calls.push(['saveSensitiveConfig']),
    toggleSelectionMode: () => calls.push(['toggleSelectionMode']),
    toggleModal: (...args) => calls.push(['toggleModal', ...args]),
    showNotification: (...args) => calls.push(['showNotification', ...args]),
    showCustomConfirm: async (...args) => {
      calls.push(['showCustomConfirm', ...args]);
      return true;
    },
    showCustomPrompt: async (...args) => {
      calls.push(['showCustomPrompt', ...args]);
      return 'New Folder';
    },
    moveConversationToFolder: (...args) => calls.push(['moveConversationToFolder', ...args]),
    createNewFolder: (name) => {
      calls.push(['createNewFolder', name]);
      return 'new-folder';
    },
    startNewChat: () => calls.push(['startNewChat']),
    processInChunks: async (items, callback) => callback(items),
    getBackupUsername: () => 'user',
    createPasswordRecord: async () => ({}),
    getUserKey: (username) => `chatUser_${username}`,
    setItem: async (...args) => calls.push(['setItem', ...args]),
    hashString: async () => 'hash',
    constantTimeEqual: () => true,
    requestAnimationFrame: (callback) => callback(),
    analyzeImageBrightness: noop,
    getDominantColorPalette: () => [],
    applyCustomWallpaper: noop,
    applyUiTheme: noop,
    applyLanguage: noop,
    setAiBubbleColor: noop,
    setUserBubbleColor: noop,
    loadChat: noop,
    getOutputMode: () => 'text',
    resolveUploadUpdateInputState: () => calls.push(['resolveUploadUpdateInputState']),
    performSearchAndRenderResults: () => calls.push(['performSearchAndRenderResults']),
    getCurrentSpeechRecognition: () => currentSpeechRecognition,
    setCurrentSpeechRecognition: (nextRecognition) => {
      currentSpeechRecognition = nextRecognition;
      calls.push(['setCurrentSpeechRecognition', nextRecognition ? 'recognition' : null]);
      return currentSpeechRecognition;
    },
    setCurrentVoiceTarget: (nextTarget) => {
      currentVoiceTarget = nextTarget;
      calls.push(['setCurrentVoiceTarget', nextTarget]);
      return currentVoiceTarget;
    },
    i18n: { en: {} },
    randomUUID: () => 'id',
    scheduleTimeout: (callback) => callback(),
    delay: async () => {},
    logger: { warn: noop, error: noop, log: noop }
  };
  const lifecycle = createLegacyBatchImportVoiceLifecycle({ ...base, ...overrides });
  return {
    calls,
    elements,
    lifecycle,
    get config() {
      return config;
    },
    get conversations() {
      return conversations;
    },
    get currentConversationId() {
      return currentConversationId;
    },
    get currentSpeechRecognition() {
      return currentSpeechRecognition;
    },
    get currentVoiceTarget() {
      return currentVoiceTarget;
    }
  };
}

test('factory is inert on import and validates required dependencies', () => {
  assert.throws(
    () => createLegacyBatchImportVoiceLifecycle(),
    /missing dependencies: document, window/
  );
});

test('factory exposes batch, import, auth-import, and voice functions', () => {
  const { lifecycle } = createHarness();
  for (const name of [
    'handleBatchDelete',
    'handleBatchArchive',
    'handleBatchMove',
    'renderBatchMoveModal',
    'batchMoveToFolder',
    'handleExport',
    'performImport',
    'handleImport',
    'handleImportOnAuth',
    'processAuthImport',
    'setupVoiceInput',
    'toggleVoiceInput'
  ]) {
    assert.equal(typeof lifecycle[name], 'function', `${name} should be exposed`);
  }
});

test('batch delete uses live selection getters and preserves persistence ordering', async () => {
  const harness = createHarness({
    selectedConversationIds: new Set(['c1', 'c2'])
  });
  await harness.lifecycle.handleBatchDelete();

  assert.equal(harness.conversations[0].deletedAt != null, true);
  assert.equal(harness.conversations[0].stateUpdatedAt, harness.conversations[0].deletedAt);
  assert.equal(harness.conversations[0].trashStateUpdatedAt, harness.conversations[0].deletedAt);
  assert.equal(harness.conversations[0].archived, false);
  assert.equal(harness.conversations[0].lastUpdatedAt, undefined);
  assert.deepEqual(harness.calls.find(call => call[0] === 'saveAppData'), [
    'saveAppData',
    { immediateCloudSync: true }
  ]);
  assert.deepEqual(harness.calls.map((call) => call[0]), [
    'showCustomConfirm',
    'setCurrentConversationId',
    'startNewChat',
    'saveAppData',
    'toggleSelectionMode',
    'showNotification'
  ]);
});

test('batch delete marks every selected conversation as trashed before invalidating its memory', async () => {
  const invalidated = [];
  let allWereTrashed = false;
  let harness;
  harness = createHarness({
    selectedConversationIds: new Set(['c1', 'c2']),
    legacyRuntimeContext: {
      resolveOptionalBinding(name) {
        assert.equal(name, 'memory.invalidateConversation');
        return async ({ conversationId, skipSummaryRebuild }) => {
          invalidated.push([conversationId, skipSummaryRebuild]);
          allWereTrashed = harness.conversations.every(conversation => conversation.deletedAt);
        };
      }
    }
  });

  await harness.lifecycle.handleBatchDelete();

  assert.deepEqual(invalidated, [['c1', true], ['c2', false]]);
  assert.equal(allWereTrashed, true);
  assert.ok(harness.conversations.every(conversation => conversation.deletedAt));
});

test('batch delete falls back to the next live conversation without starting a new chat when possible', async () => {
  const harness = createHarness({
    selectedConversationIds: new Set(['c1']),
    currentConversationId: 'c1',
    conversations: [
      { id: 'c1', archived: false, deletedAt: null },
      { id: 'c2', archived: false, deletedAt: null }
    ]
  });

  await harness.lifecycle.handleBatchDelete();

  assert.equal(harness.conversations[0].deletedAt != null, true);
  assert.equal(harness.conversations[0].stateUpdatedAt, harness.conversations[0].deletedAt);
  assert.equal(harness.conversations[0].trashStateUpdatedAt, harness.conversations[0].deletedAt);
  assert.equal(harness.conversations[0].lastUpdatedAt, undefined);
  assert.equal(harness.currentConversationId, 'c2');
  assert.equal(harness.calls.some((call) => call[0] === 'startNewChat'), false);
  assert.deepEqual(harness.calls.map((call) => call[0]), [
    'showCustomConfirm',
    'setCurrentConversationId',
    'saveAppData',
    'toggleSelectionMode',
    'showNotification'
  ]);
});

test('batch delete clears folder membership before the immediate cloud save', async () => {
  const folder = { id: 'f1', name: 'Folder One', conversationIds: ['c1', 'c2'] };
  const deletedConversation = { id: 'c1', folderId: 'f1', archived: true, deletedAt: null };
  const harness = createHarness({
    selectedConversationIds: new Set(['c1']),
    currentConversationId: 'c2',
    conversations: [deletedConversation, { id: 'c2', folderId: 'f1', archived: false, deletedAt: null }],
    folders: [folder]
  });

  await harness.lifecycle.handleBatchDelete();

  assert.equal(deletedConversation.folderId, null);
  assert.equal(deletedConversation.archived, false);
  assert.deepEqual(folder.conversationIds, ['c2']);
  assert.deepEqual(harness.calls.find(call => call[0] === 'saveAppData'), [
    'saveAppData',
    { immediateCloudSync: true }
  ]);
});

test('batch archive uses runtime dialog notification after save and selection toggle', async () => {
  const harness = createHarness({
    selectedConversationIds: new Set(['c1', 'c2'])
  });
  await harness.lifecycle.handleBatchArchive();

  assert.equal(harness.conversations[0].archived, true);
  assert.deepEqual(harness.calls.map((call) => call[0]), [
    'setCurrentConversationId',
    'startNewChat',
    'saveAppData',
    'toggleSelectionMode',
    'runtimeDialogCoordinator.showNotification'
  ]);
});

test('batch archive falls back to the next unarchived live conversation without stale selection state', async () => {
  const harness = createHarness({
    selectedConversationIds: new Set(['c1']),
    currentConversationId: 'c1',
    conversations: [
      { id: 'c1', archived: false, deletedAt: null },
      { id: 'c2', archived: false, deletedAt: null }
    ]
  });

  await harness.lifecycle.handleBatchArchive();

  assert.equal(harness.conversations[0].archived, true);
  assert.equal(harness.currentConversationId, 'c2');
  assert.equal(harness.calls.some((call) => call[0] === 'startNewChat'), false);
  assert.deepEqual(harness.calls.map((call) => call[0]), [
    'setCurrentConversationId',
    'saveAppData',
    'toggleSelectionMode',
    'runtimeDialogCoordinator.showNotification'
  ]);
});

test('batch move modal and move handoff use injected folder and selection dependencies', async () => {
  const harness = createHarness();
  harness.lifecycle.handleBatchMove();
  assert.ok(harness.calls.some((call) => call[0] === 'toggleModal' && call[2] === true));
  assert.equal(harness.elements.batchMoveFolderList.children.length, 2);

  await harness.lifecycle.batchMoveToFolder('f1');
  assert.ok(harness.calls.some((call) => call[0] === 'moveConversationToFolder' && call[1] === 'c1' && call[2] === 'f1'));
  assert.ok(harness.calls.some((call) => call[0] === 'toggleSelectionMode'));
});

test('single conversation batch move preserves selection mode and routes only the requested id', async () => {
  const harness = createHarness({
    selectedConversationIds: new Set(['c1', 'c2'])
  });
  harness.lifecycle.renderBatchMoveModal('c2');

  await harness.lifecycle.batchMoveToFolder('f1');

  assert.ok(harness.calls.some((call) => call[0] === 'moveConversationToFolder' && call[1] === 'c2' && call[2] === 'f1'));
  assert.equal(harness.calls.some((call) => call[0] === 'moveConversationToFolder' && call[1] === 'c1'), false);
  assert.equal(harness.calls.some((call) => call[0] === 'toggleSelectionMode'), false);
});

class SpeechRecognitionFake {
  start() {
    this.started = true;
  }
  stop() {
    this.stopped = true;
  }
}

// toggleVoiceInput awaits the one-time privacy notice, so let its microtasks settle.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const createVoiceHarness = (config = {}) => createHarness({
  window: { SpeechRecognition: SpeechRecognitionFake },
  config: { voicePrivacyNoticeAcknowledged: true, ...config }
});

test('voice setup and toggle use injected browser and state bridges', async () => {
  const harness = createVoiceHarness();
  harness.lifecycle.setupVoiceInput();
  harness.elements.voiceInputBtnSearch.dispatch('click');
  await settle();
  assert.equal(harness.currentVoiceTarget, 'search');
  assert.ok(harness.currentSpeechRecognition);

  harness.currentSpeechRecognition.onresult({
    resultIndex: 0,
    results: [[{ transcript: 'hello' }]]
  });
  assert.equal(harness.elements.modalSearchInput.value, 'hello');
  assert.ok(harness.calls.some((call) => call[0] === 'performSearchAndRenderResults'));
  assert.ok(harness.calls.some((call) => call[0] === 'resolveUploadUpdateInputState'));

  harness.currentSpeechRecognition.onend();
  assert.equal(harness.currentSpeechRecognition, null);
  assert.equal(harness.currentVoiceTarget, null);
});

test('speech recognition language follows the interface language', async () => {
  const expected = { 'zh-TW': 'zh-TW', en: 'en-US', fr: 'fr-FR', ru: 'ru-RU', es: 'es-ES' };

  for (const [uiLanguage, recognitionLang] of Object.entries(expected)) {
    const harness = createVoiceHarness({ uiLanguage });
    harness.lifecycle.setupVoiceInput();
    harness.elements.voiceInputBtnMessage.dispatch('click');
    await settle();
    assert.equal(harness.currentSpeechRecognition.lang, recognitionLang, uiLanguage);
  }
});

test('switching the interface language applies to the next recognition session', async () => {
  const harness = createVoiceHarness({ uiLanguage: 'en' });
  harness.lifecycle.setupVoiceInput();

  harness.elements.voiceInputBtnMessage.dispatch('click');
  await settle();
  assert.equal(harness.currentSpeechRecognition.lang, 'en-US');
  harness.currentSpeechRecognition.onend();

  harness.config.uiLanguage = 'es';
  harness.elements.voiceInputBtnMessage.dispatch('click');
  await settle();
  assert.equal(harness.currentSpeechRecognition.lang, 'es-ES');
});

test('speech recognition errors are localized and always release the button state', async () => {
  const harness = createHarness({
    window: { SpeechRecognition: SpeechRecognitionFake },
    config: { voicePrivacyNoticeAcknowledged: true },
    i18n: { en: { voiceErrorNotAllowed: 'Microphone blocked', voiceError: 'Voice input error' } }
  });
  harness.lifecycle.setupVoiceInput();
  harness.elements.voiceInputBtnMessage.dispatch('click');
  await settle();

  harness.currentSpeechRecognition.onerror({ error: 'not-allowed' });

  const notification = harness.calls.find((call) => call[0] === 'showNotification');
  assert.equal(notification[1], 'Microphone blocked');
  assert.equal(notification[2], 'error');
  // onend does not always follow onerror, so the button must not stay stuck in the active state.
  assert.equal(harness.currentSpeechRecognition, null);
  assert.equal(harness.currentVoiceTarget, null);
  assert.equal(harness.elements.voiceInputBtnMessage.classList.contains('active'), false);
});

test('an unmapped speech error falls back to the generic localized message', async () => {
  const harness = createHarness({
    window: { SpeechRecognition: SpeechRecognitionFake },
    config: { voicePrivacyNoticeAcknowledged: true },
    i18n: { en: { voiceError: 'Voice input error' } }
  });
  harness.lifecycle.setupVoiceInput();
  harness.elements.voiceInputBtnMessage.dispatch('click');
  await settle();

  harness.currentSpeechRecognition.onerror({ error: 'some-new-code' });

  const notification = harness.calls.find((call) => call[0] === 'showNotification');
  assert.equal(notification[1], 'Voice input error: some-new-code');
});

test('the first voice session asks for privacy consent before starting recognition', async () => {
  const harness = createHarness({
    window: { SpeechRecognition: SpeechRecognitionFake },
    config: { voicePrivacyNoticeAcknowledged: false }
  });
  harness.lifecycle.setupVoiceInput();

  harness.elements.voiceInputBtnMessage.dispatch('click');
  await settle();

  assert.ok(harness.calls.some((call) => call[0] === 'showCustomConfirm'), 'the notice is shown');
  assert.equal(harness.config.voicePrivacyNoticeAcknowledged, true, 'acceptance is persisted');
  assert.ok(harness.calls.some((call) => call[0] === 'saveConfig'));
  assert.ok(harness.currentSpeechRecognition, 'recognition starts after acceptance');

  // A second session must not ask again.
  harness.currentSpeechRecognition.onend();
  const confirmsBefore = harness.calls.filter((call) => call[0] === 'showCustomConfirm').length;
  harness.elements.voiceInputBtnMessage.dispatch('click');
  await settle();
  assert.equal(harness.calls.filter((call) => call[0] === 'showCustomConfirm').length, confirmsBefore);
});

test('a second click during the privacy notice does not start a second recognition', async () => {
  let releaseConfirm;
  const created = [];
  class CountingSpeechRecognition extends SpeechRecognitionFake {
    constructor() {
      super();
      created.push(this);
    }
  }
  const harness = createHarness({
    window: { SpeechRecognition: CountingSpeechRecognition },
    config: { voicePrivacyNoticeAcknowledged: false },
    showCustomConfirm: () => new Promise((resolve) => { releaseConfirm = () => resolve(true); })
  });
  harness.lifecycle.setupVoiceInput();

  // Both clicks land while the notice is still open and no recognition object exists yet.
  harness.elements.voiceInputBtnMessage.dispatch('click');
  harness.elements.voiceInputBtnMessage.dispatch('click');
  await settle();
  assert.equal(created.length, 0, 'nothing starts until the notice is answered');

  releaseConfirm();
  await settle();

  assert.equal(created.length, 1, 'exactly one recognition is created');
  assert.equal(harness.currentSpeechRecognition, created[0], 'the tracked recognition is the one that started');

  // The tracked reference must be stoppable; a leaked second instance would be unreachable.
  harness.elements.voiceInputBtnMessage.dispatch('click');
  await settle();
  assert.equal(created[0].stopped, true);
  assert.equal(created.length, 1, 'stopping does not spawn another recognition');
});

test('declining the voice privacy notice does not start recognition', async () => {
  const harness = createHarness({
    window: { SpeechRecognition: SpeechRecognitionFake },
    config: { voicePrivacyNoticeAcknowledged: false },
    showCustomConfirm: async () => false
  });
  harness.lifecycle.setupVoiceInput();

  harness.elements.voiceInputBtnMessage.dispatch('click');
  await settle();

  assert.equal(harness.currentSpeechRecognition, null, 'no recognition is created');
  assert.equal(harness.config.voicePrivacyNoticeAcknowledged, false, 'the flag stays unset');
});

test('import and auth-import composition remains in real lifecycles and module has no fragment dependency', () => {
  const source = readSource('src/app/runtime/legacy-core/batch-import-voice-lifecycle.js');
  assert.match(source, /createLegacyImportExportLifecycle\(\{/);
  assert.match(source, /createLegacyAuthImportLifecycle\(\{/);
  assert.match(source, /replaceAllAppData,/);
  assert.match(source, /getSensitiveApiKeys,/);
  assert.equal((source.match(/mergeSensitiveApiKeys,/g) || []).length >= 2, true);
  assert.equal((source.match(/saveSensitiveConfig,/g) || []).length >= 2, true);
  assert.match(source, /initChatApp:\s*\(\)\s*=>\s*legacyRuntimeContext\.resolveBinding\('app\.initChatApp'\)\(\)/);
  assert.doesNotMatch(source, /legacy-runtime\/fragments|virtual:legacy-app-runtime/);
});
