import assert from 'node:assert/strict';
import test from 'node:test';

import { retryAsync } from '../src/app/bootstrap/retry-async.js';

test('retryAsync retries transient failures with bounded delays', async () => {
  const attempts = [];
  const waits = [];
  const result = await retryAsync(async attempt => {
    attempts.push(attempt);
    if (attempt < 3) throw new Error(`failure-${attempt}`);
    return 'ready';
  }, {
    maxAttempts: 4,
    delays: [10, 20, 30],
    wait: async delay => waits.push(delay)
  });

  assert.equal(result, 'ready');
  assert.deepEqual(attempts, [1, 2, 3]);
  assert.deepEqual(waits, [10, 20]);
});

test('retryAsync stops when the retry guard rejects another attempt', async () => {
  let attempts = 0;
  await assert.rejects(() => retryAsync(async () => {
    attempts += 1;
    throw new Error('published initializer failed');
  }, {
    maxAttempts: 4,
    shouldRetry: () => false
  }), /published initializer failed/);

  assert.equal(attempts, 1);
});
