import assert from 'node:assert/strict';
import test from 'node:test';

import { createCloudWorkspaceLiveLifecycle } from '../src/app/runtime/features/cloud-workspace-live-lifecycle.js';
import { createLegacyRuntimeAppDataStore } from '../src/app/runtime/kernel/app-data-store.js';

function createWindowFixture() {
  const listeners = new Map();
  return {
    addEventListener(name, listener) {
      listeners.set(name, listener);
    },
    emit(name, detail) {
      listeners.get(name)?.({ detail });
    }
  };
}

function createPreciseRenderFixture({
  initialWorkspace,
  activeConversationId = null,
  onActiveConversationUnavailable = () => {},
  isActiveConversationViewCurrent = () => false
} = {}) {
  const window = createWindowFixture();
  const appDataStore = createLegacyRuntimeAppDataStore();
  const renderCalls = { all: 0, sidebar: 0, chat: 0 };
  const chatOptions = [];
  let responseActive = false;
  let scheduled = null;
  let scheduleCalls = 0;

  createCloudWorkspaceLiveLifecycle({
    window,
    configAccess: { getConfig: () => ({}) },
    appDataStore,
    getDefaultFolder: () => ({ id: 'root' }),
    getDefaultGenConfig: () => ({}),
    normalizeCouncilConfig: value => value,
    normalizeConversationModel: value => value,
    models: [],
    maxCouncilModels: 4,
    getCouncilTranslatorCandidates: () => [],
    getSingleTranslatorCandidates: () => [],
    applyCustomWallpaper: () => {},
    applyUiTheme: () => {},
    renderAll: () => { renderCalls.all += 1; },
    renderSidebar: () => { renderCalls.sidebar += 1; },
    renderChat: options => { renderCalls.chat += 1; chatOptions.push(options); },
    isActiveConversationViewCurrent,
    getActiveConversation: () => appDataStore.getConversations()
      .find(conversation => conversation.id === activeConversationId) || null,
    onActiveConversationUnavailable,
    busy: () => responseActive && appDataStore.getConversations()
      .find(conversation => conversation.id === activeConversationId),
    schedule: callback => { scheduled = callback; scheduleCalls += 1; return 1; }
  });
  window.__astraCloudRuntimeReady();
  if (initialWorkspace) window.emit('astra:cloud-app-data', initialWorkspace);

  const resetRenderCalls = () => {
    renderCalls.all = 0;
    renderCalls.sidebar = 0;
    renderCalls.chat = 0;
  };
  resetRenderCalls();

  return {
    window,
    appDataStore,
    renderCalls,
    chatOptions,
    resetRenderCalls,
    getScheduleCalls: () => scheduleCalls,
    setResponseActive(value) { responseActive = value; },
    runScheduled() { scheduled?.(); }
  };
}

test('cloud workspace updates wait for runtime readiness and then render hydrated state', () => {
  const window = createWindowFixture();
  const applied = { appData: null, config: null };
  let renders = 0;
  const configAccess = {
    getConfig: () => ({ lastCouncilConfig: { enabled: true } }),
    replaceConfig: value => { applied.config = value; }
  };
  const appDataStore = {
    getSnapshot: () => ({ conversations: [], folders: [], astras: [], personalMemories: [] }),
    replaceAll: value => { applied.appData = value; }
  };

  createCloudWorkspaceLiveLifecycle({
    window,
    configAccess,
    appDataStore,
    getDefaultFolder: () => ({ id: 'root' }),
    getDefaultGenConfig: () => ({}),
    normalizeCouncilConfig: value => value,
    normalizeConversationModel: value => value,
    models: [],
    maxCouncilModels: 4,
    getCouncilTranslatorCandidates: () => [],
    getSingleTranslatorCandidates: () => [],
    applyCustomWallpaper: () => {},
    applyUiTheme: () => {},
    renderAll: () => { renders += 1; }
  });

  window.emit('astra:cloud-app-data', {
    conversations: [], folders: [], astras: [], personalMemories: []
  });
  assert.equal(applied.appData, null);
  window.__astraCloudRuntimeReady();
  assert.deepEqual(applied.appData.conversations, []);
  assert.equal(renders, 1);
});

test('cloud workspace update preserves an active conversation reference and defers rendering', () => {
  const window = createWindowFixture();
  const activeConversation = {
    id: 'conversation-1',
    title: 'Question',
    isNaming: true,
    messages: [{ role: 'user', parts: [{ text: 'Question' }] }]
  };
  const appDataStore = createLegacyRuntimeAppDataStore({ initialConversations: [activeConversation] });
  let responseActive = true;
  let renders = 0;
  let scheduled = null;

  createCloudWorkspaceLiveLifecycle({
    window,
    configAccess: { getConfig: () => ({}) },
    appDataStore,
    getDefaultFolder: () => ({ id: 'root' }),
    getDefaultGenConfig: () => ({}),
    normalizeCouncilConfig: value => value,
    normalizeConversationModel: value => value,
    models: [],
    maxCouncilModels: 4,
    getCouncilTranslatorCandidates: () => [],
    getSingleTranslatorCandidates: () => [],
    applyCustomWallpaper: () => {},
    applyUiTheme: () => {},
    renderAll: () => { renders += 1; },
    busy: () => responseActive && activeConversation,
    schedule: callback => { scheduled = callback; return 1; }
  });
  window.__astraCloudRuntimeReady();

  window.emit('astra:cloud-app-data', {
    conversations: [],
    folders: [],
    astras: [],
    personalMemories: []
  });

  assert.equal(appDataStore.getConversations()[0], activeConversation);
  assert.equal(activeConversation.title, 'Question');
  assert.equal(renders, 0);
  activeConversation.messages.push({ role: 'model', parts: [{ text: 'Completed answer' }] });
  responseActive = false;
  scheduled();
  assert.equal(renders, 1);
  assert.equal(appDataStore.getConversations()[0].messages[1].parts[0].text, 'Completed answer');
});

test('cloud workspace update preserves local folder expansion state', () => {
  const window = createWindowFixture();
  const appDataStore = createLegacyRuntimeAppDataStore({
    initialFolders: [{ id: 'folder-1', name: 'Local', isOpen: true }]
  });

  createCloudWorkspaceLiveLifecycle({
    window,
    configAccess: { getConfig: () => ({}) },
    appDataStore,
    getDefaultFolder: () => ({ id: 'root', isOpen: false }),
    getDefaultGenConfig: () => ({}),
    normalizeCouncilConfig: value => value,
    normalizeConversationModel: value => value,
    models: [],
    maxCouncilModels: 4,
    getCouncilTranslatorCandidates: () => [],
    getSingleTranslatorCandidates: () => [],
    applyCustomWallpaper: () => {},
    applyUiTheme: () => {},
    renderAll: () => {}
  });
  window.__astraCloudRuntimeReady();

  window.emit('astra:cloud-app-data', {
    conversations: [],
    folders: [{ id: 'folder-1', name: 'Remote', isOpen: false }],
    astras: [],
    personalMemories: []
  });

  assert.equal(appDataStore.getFolders()[0].name, 'Remote');
  assert.equal(appDataStore.getFolders()[0].isOpen, true);
});

test('cloud workspace update keeps the fresh local draft selected after reload', () => {
  const window = createWindowFixture();
  const localDraft = {
    id: 'fresh-draft',
    isTemporary: true,
    archived: false,
    deletedAt: null,
    messages: []
  };
  const appDataStore = createLegacyRuntimeAppDataStore({ initialConversations: [localDraft] });

  createCloudWorkspaceLiveLifecycle({
    window,
    configAccess: { getConfig: () => ({}) },
    appDataStore,
    getDefaultFolder: () => ({ id: 'root' }),
    getDefaultGenConfig: () => ({}),
    normalizeCouncilConfig: value => value,
    normalizeConversationModel: value => value,
    models: [],
    maxCouncilModels: 4,
    getCouncilTranslatorCandidates: () => [],
    getSingleTranslatorCandidates: () => [],
    applyCustomWallpaper: () => {},
    applyUiTheme: () => {},
    renderAll: () => {}
  });
  window.__astraCloudRuntimeReady();

  window.emit('astra:cloud-app-data', {
    conversations: [{ id: 'history', isTemporary: false, messages: [{ role: 'user' }] }],
    folders: [],
    astras: [],
    personalMemories: []
  });

  assert.equal(appDataStore.getConversations().find(item => item.id === 'fresh-draft'), localDraft);
  assert.equal(appDataStore.getConversations().some(item => item.id === 'history'), true);
});

test('record-level cloud commit preserves unsynced local rows and applies remote rows', () => {
  const window = createWindowFixture();
  const localConversation = {
    id: 'local-only',
    isTemporary: false,
    messages: [{ role: 'user', parts: [{ text: 'Unsynced local message' }] }]
  };
  const appDataStore = createLegacyRuntimeAppDataStore({
    initialConversations: [localConversation]
  });
  let renders = 0;

  createCloudWorkspaceLiveLifecycle({
    window,
    configAccess: { getConfig: () => ({}) },
    appDataStore,
    getDefaultFolder: () => ({ id: 'root' }),
    getDefaultGenConfig: () => ({}),
    normalizeCouncilConfig: value => value,
    normalizeConversationModel: value => value,
    models: [],
    maxCouncilModels: 4,
    getCouncilTranslatorCandidates: () => [],
    getSingleTranslatorCandidates: () => [],
    applyCustomWallpaper: () => {},
    applyUiTheme: () => {},
    renderAll: () => { renders += 1; }
  });
  window.__astraCloudRuntimeReady();

  window.emit('astra:cloud-workspace-committed', {
    workspace: {
      conversations: [{ id: 'remote-only', isTemporary: false, messages: [{ role: 'user' }] }],
      folders: [],
      astras: [],
      personalMemories: []
    },
    tombstones: { conversationIds: [], folderIds: [], astraIds: [] }
  });

  assert.equal(appDataStore.getConversations().find(item => item.id === 'local-only'), localConversation);
  assert.equal(appDataStore.getConversations().some(item => item.id === 'remote-only'), true);
  assert.equal(renders, 1);
});

test('record-level cloud commit removes tombstoned local entities before merging', () => {
  const window = createWindowFixture();
  const appDataStore = createLegacyRuntimeAppDataStore({
    initialConversations: [{ id: 'deleted-conversation', folderId: 'deleted-folder', messages: [] }],
    initialFolders: [{ id: 'deleted-folder', conversationIds: ['deleted-conversation'] }],
    initialAstras: [{ id: 'deleted-astra' }]
  });

  createCloudWorkspaceLiveLifecycle({
    window,
    configAccess: { getConfig: () => ({}) },
    appDataStore,
    getDefaultFolder: () => ({ id: 'root' }),
    getDefaultGenConfig: () => ({}),
    normalizeCouncilConfig: value => value,
    normalizeConversationModel: value => value,
    models: [],
    maxCouncilModels: 4,
    getCouncilTranslatorCandidates: () => [],
    getSingleTranslatorCandidates: () => [],
    applyCustomWallpaper: () => {},
    applyUiTheme: () => {},
    renderAll: () => {}
  });
  window.__astraCloudRuntimeReady();

  window.emit('astra:cloud-workspace-committed', {
    workspace: { conversations: [], folders: [], astras: [], personalMemories: [] },
    tombstones: {
      conversationIds: ['deleted-conversation'],
      folderIds: ['deleted-folder'],
      astraIds: ['deleted-astra']
    }
  });

  assert.deepEqual(appDataStore.getConversations(), []);
  assert.deepEqual(appDataStore.getFolders(), []);
  assert.deepEqual(appDataStore.getAstras(), []);
});

test('record-level cloud tombstones request removal from the fresh memory summary', async () => {
  const window = createWindowFixture();
  const appDataStore = createLegacyRuntimeAppDataStore({
    initialConversations: [{ id: 'deleted-conversation', messages: [] }]
  });
  const removed = [];

  createCloudWorkspaceLiveLifecycle({
    window,
    configAccess: { getConfig: () => ({}) },
    appDataStore,
    getDefaultFolder: () => ({ id: 'root' }),
    getDefaultGenConfig: () => ({}),
    normalizeCouncilConfig: value => value,
    normalizeConversationModel: value => value,
    models: [],
    maxCouncilModels: 4,
    getCouncilTranslatorCandidates: () => [],
    getSingleTranslatorCandidates: () => [],
    applyCustomWallpaper: () => {},
    applyUiTheme: () => {},
    renderAll: () => {},
    onRemoteConversationsPermanentlyDeleted: async ({ conversationIds }) => removed.push(...conversationIds)
  });
  window.__astraCloudRuntimeReady();

  window.emit('astra:cloud-workspace-committed', {
    workspace: { conversations: [], folders: [], astras: [], personalMemories: [] },
    tombstones: { conversationIds: ['deleted-conversation'], folderIds: [], astraIds: [] }
  });
  await Promise.resolve();

  assert.deepEqual(removed, ['deleted-conversation']);
});

test('record-level cloud commit waits for runtime readiness and keeps its tombstones', () => {
  const window = createWindowFixture();
  const appDataStore = createLegacyRuntimeAppDataStore({
    initialConversations: [{ id: 'deleted-conversation', messages: [] }]
  });

  createCloudWorkspaceLiveLifecycle({
    window,
    configAccess: { getConfig: () => ({}) },
    appDataStore,
    getDefaultFolder: () => ({ id: 'root' }),
    getDefaultGenConfig: () => ({}),
    normalizeCouncilConfig: value => value,
    normalizeConversationModel: value => value,
    models: [],
    maxCouncilModels: 4,
    getCouncilTranslatorCandidates: () => [],
    getSingleTranslatorCandidates: () => [],
    applyCustomWallpaper: () => {},
    applyUiTheme: () => {},
    renderAll: () => {}
  });

  window.emit('astra:cloud-workspace-committed', {
    workspace: { conversations: [], folders: [], astras: [], personalMemories: [] },
    tombstones: { conversationIds: ['deleted-conversation'], folderIds: [], astraIds: [] }
  });
  assert.equal(appDataStore.getConversations().length, 1);

  window.__astraCloudRuntimeReady();
  assert.deepEqual(appDataStore.getConversations(), []);
});

test('an unchanged cloud workspace does not render any interface region', () => {
  const workspace = {
    conversations: [{
      id: 'active',
      title: 'Question',
      createdAt: '2026-01-01T00:00:00.000Z',
      messages: [{ role: 'user', parts: [{ text: 'Question' }] }]
    }],
    folders: [],
    astras: [],
    personalMemories: []
  };
  const fixture = createPreciseRenderFixture({ initialWorkspace: workspace, activeConversationId: 'active' });

  fixture.window.emit('astra:cloud-workspace-committed', {
    workspace,
    tombstones: { conversationIds: [], folderIds: [], astraIds: [] }
  });

  assert.deepEqual(fixture.renderCalls, { all: 0, sidebar: 0, chat: 0 });
});

test('the active conversation is hydrated after a cloud workspace commit', async () => {
  const window = createWindowFixture();
  const marker = { __astraCloudAsset: { path: 'user-1/active', encoding: 'base64' } };
  const activeConversation = {
    id: 'active',
    messages: [{ parts: [{ inlineData: { mimeType: 'image/png', data: marker } }] }]
  };
  const appDataStore = createLegacyRuntimeAppDataStore({
    initialConversations: [activeConversation]
  });
  let saved = 0;
  const chatRenderReasons = [];
  const hydrationCalls = [];
  createCloudWorkspaceLiveLifecycle({
    window,
    configAccess: { getConfig: () => ({}) },
    appDataStore,
    getDefaultFolder: () => ({ id: 'root' }),
    getDefaultGenConfig: () => ({}),
    normalizeCouncilConfig: value => value,
    normalizeConversationModel: value => value,
    models: [],
    maxCouncilModels: 4,
    getCouncilTranslatorCandidates: () => [],
    getSingleTranslatorCandidates: () => [],
    applyCustomWallpaper: () => {},
    applyUiTheme: () => {},
    renderAll: () => {},
    renderSidebar: () => {},
    renderChat: options => { chatRenderReasons.push(options?.reason); },
    getActiveConversation: () => appDataStore.getConversations()
      .find(conversation => conversation.id === 'active'),
    hydrateConversation: async conversation => {
      hydrationCalls.push(conversation.id);
      return {
        conversation: {
          ...conversation,
          messages: [{ parts: [{ inlineData: { mimeType: 'image/png', data: 'AQID' } }] }]
        },
        resolvedCount: 1
      };
    },
    saveAppData: async () => { saved += 1; }
  });
  window.__astraCloudRuntimeReady();

  window.emit('astra:cloud-workspace-committed', {
    workspace: {
      conversations: [activeConversation],
      folders: [],
      astras: [],
      personalMemories: []
    },
    tombstones: { conversationIds: [], folderIds: [], astraIds: [] }
  });
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.deepEqual(hydrationCalls, ['active']);
  assert.equal(appDataStore.getConversations()[0].messages[0].parts[0].inlineData.data, 'AQID');
  assert.equal(saved, 1);
  assert.equal(
    chatRenderReasons.filter(reason => reason === 'cloud-active-conversation-hydrated').length,
    1
  );
});

test('a stale hydration result cannot update a conversation after selection changes', async () => {
  const window = createWindowFixture();
  const conversations = [
    { id: 'first', messages: [{ parts: [{ text: 'first marker' }] }] },
    { id: 'second', messages: [{ parts: [{ text: 'second marker' }] }] }
  ];
  const appDataStore = createLegacyRuntimeAppDataStore({ initialConversations: conversations });
  let activeId = 'first';
  const pending = [];
  createCloudWorkspaceLiveLifecycle({
    window,
    configAccess: { getConfig: () => ({}) },
    appDataStore,
    getDefaultFolder: () => ({ id: 'root' }),
    getDefaultGenConfig: () => ({}),
    normalizeCouncilConfig: value => value,
    normalizeConversationModel: value => value,
    models: [],
    maxCouncilModels: 4,
    getCouncilTranslatorCandidates: () => [],
    getSingleTranslatorCandidates: () => [],
    applyCustomWallpaper: () => {},
    applyUiTheme: () => {},
    renderAll: () => {},
    getActiveConversation: () => appDataStore.getConversations()
      .find(conversation => conversation.id === activeId),
    hydrateConversation: conversation => new Promise(resolve => pending.push({
      id: conversation.id,
      resolve
    }))
  });
  window.__astraCloudRuntimeReady();
  window.emit('astra:cloud-workspace-committed', {
    workspace: { conversations, folders: [], astras: [], personalMemories: [] },
    tombstones: { conversationIds: [], folderIds: [], astraIds: [] }
  });
  await Promise.resolve();
  activeId = 'second';
  window.emit('astra:active-conversation-changed');
  await Promise.resolve();

  assert.deepEqual(pending.map(item => item.id), ['first', 'second']);
  pending[0].resolve({
    conversation: { id: 'first', messages: [{ parts: [{ text: 'stale hydrated value' }] }] },
    resolvedCount: 1
  });
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(
    appDataStore.getConversations().find(conversation => conversation.id === 'first')
      .messages[0].parts[0].text,
    'first marker'
  );
  pending[1].resolve({ conversation: conversations[1], resolvedCount: 0 });
});

test('a cloud update to a non-active conversation renders only the sidebar', () => {
  const activeConversation = {
    id: 'active',
    title: 'Active',
    createdAt: '2026-01-01T00:00:00.000Z',
    messages: [{ role: 'user', parts: [{ text: 'Active question' }] }]
  };
  const otherConversation = {
    id: 'other',
    title: 'Old title',
    createdAt: '2026-01-02T00:00:00.000Z',
    messages: [{ role: 'user', parts: [{ text: 'Other question' }] }]
  };
  const fixture = createPreciseRenderFixture({
    initialWorkspace: {
      conversations: [activeConversation, otherConversation],
      folders: [],
      astras: [],
      personalMemories: []
    },
    activeConversationId: 'active'
  });

  fixture.window.emit('astra:cloud-workspace-committed', {
    workspace: {
      conversations: [activeConversation, { ...otherConversation, title: 'Remote title' }],
      folders: [],
      astras: [],
      personalMemories: []
    },
    tombstones: { conversationIds: [], folderIds: [], astraIds: [] }
  });

  assert.equal(fixture.appDataStore.getConversations().find(item => item.id === 'other').title, 'Remote title');
  assert.deepEqual(fixture.renderCalls, { all: 0, sidebar: 1, chat: 0 });
});

test('a cloud update to the active conversation renders the chat', () => {
  const activeConversation = {
    id: 'active',
    title: 'Active',
    createdAt: '2026-01-01T00:00:00.000Z',
    messages: [{ role: 'user', parts: [{ text: 'Question' }] }]
  };
  const fixture = createPreciseRenderFixture({
    initialWorkspace: {
      conversations: [activeConversation],
      folders: [],
      astras: [],
      personalMemories: []
    },
    activeConversationId: 'active'
  });

  fixture.window.emit('astra:cloud-workspace-committed', {
    workspace: {
      conversations: [{
        ...activeConversation,
        messages: [
          ...activeConversation.messages,
          { role: 'model', parts: [{ text: 'Remote answer' }] }
        ]
      }],
      folders: [],
      astras: [],
      personalMemories: []
    },
    tombstones: { conversationIds: [], folderIds: [], astraIds: [] }
  });

  assert.equal(fixture.renderCalls.all, 0);
  assert.equal(fixture.renderCalls.chat, 1);
});

test('an active conversation cloud echo keeps a finalized local message list intact', () => {
  const activeConversation = {
    id: 'active',
    title: 'Active',
    createdAt: '2026-01-01T00:00:00.000Z',
    messages: [{ role: 'user', parts: [{ text: 'Question' }] }]
  };
  const fixture = createPreciseRenderFixture({
    initialWorkspace: { conversations: [activeConversation], folders: [], astras: [], personalMemories: [] },
    activeConversationId: 'active',
    isActiveConversationViewCurrent: () => true
  });

  fixture.window.emit('astra:cloud-workspace-committed', {
    workspace: {
      conversations: [{
        ...activeConversation,
        messages: [...activeConversation.messages, { role: 'model', parts: [{ text: 'Answer' }] }]
      }],
      folders: [], astras: [], personalMemories: []
    },
    tombstones: { conversationIds: [], folderIds: [], astraIds: [] }
  });

  assert.equal(fixture.renderCalls.chat, 1);
  assert.equal(fixture.chatOptions.at(-1).renderMessages, false);
});

test('a remotely trashed active conversation requests a safe fallback after commit', () => {
  const unavailable = [];
  const activeConversation = {
    id: 'active',
    title: 'Active',
    createdAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    trashStateUpdatedAt: '2026-01-01T00:00:00.000Z',
    messages: [{ role: 'user', parts: [{ text: 'Question' }] }]
  };
  const fixture = createPreciseRenderFixture({
    initialWorkspace: {
      conversations: [activeConversation],
      folders: [],
      astras: [],
      personalMemories: []
    },
    activeConversationId: 'active',
    onActiveConversationUnavailable: detail => unavailable.push(detail)
  });
  const deletedAt = '2026-01-01T01:00:00.000Z';

  fixture.window.emit('astra:cloud-workspace-committed', {
    workspace: {
      conversations: [{
        ...activeConversation,
        deletedAt,
        stateUpdatedAt: deletedAt,
        trashStateUpdatedAt: deletedAt
      }],
      folders: [],
      astras: [],
      personalMemories: []
    },
    tombstones: { conversationIds: [], folderIds: [], astraIds: [] }
  });

  assert.equal(fixture.appDataStore.getConversations()[0].deletedAt, deletedAt);
  assert.equal(unavailable.length, 1);
  assert.equal(unavailable[0].conversationId, 'active');
  assert.equal(unavailable[0].workspace.conversations[0].deletedAt, deletedAt);
});

test('an unchanged cloud workspace deferred during a response does not render after settling', () => {
  const workspace = {
    conversations: [{
      id: 'active',
      title: 'Active',
      createdAt: '2026-01-01T00:00:00.000Z',
      messages: [{ role: 'user', parts: [{ text: 'Question' }] }]
    }],
    folders: [],
    astras: [],
    personalMemories: []
  };
  const fixture = createPreciseRenderFixture({ initialWorkspace: workspace, activeConversationId: 'active' });
  fixture.setResponseActive(true);

  fixture.window.emit('astra:cloud-workspace-committed', {
    workspace,
    tombstones: { conversationIds: [], folderIds: [], astraIds: [] }
  });

  assert.equal(fixture.getScheduleCalls(), 1);
  assert.deepEqual(fixture.renderCalls, { all: 0, sidebar: 0, chat: 0 });
  fixture.setResponseActive(false);
  fixture.runScheduled();
  assert.deepEqual(fixture.renderCalls, { all: 0, sidebar: 0, chat: 0 });
});

test('cloud config applies only the small synced memory projection and persists it locally', () => {
  const window = createWindowFixture();
  const appDataStore = createLegacyRuntimeAppDataStore({
    initialMemoryState: {
      version: 2,
      profileEntries: [],
      profileCandidates: [{ id: 'local-candidate' }],
      resolvedProfileCandidateIds: [],
      recentConversationStates: [],
      conversationCapsules: [{ id: 'local-capsule' }],
      longTermTopicSummaries: [],
      suppressionRules: [],
      legacyInbox: []
    }
  });
  let config = { uiTheme: {}, modelSettings: [], lastCouncilConfig: {} };
  let saved = 0;
  const renderCalls = { all: 0, sidebar: 0, chat: 0 };

  createCloudWorkspaceLiveLifecycle({
    window,
    configAccess: { getConfig: () => config, replaceConfig: next => { config = next; } },
    appDataStore,
    getDefaultFolder: () => ({ id: 'root' }),
    getDefaultGenConfig: () => ({}),
    normalizeCouncilConfig: value => value,
    normalizeConversationModel: value => value,
    models: [],
    maxCouncilModels: 4,
    getCouncilTranslatorCandidates: () => [],
    getSingleTranslatorCandidates: () => [],
    applyCustomWallpaper: () => {},
    applyUiTheme: () => {},
    renderAll: () => { renderCalls.all += 1; },
    renderSidebar: () => { renderCalls.sidebar += 1; },
    renderChat: () => { renderCalls.chat += 1; },
    saveAppData: async () => { saved += 1; }
  });
  window.__astraCloudRuntimeReady();

  window.emit('astra:cloud-config', {
    memorySync: {
      version: 1,
      profileEntries: [{ id: 'style', confirmedByUser: true, content: 'Keep replies concise' }],
      profileCandidates: [{ id: 'remote-candidate', content: 'Use examples' }],
      resolvedProfileCandidateIds: [],
      suppressionRules: [{ type: 'do-not-mention', target: 'profile-name' }],
      longTermTopicSummaries: []
    }
  });

  assert.equal(appDataStore.getMemoryState().profileEntries[0].content, 'Keep replies concise');
  assert.deepEqual(appDataStore.getMemoryState().conversationCapsules, [{ id: 'local-capsule' }]);
  assert.deepEqual(appDataStore.getMemoryState().profileCandidates, [
    { id: 'local-candidate' },
    { id: 'remote-candidate', content: 'Use examples' }
  ]);
  assert.equal(saved, 1);
  assert.deepEqual(renderCalls, { all: 0, sidebar: 0, chat: 0 });
});

test('record-level memory updates apply without a config sync and preserve a local manual section', () => {
  const window = createWindowFixture();
  const appDataStore = createLegacyRuntimeAppDataStore({
    initialMemoryState: {
      memorySummary: {
        overview: 'Use the NUC.',
        updatedAt: '2026-07-29T00:00:00.000Z',
        sections: [{
          id: 'deployment', key: 'deployment', title: 'Deployment', content: 'Use the NUC.',
          authority: 'manual', updatedAt: '2026-07-29T00:00:00.000Z'
        }]
      }
    }
  });
  let saved = 0;
  createCloudWorkspaceLiveLifecycle({
    window,
    configAccess: { getConfig: () => ({}) },
    appDataStore,
    getDefaultFolder: () => ({ id: 'root' }),
    getDefaultGenConfig: () => ({}),
    normalizeCouncilConfig: value => value,
    normalizeConversationModel: value => value,
    models: [], maxCouncilModels: 4,
    getCouncilTranslatorCandidates: () => [],
    getSingleTranslatorCandidates: () => [],
    applyCustomWallpaper: () => {}, applyUiTheme: () => {}, renderAll: () => {},
    saveAppData: async () => { saved += 1; }
  });
  window.__astraCloudRuntimeReady();

  window.emit('astra:cloud-memory-summary', {
    records: [
      {
        record_key: 'summary:meta', layer: 'summary', record_type: 'meta', deleted_at: null,
        updated_at: '2026-07-30T00:00:00.000Z',
        payload: { overview: 'Use the VPS.', updatedAt: '2026-07-30T00:00:00.000Z', needsRefresh: false }
      },
      {
        record_key: 'summary:section:deployment', layer: 'summary', record_type: 'section', deleted_at: null,
        updated_at: '2026-07-30T00:00:00.000Z',
        payload: {
          id: 'deployment', key: 'deployment', title: 'Deployment', content: 'Use the VPS.',
          authority: 'automatic', updatedAt: '2026-07-30T00:00:00.000Z'
        }
      }
    ]
  });

  const summary = appDataStore.getMemoryState().memorySummary;
  assert.equal(summary.sections[0].content, 'Use the NUC.');
  assert.equal(summary.sections[0].authority, 'manual');
  assert.equal(saved, 1);
});

// Every save uploads the workspace, and Supabase realtime echoes our own write straight back.
// The codec materializes optional fields on the way home (council: null, archived: false,
// status: 'complete', a generated message id), so comparing raw shapes made our own echo look
// like a remote change and repainted the sidebar and the whole message list after every answer.
const OWN_ECHO_USER_ID = '33333333-3333-4333-8333-333333333333';
const OWN_ECHO_CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';

const buildLiveWorkspace = (conversationOverrides = {}) => ({
  conversations: [{
    id: OWN_ECHO_CONVERSATION_ID,
    title: 'Chat',
    model: 'gemini-3-pro',
    provider: 'gemini',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastUpdatedAt: '2026-01-01T00:01:00.000Z',
    // Shaped exactly as the submit pipeline creates them: no id on the user turn, no status,
    // no deletedAt, and none of the optional booleans.
    messages: [
      { role: 'user', parts: [{ text: 'Question' }], createdAt: '2026-01-01T00:00:30.000Z' },
      {
        id: '22222222-2222-4222-8222-222222222222',
        role: 'model',
        parts: [{ text: 'Answer' }],
        createdAt: '2026-01-01T00:01:00.000Z'
      }
    ],
    ...conversationOverrides
  }],
  folders: [],
  astras: [],
  personalMemories: []
});

const roundTripThroughCloud = async (workspace) => {
  const { webcrypto } = await import('node:crypto');
  const {
    encodeWorkspaceConversationShadow,
    decodeWorkspaceConversationShadow
  } = await import('../src/app/sync/cloud-sync-v2-codecs.js');
  const rows = await encodeWorkspaceConversationShadow({
    workspace,
    userId: OWN_ECHO_USER_ID,
    cryptoProvider: webcrypto
  });
  return decodeWorkspaceConversationShadow(rows);
};

const emitCommitted = (fixture, workspace) => {
  fixture.window.emit('astra:cloud-workspace-committed', {
    workspace,
    tombstones: { conversationIds: [], folderIds: [], astraIds: [] }
  });
};

for (const [label, overrides] of [
  ['a plain conversation', {}],
  ['an archived and pinned conversation', { archived: true, pinned: true }],
  ['a conversation with a Noura and web search', { astrasId: 'official-writer-01', isWebSearchEnabled: true }]
]) {
  test(`our own cloud echo of ${label} does not repaint anything`, async () => {
    const live = buildLiveWorkspace(overrides);
    const fixture = createPreciseRenderFixture({
      initialWorkspace: live,
      activeConversationId: OWN_ECHO_CONVERSATION_ID
    });

    emitCommitted(fixture, await roundTripThroughCloud(live));

    assert.deepEqual(fixture.renderCalls, { all: 0, sidebar: 0, chat: 0 });
  });
}

test('a genuine remote change still repaints', async () => {
  const live = buildLiveWorkspace();

  const renamed = await roundTripThroughCloud(live);
  renamed.conversations[0].title = 'Renamed on another device';
  const renameFixture = createPreciseRenderFixture({
    initialWorkspace: live,
    activeConversationId: OWN_ECHO_CONVERSATION_ID
  });
  emitCommitted(renameFixture, renamed);
  assert.equal(renameFixture.renderCalls.sidebar, 1, 'a remote rename repaints the sidebar');

  const answered = await roundTripThroughCloud(live);
  answered.conversations[0].messages.push({
    id: '44444444-4444-4444-8444-444444444444',
    role: 'model',
    parts: [{ text: 'Sent from another device' }],
    status: 'complete',
    createdAt: '2026-01-01T00:02:00.000Z',
    deletedAt: null
  });
  const messageFixture = createPreciseRenderFixture({
    initialWorkspace: live,
    activeConversationId: OWN_ECHO_CONVERSATION_ID
  });
  emitCommitted(messageFixture, answered);
  assert.equal(messageFixture.renderCalls.chat, 1, 'a remote message repaints the chat');

  const archived = await roundTripThroughCloud(live);
  archived.conversations[0].archived = true;
  const archiveFixture = createPreciseRenderFixture({
    initialWorkspace: live,
    activeConversationId: OWN_ECHO_CONVERSATION_ID
  });
  emitCommitted(archiveFixture, archived);
  assert.equal(archiveFixture.renderCalls.sidebar, 1, 'a remote archive repaints the sidebar');
});
