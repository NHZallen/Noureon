import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryRuntime } from '../src/app/runtime/memory/memory-runtime.js';

function harness() {
  const bindings = new Map();
  const saved = [];
  let memoryState = {};
  const state = { config: { memorySync: null }, conversations: [], currentUser: { username: 'alice' } };
  const runtime = createMemoryRuntime({
    document: { dispatchEvent() {} }, Event: class {}, fetch: async () => ({ ok: false }), crypto: globalThis.crypto,
    setTimeout: () => 0, clearTimeout: () => {}, console: { warn() {}, error() {}, log() {} }, state,
    runtimeAppDataStore: { getMemoryState: () => memoryState, replaceMemoryState: (next) => { memoryState = next; return next; } },
    runtimeStorageAdapter: null,
    legacyRuntimeContext: { registerLazyBinding: (name, resolve) => bindings.set(name, resolve) },
    models: [], runMemoryModel: null, modelSupportsVision: () => false, getApiKeyForProvider: () => '',
    hashString: async (value) => String(value), saveAppData: async () => saved.push('app'), saveConfig: async () => saved.push('config')
  });
  return { runtime, bindings, saved, state, getMemoryState: () => memoryState };
}

test('the memory services are registered on the runtime context for the settings, the reply and the trash', () => {
  const { runtime, bindings } = harness();
  for (const name of ['memory.retrieveHistory', 'memory.grantHistoryRecallConsent', 'memory.revokeHistoryRecallConsent', 'memory.getHistoryRecallStatus',
    'memory.invalidateConversation', 'memory.rebuildHistoryIndex', 'memory.auditHistoryIndex', 'memory.optimizeHistoryIndex']) {
    assert.equal(typeof bindings.get(name)?.(), 'function', name);
  }
  assert.equal(bindings.get('memory.invalidateConversation')(), runtime.invalidateMemoryConversation);
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
