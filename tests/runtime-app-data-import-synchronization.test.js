import assert from 'node:assert/strict';
import test from 'node:test';

import { createRuntimeAppDataStore } from '../src/app/runtime/kernel/app-data-store.js';
import { createImportExportLifecycle } from '../src/app/runtime/features/import-export-lifecycle.js';
import { createAuthImportLifecycle } from '../src/app/runtime/features/auth-import-lifecycle.js';

// The imports replace the workspace through the app data store (kernel/app-data-store.js), as the workspace features wire them:
// every group is replaced at once, the chunks are pushed into the store's new arrays, and the store is saved before the page moves on.

const fakeElement = () => ({
  value: '', files: [], disabled: false, textContent: '', style: {}, dataset: {},
  classList: { add() {}, remove() {}, contains: () => false },
  addEventListener() {}, setAttribute() {}, removeAttribute() {}
});
const elementsProxy = () => new Proxy({}, { get: (elements, name) => (elements[name] ||= fakeElement()) });
const jsonFile = (data) => ({ name: 'backup.json', type: 'application/json', text: async () => JSON.stringify(data) });
const ids = (items) => items.map((item) => item.id);

function createStoreHarness(initial = {}) {
  const store = createRuntimeAppDataStore({
    initialConversations: initial.conversations || [{ id: 'before' }],
    initialFolders: [{ id: 'folder-before' }],
    initialAstras: [{ id: 'noura-before' }],
    initialPersonalMemories: [{ id: 'memory-before' }]
  });
  const steps = [];
  const groups = () => {
    const { conversations, folders, astras, personalMemories } = store.getSnapshot();
    return { conversations: ids(conversations), folders: ids(folders), astras: ids(astras), personalMemories: ids(personalMemories) };
  };
  const storeDependencies = {
    getConversations: () => store.getConversations(),
    getFolders: () => store.getFolders(),
    getAstras: () => store.getAstras(),
    getPersonalMemories: () => store.getPersonalMemories(),
    replaceAllAppData: (next) => store.replaceAll(next),
    replaceFolders: (next) => store.replaceFolders(next),
    replacePersonalMemories: (next) => store.replacePersonalMemories(next),
    processInChunks: async (items, processItem) => {
      for (const item of items) await processItem(item);
    },
    getBackupUsername: (rawData) => rawData?.backup_identity?.username || '',
    saveAppData: async () => steps.push(['saveAppData', groups()]),
    saveConfig: async () => steps.push(['saveConfig', groups()]),
    showNotification: (message, type) => steps.push(['notification', type]),
    toggleModal: () => steps.push(['toggleModal']),
    delay: async () => {},
    logger: { warn: (message) => steps.push(['warn', message]), error: () => {} },
    i18n: { en: {} }
  };
  return { store, steps, groups, storeDependencies };
}

function createImport({ file, user = { username: 'alice' }, confirm = true, JSZip, ...overrides } = {}) {
  const harness = createStoreHarness(overrides.initial);
  const config = { uiLanguage: 'en' };
  const elements = elementsProxy();
  if (file) elements.importFileInput.files = [file];
  const lifecycle = createImportExportLifecycle({
    ...harness.storeDependencies,
    elements,
    JSZip,
    getCurrentUser: () => user,
    getConfig: () => config,
    mutateConfig: (mutator) => mutator(config),
    showCustomConfirm: async () => confirm,
    applyUiTheme: () => harness.steps.push(['applyUiTheme']),
    applyLanguage: (language) => harness.steps.push(['applyLanguage', language]),
    resolveSearchSetupSettingsModal: () => {},
    loadChat: (id) => harness.steps.push(['loadChat', id]),
    startNewChat: () => harness.steps.push(['startNewChat']),
    ...overrides.dependencies
  });
  return { ...harness, config, elements, lifecycle };
}

test('performImport replaces every group in the store, saves it, then applies and saves the settings', async () => {
  const harness = createImport();

  await harness.lifecycle.performImport({
    conversations: [{ id: 'c1' }],
    astras: [{ id: 'n1' }],
    settings: { uiLanguage: 'fr' }
  });

  const imported = { conversations: ['c1'], folders: [], astras: ['n1'], personalMemories: [] };
  assert.deepEqual(harness.steps, [['saveAppData', imported], ['saveConfig', imported]]);
  assert.equal(harness.config.uiLanguage, 'fr');
});

test('performImport without a signed-in user changes nothing', async () => {
  const harness = createImport({ user: null });
  const before = harness.groups();

  await assert.rejects(harness.lifecycle.performImport({ conversations: [{ id: 'c1' }] }));

  assert.deepEqual(harness.groups(), before);
  assert.deepEqual(harness.steps, []);
});

test('handleImport clears the store, saves the settings, fills the new arrays, saves, and only then moves the page on', async () => {
  const harness = createImport({
    file: jsonFile({
      backup_identity: { username: 'alice' },
      settings: { uiLanguage: 'fr' },
      astras: [{ id: 'n1' }],
      folders: [{ id: 'f1' }],
      personalMemories: [{ id: 'm1' }],
      conversations: [
        { id: 'archived', archived: true, messages: [] },
        { id: 'trashed', deletedAt: '2026-01-01', messages: [] },
        { id: 'open', messages: [] }
      ]
    })
  });
  const replacedArrays = [];
  const replaceAll = harness.store.replaceAll;
  harness.store.replaceAll = (next) => {
    replacedArrays.push(next.conversations);
    return replaceAll(next);
  };

  await harness.lifecycle.handleImport();

  const empty = { conversations: [], folders: [], astras: [], personalMemories: [] };
  const imported = { conversations: ['archived', 'trashed', 'open'], folders: ['f1'], astras: ['n1'], personalMemories: ['m1'] };
  assert.deepEqual(harness.steps, [
    ['saveConfig', empty],
    ['saveAppData', imported],
    ['toggleModal'],
    ['notification', 'success'],
    ['applyUiTheme'],
    ['applyLanguage', 'fr'],
    ['loadChat', 'open']
  ]);
  assert.equal(harness.store.getConversations(), replacedArrays[0], 'conversations are pushed into the array the store holds');
});

test('handleImport starts a new chat when no imported conversation is open', async () => {
  const harness = createImport({
    file: jsonFile({ backup_identity: { username: 'alice' }, conversations: [{ id: 'archived', archived: true, messages: [] }] })
  });

  await harness.lifecycle.handleImport();

  assert.deepEqual(harness.steps.at(-1), ['startNewChat']);
});

test('handleImport leaves the store as it was when the person declines', async () => {
  const harness = createImport({ confirm: false, file: jsonFile({ conversations: [{ id: 'c1', messages: [] }] }) });
  const before = harness.groups();

  await harness.lifecycle.handleImport();

  assert.deepEqual(harness.groups(), before);
  assert.deepEqual(harness.steps, [['notification', 'info']]);
});

test('handleImport keeps a Noura whose picture cannot be restored, without it', async () => {
  class FakeZip {
    static async loadAsync() {
      return new FakeZip();
    }

    constructor() {
      this.files = {};
    }

    file(name) {
      if (name === 'data.json') {
        const data = { backup_identity: { username: 'alice' }, astras: [{ id: 'n1', _avatarZipRef: 'images/n1.png' }] };
        return { async: async () => JSON.stringify(data) };
      }
      return { async: async () => { throw new Error('damaged entry'); } };
    }
  }
  const harness = createImport({ JSZip: FakeZip, file: { name: 'backup.zip', type: 'application/zip' } });

  await harness.lifecycle.handleImport();

  assert.deepEqual(ids(harness.store.getAstras()), ['n1']);
  assert.equal(harness.store.getAstras()[0].avatarUrl, undefined);
  assert.ok(harness.steps.some(([step]) => step === 'warn'));
  assert.ok(harness.steps.some(([step, type]) => step === 'notification' && type === 'success'));
});

test('handleImport does not roll back what was imported when saving fails', async () => {
  const harness = createImport({
    file: jsonFile({ backup_identity: { username: 'alice' }, conversations: [{ id: 'c1', messages: [] }] }),
    dependencies: { saveAppData: async () => { throw new Error('disk full'); } }
  });

  await harness.lifecycle.handleImport();

  assert.deepEqual(ids(harness.store.getConversations()), ['c1']);
  assert.deepEqual(harness.steps.at(-1), ['notification', 'error']);
  assert.equal(harness.elements.importPercentage.textContent, '0%');
  assert.equal(harness.elements.confirmImportBtn.disabled, false);
});

function createAuthImport({ rawData, ...overrides }) {
  const harness = createStoreHarness();
  const config = { uiLanguage: 'en' };
  const elements = elementsProxy();
  elements.usernameInput.value = 'alice';
  elements.passwordInput.value = 'secret';
  elements.importFileInputAuth.files = [jsonFile(rawData)];
  const lifecycle = createAuthImportLifecycle({
    ...harness.storeDependencies,
    elements,
    getConfig: () => config,
    mutateConfig: (mutator) => mutator(config),
    setCurrentUser: (user) => user,
    createPasswordRecord: async (username) => ({ username }),
    getUserKey: (username) => `chatUser_${username}`,
    setItem: async (key) => harness.steps.push(['setItem', key, harness.groups().conversations]),
    requestAnimationFrame: (callback) => callback(),
    scheduleTimeout: () => {},
    initChatApp: () => harness.steps.push(['initChatApp']),
    ...overrides
  });
  return { ...harness, config, elements, lifecycle };
}

test('processAuthImport saves the user first, then replaces the store, saves it, then the settings, then opens the app', async () => {
  const harness = createAuthImport({
    rawData: { backup_identity: { username: 'alice' }, settings: { uiLanguage: 'fr' }, conversations: [{ id: 'c1', messages: [] }] }
  });

  await harness.lifecycle.processAuthImport();

  const imported = { conversations: ['c1'], folders: [], astras: [], personalMemories: [] };
  assert.deepEqual(harness.steps, [
    ['setItem', 'chatUser_alice', ['before']],
    ['setItem', 'chat_lastUser', ['before']],
    ['saveAppData', imported],
    ['saveConfig', imported],
    ['toggleModal'],
    ['initChatApp'],
    ['notification', 'success']
  ]);
  assert.equal(harness.config.uiLanguage, 'fr');
});

test('processAuthImport does not roll back what was imported when saving fails', async () => {
  const harness = createAuthImport({
    rawData: { backup_identity: { username: 'alice' }, conversations: [{ id: 'c1', messages: [] }] },
    saveAppData: async () => { throw new Error('disk full'); }
  });

  await harness.lifecycle.processAuthImport();

  assert.deepEqual(ids(harness.store.getConversations()), ['c1']);
  assert.deepEqual(harness.steps.at(-1), ['notification', 'error']);
  assert.equal(harness.elements.confirmImportBtnAuth.disabled, false);
  assert.equal(harness.steps.some(([step]) => step === 'initChatApp'), false);
});
