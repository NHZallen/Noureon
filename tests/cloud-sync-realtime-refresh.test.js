import test from 'node:test';
import assert from 'node:assert/strict';

import { createConversationRealtimeRefreshScheduler } from '../src/app/sync/cloud-sync-realtime-refresh.js';

function createFakeTimers() {
  let nextId = 1;
  const callbacks = new Map();
  return {
    schedule(callback) {
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    },
    cancel(id) {
      callbacks.delete(id);
    },
    runNext() {
      const next = callbacks.entries().next();
      assert.equal(next.done, false, 'expected a scheduled refresh');
      const [id, callback] = next.value;
      callbacks.delete(id);
      callback();
    },
    get pendingCount() {
      return callbacks.size;
    }
  };
}

const flushTasks = () => new Promise(resolve => setImmediate(resolve));

test('realtime refresh ignores stale sequences and coalesces a burst into one retry', async () => {
  const timers = createFakeTimers();
  const status = { enabled: true, currentRemoteWatermark: '10' };
  let retries = 0;
  const scheduler = createConversationRealtimeRefreshScheduler({
    getSync: () => ({
      getStatus: () => status,
      retry: async () => {
        retries += 1;
        status.currentRemoteWatermark = '12';
      }
    }),
    schedule: timers.schedule,
    cancel: timers.cancel
  });

  assert.equal(scheduler.request({ new: { sync_seq: 10 } }), false);
  assert.equal(timers.pendingCount, 0);
  assert.equal(scheduler.request({ new: { sync_seq: 11 } }), true);
  assert.equal(scheduler.request({ new: { sync_seq: 12 } }), true);
  assert.equal(timers.pendingCount, 1);

  timers.runNext();
  await flushTasks();

  assert.equal(retries, 1);
  assert.equal(timers.pendingCount, 0);
  assert.equal(scheduler.request({ new: { sync_seq: '12' } }), false);
});

test('an in-flight delta that reaches a newer pending sequence suppresses the trailing retry', async () => {
  const timers = createFakeTimers();
  const status = { enabled: true, currentRemoteWatermark: '10' };
  let retries = 0;
  let finishRetry;
  const scheduler = createConversationRealtimeRefreshScheduler({
    getSync: () => ({
      getStatus: () => status,
      retry: () => {
        retries += 1;
        return new Promise(resolve => { finishRetry = resolve; });
      }
    }),
    schedule: timers.schedule,
    cancel: timers.cancel
  });

  scheduler.request({ new: { sync_seq: '11' } });
  timers.runNext();
  await flushTasks();
  assert.equal(retries, 1);

  scheduler.request({ new: { sync_seq: '12' } });
  timers.runNext();
  status.currentRemoteWatermark = '12';
  finishRetry();
  await flushTasks();
  await flushTasks();

  assert.equal(retries, 1);
  assert.equal(timers.pendingCount, 0);
});

test('a sequence-less invalidation forces one gap-closing refresh', async () => {
  const timers = createFakeTimers();
  const status = { enabled: true, currentRemoteWatermark: '20' };
  let retries = 0;
  const scheduler = createConversationRealtimeRefreshScheduler({
    getSync: () => ({
      getStatus: () => status,
      retry: async () => { retries += 1; }
    }),
    schedule: timers.schedule,
    cancel: timers.cancel
  });

  assert.equal(scheduler.request(), true);
  timers.runNext();
  await flushTasks();

  assert.equal(retries, 1);
  assert.equal(timers.pendingCount, 0);
});
