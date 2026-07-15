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
