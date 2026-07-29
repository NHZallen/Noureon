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
  const indexedFragments = [];
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
          memorySummaryPatch: {
            overview: '完整記憶中的模型選擇。',
            sections: [{
              key: 'memory-model', title: '記憶模型', content: '使用 Gemini 3.1 Flash Lite 做摘要。',
              state: 'current-state', sourceTurnIndexes: [0]
            }]
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
    indexConversationFragments: async payload => indexedFragments.push(payload),
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
  assert.deepEqual(calls[0].memorySummary, {});
  assert.deepEqual(calls[0].activeProfileEntries, [{ id: 'brief', kind: 'preference', content: '回答要簡短' }]);
  assert.deepEqual(indexed, [{
    capsule: memoryState.conversationCapsules[0],
    sourceHash: 'turn-hash-1'
  }]);
  assert.deepEqual(indexedFragments, [{
    conversationId: 'conversation-1',
    turns,
    sourceHash: 'turn-hash-1',
    updatedAt: '2026-07-11T12:00:00.000Z'
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
  assert.equal(memoryState.memorySummary.sections[0].content, '使用 Gemini 3.1 Flash Lite 做摘要。');
  assert.equal(memoryState.memoryOverview.needsRefresh, true);
  assert.equal(memoryState.memoryOverview.overview, '', 'capturing a turn must not regenerate the user-facing overview');
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

test('rolls back derived metadata when local indexing fails', async () => {
  const originalState = {
    recentConversationStates: [{ conversationId: 'chat', sourceHash: 'old-hash' }],
    conversationCapsules: [{ id: 'old-capsule', conversationId: 'chat', summary: 'old' }]
  };
  let memoryState = originalState;
  const service = createMemoryCaptureService({
    captureClient: { capture: async () => ({
      recentTurnSummary: 'new',
      capsule: { topic: 'topic', summary: 'new', confirmedDecisions: [], openQuestions: [] },
      profileCandidates: []
    }) },
    getMemoryState: () => memoryState,
    replaceMemoryState: next => { memoryState = next; },
    indexCapsule: async () => { throw new Error('embedding unavailable'); },
    createId: prefix => `${prefix}-id`
  });

  await assert.rejects(() => service.captureCompletedTurn({
    conversationId: 'chat',
    sourceHash: 'new-hash',
    turns: [{ id: 'message-1', role: 'user', text: 'new text' }]
  }), /embedding unavailable/);

  assert.strictEqual(memoryState, originalState);
});

test('drops duplicate, assistant-sourced, and cross-kind replacement candidates', async () => {
  let memoryState = {
    profileEntries: [
      { id: 'name', kind: 'identity', content: 'Allen', status: 'active', confirmedByUser: true },
      { id: 'style', kind: 'preference', content: 'Keep replies concise', status: 'active', confirmedByUser: true }
    ],
    recentConversationStates: [],
    conversationCapsules: [],
    profileCandidates: []
  };
  const service = createMemoryCaptureService({
    captureClient: { capture: async () => ({
      recentTurnSummary: 'summary',
      capsule: { topic: 'topic', summary: 'summary', confirmedDecisions: [], openQuestions: [] },
      profileCandidates: [
        { kind: 'identity', content: 'Allen', extractionConfidence: 1, sourceTurnIndexes: [0], suggestedSupersedes: ['name'] },
        { kind: 'preference', content: 'Prefer detailed answers', extractionConfidence: 1, sourceTurnIndexes: [0], suggestedSupersedes: ['name', 'style'] },
        { kind: 'preference', content: 'Assistant preference', extractionConfidence: 1, sourceTurnIndexes: [1], suggestedSupersedes: [] }
      ]
    }) },
    getMemoryState: () => memoryState,
    replaceMemoryState: next => { memoryState = next; },
    createId: prefix => `${prefix}-id`
  });

  await service.captureCompletedTurn({
    conversationId: 'chat',
    sourceHash: 'hash',
    turns: [{ id: 'user', role: 'user', text: 'Use detailed answers.' }, { id: 'assistant', role: 'assistant', text: 'Okay.' }]
  });

  assert.equal(memoryState.profileCandidates.length, 1);
  assert.equal(memoryState.profileCandidates[0].content, 'Prefer detailed answers');
  assert.deepEqual(memoryState.profileCandidates[0].suggestedSupersedes, ['style']);
});
