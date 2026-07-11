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
