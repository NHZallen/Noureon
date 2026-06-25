import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createLegacyTrashLifecycle } from '../src/app/runtime/features/trash-lifecycle.js';

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const assertMarkersInOrder = (source, markers) => {
  let lastIndex = -1;
  for (const marker of markers) {
    const index = source.indexOf(marker, lastIndex + 1);
    assert.notEqual(index, -1, `Missing marker: ${marker}`);
    assert.ok(index > lastIndex, `Marker out of order: ${marker}`);
    lastIndex = index;
  }
};

function createNode() {
  const listeners = new Map();
  const classes = new Set();
  return {
    innerHTML: '',
    textContent: '',
    disabled: false,
    dataset: {},
    children: [],
    classList: {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      contains: (name) => classes.has(name)
    },
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
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    }
  };
}

function createHarness(overrides = {}) {
  let conversations = overrides.conversations || [];
  const calls = [];
  const elements = {
    trashListContainer: createNode(),
    emptyTrashBtn: createNode(),
    trashBatchSelectBtn: createNode(),
    trashViewTitle: createNode(),
    trashViewContent: createNode(),
    trashViewModal: createNode(),
    trashBatchActionBar: createNode(),
    trashSelectionCount: createNode(),
    trashBatchRestoreBtn: createNode(),
    trashBatchDeleteBtn: createNode()
  };
  const document = {
    createElement: () => createNode()
  };
  const lifecycle = createLegacyTrashLifecycle({
    document,
    navigator: {},
    fetch: async () => {},
    File: class {},
    elements,
    getConversations: () => conversations,
    replaceConversations: (nextConversations) => {
      calls.push(['replaceConversations', nextConversations]);
      conversations = nextConversations;
      return conversations;
    },
    saveAppData: async () => calls.push(['saveAppData']),
    getI18n: () => ({
      'zh-TW': {
        confirmPermanentDelete: 'confirm permanent',
        permanentDeleteTitle: 'permanent title',
        itemPermanentlyDeleted: 'deleted',
        confirmBatchPermanentDelete: 'confirm batch',
        batchPermanentlyDeletedSuccess: 'batch deleted',
        confirmEmptyTrash: 'confirm empty',
        emptyTrashConfirmationTitle: 'empty title',
        trashEmptiedSuccess: 'emptied',
        items: 'items'
      }
    }),
    getUiLanguage: () => 'zh-TW',
    showCustomConfirm: async (...args) => {
      calls.push(['confirm', ...args]);
      return true;
    },
    showNotification: (...args) => calls.push(['notification', ...args]),
    showCoordinatedNotification: (...args) => calls.push(['coordinatedNotification', ...args]),
    toggleModal: (...args) => calls.push(['toggleModal', ...args]),
    formatFullTimestamp: value => String(value),
    renderUserText: value => String(value),
    renderModelText: value => String(value),
    escapeHTML: value => String(value),
    scheduleTimeout: callback => callback(),
    clearScheduledTimeout: () => {},
    createChangeEvent: () => ({ type: 'change' })
  });

  return {
    lifecycle,
    calls,
    elements,
    getConversations: () => conversations,
    setConversations: next => {
      conversations = next;
    }
  };
}

test('factory exports the complete trash lifecycle API', () => {
  const { lifecycle } = createHarness();

  assert.deepEqual(Object.keys(lifecycle), [
    'renderTrash',
    'handleRestoreTrashItem',
    'handleDeleteTrashItemPermanently',
    'showTrashItemInViewModal',
    'toggleTrashSelectionMode',
    'renderTrashBatchActionBar',
    'handleBatchRestoreFromTrash',
    'handleBatchDeleteFromTrash',
    'handleEmptyTrash'
  ]);
});

test('renderTrash reads live conversations and preserves empty and list states', () => {
  const harness = createHarness();

  harness.lifecycle.renderTrash();
  assert.match(harness.elements.trashListContainer.innerHTML, /垃圾桶是空的/);
  assert.equal(harness.elements.emptyTrashBtn.disabled, true);
  assert.equal(harness.elements.trashBatchSelectBtn.disabled, true);

  harness.setConversations([{
    id: 'deleted',
    title: 'Deleted chat',
    deletedAt: '2026-06-25T00:00:00.000Z',
    messages: []
  }]);
  harness.lifecycle.renderTrash();

  assert.equal(harness.elements.emptyTrashBtn.disabled, false);
  assert.equal(harness.elements.trashBatchSelectBtn.disabled, false);
  assert.equal(harness.elements.trashListContainer.children.length, 1);
  assert.match(harness.elements.trashListContainer.children[0].innerHTML, /Deleted chat/);
});

test('single restore mutates the live conversation before save, render, and notification', async () => {
  const conversation = { id: 'deleted', deletedAt: '2026-06-25T00:00:00.000Z' };
  const harness = createHarness({ conversations: [conversation] });

  await harness.lifecycle.handleRestoreTrashItem('deleted');

  assert.equal(conversation.deletedAt, null);
  assert.deepEqual(harness.calls, [
    ['saveAppData'],
    ['coordinatedNotification', '項目已還原。', 'success']
  ]);
});

test('single permanent delete preserves confirm, replace, save, render, and notification order', async () => {
  const kept = { id: 'keep', deletedAt: null };
  const harness = createHarness({
    conversations: [{ id: 'delete', deletedAt: '2026-06-25T00:00:00.000Z' }, kept]
  });

  await harness.lifecycle.handleDeleteTrashItemPermanently('delete');

  assert.deepEqual(harness.getConversations(), [kept]);
  assert.deepEqual(harness.calls.map(call => call[0]), [
    'confirm',
    'replaceConversations',
    'saveAppData',
    'notification'
  ]);
  assert.equal(harness.calls[1][1], harness.getConversations());
});

test('empty trash counts before replacement and preserves save and notification order', async () => {
  const kept = { id: 'keep', deletedAt: null };
  const harness = createHarness({
    conversations: [
      { id: 'one', deletedAt: '2026-06-25T00:00:00.000Z' },
      { id: 'two', deletedAt: '2026-06-24T00:00:00.000Z' },
      kept
    ]
  });

  await harness.lifecycle.handleEmptyTrash();

  assert.deepEqual(harness.getConversations(), [kept]);
  assert.deepEqual(harness.calls.map(call => call[0]), [
    'confirm',
    'replaceConversations',
    'saveAppData',
    'notification'
  ]);
  assert.match(harness.calls.at(-1)[1], /2/);
});

test('batch restore and delete preserve selection, persistence, and notification ordering', () => {
  const source = readSource('src/app/runtime/features/trash-lifecycle.js');

  assertMarkersInOrder(source, [
    'const handleBatchRestoreFromTrash = async () => {',
    'const count = selectedTrashIds.size',
    'selectedTrashIds.forEach(id => {',
    'conversation.deletedAt = null',
    'await saveAppData()',
    'toggleTrashSelectionMode()',
    'showCoordinatedNotification('
  ]);
  assertMarkersInOrder(source, [
    'const handleBatchDeleteFromTrash = async () => {',
    'const count = selectedTrashIds.size',
    'await showCustomConfirm(',
    'replaceConversations(',
    'getConversations().filter(conversation => !selectedTrashIds.has(conversation.id))',
    'await saveAppData()',
    'toggleTrashSelectionMode()',
    'showNotification('
  ]);
});

test('selection state stays internal and drives list and batch action rendering', () => {
  const harness = createHarness({
    conversations: [{
      id: 'deleted',
      title: 'Deleted chat',
      deletedAt: '2026-06-25T00:00:00.000Z',
      messages: []
    }]
  });

  harness.lifecycle.toggleTrashSelectionMode();

  assert.match(harness.elements.trashListContainer.children[0].innerHTML, /trash-select-checkbox/);
  assert.equal(harness.elements.trashBatchActionBar.classList.contains('hidden'), false);
  assert.equal(harness.elements.trashBatchRestoreBtn.disabled, true);
  assert.equal(harness.elements.trashBatchDeleteBtn.disabled, true);
});

test('trash conversation view uses the composed renderer and opens the modal', () => {
  const harness = createHarness({
    conversations: [{
      id: 'deleted',
      title: 'Deleted chat',
      deletedAt: '2026-06-25T00:00:00.000Z',
      messages: []
    }]
  });

  harness.lifecycle.showTrashItemInViewModal('deleted');

  assert.equal(harness.elements.trashViewTitle.textContent, 'Deleted chat');
  assert.match(harness.elements.trashViewContent.innerHTML, /此對話沒有訊息/);
  assert.deepEqual(harness.calls, [['toggleModal', harness.elements.trashViewModal, true]]);
});

test('trash lifecycle keeps media attachment, preview, and conversation view composition', () => {
  const source = readSource('src/app/runtime/features/trash-lifecycle.js');

  assert.match(source, /createMediaAttachmentRenderer\(\{\s*escapeHTML\s*\}\)/);
  assert.match(source, /createMediaPreviewLifecycle\(\{/);
  assert.match(source, /getUiLanguage/);
  assert.match(source, /createConversationViewRenderer\(\{/);
  assert.match(source, /renderConversationMessages\(\{/);
});

test('trash lifecycle has no storage, auth, import, P2P, startup, or runtime entry ownership', () => {
  const source = readSource('src/app/runtime/features/trash-lifecycle.js');

  assert.match(source, /export\s+function\s+createLegacyTrashLifecycle/);
  assert.doesNotMatch(
    source,
    /legacy-runtime\/fragments|virtual:legacy-app-runtime|storage-adapter|runtime-app|indexedDB|localStorage|sessionStorage|currentUser|loadConfig|loadAppData|initChatApp|initializeApp|Peer|P2P|JSZip/
  );
});
