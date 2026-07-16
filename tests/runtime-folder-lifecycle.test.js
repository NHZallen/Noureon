import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createLegacyFolderLifecycle } from '../src/app/runtime/features/folder-lifecycle.js';

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

function createNode() {
  const listeners = new Map();
  const classes = new Set();
  return {
    id: '',
    className: '',
    innerHTML: '',
    textContent: '',
    title: '',
    dataset: {},
    style: {},
    children: [],
    parentElement: null,
    classList: {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      contains: (name) => classes.has(name)
    },
    appendChild(child) {
      child.parentElement = this;
      this.children.push(child);
      return child;
    },
    after() {},
    remove() {
      this.removed = true;
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    dispatch(type, event = {}) {
      return listeners.get(type)?.(event);
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    getBoundingClientRect() {
      return { bottom: 20, left: 10 };
    }
  };
}

function createHarness(overrides = {}) {
  let folders = overrides.folders || [];
  let conversations = overrides.conversations || [];
  const calls = [];
  const textColorOptions = createNode();
  const colorTitle = createNode();
  const colorSwatchesContainer = createNode();
  colorSwatchesContainer.parentElement = {
    querySelector: () => colorTitle
  };
  const iconOptionsContainer = createNode();
  iconOptionsContainer.parentElement = { after: () => {} };
  const folderSettingsModal = createNode();
  const body = createNode();
  const nodesById = new Map([
    ['text-color-container', createNode()],
    ['text-color-options', textColorOptions]
  ]);
  const document = {
    body,
    createElement: () => createNode(),
    getElementById: (id) => nodesById.get(id) || null
  };
  const elements = {
    colorSwatchesContainer,
    iconOptionsContainer,
    folderSettingsModal
  };

  const lifecycle = createLegacyFolderLifecycle({
    document,
    elements,
    getFolders: () => folders,
    getConversations: () => conversations,
    replaceFolders: (nextFolders) => {
      calls.push(['replaceFolders', nextFolders]);
      folders = nextFolders;
      return folders;
    },
    getDefaultFolder: () => ({ color: 'gray', icon: 'default', textColor: 'gray', isOpen: false }),
    saveAppData: async (...args) => {
      calls.push(['saveAppData', ...args]);
    },
    deferConversationFolderSync: (...args) => calls.push(['deferConversationFolderSync', ...args]),
    deleteFolderFromCloud: overrides.deleteFolderFromCloud || (async (...args) => calls.push(['deleteFolderFromCloud', ...args])),
    renderFolders: () => calls.push(['renderFolders']),
    renderAll: () => calls.push(['renderAll']),
    renderSidebar: () => calls.push(['renderSidebar']),
    showCustomConfirm: async (...args) => {
      calls.push(['confirm', ...args]);
      return true;
    },
    showNotification: (...args) => calls.push(['notification', ...args]),
    toggleModal: (...args) => calls.push(['toggleModal', ...args]),
    showRenameModal: (...args) => calls.push(['showRenameModal', ...args]),
    folderColors: { gray: '#64748b', blue: '#3b82f6' },
    folderIconOptions: { default: '<path />', star: '<star />' },
    normalizeFolderColorSelection: (value) => value,
    getI18n: () => ({
      'zh-TW': {
        confirmDeleteFolderWithChats: 'delete with chats',
        confirmDeleteEmptyFolder: 'delete empty',
        deleteFolderTitle: 'delete folder',
        folderDeleted: 'folder deleted',
        rename: 'rename',
        customize: 'customize',
        deleteFolder: 'delete'
      }
    }),
    getUiLanguage: () => 'zh-TW',
    randomUUID: () => 'folder-id',
    scheduleAnimationFrame: (callback) => callback(),
    logger: {
      error: (...args) => calls.push(['error', ...args]),
      warn: (...args) => calls.push(['warn', ...args])
    }
  });

  return {
    lifecycle,
    calls,
    document,
    elements,
    textColorOptions,
    getFolders: () => folders,
    setFolders: (next) => { folders = next; },
    getConversations: () => conversations,
    setConversations: (next) => { conversations = next; }
  };
}

test('factory exports the complete folder lifecycle API', () => {
  const { lifecycle } = createHarness();

  assert.deepEqual(Object.keys(lifecycle), [
    'createNewFolder',
    'moveConversationToFolder',
    'deleteFolder',
    'showFolderSettingsModal',
    'handleSaveFolderSettings',
    'createFolderMenu'
  ]);
});

test('createNewFolder preserves defaults, identity sync, save, and render order', async () => {
  const harness = createHarness();

  assert.equal(harness.lifecycle.createNewFolder('Projects'), 'folder-id');
  await Promise.resolve();

  const folders = harness.getFolders();
  assert.deepEqual(folders, [{
    id: 'folder-id',
    name: 'Projects',
    conversationIds: [],
    color: 'gray',
    icon: 'default',
    textColor: 'gray',
    isOpen: false
  }]);
  assert.equal(harness.calls[0][0], 'replaceFolders');
  assert.equal(harness.calls[0][1], folders);
  assert.deepEqual(harness.calls.slice(1, 3), [['saveAppData'], ['renderFolders']]);
});

test('moveConversationToFolder reads live arrays and preserves save-render ordering', async () => {
  const harness = createHarness();
  const firstFolder = { id: 'old', conversationIds: ['conv'] };
  const secondFolder = { id: 'new', conversationIds: [] };
  const conversation = { id: 'conv', folderId: 'old' };
  harness.setFolders([firstFolder, secondFolder]);
  harness.setConversations([conversation]);

  await harness.lifecycle.moveConversationToFolder('conv', 'new');

  assert.deepEqual(firstFolder.conversationIds, []);
  assert.deepEqual(secondFolder.conversationIds, ['conv']);
  assert.equal(conversation.folderId, 'new');
  assert.deepEqual(harness.calls, [
    ['deferConversationFolderSync', 'conv'],
    ['saveAppData'],
    ['renderSidebar']
  ]);
});

test('moveConversationToFolder uses the latest conversations pointer after replacement', async () => {
  const staleConversation = { id: 'stale', folderId: null };
  const activeConversation = { id: 'conv', folderId: null };
  const folder = { id: 'new', conversationIds: [] };
  const harness = createHarness({
    folders: [folder],
    conversations: [staleConversation]
  });
  const staleConversations = harness.getConversations();

  harness.setConversations([activeConversation]);
  await harness.lifecycle.moveConversationToFolder('conv', 'new');

  assert.equal(activeConversation.folderId, 'new');
  assert.deepEqual(folder.conversationIds, ['conv']);
  assert.deepEqual(staleConversations, [staleConversation]);
  assert.equal(staleConversation.folderId, null);
  assert.deepEqual(harness.calls, [
    ['deferConversationFolderSync', 'conv'],
    ['saveAppData'],
    ['renderSidebar']
  ]);
});

test('deleteFolder clears linked conversations before replacement and persistence', async () => {
  const folder = { id: 'folder', conversationIds: ['conv'] };
  const linkedConversation = { id: 'conv', folderId: 'folder' };
  const otherConversation = { id: 'other', folderId: null };
  const harness = createHarness({
    folders: [folder, { id: 'keep', conversationIds: [] }],
    conversations: [linkedConversation, otherConversation]
  });

  await harness.lifecycle.deleteFolder('folder', { stopPropagation: () => harness.calls.push(['stop']) });

  assert.equal(linkedConversation.folderId, null);
  assert.deepEqual(harness.getFolders(), [{ id: 'keep', conversationIds: [] }]);
  assert.deepEqual(harness.calls.map(call => call[0]), [
    'stop',
    'confirm',
    'deleteFolderFromCloud',
    'replaceFolders',
    'saveAppData',
    'renderSidebar',
    'notification'
  ]);
  assert.deepEqual(harness.calls[2].slice(1), ['folder', { folder }]);
  assert.equal(harness.calls[3][1], harness.getFolders());
});

test('deleteFolder keeps local data when durable cloud deletion fails', async () => {
  const folder = { id: 'folder', conversationIds: ['conv'] };
  const linkedConversation = { id: 'conv', folderId: 'folder' };
  const harness = createHarness({
    folders: [folder],
    conversations: [linkedConversation],
    deleteFolderFromCloud: async () => { throw new Error('cloud down'); }
  });

  await harness.lifecycle.deleteFolder('folder');

  assert.deepEqual(harness.getFolders(), [folder]);
  assert.equal(linkedConversation.folderId, 'folder');
  assert.equal(harness.calls.some(call => call[0] === 'replaceFolders'), false);
  assert.equal(harness.calls.some(call => call[0] === 'saveAppData'), false);
  assert.equal(harness.calls.some(call => call[0] === 'warn'), true);
  assert.equal(harness.calls.some(call => call[0] === 'notification' && call[2] === 'error'), true);
});

test('settings lifecycle keeps folderToCustomize internal and saves the latest live folder', async () => {
  const original = { id: 'folder', color: 'gray', icon: 'default', textColor: 'gray' };
  const harness = createHarness({ folders: [original] });

  harness.lifecycle.showFolderSettingsModal('folder', { stopPropagation() {} });
  const latest = { id: 'folder', color: 'gray', icon: 'default', textColor: 'gray' };
  harness.setFolders([latest]);
  harness.elements.colorSwatchesContainer.querySelector = () => ({ dataset: { color: 'blue' } });
  harness.elements.iconOptionsContainer.querySelector = () => ({ dataset: { icon: 'star' } });
  harness.textColorOptions.querySelector = () => ({ dataset: { textColor: 'white' } });
  harness.calls.length = 0;

  await harness.lifecycle.handleSaveFolderSettings();

  assert.deepEqual(latest, {
    id: 'folder',
    color: 'blue',
    icon: 'star',
    textColor: 'white'
  });
  assert.deepEqual(harness.calls.map(call => call[0]), [
    'replaceFolders',
    'saveAppData',
    'renderFolders',
    'toggleModal'
  ]);
  assert.equal(harness.calls[0][1], harness.getFolders());
});

test('folder menu keeps rename, customize, and delete command wiring', () => {
  const source = readSource('src/app/runtime/features/folder-lifecycle.js');

  assert.match(source, /querySelector\('\.rename-folder-btn'\)\.addEventListener\('click'/);
  assert.match(source, /showRenameModal\(folderId,\s*'folder',\s*event\)/);
  assert.match(source, /querySelector\('\.customize-folder-btn'\)\.addEventListener\('click'/);
  assert.match(source, /showFolderSettingsModal\(folderId,\s*event\)/);
  assert.match(source, /querySelector\('\.delete-folder-btn'\)\.addEventListener\('click'/);
  assert.match(source, /deleteFolder\(folderId,\s*event\)/);
  assert.match(source, /scheduleAnimationFrame\(\(\)\s*=>\s*popover\.classList\.add\('visible'\)\)/);
});

test('folder lifecycle has no storage, auth, import, P2P, startup, or runtime entry ownership', () => {
  const source = readSource('src/app/runtime/features/folder-lifecycle.js');

  assert.match(source, /export\s+function\s+createLegacyFolderLifecycle/);
  assert.doesNotMatch(
    source,
    /legacy-runtime\/fragments|virtual:legacy-app-runtime|storage-adapter|runtime-app|indexedDB|localStorage|sessionStorage|currentUser|loadConfig|loadAppData|initChatApp|initializeApp|Peer|P2P|JSZip/
  );
  assert.doesNotMatch(source, /globalThis\.document|window\.document/);
});
