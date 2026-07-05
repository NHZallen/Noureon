import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mergeWorkspaceAppDataForCloud,
  prepareWorkspaceAppDataForCloud,
  preserveLocalFolderUiState
} from '../src/app/sync/cloud-workspace-app-data.js';

test('workspace app-data upload removes device-only folder state and empty temporary chats', () => {
  const prepared = prepareWorkspaceAppDataForCloud({
    conversations: [
      { id: 'temp-empty', isTemporary: true, messages: [], folderId: 'folder-1' },
      { id: 'real-chat', isTemporary: false, messages: [{ role: 'user' }], folderId: 'folder-1' }
    ],
    folders: [{ id: 'folder-1', isOpen: true, conversationIds: ['stale'] }],
    astras: [],
    personalMemories: []
  });

  assert.deepEqual(prepared.conversations.map(conversation => conversation.id), ['real-chat']);
  assert.equal('isOpen' in prepared.folders[0], false);
  assert.deepEqual(prepared.folders[0].conversationIds, ['real-chat']);
});

test('workspace app-data upload retains trashed conversations outside folder membership', () => {
  const deletedAt = '2026-07-06T01:02:03.000Z';
  const prepared = prepareWorkspaceAppDataForCloud({
    conversations: [{
      id: 'trashed-chat',
      deletedAt,
      folderId: null,
      messages: [{ role: 'user', parts: [{ text: 'Keep in trash' }] }]
    }],
    folders: [{ id: 'folder-1', conversationIds: ['trashed-chat'] }]
  });

  assert.equal(prepared.conversations[0].deletedAt, deletedAt);
  assert.deepEqual(prepared.folders[0].conversationIds, []);
});

test('workspace app-data merge synchronizes moving a conversation to trash', () => {
  const baseConversation = {
    id: 'chat-1',
    deletedAt: null,
    folderId: 'folder-1',
    messages: [{ role: 'user', parts: [{ text: 'Question' }] }]
  };
  const base = {
    conversations: [baseConversation],
    folders: [{ id: 'folder-1', conversationIds: ['chat-1'] }]
  };
  const deletedAt = '2026-07-06T01:02:03.000Z';
  const merged = mergeWorkspaceAppDataForCloud({
    base,
    local: {
      conversations: [{ ...baseConversation, deletedAt, folderId: null }],
      folders: [{ id: 'folder-1', conversationIds: [] }]
    },
    remote: base
  });

  assert.equal(merged.conversations[0].deletedAt, deletedAt);
  assert.equal(merged.conversations[0].folderId, null);
  assert.deepEqual(merged.folders[0].conversationIds, []);
});

test('workspace app-data merge synchronizes trash restore and permanent deletion', () => {
  const deletedAt = '2026-07-06T01:02:03.000Z';
  const trashedConversation = {
    id: 'chat-1',
    deletedAt,
    folderId: null,
    messages: [{ role: 'user', parts: [{ text: 'Question' }] }]
  };
  const base = { conversations: [trashedConversation], folders: [] };

  const restored = mergeWorkspaceAppDataForCloud({
    base,
    local: { conversations: [{ ...trashedConversation, deletedAt: null }], folders: [] },
    remote: base
  });
  assert.equal(restored.conversations[0].deletedAt, null);

  const permanentlyDeleted = mergeWorkspaceAppDataForCloud({
    base,
    local: { conversations: [], folders: [] },
    remote: base
  });
  assert.deepEqual(permanentlyDeleted.conversations, []);
});

test('workspace app-data merge keeps remote answer and local folder move together', () => {
  const base = {
    conversations: [{ id: 'chat-1', folderId: null, messages: [{ role: 'user', parts: [{ text: 'Q' }] }] }],
    folders: [{ id: 'folder-1', isOpen: false, conversationIds: [] }],
    astras: [],
    personalMemories: []
  };
  const local = {
    ...base,
    conversations: [{ ...base.conversations[0], folderId: 'folder-1' }],
    folders: [{ id: 'folder-1', isOpen: true, conversationIds: ['chat-1'] }]
  };
  const remote = {
    ...base,
    conversations: [{
      ...base.conversations[0],
      messages: [...base.conversations[0].messages, { role: 'model', parts: [{ text: 'A' }] }]
    }]
  };

  const merged = mergeWorkspaceAppDataForCloud({ base, local, remote });

  assert.equal(merged.conversations[0].folderId, 'folder-1');
  assert.equal(merged.conversations[0].messages[1].parts[0].text, 'A');
  assert.deepEqual(merged.folders[0].conversationIds, ['chat-1']);
  assert.equal('isOpen' in merged.folders[0], false);
});

test('remote workspace application preserves local folder expansion state', () => {
  const next = preserveLocalFolderUiState(
    { folders: [{ id: 'folder-1', isOpen: true }] },
    { folders: [{ id: 'folder-1', name: 'Synced', isOpen: false }] }
  );

  assert.equal(next.folders[0].isOpen, true);
  assert.equal(next.folders[0].name, 'Synced');
});
