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
