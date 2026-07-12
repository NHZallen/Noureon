import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryWorkScheduler } from '../src/app/runtime/memory/memory-work-scheduler.js';

test('coalesces rapid updates for one conversation into the newest job', async () => {
  const jobs = [];
  const scheduled = [];
  const scheduler = createMemoryWorkScheduler({
    runJob: async (job) => jobs.push(job),
    schedule: (callback) => {
      scheduled.push(callback);
      return callback;
    },
    cancel: () => {}
  });

  scheduler.enqueueCapture({ conversationId: 'conversation-1', sourceHash: 'first' });
  scheduler.enqueueCapture({ conversationId: 'conversation-1', sourceHash: 'second' });

  await scheduled.at(-1)();

  assert.deepEqual(jobs, [{ conversationId: 'conversation-1', sourceHash: 'second' }]);
});

test('cancels queued work when its conversation is deleted', () => {
  const cancelled = [];
  const scheduler = createMemoryWorkScheduler({
    runJob: async () => {},
    schedule: () => 'timer-1',
    cancel: (timer) => cancelled.push(timer)
  });

  scheduler.enqueueCapture({ conversationId: 'conversation-1', sourceHash: 'first' });
  scheduler.cancelConversation('conversation-1');

  assert.deepEqual(cancelled, ['timer-1']);
  assert.equal(scheduler.getPendingJob('conversation-1'), null);
});

test('preserves the newest capture payload for delayed work', async () => {
  const jobs = [];
  let scheduled;
  const scheduler = createMemoryWorkScheduler({
    runJob: async job => jobs.push(job),
    schedule: callback => {
      scheduled = callback;
      return 'timer';
    },
    cancel: () => {}
  });

  scheduler.enqueueCapture({
    conversationId: 'conversation-1',
    sourceHash: 'turn-hash',
    turns: [{ id: 'user-1', role: 'user', text: '記憶測試' }]
  });
  await scheduled();

  assert.deepEqual(jobs[0].turns, [{ id: 'user-1', role: 'user', text: '記憶測試' }]);
});
