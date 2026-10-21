import assert from 'node:assert/strict';
import test from 'node:test';

import { createConversationActions, getDefaultFolder, getDefaultGenConfig } from '../src/app/runtime/legacy-core/conversation-actions.js';
import { MODELS } from '../src/app/runtime/legacy-core/model-registry.js';
import { createDom } from './behaviours/helpers/create-dom.js';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

// The shell around the actions: a store of conversations and folders that hands out a new array on each replace (as the live bridge
// does), and a log of what was saved, drawn and said, in order.
function harness({ conversations = [], folders = [], currentId = null, config = {} } = {}) {
  const log = [];
  let list = conversations;
  let current = currentId;
  const elementsWith = (doc) => ({
    messageInput: { value: 'draft' },
    renameModal: { querySelector: () => ({ textContent: '' }) },
    renameInput: { value: '', focus: () => log.push('focus') },
    viewArchivedTitle: doc?.getElementById('title') || { textContent: '' },
    viewArchivedContent: doc?.getElementById('content') || {},
    viewArchivedChatModal: { id: 'archived-modal' }
  });
  const shell = { uploadedFiles: ['file'], messageObserver: { disconnect: () => log.push('observer off') } };
  const deps = (doc) => ({
    window: { dispatchEvent: (event) => log.push(['event', event.type, event.detail]), CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } } },
    document: doc,
    elements: elementsWith(doc),
    i18n: { en: { chatMovedToTrash: 'Moved.' } },
    shell,
    toggleSidebar: (...args) => log.push(['toggleSidebar', ...args]),
    updateFunctionButtonsState: () => log.push('function buttons'),
    runtimeConfigAccess: { getConfig: () => ({ lastCouncilConfig: { enabled: true, participantModelIds: ['a', 'b'] }, ...config }), getUiLanguage: () => 'en' },
    liveConversationsBridge: { getConversations: () => list, replaceConversations: (next) => { list = next; return list; } },
    conversationStateAccess: { getCurrentConversationId: () => current, setCurrentConversationId: (id) => { current = id; } },
    runtimeAppDataStore: { getFolders: () => folders },
    runtimeDialogCoordinator: { showNotification: (...args) => log.push(['notify', ...args]) },
    cloneCouncilConfig: (value) => ({ ...value }),
    getText: (key) => key,
    toggleModal: (modal, open) => log.push(['modal', modal.id || 'rename', open]),
    saveAppData: async (options) => { log.push(['save', options]); },
    renderMarkdown: (text) => `<p>${text}</p>`,
    bindGeneratedImageAssets: async () => {},
    getActiveConversation: () => list.find((c) => c.id === current) || null,
    renderAll: (options) => log.push(['renderAll', options]),
    renderSidebar: () => log.push('sidebar'),
    adjustTextareaHeight: () => {},
    updateInputState: () => log.push('input state'),
    updateApiKeyWarningBadge: () => {},
    getQuoteInquiry: () => ({ clearQuote: () => log.push('quote cleared') }),
    cancelPendingMemoryCapture: (id) => log.push(['memory capture cancelled', id]),
    invalidateConversationMemory: async (args) => log.push(['memory invalidated', args])
  });
  return { log, shell, deps, list: () => list, current: () => current, actions: (doc) => createConversationActions(deps(doc)) };
}

const conv = (id, extra = {}) => ({ id, title: id, messages: [{ role: 'user' }], archived: false, deletedAt: null, ...extra });

test('a new conversation drops empty and ephemeral ones, starts with the council off and opens', async () => {
  const h = harness({ conversations: [conv('kept'), conv('empty', { isTemporary: true, messages: [] }), conv('gone', { retentionMode: 'ephemeral' })], config: { defaultModel: MODELS[1].id } });
  await h.actions().startNewChat();
  const [created, ...rest] = h.list();
  assert.deepEqual(rest.map((c) => c.id), ['kept']);
  assert.equal(h.current(), created.id);
  assert.equal(created.model, MODELS[1].id);
  assert.equal(created.isTemporary, true);
  assert.equal(created.council.enabled, false);
  assert.deepEqual(created.council.participantModelIds, ['a', 'b']);
  assert.deepEqual(created.genConfig, getDefaultGenConfig());
  assert.deepEqual(h.shell.uploadedFiles, []);
  assert.ok(h.log.some((entry) => entry[0] === 'save'), 'saved because conversations were dropped');
  assert.ok(h.log.some((entry) => entry[0] === 'toggleSidebar' && entry[1] === false));

  const kept = harness();
  await kept.actions().startNewChat({ keepSidebarOpen: true });
  assert.ok(!kept.log.some((entry) => entry[0] === 'toggleSidebar'));
  assert.ok(!kept.log.some((entry) => entry[0] === 'save'), 'nothing dropped, nothing saved');
  assert.deepEqual(getDefaultFolder(), { color: 'gray', icon: 'default', textColor: 'gray', isOpen: false });
});

test('opening another conversation drops the empty one left, turns its council off and saves that', async () => {
  const h = harness({ conversations: [conv('empty', { isTemporary: true, messages: [] }), conv('b', { council: { enabled: true }, unsentMessage: 'hi' })], currentId: 'empty' });
  h.actions().loadChat('b');
  assert.deepEqual(h.list().map((c) => c.id), ['b']);
  assert.equal(h.current(), 'b');
  assert.equal(h.list()[0].council.enabled, false);
  assert.ok(h.log.indexOf('observer off') < h.log.findIndex((entry) => entry[0] === 'renderAll'));
  assert.deepEqual(h.log.find((entry) => entry[0] === 'renderAll')[1], { reason: 'chat-switch', scrollMode: 'bottom' });
  assert.ok(h.log.some((entry) => entry[0] === 'event' && entry[1] === 'astra:active-conversation-changed' && entry[2].conversationId === 'b'));
  assert.ok(h.log.some((entry) => entry[0] === 'save'));
  assert.deepEqual(h.shell.uploadedFiles, []);
});

test('moving the open conversation to the trash leaves it first, then saves at once, then says so', async () => {
  const folder = { id: 'f', conversationIds: ['a', 'b'] };
  const h = harness({ conversations: [conv('a', { folderId: 'f', archived: true }), conv('b')], folders: [folder], currentId: 'a' });
  await h.actions().deleteChat('a', { stopPropagation: () => h.log.push('stopped') });
  const deleted = h.list().find((c) => c.id === 'a');
  assert.ok(deleted.deletedAt);
  assert.equal(deleted.stateUpdatedAt, deleted.deletedAt);
  assert.equal(deleted.trashStateUpdatedAt, deleted.deletedAt);
  assert.equal(deleted.archived, false);
  assert.equal(deleted.folderId, null);
  assert.deepEqual(folder.conversationIds, ['b']);
  assert.notEqual(h.current(), 'a', 'a blank conversation was opened');
  const order = ['stopped', 'memory capture cancelled', 'renderAll', 'memory invalidated', 'save', 'notify'];
  const positions = order.map((name) => h.log.findIndex((entry) => entry === name || entry[0] === name));
  assert.deepEqual([...positions].sort((x, y) => x - y), positions, `in order: ${order.join(', ')}`);
  assert.deepEqual(h.log.find((entry) => entry[0] === 'save')[1], { immediateCloudSync: true });
  assert.deepEqual(h.log.find((entry) => entry[0] === 'notify').slice(1), ['Moved.', 'success']);
  assert.ok(!h.log.some((entry) => entry[1] === 'sidebar.toggleSidebar'), 'the sidebar stays open');

  const other = harness({ conversations: [conv('a'), conv('b')], currentId: 'b' });
  await other.actions().deleteChat('a');
  assert.equal(other.current(), 'b');
  assert.ok(other.log.includes('sidebar'));
});

test('archiving the open conversation opens the next one left, or a new one', async () => {
  const h = harness({ conversations: [conv('a'), conv('trash', { deletedAt: 'x' }), conv('c')], currentId: 'a' });
  await h.actions().archiveChat('a');
  assert.equal(h.list()[0].archived, true);
  assert.equal(h.current(), 'c');

  const last = harness({ conversations: [conv('a')], currentId: 'a' });
  await last.actions().archiveChat('a');
  assert.notEqual(last.current(), 'a');
  assert.equal(last.list()[0].isTemporary, true);

  const closed = harness({ conversations: [conv('a', { archived: true })], currentId: null });
  await closed.actions().unarchiveChat('a');
  assert.equal(closed.list()[0].archived, false);
  assert.deepEqual(closed.log, [['save', undefined], 'sidebar']);
});

test('pinning and renaming change the latest conversation, save and draw the sidebar', async () => {
  const h = harness({ conversations: [conv('a')] });
  const actions = h.actions();
  await actions.togglePinChat('a');
  assert.equal(h.list()[0].pinned, true);
  assert.deepEqual(h.log, [['save', undefined], 'sidebar']);

  h.log.length = 0;
  actions.showRenameModal('a', 'conversation');
  assert.ok(h.log.some((entry) => entry[0] === 'modal' && entry[2] === true));
  await actions.handleRename();
  assert.equal(h.list()[0].title, 'a', 'an empty title is not saved');
});

test('the rename dialog saves the new title of a conversation or a folder and closes', async () => {
  const folder = { id: 'f', name: 'Old' };
  const h = harness({ conversations: [conv('a')], folders: [folder] });
  const deps = h.deps();
  const actions = createConversationActions(deps);
  actions.showRenameModal('a', 'conversation');
  assert.equal(deps.elements.renameInput.value, 'a');
  deps.elements.renameInput.value = '  New title ';
  await actions.handleRename();
  assert.equal(h.list()[0].title, 'New title');
  assert.equal(h.list()[0].isRenamed, true);
  assert.deepEqual(h.log.slice(-3), [['save', undefined], 'sidebar', ['modal', 'rename', false]]);
  await actions.handleRename();
  assert.equal(h.log.filter((entry) => entry[0] === 'save').length, 1, 'the dialog forgets its subject once closed');

  actions.showRenameModal('f', 'folder');
  assert.equal(deps.elements.renameInput.value, 'Old');
  deps.elements.renameInput.value = 'Folder';
  await actions.handleRename();
  assert.equal(folder.name, 'Folder');
});

test('an archived conversation is shown in its dialog, drawn before it opens', () => {
  const { document, cleanup } = createDom('<h2 id="title"></h2><div id="content"></div>');
  const frames = [];
  globalThis.requestAnimationFrame = (callback) => { frames.push(callback); return frames.length; };
  try {
    const h = harness({ conversations: [conv('a', { title: 'Archived', messages: [{ role: 'user', parts: [{ text: 'Hello' }] }, { role: 'model', parts: [{ text: 'Hi' }] }] })] });
    h.actions(document).showArchivedChatPreview('a');
    assert.equal(document.getElementById('title').textContent, 'Archived');
    assert.match(document.getElementById('content').innerHTML, /Hello/);
    assert.match(document.getElementById('content').innerHTML, /<p>Hi<\/p>/);
    assert.deepEqual(h.log, [['modal', 'archived-modal', true]]);
    assert.ok(frames.length > 0, 'kept at its latest message once the dialog is open');
  } finally {
    delete globalThis.requestAnimationFrame;
    cleanup();
  }
});
