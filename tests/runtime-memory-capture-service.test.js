import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryCaptureService } from '../src/app/runtime/memory/memory-capture-service.js';

test('captures a completed turn once into separate recent state, capsule, and review-only candidates', async () => {
  let memoryState = {
    version: 2,
    profileEntries: [{ id: 'brief', status: 'active', confirmedByUser: true, kind: 'preference', content: '回答要簡短' }],
    recentConversationStates: [],
    conversationCapsules: [],
    profileCandidates: []
  };
  const calls = [];
  const indexed = [];
  const service = createMemoryCaptureService({
    captureClient: {
      capture: async input => {
        calls.push(input);
        return {
          recentTurnSummary: '使用者決定用 Gemini 3.1 Flash Lite。',
          capsule: {
            topic: '記憶系統模型選擇',
            summary: '使用者選擇 Gemini 3.1 Flash Lite 做摘要。',
            confirmedDecisions: ['摘要模型使用 Gemini 3.1 Flash Lite'],
            openQuestions: ['何時啟用跨對話回憶']
          },
          profileCandidates: [{
            kind: 'preference',
            content: '使用繁體中文回答',
            extractionConfidence: 0.95,
            sourceTurnIndexes: [0],
            suggestedSupersedes: ['brief', 'missing']
          }]
        };
      }
    },
    getMemoryState: () => memoryState,
    replaceMemoryState: next => { memoryState = next; },
    indexCapsule: async payload => indexed.push(payload),
    createId: prefix => `${prefix}-id`,
    now: () => '2026-07-11T12:00:00.000Z'
  });
  const turns = [
    { id: 'user-1', role: 'user', text: '摘要模型用 Gemini 3.1 Flash Lite。' },
    { id: 'assistant-1', role: 'model', text: '我會照這個設定。' }
  ];

  const first = await service.captureCompletedTurn({
    conversationId: 'conversation-1',
    sourceHash: 'turn-hash-1',
    turns
  });
  const second = await service.captureCompletedTurn({
    conversationId: 'conversation-1',
    sourceHash: 'turn-hash-1',
    turns
  });

  assert.equal(first.captured, true);
  assert.deepEqual(second, { captured: false, reason: 'unchanged-source' });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].activeProfileEntries, [{ id: 'brief', kind: 'preference', content: '回答要簡短' }]);
  assert.deepEqual(indexed, [{
    capsule: memoryState.conversationCapsules[0],
    sourceHash: 'turn-hash-1'
  }]);
  assert.deepEqual(memoryState.recentConversationStates, [{
    conversationId: 'conversation-1',
    recentTurnSummary: '使用者決定用 Gemini 3.1 Flash Lite。',
    coveredThroughMessageId: 'assistant-1',
    sourceHash: 'turn-hash-1',
    updatedAt: '2026-07-11T12:00:00.000Z'
  }]);
  assert.deepEqual(memoryState.conversationCapsules[0].sourceRefs, [
    { messageId: 'user-1', role: 'user', claimType: 'source-turn' },
    { messageId: 'assistant-1', role: 'assistant', claimType: 'proposal' }
  ]);
  assert.equal(memoryState.profileCandidates[0].status, 'review');
  assert.equal(memoryState.profileCandidates[0].confirmedByUser, false);
  assert.deepEqual(memoryState.profileCandidates[0].suggestedSupersedes, ['brief']);
});

test('history rebuild capture never adds profile candidates from old conversations', async () => {
  let memoryState = { recentConversationStates: [], conversationCapsules: [], profileCandidates: [] };
  const service = createMemoryCaptureService({
    captureClient: { capture: async () => ({
      recentTurnSummary: 'summary',
      capsule: { topic: 'topic', summary: 'summary', confirmedDecisions: [], openQuestions: [] },
      profileCandidates: [{ kind: 'preference', content: 'candidate', extractionConfidence: 1, sourceTurnIndexes: [0] }]
    }) },
    getMemoryState: () => memoryState,
    replaceMemoryState: next => { memoryState = next; },
    createId: prefix => `${prefix}-id`
  });

  await service.captureCompletedTurn({
    conversationId: 'old-chat',
    sourceHash: 'old-hash',
    turns: [{ id: 'message-1', role: 'user', text: 'old text' }],
    collectProfileCandidates: false
  });

  assert.deepEqual(memoryState.profileCandidates, []);
});
