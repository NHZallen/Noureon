import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Window } from 'happy-dom';

import { createLegacyTrashLifecycle } from '../src/app/runtime/features/trash-lifecycle.js';

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// A trash panel on a real DOM (happy-dom), so selection works through the checkboxes the person clicks.
function createDomHarness(conversations) {
  const window = new Window();
  const { document } = window;
  const calls = [];
  const make = (tag = 'div') => document.createElement(tag);
  const elements = Object.fromEntries(['trashListContainer', 'emptyTrashBtn', 'trashBatchSelectBtn', 'trashViewTitle', 'trashViewContent', 'trashViewModal', 'trashBatchActionBar', 'trashSelectionCount', 'trashBatchRestoreBtn', 'trashBatchDeleteBtn'].map((name) => [name, make(name.endsWith('Btn') ? 'button' : 'div')]));
  document.body.appendChild(elements.trashListContainer);
  let live = conversations;
  const lifecycle = createLegacyTrashLifecycle({
    document,
    navigator: {},
    fetch: async () => {},
    File: class {},
    elements,
    getConversations: () => live,
    replaceConversations: (next) => {
      calls.push(['replaceConversations', next.map((conversation) => conversation.id)]);
      live = next;
      return live;
    },
    saveAppData: async (...args) => calls.push(['saveAppData', ...args]),
    renderAll: () => {},
    renderSidebar: () => calls.push(['renderSidebar']),
    getI18n: () => ({ 'zh-TW': { items: 'items' } }),
    getUiLanguage: () => 'zh-TW',
    showCustomConfirm: async () => {
      calls.push(['confirm']);
      return true;
    },
    showNotification: (...args) => calls.push(['notification', ...args]),
    showCoordinatedNotification: (...args) => calls.push(['coordinatedNotification', ...args]),
    deleteConversationsFromCloud: async (ids, options) => calls.push(['deleteConversationsFromCloud', ids, options.conversations.map((conversation) => conversation.id)]),
    invalidateConversationMemory: async ({ conversationId }) => calls.push(['invalidate', conversationId]),
    rebuildHistoryIndex: async () => calls.push(['rebuild']),
    toggleModal: (...args) => calls.push(['toggleModal', ...args]),
    formatFullTimestamp: (value) => String(value),
    renderUserText: (value) => `U:${value}`,
    renderModelText: (value) => `M:${value}`,
    escapeHTML: (value) => String(value),
    scheduleTimeout: () => 0,
    clearScheduledTimeout: () => {},
    createChangeEvent: () => new window.Event('change')
  });
  const selectRow = (id) => elements.trashListContainer
    .querySelector(`.trash-item[data-id="${id}"] .pz-text`)
    .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const inSelectionMode = () => !elements.trashBatchActionBar.classList.contains('hidden');
  return { window, elements, lifecycle, calls, selectRow, inSelectionMode, getConversations: () => live };
}

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
    saveAppData: async (...args) => calls.push(['saveAppData', ...args]),
    renderAll: () => calls.push(['renderAll']),
    renderSidebar: () => calls.push(['renderSidebar']),
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
    deleteConversationsFromCloud: overrides.deleteConversationsFromCloud || (async (ids, options) => calls.push(['deleteConversationsFromCloud', ids, options])),
    invalidateConversationMemory: overrides.invalidateConversationMemory || (async () => {}),
    rebuildHistoryIndex: overrides.rebuildHistoryIndex || (async () => {}),
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

test('renderTrash escapes imported titles and ids before inserting markup', () => {
  const maliciousTitle = '<img src=x onerror="stealKeys()">安全標題';
  const maliciousId = 'unsafe" onclick="stealKeys()';
  const harness = createHarness({
    conversations: [{
      id: maliciousId,
      title: maliciousTitle,
      deletedAt: '2026-07-14T00:00:00.000Z',
      messages: []
    }]
  });

  harness.lifecycle.renderTrash();

  const markup = harness.elements.trashListContainer.children[0].innerHTML;
  assert.doesNotMatch(markup, /<img\b/i);
  assert.doesNotMatch(markup, /onclick="stealKeys\(\)"/i);
  assert.match(markup, /&lt;img src=x onerror=&quot;stealKeys\(\)&quot;&gt;安全標題/);
  assert.match(markup, /data-id="unsafe&quot; onclick=&quot;stealKeys\(\)"/);
});

test('single restore mutates the live conversation before save, render, and notification', async () => {
  const conversation = {
    id: 'deleted',
    deletedAt: '2026-06-25T00:00:00.000Z',
    lastUpdatedAt: '2026-06-20T00:00:00.000Z'
  };
  const harness = createHarness({ conversations: [conversation] });

  await harness.lifecycle.handleRestoreTrashItem('deleted');

  assert.equal(conversation.deletedAt, null);
  assert.equal(conversation.lastUpdatedAt, '2026-06-20T00:00:00.000Z');
  assert.match(conversation.stateUpdatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(conversation.trashStateUpdatedAt, conversation.stateUpdatedAt);
  assert.deepEqual(harness.calls, [
    ['saveAppData', { immediateCloudSync: true }],
    ['renderSidebar'],
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
    'deleteConversationsFromCloud',
    'replaceConversations',
    'saveAppData',
    'renderSidebar',
    'notification'
  ]);
  assert.deepEqual(harness.calls[1][1], ['delete']);
  assert.deepEqual(harness.calls[1][2], {
    conversations: [{ id: 'delete', deletedAt: '2026-06-25T00:00:00.000Z' }],
    requireSnapshots: true
  });
  assert.equal(harness.calls[2][1], harness.getConversations());
});

test('single permanent delete keeps local trash when cloud deletion fails', async () => {
  const deleted = { id: 'delete', deletedAt: '2026-06-25T00:00:00.000Z' };
  const harness = createHarness({
    conversations: [deleted],
    deleteConversationsFromCloud: async (ids, options) => {
      harness.calls.push(['deleteConversationsFromCloud', ids, options]);
      throw new Error('cloud down');
    }
  });

  await harness.lifecycle.handleDeleteTrashItemPermanently('delete');

  assert.deepEqual(harness.getConversations(), [deleted]);
  assert.deepEqual(harness.calls.map(call => call[0]), [
    'confirm',
    'deleteConversationsFromCloud',
    'notification'
  ]);
  assert.equal(harness.calls[1][2].requireSnapshots, true);
  assert.equal(harness.calls.at(-1)[2], 'error');
});

test('restore rebuilds memory and permanent deletion invalidates it', async () => {
  const memoryCalls = [];
  const restored = { id: 'restore', deletedAt: '2026-06-25T00:00:00.000Z' };
  const restoreHarness = createHarness({
    conversations: [restored],
    rebuildHistoryIndex: async () => memoryCalls.push(['rebuild'])
  });
  await restoreHarness.lifecycle.handleRestoreTrashItem('restore');

  const deleteHarness = createHarness({
    conversations: [{ id: 'delete', deletedAt: '2026-06-25T00:00:00.000Z' }],
    invalidateConversationMemory: async options => memoryCalls.push(['invalidate', options.conversationId])
  });
  await deleteHarness.lifecycle.handleDeleteTrashItemPermanently('delete');

  assert.deepEqual(memoryCalls, [['rebuild'], ['invalidate', 'delete']]);
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
    'deleteConversationsFromCloud',
    'replaceConversations',
    'saveAppData',
    'renderSidebar',
    'notification'
  ]);
  assert.deepEqual(harness.calls[1][1], ['one', 'two']);
  assert.deepEqual(harness.calls[1][2].conversations.map(conversation => conversation.id), ['one', 'two']);
  assert.equal(harness.calls[1][2].requireSnapshots, true);
  assert.match(harness.calls.at(-1)[1], /2/);
});

test('empty trash keeps local rows when cloud deletion fails', async () => {
  const one = { id: 'one', deletedAt: '2026-06-25T00:00:00.000Z' };
  const harness = createHarness({
    conversations: [one],
    deleteConversationsFromCloud: async (ids, options) => {
      harness.calls.push(['deleteConversationsFromCloud', ids, options]);
      throw new Error('cloud down');
    }
  });

  await harness.lifecycle.handleEmptyTrash();

  assert.deepEqual(harness.getConversations(), [one]);
  assert.deepEqual(harness.calls.map(call => call[0]), [
    'confirm',
    'deleteConversationsFromCloud',
    'notification'
  ]);
  assert.equal(harness.calls[1][2].requireSnapshots, true);
  assert.equal(harness.calls.at(-1)[2], 'error');
});

test('batch restore restores the selected rows, saves, leaves selection mode, then notifies', async () => {
  const harness = createDomHarness([
    { id: 'one', title: 'One', deletedAt: '2026-06-25T00:00:00.000Z', messages: [] },
    { id: 'two', title: 'Two', deletedAt: '2026-06-24T00:00:00.000Z', messages: [] },
    { id: 'three', title: 'Three', deletedAt: '2026-06-23T00:00:00.000Z', messages: [] }
  ]);
  try {
    // Nothing selected: nothing happens.
    harness.lifecycle.toggleTrashSelectionMode();
    await harness.lifecycle.handleBatchRestoreFromTrash();
    assert.deepEqual(harness.calls, []);

    harness.selectRow('one');
    harness.selectRow('three');
    await harness.lifecycle.handleBatchRestoreFromTrash();

    const [one, two, three] = harness.getConversations();
    assert.equal(one.deletedAt, null);
    assert.equal(two.deletedAt, '2026-06-24T00:00:00.000Z');
    assert.equal(three.deletedAt, null);
    assert.equal(one.trashStateUpdatedAt, one.stateUpdatedAt);
    assert.deepEqual(harness.calls.map((call) => call[0]), ['saveAppData', 'renderSidebar', 'coordinatedNotification', 'rebuild']);
    assert.deepEqual(harness.calls[0][1], { immediateCloudSync: true });
    assert.match(harness.calls[2][1], /2/);
    assert.equal(harness.inSelectionMode(), false);
    assert.equal(harness.elements.trashListContainer.querySelector('.trash-select-checkbox'), null);
  } finally {
    harness.window.close();
  }
});

test('batch delete confirms, deletes in the cloud, then replaces, saves, leaves selection mode and notifies', async () => {
  const harness = createDomHarness([
    { id: 'one', title: 'One', deletedAt: '2026-06-25T00:00:00.000Z', messages: [] },
    { id: 'two', title: 'Two', deletedAt: '2026-06-24T00:00:00.000Z', messages: [] },
    { id: 'kept', title: 'Kept', deletedAt: null, messages: [] }
  ]);
  try {
    harness.lifecycle.toggleTrashSelectionMode();
    harness.selectRow('two');
    await harness.lifecycle.handleBatchDeleteFromTrash();

    assert.deepEqual(harness.getConversations().map((conversation) => conversation.id), ['one', 'kept']);
    assert.deepEqual(harness.calls, [
      ['confirm'],
      ['deleteConversationsFromCloud', ['two'], ['two']],
      ['invalidate', 'two'],
      ['replaceConversations', ['one', 'kept']],
      ['saveAppData'],
      ['renderSidebar'],
      ['notification', harness.calls.at(-1)[1], 'success']
    ]);
    assert.match(harness.calls.at(-1)[1], /1/);
    assert.equal(harness.inSelectionMode(), false);
  } finally {
    harness.window.close();
  }
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

const trashWithPicture = () => createDomHarness([{
  id: 'gone',
  title: 'Gone',
  deletedAt: '2026-06-25T00:00:00.000Z',
  messages: [
    { role: 'user', parts: [{ text: 'hello' }, { inlineData: { mimeType: 'image/png', data: 'AAAA', name: 'cat.png' } }] },
    { role: 'model', parts: [{ text: 'reply' }] }
  ]
}]);

test('the trash view shows the texts through the given renderers and lists the attachments', () => {
  const harness = trashWithPicture();
  try {
    harness.lifecycle.showTrashItemInViewModal('gone');

    const content = harness.elements.trashViewContent;
    assert.equal(content.querySelector('.user-message .message-content').textContent, 'U:hello');
    assert.equal(content.querySelector('.model-message .message-content').textContent, 'M:reply');
    assert.ok(content.querySelector('.user-message [data-media-index="0"]'), 'the attachment is listed');
    assert.deepEqual(harness.calls, [['toggleModal', harness.elements.trashViewModal, true]]);
  } finally {
    harness.window.close();
  }
});

// Found while replacing the source checks (NOU-80): the trash view hands whole parts ({ inlineData }) to the attachment grid,
// which reads mimeType on the part, so a picture shows as an unnamed file row. The archive view unwraps them (mediaMode 'inlineData').
test('the trash view shows an attached picture as a picture', () => {
  const harness = trashWithPicture();
  try {
    harness.lifecycle.showTrashItemInViewModal('gone');
    const thumb = harness.elements.trashViewContent.querySelector('.user-message .message-media-thumb img');
    assert.equal(thumb?.getAttribute('src'), 'data:image/png;base64,AAAA');
    assert.equal(thumb?.getAttribute('alt'), 'cat.png');
  } finally {
    harness.window.close();
  }
});

test('trash lifecycle has no storage, auth, import, P2P, startup, or runtime entry ownership', () => {
  const source = readSource('src/app/runtime/features/trash-lifecycle.js');

  assert.doesNotMatch(
    source,
    /legacy-runtime\/fragments|virtual:legacy-app-runtime|storage-adapter|runtime-app|indexedDB|localStorage|sessionStorage|currentUser|loadConfig|loadAppData|initChatApp|initializeApp|Peer|P2P|JSZip/
  );
});

test('in selection mode a row click toggles its checkbox, and a click on the checkbox itself is not counted twice', () => {
  const harness = createDomHarness([{ id: 'gone', title: 'Gone', deletedAt: '2026-06-25T00:00:00.000Z', messages: [] }]);
  try {
    harness.lifecycle.toggleTrashSelectionMode();
    const row = harness.elements.trashListContainer.querySelector('.trash-item');
    const selected = () => harness.elements.trashSelectionCount.textContent;

    // A click on the row (not on a button) toggles the row's checkbox.
    harness.selectRow('gone');
    assert.equal(row.querySelector('.trash-select-checkbox').checked, true);
    assert.match(selected(), /1/);
    // A click on the checkbox toggles it once (it does not reach the row, which would toggle it back).
    const current = row.querySelector('.trash-select-checkbox');
    current.click();
    assert.equal(current.checked, false);
    assert.match(selected(), /0/);
  } finally {
    harness.window.close();
  }
});
