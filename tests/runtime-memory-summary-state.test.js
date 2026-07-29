import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyManualMemorySummaryEdit,
  clearAutomaticMemoryOverview,
  formatMemorySummaryForModel,
  reconcileMemoryOverview,
  normalizeMemoryEvidence,
  reconcileMemorySummary,
  removeMemorySummarySources
} from '../src/app/runtime/memory/memory-summary-state.js';

const NOW = '2026-07-29T04:00:00.000Z';
const options = {
  now: () => NOW,
  createId: prefix => `${prefix}:test`
};

test('keeps one evidence record per user message when the conversation snapshot hash changes', () => {
  const evidence = normalizeMemoryEvidence([
    { conversationId: 'chat', messageId: 'user-1', sourceHash: 'first', content: 'I use a VPS.', updatedAt: '2026-07-28T00:00:00.000Z' },
    { conversationId: 'chat', messageId: 'user-1', sourceHash: 'second', content: 'I use a VPS.', updatedAt: '2026-07-29T00:00:00.000Z' }
  ]);

  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].sourceHash, 'second');
});

test('drops expired automatic temporary states without removing a user-authored section', () => {
  const summary = reconcileMemorySummary({
    patch: {
      sections: [{
        key: 'trip', title: 'Trip', content: 'Travel plans for this week.', state: 'temporary-state',
        expiresAt: '2026-07-28T00:00:00.000Z', sourceConversationIds: ['chat'], sourceMessageIds: ['message']
      }]
    },
    allowedConversationIds: ['chat'],
    allowedMessageIds: ['message'],
    ...options
  });

  assert.deepEqual(summary.sections, []);
});

test('reconciles only model sections backed by the supplied user sources', () => {
  const summary = reconcileMemorySummary({
    patch: {
      overview: 'Current setup overview.',
      modelId: 'memory-model',
      sections: [
        {
          key: 'openclaw',
          title: 'OpenClaw',
          content: 'OpenClaw is currently planned for the NUC.',
          state: 'current-state',
          sourceConversationIds: ['chat-1'],
          sourceMessageIds: ['message-1']
        },
        {
          key: 'invented',
          title: 'Invented',
          content: 'This has no valid source.',
          sourceConversationIds: ['unknown'],
          sourceMessageIds: ['unknown']
        }
      ]
    },
    allowedConversationIds: ['chat-1'],
    allowedMessageIds: ['message-1'],
    ...options
  });

  assert.equal(summary.sections.length, 1);
  assert.equal(summary.sections[0].content, 'OpenClaw is currently planned for the NUC.');
  assert.equal(summary.lastModelId, 'memory-model');
  assert.match(formatMemorySummaryForModel(summary), /NUC/);
});

test('a manual edit remains authoritative when an automatic refresh revisits the topic', () => {
  const manual = applyManualMemorySummaryEdit({
    summary: { sections: [{ id: 'section-1', key: 'openclaw', title: 'OpenClaw', content: 'NUC' }] },
    title: 'OpenClaw',
    key: 'openclaw',
    content: 'OpenClaw currently runs on the NUC.',
    sectionId: 'section-1',
    ...options
  });
  const refreshed = reconcileMemorySummary({
    summary: manual,
    patch: {
      sections: [{
        key: 'openclaw',
        title: 'OpenClaw',
        content: 'OpenClaw runs on a VPS.',
        sourceConversationIds: ['chat-2'],
        sourceMessageIds: ['message-2']
      }]
    },
    allowedConversationIds: ['chat-2'],
    allowedMessageIds: ['message-2'],
    ...options
  });

  assert.equal(refreshed.sections[0].content, 'OpenClaw currently runs on the NUC.');
  assert.equal(refreshed.sections[0].authority, 'manual');
});

test('permanent deletion removes automatic sections whose sole source disappeared but retains manual text', () => {
  const result = removeMemorySummarySources({
    summary: {
      sections: [
        { id: 'automatic', title: 'Device', content: 'Use a NUC.', sourceConversationIds: ['old-chat'], sourceMessageIds: ['old-message'] },
        { id: 'manual', title: 'Style', content: 'Keep explanations practical.', authority: 'manual' }
      ]
    },
    evidence: [{ conversationId: 'old-chat', messageId: 'old-message', content: 'Use a NUC.' }],
    conversationId: 'old-chat',
    ...options
  });

  assert.deepEqual(result.summary.sections.map(section => section.id), ['manual']);
  assert.deepEqual(result.evidence, []);
  assert.equal(result.summary.needsRefresh, true);
});

test('keeps the display overview separate and marks it stale until the user refreshes it', () => {
  const summary = {
    overview: 'Complete state.',
    sections: [{ id: 'full', key: 'deployment', title: 'Deployment', content: 'Use the NUC.', updatedAt: NOW }],
    updatedAt: NOW
  };
  const overview = reconcileMemoryOverview({
    overview: { overview: 'Old display state.', sections: [], needsRefresh: true },
    patch: { overview: 'Current display state.', sections: [{ key: 'deployment', title: 'Deployment', content: 'NUC.' }] },
    memorySummary: summary,
    ...options
  });
  const afterDeletion = clearAutomaticMemoryOverview({ overview, ...options });

  assert.equal(overview.overview, 'Current display state.');
  assert.equal(overview.basedOnMemorySummaryUpdatedAt, NOW);
  assert.equal(afterDeletion.overview, '');
  assert.equal(afterDeletion.needsRefresh, true);
  assert.equal(afterDeletion.status, 'idle');
});

test('clears generated complete-summary prose when one of its sources is deleted', () => {
  const result = removeMemorySummarySources({
    summary: {
      overview: 'The deleted conversation said to use the VPS.',
      sections: [{
        id: 'deployment',
        key: 'deployment',
        title: 'Deployment',
        content: 'Use the VPS.',
        authority: 'automatic',
        sourceConversationIds: ['deleted-chat'],
        sourceMessageIds: ['deleted-message'],
        updatedAt: NOW
      }],
      updatedAt: NOW
    },
    evidence: [{
      conversationId: 'deleted-chat',
      messageId: 'deleted-message',
      content: 'Use the VPS.',
      updatedAt: NOW
    }],
    conversationId: 'deleted-chat',
    messageIds: ['deleted-message'],
    ...options
  });

  assert.equal(result.changed, true);
  assert.equal(result.summary.overview, '');
  assert.deepEqual(result.summary.sections, []);
});
