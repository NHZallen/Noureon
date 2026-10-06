import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canCaptureConversationMessage,
  createPersistableAppDataSnapshot,
  isEmptyTemporaryConversation,
  isEphemeralConversation
} from '../src/app/runtime/features/temporary-chat-state.js';

test('temporary conversations are removed from persistence without mutating live app data', () => {
  const temporary = { id: 'temporary', retentionMode: 'ephemeral', messages: [{ role: 'user' }] };
  const ordinary = { id: 'ordinary', messages: [{ role: 'user' }] };
  const live = { conversations: [temporary, ordinary], folders: [], astras: [], personalMemories: [] };

  const snapshot = createPersistableAppDataSnapshot(live);

  assert.deepEqual(snapshot.conversations, [ordinary]);
  assert.deepEqual(live.conversations, [temporary, ordinary]);
  assert.equal(isEphemeralConversation(temporary), true);
});

test('persistence preserves the original snapshot reference when no temporary chat exists', () => {
  const live = { conversations: [{ id: 'ordinary' }] };
  assert.equal(createPersistableAppDataSnapshot(live), live);
});

test('memory capture starts only with messages sent after permanent save', () => {
  const beforeSave = { role: 'user', parts: [{ text: 'private before save' }] };
  const afterSave = { role: 'user', parts: [{ text: 'ordinary after save' }] };
  const conversation = {
    retentionMode: 'persistent',
    memoryCaptureStartIndex: 1,
    messages: [beforeSave, afterSave]
  };

  assert.equal(canCaptureConversationMessage(conversation, beforeSave), false);
  assert.equal(canCaptureConversationMessage(conversation, afterSave), true);
  assert.equal(canCaptureConversationMessage({ ...conversation, retentionMode: 'ephemeral' }, afterSave), false);
});

test('the empty chat waiting for the next message is not persisted, but a temporary chat with messages is', () => {
  const empty = { id: 'empty', isTemporary: true, messages: [] };
  const started = { id: 'started', isTemporary: true, messages: [{ role: 'user' }] };
  const ordinary = { id: 'ordinary', isTemporary: false, messages: [] };
  const live = { conversations: [empty, started, ordinary], folders: [], astras: [], personalMemories: [] };

  const snapshot = createPersistableAppDataSnapshot(live);

  assert.deepEqual(snapshot.conversations.map(conversation => conversation.id), ['started', 'ordinary']);
  assert.equal(live.conversations.length, 3, 'the live data is not changed');
  assert.equal(isEmptyTemporaryConversation(empty), true);
  assert.equal(isEmptyTemporaryConversation(started), false);
  assert.equal(isEmptyTemporaryConversation(ordinary), false);
  assert.equal(isEmptyTemporaryConversation({ isTemporary: true }), true, 'a chat without a message list is empty');
});
