import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';

import { messageIsCouncilTurn, withCouncilRecord } from '../src/app/ui/council/council-record.js';
import { encodeWorkspaceConversationShadow, decodeWorkspaceConversationShadow } from '../src/app/sync/cloud-sync-v2-codecs.js';

const council = { mode: 'deliberation', members: [{ id: 'a', name: 'A', status: 'done' }], stages: [{ key: 'firstRound', ms: 4000, done: 1 }] };

test('a message with the record of a council is a council turn, an ordinary one is not', () => {
  assert.equal(messageIsCouncilTurn({ role: 'model', parts: [{ text: withCouncilRecord('The answer.', council, { elapsedMs: 5000 }) }] }), true);
  assert.equal(messageIsCouncilTurn({ role: 'model', parts: [{ text: 'The answer.' }] }), false);
  assert.equal(messageIsCouncilTurn({ role: 'model', parts: [{ text: 'It says "council" in the text.' }] }), false);
  assert.equal(messageIsCouncilTurn({ role: 'user', parts: [{ text: 'hello' }] }), false);
  assert.equal(messageIsCouncilTurn(null), false);
});

test('a message sent to a council is one while its answer is still being made', () => {
  assert.equal(messageIsCouncilTurn({ role: 'user', parts: [{ text: 'hello' }], metadata: { councilTurn: { mode: 'consensus' } } }), true);
});

test('the mark of a council turn goes to the cloud and comes back with the message', async () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const conversationId = '22222222-2222-4222-8222-222222222222';
  const workspace = {
    folders: [],
    conversations: [{
      id: conversationId,
      title: 'Council',
      createdAt: '2026-10-19T01:00:00.000Z',
      messages: [{ role: 'user', parts: [{ text: 'hello' }], metadata: { councilTurn: { mode: 'consensus' } } }]
    }]
  };
  const encoded = await encodeWorkspaceConversationShadow({ workspace, userId, cryptoProvider: webcrypto });
  assert.deepEqual(encoded.messages[0].metadata, { councilTurn: { mode: 'consensus' } });
  const decoded = decodeWorkspaceConversationShadow({ folders: [], conversations: encoded.conversations, messages: encoded.messages, astras: [] });
  assert.equal(messageIsCouncilTurn(decoded.conversations[0].messages[0]), true);
});
