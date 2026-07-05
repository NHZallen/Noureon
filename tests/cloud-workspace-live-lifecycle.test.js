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
    busy: () => responseActive,
    schedule: callback => { scheduled = callback; return 1; }
  });
  window.__astraCloudRuntimeReady();

  window.emit('astra:cloud-app-data', {
    conversations: [{
      id: 'conversation-1',
      title: 'Remote title',
      isNaming: false,
      messages: [{ role: 'user', parts: [{ text: 'Question' }] }]
    }],
    folders: [],
    astras: [],
    personalMemories: []
  });

  assert.equal(appDataStore.getConversations()[0], activeConversation);
  assert.equal(activeConversation.title, 'Remote title');
  assert.equal(renders, 0);
  activeConversation.messages.push({ role: 'model', parts: [{ text: 'Completed answer' }] });
  responseActive = false;
  scheduled();
  assert.equal(renders, 1);
  assert.equal(appDataStore.getConversations()[0].messages[1].parts[0].text, 'Completed answer');
});
