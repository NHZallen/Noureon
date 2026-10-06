import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemorySummaryBootstrap } from '../src/app/runtime/memory/memory-summary-bootstrap.js';

test('starts an initial summary for existing normal chats and skips an already fresh summary', async () => {
  let rebuilds = 0;
  let memoryState = {};
  const bootstrap = createMemorySummaryBootstrap({
    getMemoryState: () => memoryState,
    getConversations: () => [
      { id: 'temporary', isTemporary: true, messages: [{ role: 'user' }] },
      { id: 'saved', messages: [{ role: 'user' }] }
    ],
    rebuildSummary: async () => { rebuilds += 1; return { state: 'complete' }; }
  });

  await bootstrap();
  memoryState = { memorySummary: { needsRefresh: false } };
  const skipped = await bootstrap();
  await bootstrap({ force: true });

  assert.equal(rebuilds, 2);
  assert.deepEqual(skipped, { skipped: true });
});

test('a start of the app does not retry a summary rebuild that failed, but a forced one does', async () => {
  let rebuilds = 0;
  const memoryState = { memorySummary: { status: 'failed', needsRefresh: true, lastError: '1 memory task failed.' } };
  const bootstrap = createMemorySummaryBootstrap({
    getMemoryState: () => memoryState,
    getConversations: () => [{ id: 'saved', messages: [{ role: 'user' }] }],
    rebuildSummary: async () => { rebuilds += 1; return { state: 'complete' }; }
  });

  const skipped = await bootstrap();
  assert.deepEqual(skipped, { skipped: true, reason: 'previous-rebuild-failed' });
  assert.equal(rebuilds, 0);

  await bootstrap({ force: true });
  assert.equal(rebuilds, 1);
});

test('a summary that needs a refresh but has not failed is still rebuilt at start', async () => {
  let rebuilds = 0;
  const bootstrap = createMemorySummaryBootstrap({
    getMemoryState: () => ({ memorySummary: { status: 'idle', needsRefresh: true } }),
    getConversations: () => [{ id: 'saved', messages: [{ role: 'user' }] }],
    rebuildSummary: async () => { rebuilds += 1; return {}; }
  });
  await bootstrap();
  assert.equal(rebuilds, 1);
});
