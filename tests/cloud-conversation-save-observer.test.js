import assert from 'node:assert/strict';
import test from 'node:test';

import { notifyCloudConversationSave } from '../src/app/runtime/kernel/cloud-conversation-save-observer.js';

test('save observer queues one debounced capture without forcing an immediate flush', () => {
  const snapshot = { conversations: [{ id: 'conversation-1' }] };
  const calls = [];
  const sync = {
    captureWorkspace(workspace, metadata) {
      calls.push(['capture', workspace, metadata]);
      return true;
    },
    flush() {
      calls.push(['flush']);
    }
  };

  assert.equal(notifyCloudConversationSave(snapshot, sync), true);
  assert.deepEqual(calls, [['capture', snapshot, undefined]]);
});

test('save observer forwards journal metadata to the active global sync', () => {
  const previousSync = globalThis.__astraCloudSyncV2;
  const metadata = { revision: 'revision-1' };
  const calls = [];
  globalThis.__astraCloudSyncV2 = {
    captureWorkspace: (...args) => {
      calls.push(args);
      return true;
    }
  };

  try {
    const snapshot = { folders: [] };
    assert.equal(notifyCloudConversationSave(snapshot, metadata), true);
    assert.deepEqual(calls, [[snapshot, metadata]]);
  } finally {
    if (previousSync === undefined) delete globalThis.__astraCloudSyncV2;
    else globalThis.__astraCloudSyncV2 = previousSync;
  }
});

test('immediate save starts a flush without blocking the local save observer', () => {
  const previousSync = globalThis.__astraCloudSyncV2;
  const calls = [];
  let releaseFlush;
  const flushGate = new Promise(resolve => { releaseFlush = resolve; });
  globalThis.__astraCloudSyncV2 = {
    captureWorkspace(snapshot, metadata) {
      calls.push(['capture', snapshot, metadata]);
      return true;
    },
    flush() {
      calls.push(['flush']);
      return flushGate;
    }
  };

  try {
    const snapshot = { conversations: [{ id: 'conversation-1' }] };
    const result = notifyCloudConversationSave(snapshot, { revision: 'revision-1', immediate: true });
    assert.equal(result, true);
    assert.equal(result instanceof Promise, false);
    assert.deepEqual(calls, [
      ['capture', snapshot, { revision: 'revision-1', immediate: true }],
      ['flush']
    ]);
  } finally {
    releaseFlush();
    if (previousSync === undefined) delete globalThis.__astraCloudSyncV2;
    else globalThis.__astraCloudSyncV2 = previousSync;
  }
});

test('immediate save does not flush a rejected capture and contains flush failures', async () => {
  const previousSync = globalThis.__astraCloudSyncV2;
  const warnings = [];
  let flushes = 0;
  globalThis.__astraCloudSyncV2 = {
    captureWorkspace: () => false,
    flush: () => { flushes += 1; }
  };

  try {
    assert.equal(notifyCloudConversationSave({}, { immediate: true }), false);
    assert.equal(flushes, 0);

    globalThis.__astraCloudSyncV2 = {
      captureWorkspace: () => true,
      flush: () => Promise.reject(new Error('network down'))
    };
    assert.equal(notifyCloudConversationSave({}, { immediate: true }, {
      warn: (...args) => warnings.push(args)
    }), true);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(warnings.length, 1);
    assert.match(warnings[0][0], /queued for retry/);
  } finally {
    if (previousSync === undefined) delete globalThis.__astraCloudSyncV2;
    else globalThis.__astraCloudSyncV2 = previousSync;
  }
});
