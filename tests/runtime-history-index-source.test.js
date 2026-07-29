import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildHistoryIndexTurns,
  serializeHistoryIndexSource
} from '../src/app/runtime/memory/history-index-source.js';
import { createHistoryIndexRebuildService } from '../src/app/runtime/memory/history-index-rebuild-service.js';

test('history index source fingerprint ignores synced message ids and attachment transport payloads', () => {
  const beforeSync = buildHistoryIndexTurns({
    id: 'conversation',
    messages: [{
      role: 'user',
      parts: [
        { text: 'Does this CLI suit my VPS?' },
        { inlineData: { name: 'setup.png', mimeType: 'image/png', size: 128, data: 'base64-before-sync' } }
      ]
    }]
  });
  const afterSync = buildHistoryIndexTurns({
    id: 'conversation',
    messages: [{
      id: '11111111-1111-4111-8111-111111111111',
      role: 'user',
      parts: [
        { text: 'Does this CLI suit my VPS?' },
        { inlineData: { name: 'setup.png', mimeType: 'image/png', size: 128, data: { __astraCloudAsset: { path: 'user/hash' } } } }
      ]
    }]
  });

  assert.notEqual(beforeSync[0].id, afterSync[0].id);
  assert.equal(serializeHistoryIndexSource(beforeSync), serializeHistoryIndexSource(afterSync));
});

test('rebuild skips a synced conversation when only its transport id changed', async () => {
  const conversation = {
    id: 'conversation',
    messages: [{
      id: '11111111-1111-4111-8111-111111111111',
      role: 'user',
      parts: [{ text: 'Keep the VPS lightweight.' }]
    }]
  };
  const sourceHash = serializeHistoryIndexSource(buildHistoryIndexTurns(conversation));
  let captures = 0;
  const service = createHistoryIndexRebuildService({
    getConversations: () => [conversation],
    getMemoryState: () => ({ recentConversationStates: [{ conversationId: 'conversation', sourceHash }] }),
    hashString: async source => source,
    hasIndexedSource: () => true,
    captureCompletedTurn: async () => { captures += 1; return { captured: true }; }
  });

  const result = await service.rebuild();

  assert.equal(captures, 0);
  assert.equal(result.skipped, 1);
});
