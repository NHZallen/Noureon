import assert from 'node:assert/strict';
import test from 'node:test';

import {
  countShadowUploadRows,
  createShadowUploadDelta,
  mergeShadowUploadIntoBaseline
} from '../src/app/sync/cloud-sync-v2-delta.js';

const encodedWorkspace = () => ({
  folders: [{
    id: 'folder-1',
    user_id: 'user-1',
    name: 'Folder',
    color: 'blue',
    icon: 'default',
    text_color: 'white',
    deleted_at: null
  }],
  conversations: [{
    id: 'conversation-1',
    user_id: 'user-1',
    folder_id: 'folder-1',
    title: 'Title',
    summary: '',
    model: 'model',
    provider: 'provider',
    metadata: { pinnedBy: 'client' },
    archived: false,
    pinned: false,
    created_at: '2026-07-15T00:00:00.000Z',
    deleted_at: null
  }],
  messages: [{
    id: 'message-1',
    user_id: 'user-1',
    conversation_id: 'conversation-1',
    role: 'user',
    parts: [{ text: 'Hello' }],
    status: 'complete',
    sequence: 0,
    created_at: '2026-07-15T00:00:00.000Z',
    deleted_at: null
  }],
  astras: [{
    id: 'astra-1',
    user_id: 'user-1',
    name: 'Noura',
    description: '',
    instructions: 'Help',
    metadata: { color: 'blue' }
  }],
  skippedConversationIds: []
});

const shadowCollections = ['folders', 'conversations', 'messages', 'astras'];

function remoteWorkspaceFromEncoded(encoded = encodedWorkspace()) {
  return Object.fromEntries(shadowCollections.map(collection => [
    collection,
    encoded[collection].map(row => ({
      ...row,
      ...(collection === 'astras' ? { deleted_at: null } : {}),
      updated_at: '2026-07-15T00:05:00.000Z',
      sync_seq: 10
    }))
  ]));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

test('identical remote rows are omitted even when they contain server-only timestamps', () => {
  const encoded = encodedWorkspace();
  const remote = remoteWorkspaceFromEncoded(encoded);

  const delta = createShadowUploadDelta(encoded, remote);

  assert.equal(countShadowUploadRows(delta), 0);
});

test('only new or changed rows are selected and remote-only rows are not treated as deletion', () => {
  const encoded = encodedWorkspace();
  encoded.conversations[0] = { ...encoded.conversations[0], title: 'Changed locally' };
  encoded.messages.push({
    ...encoded.messages[0],
    id: 'message-2',
    sequence: 1,
    parts: [{ text: 'New message' }]
  });
  const remote = remoteWorkspaceFromEncoded();
  remote.conversations.push({ ...remote.conversations[0], id: 'remote-only' });

  const delta = createShadowUploadDelta(encoded, remote);

  assert.deepEqual(delta.folders, []);
  assert.deepEqual(delta.astras, []);
  assert.deepEqual(delta.conversations.map(row => row.id), ['conversation-1']);
  assert.deepEqual(delta.messages.map(row => row.id), ['message-2']);
  assert.equal(delta.conversations.some(row => row.id === 'remote-only'), false);
});

test('full recovery selects every local row regardless of the baseline', () => {
  const encoded = encodedWorkspace();
  const delta = createShadowUploadDelta(encoded, encoded, { forceFull: true });

  assert.equal(countShadowUploadRows(delta), 4);
  assert.deepEqual(delta.folders, encoded.folders);
  assert.deepEqual(delta.conversations, encoded.conversations);
  assert.deepEqual(delta.messages, encoded.messages);
  assert.deepEqual(delta.astras, encoded.astras);
  assert.notEqual(delta.folders, encoded.folders);
  assert.notEqual(delta.conversations, encoded.conversations);
  assert.notEqual(delta.messages, encoded.messages);
  assert.notEqual(delta.astras, encoded.astras);
});

test('successful delta rows update the comparison baseline without dropping remote-only rows', () => {
  const baseline = remoteWorkspaceFromEncoded();
  baseline.conversations.push({ ...baseline.conversations[0], id: 'remote-only' });
  const changed = {
    folders: [],
    conversations: [{ ...baseline.conversations[0], title: 'Updated' }],
    messages: [],
    astras: []
  };

  const next = mergeShadowUploadIntoBaseline(baseline, changed);

  assert.equal(next.conversations.length, 2);
  assert.equal(next.conversations.find(row => row.id === 'conversation-1').title, 'Updated');
  assert.equal(
    next.conversations.find(row => row.id === 'conversation-1').updated_at,
    '2026-07-15T00:05:00.000Z'
  );
  assert.equal(next.conversations.find(row => row.id === 'conversation-1').sync_seq, 10);
  assert.ok(next.conversations.some(row => row.id === 'remote-only'));
});

test('active Astra rows differ from remote deletion tombstones but match an explicit active null', () => {
  const encoded = encodedWorkspace();
  const remote = remoteWorkspaceFromEncoded(encoded);

  assert.deepEqual(createShadowUploadDelta(encoded, remote).astras, []);

  remote.astras[0] = {
    ...remote.astras[0],
    deleted_at: '2026-07-15T00:10:00.000Z'
  };
  assert.deepEqual(
    createShadowUploadDelta(encoded, remote).astras.map(row => row.id),
    ['astra-1']
  );
});

test('only updated_at and sync_seq are ignored while unexpected remote fields force upload', () => {
  const encoded = encodedWorkspace();
  const remote = remoteWorkspaceFromEncoded(encoded);
  remote.folders[0] = { ...remote.folders[0], future_domain_state: 'remote-only' };

  const delta = createShadowUploadDelta(encoded, remote);

  assert.deepEqual(delta.folders.map(row => row.id), ['folder-1']);
  assert.deepEqual(delta.conversations, []);
  assert.deepEqual(delta.messages, []);
  assert.deepEqual(delta.astras, []);
});

test('duplicate and invalid rows remain conservative upload candidates', () => {
  const encoded = encodedWorkspace();
  encoded.conversations.push({ ...encoded.conversations[0] });
  encoded.astras.push(null);
  const remote = remoteWorkspaceFromEncoded(encodedWorkspace());
  remote.messages.push({ ...remote.messages[0] });
  remote.folders.push(null);

  const delta = createShadowUploadDelta(encoded, remote);

  assert.equal(delta.folders.length, 1);
  assert.equal(delta.conversations.length, 2);
  assert.equal(delta.messages.length, 1);
  assert.deepEqual(delta.astras, [null]);
});

test('baseline merge preserves duplicate ambiguity and neither helper mutates its inputs', () => {
  const encoded = deepFreeze(encodedWorkspace());
  const remoteSource = remoteWorkspaceFromEncoded(encodedWorkspace());
  remoteSource.folders.push({ ...remoteSource.folders[0] });
  const remote = deepFreeze(remoteSource);
  const encodedBefore = JSON.stringify(encoded);
  const remoteBefore = JSON.stringify(remote);

  const delta = createShadowUploadDelta(encoded, remote);
  const next = mergeShadowUploadIntoBaseline(remote, {
    folders: [{ ...encoded.folders[0], name: 'Changed' }]
  });

  assert.equal(JSON.stringify(encoded), encodedBefore);
  assert.equal(JSON.stringify(remote), remoteBefore);
  assert.deepEqual(delta.folders.map(row => row.id), ['folder-1']);
  assert.equal(next.folders.length, 3);
  assert.equal(next.folders.filter(row => row.id === 'folder-1').length, 3);
  assert.notEqual(next.folders, remote.folders);
  assert.notEqual(next.folders[0], remote.folders[0]);
});
