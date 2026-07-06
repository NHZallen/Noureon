import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyAstraTombstones,
  applyWorkspaceTombstones,
  createAstraTombstoneIndex,
  createTombstoneIndex,
  filterEncodedWorkspaceByTombstones
} from '../src/app/sync/cloud-sync-v2-deletions.js';

const deletedConversationId = '22222222-2222-4222-8222-222222222222';
const deletedFolderId = '33333333-3333-4333-8333-333333333333';
const survivingConversationId = '44444444-4444-4444-8444-444444444444';
const survivingFolderId = '77777777-7777-4777-8777-777777777777';
const tombstones = [
  { entity_type: 'conversation', entity_id: deletedConversationId, deleted_at: '2026-07-06T02:00:00Z' },
  { entity_type: 'folder', entity_id: deletedFolderId, deleted_at: '2026-07-06T02:01:00Z' }
];

test('tombstone index records supported types and ignores unknown or incomplete rows', () => {
  const index = createTombstoneIndex([
    ...tombstones,
    { entity_type: 'message', entity_id: 'message-1' },
    { entity_type: 'conversation' },
    null
  ]);

  assert.deepEqual([...index.conversations], [deletedConversationId]);
  assert.deepEqual([...index.folders], [deletedFolderId]);
});

test('workspace tombstones remove entities, clear deleted folders, and re-derive membership immutably', () => {
  const workspace = {
    conversations: [
      { id: deletedConversationId, folderId: survivingFolderId, messages: [{ id: 'm1' }] },
      { id: survivingConversationId, folderId: deletedFolderId, messages: [] },
      { id: '55555555-5555-4555-8555-555555555555', folderId: survivingFolderId, messages: [] },
      { id: '66666666-6666-4666-8666-666666666666', folderId: survivingFolderId, deletedAt: '2026-07-06T02:02:00Z' }
    ],
    folders: [
      { id: deletedFolderId, conversationIds: [survivingConversationId] },
      { id: survivingFolderId, conversationIds: [deletedConversationId, 'stale-id'] }
    ],
    astras: [],
    personalMemories: []
  };
  const original = structuredClone(workspace);

  const result = applyWorkspaceTombstones(workspace, createTombstoneIndex(tombstones));

  assert.deepEqual(result.folders, [{
    id: survivingFolderId,
    conversationIds: ['55555555-5555-4555-8555-555555555555']
  }]);
  assert.deepEqual(result.conversations.map(item => item.id), [
    survivingConversationId,
    '55555555-5555-4555-8555-555555555555',
    '66666666-6666-4666-8666-666666666666'
  ]);
  assert.equal(result.conversations[0].folderId, null);
  assert.deepEqual(workspace, original);
  assert.notEqual(result, workspace);
});

test('workspace folder membership is derived in one conversation pass across multiple folders', () => {
  let folderIdReads = 0;
  const conversation = (id, folderId, deletedAt = null) => ({
    id,
    deletedAt,
    get folderId() {
      folderIdReads += 1;
      return folderId;
    }
  });
  const workspace = {
    conversations: [
      conversation('conversation-a', 'folder-a'),
      conversation('conversation-b', 'folder-b'),
      conversation('conversation-c', 'folder-a'),
      conversation('conversation-deleted', 'folder-c', '2026-07-06T03:00:00Z')
    ],
    folders: [
      { id: 'folder-a', conversationIds: [] },
      { id: 'folder-b', conversationIds: ['stale'] },
      { id: 'folder-c', conversationIds: ['conversation-deleted'] }
    ]
  };

  const result = applyWorkspaceTombstones(workspace, createTombstoneIndex());

  assert.deepEqual(result.folders.map(folder => folder.conversationIds), [
    ['conversation-a', 'conversation-c'],
    ['conversation-b'],
    []
  ]);
  assert.ok(folderIdReads <= workspace.conversations.length * 2);
});

test('workspace tombstone filtering rejects null and id-less conversation rows', () => {
  const result = applyWorkspaceTombstones({
    conversations: [null, {}, { id: 'valid-conversation', folderId: 'folder-a' }],
    folders: [null, {}, { id: 'folder-a', conversationIds: [] }]
  });

  assert.deepEqual(result.conversations, [{ id: 'valid-conversation', folderId: 'folder-a' }]);
  assert.deepEqual(result.folders, [{
    id: 'folder-a',
    conversationIds: ['valid-conversation']
  }]);
});

test('Astra tombstones remove deleted local Astras and block stale uploads', () => {
  const deletedAstraId = '88888888-8888-4888-8888-888888888888';
  const activeAstraId = '99999999-9999-4999-8999-999999999999';
  const index = createAstraTombstoneIndex([
    { id: deletedAstraId, deleted_at: '2026-07-06T08:00:00.000Z' },
    { id: activeAstraId, deleted_at: null }
  ]);

  assert.deepEqual([...index], [deletedAstraId]);
  assert.deepEqual(applyAstraTombstones({
    astras: [{ id: deletedAstraId }, { id: activeAstraId }]
  }, index).astras, [{ id: activeAstraId }]);
  assert.deepEqual(filterEncodedWorkspaceByTombstones({
    astras: [{ id: deletedAstraId }, { id: activeAstraId }]
  }, createTombstoneIndex(), index).astras, [{ id: activeAstraId }]);
});

test('encoded tombstones prevent stale and orphaned rows from uploading without mutating input', () => {
  const encoded = {
    folders: [{ id: deletedFolderId }, { id: survivingFolderId }],
    conversations: [
      { id: deletedConversationId, folder_id: survivingFolderId },
      { id: survivingConversationId, folder_id: deletedFolderId }
    ],
    messages: [
      { id: 'message-deleted', conversation_id: deletedConversationId },
      { id: 'message-surviving', conversation_id: survivingConversationId },
      { id: 'message-missing', conversation_id: 'missing-conversation' }
    ],
    skippedConversationIds: ['legacy-id']
  };
  const original = structuredClone(encoded);

  const result = filterEncodedWorkspaceByTombstones(encoded, createTombstoneIndex(tombstones));

  assert.deepEqual(result.folders, [{ id: survivingFolderId }]);
  assert.deepEqual(result.conversations, [{ id: survivingConversationId, folder_id: null }]);
  assert.deepEqual(result.messages, [{ id: 'message-surviving', conversation_id: survivingConversationId }]);
  assert.deepEqual(result.skippedConversationIds, ['legacy-id']);
  assert.deepEqual(encoded, original);
});

test('encoded filtering rejects null and id-less conversations and never retains undefined message owners', () => {
  const result = filterEncodedWorkspaceByTombstones({
    folders: [null, {}, { id: 'valid-folder' }],
    conversations: [null, {}, { id: 'valid-conversation', folder_id: null }],
    messages: [
      { id: 'undefined-owner' },
      { id: 'valid-message', conversation_id: 'valid-conversation' }
    ]
  });

  assert.deepEqual(result.folders, [{ id: 'valid-folder' }]);
  assert.deepEqual(result.conversations, [{ id: 'valid-conversation', folder_id: null }]);
  assert.deepEqual(result.messages, [{ id: 'valid-message', conversation_id: 'valid-conversation' }]);
});
