import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryRuntime } from '../src/app/runtime/memory/memory-runtime.js';

function harness() {
  const saved = [];
  let memoryState = {};
  const state = { config: { memorySync: null }, conversations: [], currentUser: { username: 'alice' } };
  const runtime = createMemoryRuntime({
    document: { dispatchEvent() {} }, Event: class {}, fetch: async () => ({ ok: false }), crypto: globalThis.crypto,
    setTimeout: () => 0, clearTimeout: () => {}, console: { warn() {}, error() {}, log() {} },
    runtimeConfigAccess: { getConfig: () => state.config },
    liveConversationsBridge: { getConversations: () => state.conversations },
    getCurrentUser: () => state.currentUser,
    runtimeAppDataStore: { getMemoryState: () => memoryState, replaceMemoryState: (next) => { memoryState = next; return next; } },
    runtimeStorageAdapter: null,
    models: [], runMemoryModel: null, modelSupportsVision: () => false, getApiKeyForProvider: () => '',
    hashString: async (value) => String(value), saveAppData: async () => saved.push('app'), saveConfig: async () => saved.push('config')
  });
  return { runtime, saved, state, getMemoryState: () => memoryState };
}

test('the memory functions the settings, the reply and the trash use are returned together', () => {
  const { runtime } = harness();
  for (const name of ['retrieveHistory', 'grantHistoryRecallConsent', 'revokeHistoryRecallConsent', 'getHistoryRecallStatus',
    'invalidateConversation', 'rebuildHistoryIndex', 'auditHistoryIndex', 'optimizeHistoryIndex', 'getOverview', 'updateSummary',
    'refreshOverview', 'getWorkStatus']) {
    assert.equal(typeof runtime.memory[name], 'function', name);
  }
  assert.equal(runtime.memory.invalidateConversation, runtime.invalidateMemoryConversation);
  assert.ok(Object.isFrozen(runtime.memory));
  for (const name of ['replaceMemoryState', 'captureCompletedTurnAndPersist', 'invalidateMemoryConversation', 'ensureMemorySummaryFresh']) {
    assert.equal(typeof runtime[name], 'function', name);
  }
  assert.equal(typeof runtime.memoryWorkScheduler.cancelConversation, 'function');
});

test('a new memory state is kept and its synced projection saved with the settings only when it changes', async () => {
  const { runtime, saved, state, getMemoryState } = harness();
  const next = { profileEntries: [{ id: 'p1', content: 'Likes tea', confirmedByUser: true }] };
  assert.equal(runtime.replaceMemoryState(next), next);
  assert.equal(getMemoryState(), next);
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(state.config.memorySync, 'the projection is kept in the settings');
  const saves = saved.filter((what) => what === 'config').length;
  assert.ok(saves >= 1);
  runtime.replaceMemoryState(next);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(saved.filter((what) => what === 'config').length, saves, 'the same projection is not saved again');
});
