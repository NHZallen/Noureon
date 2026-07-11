import assert from 'node:assert/strict';
import test from 'node:test';

import { createCurrentMemoryContextProvider } from '../src/app/runtime/memory/current-memory-context-provider.js';

test('provides confirmed profile preferences but not identities for normal v2 requests', () => {
  const getMemoryContext = createCurrentMemoryContextProvider({
    getMemoryState: () => ({
      profileEntries: [
        { id: 'name', kind: 'identity', content: '使用者名字是 Allen', status: 'active', confirmedByUser: true, mentionPolicy: 'only-on-request' },
        { id: 'language', kind: 'preference', content: '使用繁體中文回答', status: 'active', confirmedByUser: true }
      ],
      suppressionRules: [{ type: 'do-not-mention', target: 'profile-name', scope: 'generic-chat' }]
    })
  });

  const context = getMemoryContext({ config: { memoryProfileEnabled: true } });

  assert.deepEqual(context.profileEntries, [{ id: 'language', kind: 'preference', content: '使用繁體中文回答' }]);
  assert.deepEqual(context.historyResults, []);
});

test('omits all profile entries when profile memory is disabled', () => {
  const getMemoryContext = createCurrentMemoryContextProvider({
    getMemoryState: () => ({
      profileEntries: [{ id: 'language', kind: 'preference', content: '使用繁體中文回答', status: 'active', confirmedByUser: true }],
      suppressionRules: []
    })
  });

  const context = getMemoryContext({ config: { memoryProfileEnabled: false } });

  assert.deepEqual(context.profileEntries, []);
});

test('retrieves historical summaries only when history recall is enabled', async () => {
  const calls = [];
  const getMemoryContext = createCurrentMemoryContextProvider({
    getMemoryState: () => ({
      recentConversationStates: [{ conversationId: 'current', recentTurnSummary: 'current summary' }],
      profileEntries: [],
      suppressionRules: []
    }),
    retrieveHistory: async options => {
      calls.push(options);
      return [{ recordId: 'old', summary: 'relevant old discussion', sourceIds: ['message-1'] }];
    }
  });

  const disabled = getMemoryContext({
    config: { historyRecallEnabled: false },
    conversation: { id: 'current' },
    currentMessage: { parts: [{ text: 'question' }] }
  });
  assert.deepEqual(disabled.historyResults, []);

  const enabled = await getMemoryContext({
    config: { historyRecallEnabled: true },
    conversation: { id: 'current' },
    currentMessage: { parts: [{ text: 'question' }] }
  });
  assert.equal(calls.length, 1);
  assert.equal(enabled.currentChatSummary, 'current summary');
  assert.deepEqual(enabled.historyResults, [{ recordId: 'old', summary: 'relevant old discussion', sourceIds: ['message-1'] }]);
});
