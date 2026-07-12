import assert from 'node:assert/strict';
import test from 'node:test';

import { createHistoryIndexRebuildService } from '../src/app/runtime/memory/history-index-rebuild-service.js';

test('rebuilds text conversations sequentially without creating profile candidates', async () => {
  const calls = [];
  const states = [];
  const service = createHistoryIndexRebuildService({
    getConversations: () => [
      { id: 'chat-1', messages: [{ id: 'one', role: 'user', parts: [{ text: 'First chat' }] }] },
      { id: 'chat-2', messages: [{ id: 'two', role: 'model', parts: [{ text: 'Second chat' }] }] },
      { id: 'empty', messages: [] },
      { id: 'draft', isTemporary: true, messages: [{ role: 'user', parts: [{ text: 'Draft' }] }] }
    ],
    getMemoryState: () => ({ recentConversationStates: [] }),
    hashString: async value => `hash:${value.length}`,
    captureCompletedTurn: async options => {
      calls.push(options);
      return { captured: true };
    }
  });

  const result = await service.rebuild({ onProgress: status => states.push(status) });

  assert.deepEqual(result, { state: 'complete', completed: 2, total: 2, indexed: 2, skipped: 0, failed: 0 });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].collectProfileCandidates, false);
  assert.equal(calls[1].collectProfileCandidates, false);
  assert.deepEqual(states.at(-1), result);
});

test('skips an unchanged capsule and records individual failures without aborting the index', async () => {
  const service = createHistoryIndexRebuildService({
    getConversations: () => [
      { id: 'unchanged', messages: [{ id: 'one', role: 'user', parts: [{ text: 'Same' }] }] },
      { id: 'fails', messages: [{ id: 'two', role: 'user', parts: [{ text: 'Fails' }] }] }
    ],
    getMemoryState: () => ({ recentConversationStates: [{ conversationId: 'unchanged', sourceHash: 'same-hash' }] }),
    hashString: async turns => turns.includes('Same') ? 'same-hash' : 'other-hash',
    captureCompletedTurn: async () => { throw new Error('network'); }
  });

  const result = await service.rebuild();

  assert.deepEqual(result, { state: 'complete', completed: 2, total: 2, indexed: 0, skipped: 1, failed: 1 });
});

test('recaptures unchanged memory state when the stable index record is missing', async () => {
  let captures = 0;
  const service = createHistoryIndexRebuildService({
    getConversations: () => [
      { id: 'chat-1', messages: [{ id: 'one', role: 'user', parts: [{ text: 'Same' }] }] }
    ],
    getMemoryState: () => ({ recentConversationStates: [{ conversationId: 'chat-1', sourceHash: 'same-hash' }] }),
    hashString: async () => 'same-hash',
    hasIndexedSource: () => false,
    captureCompletedTurn: async () => { captures += 1; return { captured: true }; }
  });

  const result = await service.rebuild();

  assert.equal(captures, 1);
  assert.equal(result.indexed, 1);
  assert.equal(result.skipped, 0);
});
