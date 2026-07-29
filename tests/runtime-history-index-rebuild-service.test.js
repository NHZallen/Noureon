import assert from 'node:assert/strict';
import test from 'node:test';

import { createHistoryIndexStore } from '../src/app/runtime/memory/history-index-store.js';
import { hasCurrentHistoryIndexRecords } from '../src/app/runtime/memory/history-index-records.js';
import { createHistoryIndexRebuildService } from '../src/app/runtime/memory/history-index-rebuild-service.js';
import {
  buildHistoryIndexTurns,
  serializeHistoryIndexSource
} from '../src/app/runtime/memory/history-index-source.js';
import { createHistoryIndexingService } from '../src/app/runtime/memory/history-indexing-service.js';
import { createMemoryCaptureService } from '../src/app/runtime/memory/memory-capture-service.js';

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

test('adopts a verified legacy source fingerprint without replaying model or embedding work', async () => {
  const migrations = [];
  let captures = 0;
  const service = createHistoryIndexRebuildService({
    getConversations: () => [
      { id: 'chat-1', messages: [{ id: 'old-id', role: 'user', parts: [{ text: 'Same text' }] }] }
    ],
    getMemoryState: () => ({ recentConversationStates: [{ conversationId: 'chat-1', sourceHash: 'legacy-source' }] }),
    hashString: async value => value.includes('"id":"old-id"') ? 'legacy-source' : 'stable-source',
    hasIndexedSource: ({ sourceHash }) => sourceHash === 'legacy-source',
    migrateSourceFingerprint: async options => { migrations.push(options); return true; },
    captureCompletedTurn: async () => { captures += 1; return { captured: true }; }
  });

  const result = await service.rebuild();

  assert.equal(captures, 0);
  assert.deepEqual(migrations, [{
    conversationId: 'chat-1',
    previousSourceHash: 'legacy-source',
    nextSourceHash: 'stable-source'
  }]);
  assert.equal(result.completed, 1);
  assert.equal(result.skipped, 1);
});

test('repairs a missing production index even when derived memory has the same source hash', async () => {
  const conversation = {
    id: 'chat-1',
    messages: [{ id: 'message-1', role: 'user', parts: [{ text: 'Remember this detail.' }] }]
  };
  const turns = buildHistoryIndexTurns(conversation);
  const hashString = async value => `hash:${value}`;
  const sourceHash = await hashString(serializeHistoryIndexSource(turns));
  let memoryState = {
    recentConversationStates: [{
      conversationId: conversation.id,
      recentTurnSummary: 'Existing summary',
      sourceHash
    }],
    conversationCapsules: [{
      id: 'capsule-1',
      conversationId: conversation.id,
      topic: 'Existing topic',
      summary: 'Existing summary',
      confirmedDecisions: [],
      openQuestions: []
    }],
    profileCandidates: []
  };
  const index = createHistoryIndexStore();
  let captureModelCalls = 0;
  const indexing = createHistoryIndexingService({
    index,
    embeddingClient: { embedHistoryDocument: async () => [1, 0] }
  });
  const capture = createMemoryCaptureService({
    captureClient: {
      capture: async () => {
        captureModelCalls += 1;
        return {
          recentTurnSummary: 'Existing summary',
          capsule: {
            topic: 'Existing topic',
            summary: 'Existing summary',
            confirmedDecisions: [],
            openQuestions: []
          },
          profileCandidates: []
        };
      }
    },
    getMemoryState: () => memoryState,
    replaceMemoryState: next => { memoryState = next; },
    indexCapsule: options => indexing.indexCapsule(options),
    indexConversationFragments: options => indexing.indexConversationFragments(options),
    createId: prefix => `${prefix}:new`
  });
  const service = createHistoryIndexRebuildService({
    getConversations: () => [conversation],
    getMemoryState: () => memoryState,
    captureCompletedTurn: options => capture.captureCompletedTurn(options),
    repairIndexedSource: async options => {
      const capsule = memoryState.conversationCapsules
        .find(item => item.conversationId === options.conversationId);
      await indexing.indexCapsule({ capsule, sourceHash: options.sourceHash });
      await indexing.indexConversationFragments(options);
      return { indexed: true };
    },
    hashString,
    hasIndexedSource: options => hasCurrentHistoryIndexRecords({
      ...options,
      records: index.getAll()
    })
  });

  const result = await service.rebuild();

  assert.equal(captureModelCalls, 0);
  assert.equal(result.indexed, 1);
  assert.equal(result.skipped, 0);
  assert.deepEqual(
    index.getAll().map(record => record.recordType).sort(),
    ['conversation-capsule', 'conversation-fragment']
  );
});
