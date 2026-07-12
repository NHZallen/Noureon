import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createLegacyAuthImportLifecycle } from '../src/app/runtime/features/auth-import-lifecycle.js';

const PNG_1X1_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlXcAAAAASUVORK5CYII=';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

function createClassList() {
  const classes = new Set();
  return {
    add: (...names) => names.forEach((name) => classes.add(name)),
    remove: (...names) => names.forEach((name) => classes.delete(name)),
    contains: (name) => classes.has(name)
  };
}

function createElement(id = '') {
  return {
    id,
    classList: createClassList(),
    disabled: false,
    files: [],
    style: {},
    textContent: '',
    value: '',
    addEventListener(type, handler, options) {
      this.lastListener = { type, handler, options };
    }
  };
}

function createTrackedArray(calls, label) {
  const items = [];
  items.push = (...nextItems) => {
    calls.push([`${label}Push`, nextItems[0]?.id]);
    return Array.prototype.push.apply(items, nextItems);
  };
  return items;
}

function createHarness({
  rawData,
  file,
  username = 'alice',
  password = 'secret',
  config = { uiLanguage: 'en', apiKeys: { keep: 'yes' } },
  sensitiveApiKeys = { ...(config.apiKeys || {}) }
} = {}) {
  const calls = [];
  let currentUser = null;
  let conversations = [];
  let folders = [];
  let astras = [];
  let personalMemories = [];
  const elements = {
    usernameInput: createElement('usernameInput'),
    passwordInput: createElement('passwordInput'),
    importFileInputAuth: createElement('importFileInputAuth'),
    importDataModalAuth: createElement('importDataModalAuth'),
    importProgressContainerAuth: createElement('importProgressContainerAuth'),
    importProgressBarAuth: createElement('importProgressBarAuth'),
    importStatusTextAuth: createElement('importStatusTextAuth'),
    importPercentageAuth: createElement('importPercentageAuth'),
    confirmImportBtnAuth: createElement('confirmImportBtnAuth'),
    authContainer: createElement('authContainer'),
    appContainer: createElement('appContainer')
  };
  elements.usernameInput.value = username;
  elements.passwordInput.value = password;
  elements.confirmImportBtnAuth.textContent = 'Import';
  if (file) {
    elements.importFileInputAuth.files = [file];
  } else if (rawData) {
    elements.importFileInputAuth.files = [{
      name: 'auth-backup.json',
      type: 'application/json',
      async text() {
        return JSON.stringify(rawData);
      }
    }];
  }

  class FakeJSZip {
    constructor() {
      this.files = {};
    }

    file(name) {
      return this.files[name] ?? null;
    }

    static async loadAsync(zipFile) {
      calls.push(['zipLoad', zipFile.name]);
      const zip = new FakeJSZip();
      zip.files['data.json'] = {
        async async(format) {
          assert.equal(format, 'string');
          return zipFile.content;
        }
      };
      zip.files['images/astra.png'] = {
        async async(format) {
          assert.equal(format, 'base64');
          return PNG_1X1_BASE64;
        }
      };
      zip.files['files/message.bin'] = {
        async async(format) {
          assert.equal(format, 'base64');
          return 'MESSAGE_BASE64';
        }
      };
      return zip;
    }
  }

  const lifecycle = createLegacyAuthImportLifecycle({
    elements,
    JSZip: FakeJSZip,
    getConfig: () => config,
    mutateConfig: (mutator) => {
      calls.push(['mutateConfig']);
      if (typeof mutator === 'function') return mutator(config);
      Object.assign(config, mutator);
      return config;
    },
    mergeSensitiveApiKeys: (apiKeys) => {
      calls.push(['mergeSensitiveApiKeys']);
      Object.assign(sensitiveApiKeys, apiKeys);
      return sensitiveApiKeys;
    },
    setCurrentUser: (nextUser) => {
      calls.push(['setCurrentUser', nextUser.username]);
      currentUser = nextUser;
      return currentUser;
    },
    createPasswordRecord: async (nextUsername, nextPassword) => {
      calls.push(['createPasswordRecord', nextUsername, nextPassword]);
      return { username: nextUsername, passwordKdf: 'PBKDF2-SHA-256' };
    },
    getUserKey: (nextUsername) => {
      calls.push(['getUserKey', nextUsername]);
      return `chatUser_${nextUsername}`;
    },
    setItem: async (key, value) => calls.push(['setItem', key, value]),
    replaceAllAppData: (nextData) => {
      calls.push(['replaceAllAppData']);
      conversations = createTrackedArray(calls, 'conversations');
      folders = nextData.folders;
      astras = createTrackedArray(calls, 'astras');
      personalMemories = nextData.personalMemories;
      return { conversations, folders, astras, personalMemories };
    },
    replaceFolders: (nextFolders) => {
      calls.push(['replaceFolders']);
      folders = nextFolders;
      return folders;
    },
    replacePersonalMemories: (nextPersonalMemories) => {
      calls.push(['replacePersonalMemories']);
      personalMemories = nextPersonalMemories;
      return personalMemories;
    },
    saveAppData: async () => calls.push(['saveAppData']),
    saveConfig: async () => calls.push(['saveConfig']),
    saveSensitiveConfig: async () => calls.push(['saveSensitiveConfig']),
    processInChunks: async (items, processFn, chunkSize, onProgress) => {
      for (let index = 0; index < items.length; index += 1) {
        await processFn(items[index]);
        onProgress?.(index + 1, items.length);
      }
    },
    getBackupUsername: (data) => data?.backup_identity?.username || '',
    hashString: async (value) => {
      calls.push(['hashString', value]);
      return `hash:${value}`;
    },
    constantTimeEqual: (left, right) => {
      calls.push(['constantTimeEqual', left, right]);
      return left === right;
    },
    showNotification: (message, type) => calls.push(['notification', type, message]),
    toggleModal: (element, open) => calls.push(['toggleModal', element.id, open]),
    requestAnimationFrame: (callback) => {
      calls.push(['requestAnimationFrame']);
      callback();
    },
    scheduleTimeout: (callback, ms) => {
      calls.push(['scheduleTimeout', ms]);
      callback();
    },
    delay: async (ms) => calls.push(['delay', ms]),
    initChatApp: () => calls.push(['initChatApp']),
    i18n: {
      en: {
        confirmAndImport: 'Confirm and import',
        importAuthMismatch: 'Auth mismatch',
        importFailed: 'Import failed',
        importInvalidFile: 'Invalid import file',
        importSuccess: 'Import success',
        selectFileError: 'Select file'
      }
    },
    logger: {
      error: (...args) => calls.push(['error', ...args]),
      warn: (...args) => calls.push(['warn', ...args])
    }
  });

  return {
    calls,
    config,
    get sensitiveApiKeys() {
      return sensitiveApiKeys;
    },
    elements,
    get currentUser() {
      return currentUser;
    },
    get conversations() {
      return conversations;
    },
    get folders() {
      return folders;
    },
    get astras() {
      return astras;
    },
    get personalMemories() {
      return personalMemories;
    },
    lifecycle
  };
}

test('factory exports the auth import lifecycle API', () => {
  const { lifecycle } = createHarness();

  assert.equal(typeof lifecycle.handleImportOnAuth, 'function');
  assert.equal(typeof lifecycle.processAuthImport, 'function');
});

test('handleImportOnAuth opens the auth import modal through injected toggleModal', () => {
  const { calls, lifecycle } = createHarness();

  lifecycle.handleImportOnAuth();

  assert.deepEqual(calls, [['toggleModal', 'importDataModalAuth', true]]);
});

test('processAuthImport preserves auth persistence, app-data import, config save, transition, and notification order', async () => {
  const rawData = {
    backup_identity: { username: 'alice' },
    user_credentials: { passwordHash: 'hash:secret' },
    astras: [{ id: 'astra-1', _avatarZipRef: 'images/astra.png' }],
    folders: [{ id: 'folder-1' }],
    personalMemories: [{ id: 'memory-1' }],
    conversations: [{
      id: 'conv-1',
      messages: [{
        parts: [{ inlineData: { _zipRef: 'files/message.bin', mimeType: 'application/octet-stream' } }]
      }]
    }],
    settings: { theme: 'light' },
    apiKeys: { imported: 'key' }
  };
  const harness = createHarness({
    file: { name: 'auth-backup.zip', type: 'application/zip', content: JSON.stringify(rawData) }
  });

  await harness.lifecycle.processAuthImport();

  assert.equal(harness.currentUser.username, 'alice');
  assert.equal(harness.astras[0].avatarUrl, `data:image/png;base64,${PNG_1X1_BASE64}`);
  assert.equal(harness.conversations[0].messages[0].parts[0].inlineData.data, 'MESSAGE_BASE64');
  assert.deepEqual(harness.config.apiKeys, { keep: 'yes' });
  assert.deepEqual(harness.sensitiveApiKeys, { keep: 'yes', imported: 'key' });

  const ordered = harness.calls
    .map((call) => call[0] === 'setItem' ? `${call[0]}:${call[1]}` : call[0])
    .filter((name) => [
      'zipLoad',
      'hashString',
      'constantTimeEqual',
      'getUserKey',
      'createPasswordRecord',
      'setCurrentUser',
      'setItem:chatUser_alice',
      'setItem:chat_lastUser',
      'replaceAllAppData',
      'astrasPush',
      'replaceFolders',
      'replacePersonalMemories',
      'conversationsPush',
      'saveAppData',
      'mutateConfig',
      'mergeSensitiveApiKeys',
      'saveSensitiveConfig',
      'saveConfig',
      'toggleModal',
      'requestAnimationFrame',
      'scheduleTimeout',
      'initChatApp',
      'notification'
    ].includes(name));

  assert.deepEqual(ordered, [
    'zipLoad',
    'hashString',
    'constantTimeEqual',
    'getUserKey',
    'createPasswordRecord',
    'setCurrentUser',
    'setItem:chatUser_alice',
    'setItem:chat_lastUser',
    'replaceAllAppData',
    'astrasPush',
    'replaceFolders',
    'replacePersonalMemories',
    'conversationsPush',
    'saveAppData',
    'mutateConfig',
    'mergeSensitiveApiKeys',
    'saveSensitiveConfig',
    'saveConfig',
    'toggleModal',
    'requestAnimationFrame',
    'scheduleTimeout',
    'initChatApp',
    'notification'
  ]);

  const userWrite = harness.calls.find((call) => call[0] === 'setItem' && call[1] === 'chatUser_alice');
  assert.equal(userWrite[2], JSON.stringify({ username: 'alice', passwordKdf: 'PBKDF2-SHA-256' }));
});

test('processAuthImport pushes conversations into the active replaceAll array without mutating stale pointers', async () => {
  const rawData = {
    backup_identity: { username: 'alice' },
    user_credentials: { passwordHash: 'hash:secret' },
    conversations: [{ id: 'conv-1', messages: [] }, { id: 'conv-2', messages: [] }]
  };
  const harness = createHarness({
    file: { name: 'auth-backup.json', type: 'application/json', async text() { return JSON.stringify(rawData); } }
  });
  const staleConversations = harness.conversations;

  await harness.lifecycle.processAuthImport();

  assert.deepEqual(harness.conversations.map((conversation) => conversation.id), ['conv-1', 'conv-2']);
  assert.deepEqual(staleConversations, []);
  assert.ok(harness.calls.some((call) => call[0] === 'replaceAllAppData'));
  assert.deepEqual(
    harness.calls.filter((call) => call[0] === 'conversationsPush').map((call) => call[1]),
    ['conv-1', 'conv-2']
  );
});

test('processAuthImport validates missing files and backup credential mismatch without mutating state', async () => {
  const missingFileHarness = createHarness();
  missingFileHarness.elements.importFileInputAuth.files = [];

  await missingFileHarness.lifecycle.processAuthImport();

  assert.deepEqual(missingFileHarness.calls, [['notification', 'error', 'Select file']]);

  const mismatchHarness = createHarness({
    rawData: {
      backup_identity: { username: 'bob' },
      conversations: []
    }
  });

  await mismatchHarness.lifecycle.processAuthImport();

  assert.equal(mismatchHarness.currentUser, null);
  assert.equal(mismatchHarness.calls.some((call) => call[0] === 'replaceAllAppData'), false);
  assert.equal(mismatchHarness.calls.some((call) => call[0] === 'setItem'), false);
  assert.equal(mismatchHarness.calls.some((call) => call[0] === 'notification' && call[1] === 'error'), true);
});

test('processAuthImport rejects unsafe backup data before hashing or persisting identity', async () => {
  const harness = createHarness({
    file: {
      name: 'unsafe-auth-backup.json',
      type: 'application/json',
      async text() {
        return '{"backup_identity":{"username":"alice"},"user_credentials":{"passwordHash":"hash:secret"},"settings":{"__proto__":{"polluted":true}}}';
      }
    }
  });

  await harness.lifecycle.processAuthImport();

  assert.equal(harness.currentUser, null);
  assert.equal(Object.prototype.polluted, undefined);
  assert.equal(harness.calls.some((call) => call[0] === 'hashString'), false);
  assert.equal(harness.calls.some((call) => call[0] === 'createPasswordRecord'), false);
  assert.equal(harness.calls.some((call) => call[0] === 'setItem'), false);
  assert.equal(harness.calls.some((call) => call[0] === 'replaceAllAppData'), false);
  assert.equal(harness.calls.some((call) => call[0] === 'notification' && call[1] === 'error'), true);
});

test('processAuthImport rejects oversized files before reading or changing identity', async () => {
  let read = false;
  const harness = createHarness({
    file: {
      name: 'oversized-auth-backup.json',
      type: 'application/json',
      size: 10 * 1024 * 1024 + 1,
      async text() {
        read = true;
        return '{}';
      }
    }
  });

  await harness.lifecycle.processAuthImport();

  assert.equal(read, false);
  assert.equal(harness.currentUser, null);
  assert.equal(harness.calls.some((call) => call[0] === 'hashString'), false);
  assert.equal(harness.calls.some((call) => call[0] === 'setItem'), false);
  assert.equal(harness.calls.some((call) => call[0] === 'replaceAllAppData'), false);
});

test('auth import lifecycle module avoids fragments, runtime-app, global auth ownership, and direct currentUser assignment', () => {
  const source = readSource('src/app/runtime/features/auth-import-lifecycle.js');

  assert.doesNotMatch(source, /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-app/);
  assert.doesNotMatch(source, /legacyRuntimeContext|initializeApp|handleLogin|handleLogout/);
  assert.doesNotMatch(source, /(?:^|\n)\s*currentUser\s*=/);
});
