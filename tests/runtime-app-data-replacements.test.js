import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createLegacyRuntimeAppDataStore } from '../src/app/runtime/kernel/app-data-store.js';
import { createLiveConversationsBridge } from '../src/app/runtime/kernel/live-conversations-bridge.js';
import { createShellState } from '../src/app/runtime/legacy-core/shell-state.js';
import { createLegacyTrashLifecycle } from '../src/app/runtime/features/trash-lifecycle.js';
import { createLegacyFolderLifecycle } from '../src/app/runtime/features/folder-lifecycle.js';
import { createDom } from './behaviours/helpers/create-dom.js';

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// The workspace data is the store's own (kernel/app-data-store.js), read and replaced through its named functions; the features take
// those functions, and the conversations go through the live bridge (kernel/live-conversations-bridge.js), as legacy-core.js wires them.
// Elsewhere: loading in tests/workspace-load.test.js; new, deleted and archived conversations in tests/conversation-actions.test.js; the
// imports in tests/runtime-app-data-import-synchronization.test.js; deleting a Noura in tests/runtime-sidebar-chat-astra-render-lifecycle.test.js;
// subscribing in the Noura store in tests/mobile-context-menus.test.js; deleting a memory in tests/runtime-model-memory-dashboard-lifecycle.test.js;
// the retired virtual runtime and the kernel boundaries in tests/retired-code.test.js.

function createWorkspace(conversations, folders = []) {
  const store = createLegacyRuntimeAppDataStore({ initialConversations: conversations, initialFolders: folders });
  const bridge = createLiveConversationsBridge({
    getConversations: () => store.getConversations(),
    replaceConversations: (next) => store.replaceConversations(next)
  });
  const steps = [];
  const conversationIds = () => store.getSnapshot().conversations.map((conversation) => conversation.id);
  return { store, bridge, steps, conversationIds };
}

function createTrash(workspace, document, overrides = {}) {
  const { store, bridge, steps, conversationIds } = workspace;
  const element = (tag = 'div') => document.body.appendChild(document.createElement(tag));
  const elements = {
    trashListContainer: element(),
    emptyTrashBtn: element('button'),
    trashBatchSelectBtn: element('button'),
    trashBatchActionBar: element(),
    trashSelectionCount: element(),
    trashBatchRestoreBtn: element('button'),
    trashBatchDeleteBtn: element('button')
  };
  const trash = createLegacyTrashLifecycle({
    document,
    elements,
    getConversations: () => bridge.getConversations(),
    replaceConversations: (next) => {
      steps.push('replace');
      return bridge.replaceConversations(next);
    },
    saveAppData: async () => steps.push(['save', conversationIds()]),
    renderSidebar: () => steps.push('renderSidebar'),
    getI18n: () => ({ en: {} }),
    getUiLanguage: () => 'en',
    showCustomConfirm: async () => true,
    showNotification: (message, type) => steps.push(['notify', type]),
    showCoordinatedNotification: (message, type) => steps.push(['notify', type]),
    deleteConversationsFromCloud: async (ids, options) => steps.push(['cloud', ids, options.conversations.map((item) => item.id)]),
    formatFullTimestamp: String,
    escapeHTML: String,
    scheduleTimeout: () => 0,
    clearScheduledTimeout: () => {},
    createChangeEvent: () => new document.defaultView.Event('change'),
    ...overrides
  });
  const listed = () => [...elements.trashListContainer.querySelectorAll('.trash-item')].map((item) => item.dataset.id);
  return { trash, elements, listed, store };
}

// Boundary: the composition root keeps no copy of the workspace data of its own; the store owns the pointers.
test('legacy core keeps no local app data mirrors', () => {
  assert.doesNotMatch(
    readSource('src/app/runtime/legacy-core/legacy-core.js'),
    /let\s+(?:conversations|folders|astras|personalMemories|activeConversationId)\s*=|syncLegacyMirror|createConversations?Store\b|getAppData:\s*\(\)\s*=>\s*\(\{\s*conversations/
  );
});

// Boundary: the store is made by the kernel (runtime-app.js) and reached through what the composition root hands out.
test('compositions take the app data store instead of importing it', () => {
  for (const path of [
    'src/app/runtime/legacy-core/legacy-core.js',
    'src/app/runtime/legacy-core/workspace-features.js',
    'src/app/runtime/legacy-core/page-features.js',
    'src/app/runtime-entry.js'
  ]) {
    assert.doesNotMatch(readSource(path), /app-data-store\.js|createLegacyRuntimeAppDataStore/, path);
  }
});

test('the shell state holds none of the workspace data', () => {
  const names = Object.values(createShellState()).flatMap((store) => Object.keys(store));

  assert.ok(names.length > 0);
  assert.deepEqual(
    names.filter((name) => /^(?:get|set|replace)(?:Conversations|Folders|Astras|PersonalMemories|MemoryState|AppData)$/.test(name)),
    []
  );
});

test('a replace through the live bridge is what the store holds and what every reader sees next', () => {
  const { store, bridge } = createWorkspace([{ id: 'a' }]);
  const next = [{ id: 'b' }];

  assert.equal(bridge.replaceConversations(next), next);
  assert.equal(store.getConversations(), next);
  assert.equal(bridge.getConversations(), next);
  assert.equal(store.getSnapshot().conversations, next);

  store.replaceConversations([{ id: 'c' }]);
  assert.deepEqual(bridge.getConversations(), [{ id: 'c' }], 'the bridge holds no copy');
});

test('deleting from the trash replaces the store before it is saved, then renders and says so', async () => {
  const { document, cleanup } = createDom();
  try {
    const workspace = createWorkspace([{ id: 'gone', deletedAt: '2026-01-01' }, { id: 'kept', deletedAt: null }]);
    const { trash } = createTrash(workspace, document);

    await trash.handleDeleteTrashItemPermanently('gone');

    assert.deepEqual(workspace.steps, [
      ['cloud', ['gone'], ['gone']],
      'replace',
      ['save', ['kept']],
      'renderSidebar',
      ['notify', 'success']
    ]);
  } finally {
    cleanup();
  }
});

test('deleting the selected trash items removes only those, from the store, before saving', async () => {
  const { document, cleanup } = createDom();
  try {
    const workspace = createWorkspace([
      { id: 'one', title: 'One', deletedAt: '2026-01-01' },
      { id: 'two', title: 'Two', deletedAt: '2026-01-02' },
      { id: 'live', title: 'Live', deletedAt: null }
    ]);
    const { trash, elements, listed } = createTrash(workspace, document);
    trash.toggleTrashSelectionMode();
    assert.deepEqual(listed(), ['two', 'one']);
    const checkbox = elements.trashListContainer.querySelector('.trash-select-checkbox[data-id="one"]');
    checkbox.checked = true;
    checkbox.dispatchEvent(new document.defaultView.Event('change'));

    await trash.handleBatchDeleteFromTrash();

    assert.deepEqual(workspace.steps, [
      ['cloud', ['one'], ['one']],
      'replace',
      ['save', ['two', 'live']],
      'renderSidebar',
      ['notify', 'success']
    ]);
    assert.equal(elements.trashBatchActionBar.classList.contains('hidden'), true, 'the selection mode ends');
    assert.equal(elements.trashListContainer.querySelector('.trash-select-checkbox'), null);
  } finally {
    cleanup();
  }
});

test('emptying the trash keeps the live conversations and the list it shows follows the store', async () => {
  const { document, cleanup } = createDom();
  try {
    const workspace = createWorkspace([
      { id: 'one', deletedAt: '2026-01-01' },
      { id: 'live', deletedAt: null },
      { id: 'two', deletedAt: '2026-01-02' }
    ]);
    const { trash, listed } = createTrash(workspace, document);

    await trash.handleEmptyTrash();

    assert.deepEqual(workspace.steps, [
      ['cloud', ['one', 'two'], ['one', 'two']],
      'replace',
      ['save', ['live']],
      'renderSidebar',
      ['notify', 'success']
    ]);
    assert.deepEqual(listed(), []);
  } finally {
    cleanup();
  }
});

test('the trash keeps the store as it was when the cloud deletion fails', async () => {
  const { document, cleanup } = createDom();
  try {
    const workspace = createWorkspace([{ id: 'gone', deletedAt: '2026-01-01' }]);
    const before = workspace.store.getConversations();
    const { trash } = createTrash(workspace, document, {
      deleteConversationsFromCloud: async () => { throw new Error('offline'); },
      logger: { warn() {}, error() {} }
    });

    await trash.handleEmptyTrash();

    assert.equal(workspace.store.getConversations(), before);
    assert.deepEqual(workspace.steps, [['notify', 'error']]);
  } finally {
    cleanup();
  }
});

test('deleting a folder unfiles its conversations, replaces the folders in the store, then saves and renders', async () => {
  const workspace = createWorkspace(
    [{ id: 'filed', folderId: 'f1' }, { id: 'other', folderId: 'f2' }],
    [{ id: 'f1', conversationIds: ['filed'] }, { id: 'f2', conversationIds: ['other'] }]
  );
  const { store, steps } = workspace;
  const folders = createLegacyFolderLifecycle({
    getFolders: () => store.getFolders(),
    getConversations: () => workspace.bridge.getConversations(),
    replaceFolders: (next) => store.replaceFolders(next),
    saveAppData: async () => steps.push(['save', store.getSnapshot()]),
    deleteFolderFromCloud: async (id) => steps.push(['cloud', id]),
    renderSidebar: () => steps.push('renderSidebar'),
    showCustomConfirm: async () => true,
    showNotification: (message, type) => steps.push(['notify', type]),
    getI18n: () => ({ en: {} }),
    getUiLanguage: () => 'en'
  });

  await folders.deleteFolder('f1');

  const [saved] = steps.filter((step) => step[0] === 'save');
  assert.deepEqual(saved[1].folders.map((folder) => folder.id), ['f2']);
  assert.deepEqual(saved[1].conversations.map((conversation) => conversation.folderId), [null, 'f2']);
  assert.deepEqual(steps.map((step) => (Array.isArray(step) ? step[0] : step)), ['cloud', 'save', 'renderSidebar', 'notify']);
});
