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
    renderAll: () => {},
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
});
