import assert from 'node:assert/strict';
import test from 'node:test';

import { createHistoryIndex } from '../src/app/runtime/memory-notes/history-index.js';
import { createPageHistory } from '../src/app/runtime/memory-store/page-history.js';
import { EMPTY_MESSAGES, defaultStubOf, stubObjectFrom } from '../src/app/runtime/kernel/conversation-stub.js';

// The memory's search over past conversations, with conversations that are only stubs (docs/superpowers/specs/2026-11-12-on-demand-loading-design.md §5):
// a stub never empties what the index holds, and is cut from its record in the background, a batch at a time.

const talk = (id, word) => ({
  id, title: id, lastUpdatedAt: '2026-11-01T00:00:00.000Z', createdAt: '2026-11-01T00:00:00.000Z',
  messages: [
    { id: `${id}-1`, role: 'user', createdAt: '2026-11-01T00:00:00.000Z', parts: [{ text: `Tell me about the ${word} migration plan for Mondays` }] },
    { id: `${id}-2`, role: 'model', createdAt: '2026-11-01T00:00:01.000Z', parts: [{ text: `The ${word} migration plan has three steps` }] }
  ]
});
const stubOf = conversation => stubObjectFrom(defaultStubOf(conversation));
const scanOf = records => async (conversations, visit) => { for (const conversation of conversations) visit(conversation, records.get(conversation.id).messages); return true; };

test('a stub does not empty what the index holds, and a stub the index never saw is skipped until it is warmed', async () => {
  const whole = talk('c1', 'zebra');
  const index = createHistoryIndex({ scan: scanOf(new Map([['c1', whole], ['c2', talk('c2', 'giraffe')]])) });
  index.update([whole]);
  assert.ok(index.search('zebra migration plan', { limit: 5 }).length > 0);

  // The conversation is let go of: the same numbers, no messages.
  const evicted = stubOf(whole);
  const unseen = stubOf(talk('c2', 'giraffe'));
  assert.equal(evicted.messages, EMPTY_MESSAGES);
  index.update([evicted, unseen]);
  assert.ok(index.search('zebra migration plan', { limit: 5 }).length > 0, 'what the index held of the let-go conversation is still there');
  assert.equal(index.has('c1'), true);
  assert.equal(index.has('c2'), false, 'a stub never read is not cut from nothing');
  assert.equal(index.search('giraffe migration plan', { limit: 5 }).some(hit => hit.conversationId === 'c2'), false);

  assert.equal(await index.warm([evicted, unseen]), 1, 'only the one the index lacks is read');
  assert.equal(index.has('c2'), true);
  assert.equal(index.search('giraffe migration plan', { limit: 5 }).some(hit => hit.conversationId === 'c2'), true);
});

test('the page history says it is not complete until every stub was looked at, so that the vectors of the others are not pruned', async () => {
  const records = new Map([['c1', talk('c1', 'zebra')], ['c2', talk('c2', 'giraffe')]]);
  const conversations = [stubOf(records.get('c1')), stubOf(records.get('c2'))];
  const history = createPageHistory({ getConversations: () => conversations });
  assert.equal(history.complete(), false);
  assert.equal(history.pieces().length, 0, 'nothing is cut from the stubs by the synchronous path');
  // (The background warm-up uses the loader's scan; without a loader the stubs stay unread, and the history keeps saying so.)
  assert.equal(history.complete(), false);
  conversations.forEach(conversation => Object.assign(conversation, { __stub: false, messages: records.get(conversation.id).messages }));
  assert.equal(history.complete(), true, 'whole conversations are complete by themselves');
  assert.ok(history.pieces().length > 0);
});
