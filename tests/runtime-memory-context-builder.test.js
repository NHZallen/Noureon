import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildMemoryContext,
  formatMemoryContextForModel
} from '../src/app/runtime/memory/memory-context-builder.js';

test('keeps a stored name out of a normal reply context while retaining confirmed preferences', () => {
  const context = buildMemoryContext({
    currentChatSummary: '正在討論記憶功能。',
    profileEntries: [
      {
        id: 'name',
        kind: 'identity',
        content: '使用者名字是 Allen',
        status: 'active',
        confirmedByUser: true,
        mentionPolicy: 'only-on-request'
      },
      {
        id: 'language',
        kind: 'preference',
        content: '使用繁體中文回答',
        status: 'active',
        confirmedByUser: true
      }
    ],
    suppressionRules: [{ type: 'do-not-mention', target: 'profile-name', scope: 'generic-chat' }]
  });

  assert.deepEqual(context.profileEntries, [{
    id: 'language',
    kind: 'preference',
    content: '使用繁體中文回答'
  }]);
  assert.deepEqual(context.instructions, ['Do not use stored names as unsolicited forms of address.']);
  assert.equal(context.currentChatSummary, '正在討論記憶功能。');
});

test('includes an identity entry only after an explicit local permission', () => {
  const context = buildMemoryContext({
    profileEntries: [{
      id: 'name',
      kind: 'identity',
      content: '使用者名字是 Allen',
      status: 'active',
      confirmedByUser: true,
      mentionPolicy: 'only-on-request'
    }],
    requestedProfileEntryIds: ['name']
  });

  assert.deepEqual(context.profileEntries, [{
    id: 'name',
    kind: 'identity',
    content: '使用者名字是 Allen'
  }]);
  assert.deepEqual(context.instructions, []);
});

test('removes suppressed historical results before composing a context packet', () => {
  const context = buildMemoryContext({
    historyResults: [
      { recordId: 'allowed', summary: '以前討論過 Gemini 成本。', sourceIds: ['old-chat'] },
      { recordId: 'blocked', summary: '不應再被提起的內容。', sourceIds: ['private-chat'] }
    ],
    suppressionRules: [{ type: 'exclude-history-source', target: 'private-chat' }]
  });

  assert.deepEqual(context.historyResults, [{
    recordId: 'allowed',
    summary: '以前討論過 Gemini 成本。',
    sourceIds: ['old-chat']
  }]);
});

test('formats only the permitted memory facts without exposing source identifiers', () => {
  const formatted = formatMemoryContextForModel({
    currentChatSummary: '正在規劃記憶系統。',
    instructions: ['Do not use stored names as unsolicited forms of address.'],
    profileEntries: [{ id: 'language', kind: 'preference', content: '使用繁體中文回答' }],
    historyResults: [{
      recordId: 'old-memory-chat',
      summary: '先前討論過 Gemini Embedding 2 的成本控制。',
      sourceIds: ['conversation-123']
    }]
  });

  assert.match(formatted, /正在規劃記憶系統/);
  assert.match(formatted, /使用繁體中文回答/);
  assert.match(formatted, /Gemini Embedding 2/);
  assert.match(formatted, /Do not use stored names/);
  assert.doesNotMatch(formatted, /language|old-memory-chat|conversation-123/);
});

test('retains source conversation ids for the UI without placing them in the model prompt', () => {
  const context = buildMemoryContext({
    historyResults: [{
      recordId: 'history-record',
      conversationId: '11111111-1111-4111-8111-111111111111',
      summary: 'Prior project decision summary.',
      sourceIds: ['message-id']
    }]
  });

  assert.equal(context.historyResults[0].conversationId, '11111111-1111-4111-8111-111111111111');
  assert.doesNotMatch(formatMemoryContextForModel(context), /11111111-1111-4111-8111-111111111111|history-record|message-id/);
});

test('tells the answer model to reproduce an explicitly retrieved prior answer without exposing internal ids', () => {
  const context = buildMemoryContext({
    historyResults: [{
      recordId: 'exact-history-record',
      conversationId: '11111111-1111-4111-8111-111111111111',
      summary: 'Assistant: 200g dark chocolate, then chill for four hours.',
      sourceIds: ['message-id'],
      matchMode: 'exact'
    }]
  });
  const formatted = formatMemoryContextForModel(context);

  assert.equal(context.exactHistoryRecall, true);
  assert.match(formatted, /Exact prior-answer request/);
  assert.match(formatted, /reproduce that assistant answer faithfully and completely/);
  assert.doesNotMatch(formatted, /11111111-1111-4111-8111-111111111111|exact-history-record|message-id|matchMode/);
});

test('selects fresh relevant summary sections and makes manual updates authoritative to the answer model', () => {
  const context = buildMemoryContext({
    currentMessageText: 'Is this CLI a good fit for my VPS?',
    memorySummary: {
      overview: 'The user prefers practical deployment advice.',
      sections: [
        { title: 'Deployment', content: 'Use the NUC for local agent workloads; keep VPS services lightweight.', authority: 'manual', updatedAt: '2026-07-29T00:00:00.000Z' },
        { title: 'Image workflow', content: 'The device has 8GB VRAM.', updatedAt: '2026-07-28T00:00:00.000Z' }
      ]
    }
  });
  const formatted = formatMemoryContextForModel(context);

  assert.equal(context.memorySummary.sections[0].authority, 'manual');
  assert.match(formatted, /Fresh user memory summary/);
  assert.match(formatted, /User-authoritative update — Deployment/);
  assert.match(formatted, /keep VPS services lightweight/);
  assert.doesNotMatch(formatted, /memory-summary:|updatedAt/);
});
