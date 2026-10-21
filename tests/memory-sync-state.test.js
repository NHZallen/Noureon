import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemorySyncState } from '../src/app/runtime/memory/memory-sync-state.js';
import { projectMemoryStateForSync } from '../src/app/runtime/memory/memory-sync-projection.js';

const harness = (memorySync) => {
  const calls = [];
  let memoryState = { profileEntries: [], conversationCapsules: [{ id: 'local-capsule' }] };
  const state = { config: { memorySync } };
  const sync = createMemorySyncState({
    runtimeConfigAccess: { getConfig: () => state.config },
    runtimeAppDataStore: {
      getMemoryState: () => memoryState,
      replaceMemoryState: (next) => {
        calls.push('replaceMemoryState');
        memoryState = next;
        return memoryState;
      }
    },
    saveConfig: async () => calls.push('saveConfig'),
    saveAppData: async () => calls.push('saveAppData'),
    console: { warn: () => {} }
  });
  return { calls, state, sync, memoryState: () => memoryState };
};

const confirmed = { id: 'language', confirmedByUser: true, content: 'Traditional Chinese', updatedAt: '2026-07-11' };

test('a new memory state saves its projection in the synced settings only when the projection changed', async () => {
  const { calls, state, sync } = harness(null);
  const next = { profileEntries: [confirmed], conversationCapsules: [{ id: 'capsule' }] };
  assert.equal(sync.replaceMemoryState(next), next);
  assert.deepEqual(state.config.memorySync, projectMemoryStateForSync(next));
  assert.ok(!JSON.stringify(state.config.memorySync).includes('capsule'), 'the conversation capsules stay on the device');
  await Promise.resolve();
  assert.deepEqual(calls, ['replaceMemoryState', 'saveConfig']);

  calls.length = 0;
  sync.replaceMemoryState({ ...next });
  assert.deepEqual(calls, ['replaceMemoryState'], 'the same projection is not saved again');
});

test('a projection with the summary fields of the earlier format is saved again in the current one', async () => {
  const { calls, state, sync } = harness({ ...projectMemoryStateForSync({}), memorySummary: 'old summary' });
  sync.replaceMemoryState({});
  assert.equal(state.config.memorySync.memorySummary, undefined);
  assert.deepEqual(calls, ['replaceMemoryState', 'saveConfig']);
});

test('at the start, the projection of another device is merged into the local memory state and both are saved', async () => {
  const { calls, memoryState, sync } = harness(projectMemoryStateForSync({ profileEntries: [confirmed] }));
  await sync.restoreMemorySync();
  assert.deepEqual(memoryState().profileEntries.map((entry) => entry.id), ['language']);
  assert.deepEqual(memoryState().conversationCapsules, [{ id: 'local-capsule' }], 'what is only on this device is kept');
  assert.deepEqual(calls, ['replaceMemoryState', 'saveAppData']);

  const empty = harness(null);
  await empty.sync.restoreMemorySync();
  assert.deepEqual(empty.calls, [], 'nothing to restore without a projection');
});
