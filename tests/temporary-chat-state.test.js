import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canCaptureConversationMessage,
  createPersistableAppDataSnapshot,
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
