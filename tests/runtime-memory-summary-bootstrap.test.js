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
