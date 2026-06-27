import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createLegacyRuntimeAppDataStore } from '../src/app/runtime/kernel/app-data-store.js';

const bridgeModuleUrl = new URL('../src/app/runtime/kernel/live-conversations-bridge.js', import.meta.url);

async function createBridge(options) {
  const { createLiveConversationsBridge } = await import(bridgeModuleUrl);
  return createLiveConversationsBridge(options);
}

test('live conversations bridge module exports a factory', async () => {
  const module = await import(bridgeModuleUrl);

  assert.equal(typeof module.createLiveConversationsBridge, 'function');
});

test('getConversations always returns the latest app data store pointer', async () => {
  const store = createLegacyRuntimeAppDataStore({
    initialConversations: [{ id: 'initial' }]
  });
  const bridge = await createBridge({
    getConversations: () => store.getConversations(),
    replaceConversations: (next) => store.replaceConversations(next)
  });
  const replacement = [{ id: 'replacement' }];

  store.replaceConversations(replacement);

  assert.equal(bridge.getConversations(), replacement);
});

test('replaceConversations updates the store and synchronizes the legacy mirror', async () => {
  const store = createLegacyRuntimeAppDataStore({
    initialConversations: [{ id: 'initial' }]
  });
  let legacyMirror = store.getConversations();
  const synchronizedPointers = [];
  const bridge = await createBridge({
    getConversations: () => store.getConversations(),
    replaceConversations: (next) => store.replaceConversations(next),
    syncLegacyMirror: (next) => {
      legacyMirror = next;
      synchronizedPointers.push(next);
    }
  });
  const replacement = [{ id: 'replacement' }];

  const result = bridge.replaceConversations(replacement);

  assert.equal(result, replacement);
  assert.equal(store.getConversations(), replacement);
  assert.equal(legacyMirror, replacement);
  assert.deepEqual(synchronizedPointers, [replacement]);
});

test('replaceConversations stops stale arrays from becoming the source of truth', async () => {
  const store = createLegacyRuntimeAppDataStore({
    initialConversations: [{ id: 'stale' }]
  });
  const staleConversations = store.getConversations();
  const bridge = await createBridge({
    getConversations: () => store.getConversations(),
    replaceConversations: (next) => store.replaceConversations(next)
  });
  const replacement = [{ id: 'current' }];

  bridge.replaceConversations(replacement);
  staleConversations.push({ id: 'stale-mutation' });
  bridge.getConversations().push({ id: 'current-mutation' });

  assert.equal(bridge.getConversations(), replacement);
  assert.deepEqual(bridge.getConversations().map(({ id }) => id), ['current', 'current-mutation']);
  assert.deepEqual(staleConversations.map(({ id }) => id), ['stale', 'stale-mutation']);
});

test('syncLegacyMirror can synchronize after an external replaceAll operation', async () => {
  const store = createLegacyRuntimeAppDataStore({
    initialConversations: [{ id: 'initial' }]
  });
  let legacyMirror = store.getConversations();
  const bridge = await createBridge({
    getConversations: () => store.getConversations(),
    replaceConversations: (next) => store.replaceConversations(next),
    syncLegacyMirror: (next) => {
      legacyMirror = next;
    }
  });
  const replacement = [{ id: 'replace-all' }];

  store.replaceAll({
    conversations: replacement,
    folders: [],
    astras: [],
    personalMemories: []
  });

  assert.equal(bridge.syncLegacyMirror(), replacement);
  assert.equal(legacyMirror, replacement);
});

test('live conversations bridge import is inert and kernel scoped', () => {
  const source = readFileSync(bridgeModuleUrl, 'utf8');

  assert.doesNotMatch(source, /document|window|indexedDB|localStorage|sessionStorage/);
  assert.doesNotMatch(source, /legacy-core|runtime-entry|render|saveAppData/);
});
