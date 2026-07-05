import assert from 'node:assert/strict';
import test from 'node:test';

import { createCloudWorkspaceLiveLifecycle } from '../src/app/runtime/features/cloud-workspace-live-lifecycle.js';

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
  const appDataStore = { replaceAll: value => { applied.appData = value; } };

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
