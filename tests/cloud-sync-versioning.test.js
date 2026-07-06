import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canCommitHydratedRemote,
  cloudValuesEqual,
  enqueueRecoveringTask,
  mergeConcurrentWorkspaceAppData,
  mergeRemoteWorkspaceAppData,
  mergeWorkspaceAppData,
  settleCloudUpload,
  shouldApplyCloudRemote
} from '../src/app/sync/cloud-sync-versioning.js';

test('realtime task queue continues after an earlier task rejects', async () => {
  const errors = [];
  let ran = false;
  const recovered = enqueueRecoveringTask(
    Promise.reject(new Error('temporary realtime failure')),
    async () => { ran = true; },
    error => errors.push(error.message)
  );

  await recovered;
  assert.equal(ran, true);
  assert.deepEqual(errors, ['temporary realtime failure']);
});

test('hydrated remote snapshot cannot commit after a newer local revision starts', () => {
  assert.equal(canCommitHydratedRemote({
    startedRevision: 'revision-1',
    currentState: { localRevision: 'revision-2', dirty: true }
  }), false);
  assert.equal(canCommitHydratedRemote({
    startedRevision: 'revision-1',
    currentState: { localRevision: 'revision-1', dirty: false }
  }), true);
  assert.equal(canCommitHydratedRemote({
    startedRevision: 'revision-1',
    currentState: { localRevision: 'revision-1', dirty: false },
    activeUpload: true
  }), false);
});

test('an older in-flight upload cannot clear a newer local dirty revision', () => {
  const settled = settleCloudUpload({
    localRevision: 'revision-2',
    dirty: true
  }, 'revision-1', '2026-07-05T10:00:00.000Z');

  assert.equal(settled.complete, false);
  assert.equal(settled.state.localRevision, 'revision-2');
  assert.equal(settled.state.dirty, true);
});

test('the matching upload clears dirty state and records server time', () => {
  const settled = settleCloudUpload({
    localRevision: 'revision-2',
    dirty: true
  }, 'revision-2', '2026-07-05T10:00:01.000Z');

  assert.equal(settled.complete, true);
  assert.equal(settled.state.dirty, false);
  assert.equal(settled.state.remoteUpdatedAt, '2026-07-05T10:00:01.000Z');
});

test('remote ordering uses last server time and never overwrites dirty local state', () => {
  assert.equal(shouldApplyCloudRemote({
    dirty: true,
    remoteUpdatedAt: '2026-07-05T10:00:00.000Z'
  }, '2026-07-05T10:00:02.000Z'), false);
  assert.equal(shouldApplyCloudRemote({
    dirty: false,
    remoteUpdatedAt: '2026-07-05T10:00:00.000Z'
  }, '2026-07-05T10:00:02.000Z'), true);
});

test('sync metadata upgrade preserves a completed local answer over a remote naming snapshot', () => {
  const base = {
    id: 'conversation-1',
    title: 'New chat',
    isNaming: true,
    messages: [{ role: 'user', parts: [{ text: 'Hello' }] }]
  };
  const local = {
    conversations: [{
      ...base,
      title: 'Greeting',
      isNaming: false,
      messages: [...base.messages, { role: 'model', parts: [{ text: 'Hi there' }] }]
    }]
  };
  const remote = { conversations: [base] };

  const merged = mergeWorkspaceAppData(local, remote);
  assert.equal(merged.conversations[0].title, 'Greeting');
  assert.equal(merged.conversations[0].isNaming, false);
  assert.equal(merged.conversations[0].messages.length, 2);
});

test('live remote merge cannot remove a more complete local assistant response', () => {
  const liveConversation = {
    id: 'conversation-1',
    title: 'Question',
    isNaming: true,
    messages: [
      { role: 'user', parts: [{ text: 'Question' }] },
      { role: 'model', parts: [{ text: 'Completed answer' }] }
    ]
  };
  const remoteConversation = {
    id: 'conversation-1',
    title: 'Remote title',
    isNaming: false,
    messages: [{ role: 'user', parts: [{ text: 'Question' }] }]
  };

  const merged = mergeRemoteWorkspaceAppData(
    { conversations: [liveConversation] },
    { conversations: [remoteConversation], folders: [], astras: [], personalMemories: [] }
  );

  assert.equal(merged.conversations[0], liveConversation);
  assert.equal(merged.conversations[0].messages[1].parts[0].text, 'Completed answer');
});

test('live remote merge retains protected responses and device-only empty drafts', () => {
  const protectedConversation = { id: 'active', messages: [{ role: 'model', parts: [{ text: 'Answer' }] }] };
  const deviceOnlyDraft = { id: 'draft', isTemporary: true, deletedAt: null, messages: [] };
  const staleConversation = { id: 'deleted', messages: [] };
  const merged = mergeRemoteWorkspaceAppData(
    { conversations: [protectedConversation, deviceOnlyDraft, staleConversation] },
    { conversations: [], folders: [], astras: [], personalMemories: [] },
    protectedConversation
  );

  assert.deepEqual(merged.conversations, [protectedConversation, deviceOnlyDraft]);
});

test('equal-content remote conversations win so folder metadata can synchronize', () => {
  const local = { id: 'conversation-1', folderId: null, messages: [{ role: 'user', parts: [{ text: 'Hi' }] }] };
  const remote = { ...local, folderId: 'folder-1' };
  const merged = mergeRemoteWorkspaceAppData(
    { conversations: [local] },
    { conversations: [remote], folders: [], astras: [], personalMemories: [] }
  );

  assert.equal(merged.conversations[0], remote);
  assert.equal(merged.conversations[0].folderId, 'folder-1');
});

test('remote trash move wins over stale local visible conversation', () => {
  const local = {
    id: 'conversation-1',
    title: 'Visible locally',
    createdAt: '2026-07-06T01:00:00.000Z',
    lastUpdatedAt: '2026-07-06T01:05:00.000Z',
    deletedAt: null,
    messages: [{ role: 'user', parts: [{ text: 'Hi' }] }]
  };
  const remote = {
    ...local,
    deletedAt: '2026-07-06T01:10:00.000Z',
    lastUpdatedAt: '2026-07-06T01:10:00.000Z'
  };

  const merged = mergeRemoteWorkspaceAppData(
    { conversations: [local] },
    { conversations: [remote], folders: [], astras: [], personalMemories: [] }
  );

  assert.equal(merged.conversations[0], remote);
  assert.equal(merged.conversations[0].deletedAt, '2026-07-06T01:10:00.000Z');
});

test('remote trash restore wins over stale local trashed conversation', () => {
  const local = {
    id: 'conversation-1',
    title: 'Still trashed locally',
    createdAt: '2026-07-06T01:00:00.000Z',
    lastUpdatedAt: '2026-07-06T01:10:00.000Z',
    deletedAt: '2026-07-06T01:10:00.000Z',
    messages: [{ role: 'user', parts: [{ text: 'Hi' }] }]
  };
  const remote = {
    ...local,
    deletedAt: null,
    lastUpdatedAt: '2026-07-06T01:15:00.000Z'
  };

  const merged = mergeRemoteWorkspaceAppData(
    { conversations: [local] },
    { conversations: [remote], folders: [], astras: [], personalMemories: [] }
  );

  assert.equal(merged.conversations[0], remote);
  assert.equal(merged.conversations[0].deletedAt, null);
});

test('three-way workspace merge keeps remote AI and move-out while preserving unrelated local folder state', () => {
  const baseConversation = {
    id: 'conversation-1',
    folderId: 'folder-1',
    messages: [{ role: 'user', parts: [{ text: 'Question' }] }]
  };
  const baseFolder = { id: 'folder-1', isOpen: false, conversationIds: ['conversation-1'] };
  const base = { conversations: [baseConversation], folders: [baseFolder], astras: [], personalMemories: [] };
  const local = {
    ...base,
    folders: [{ ...baseFolder, isOpen: true }]
  };
  const remote = {
    ...base,
    conversations: [{
      ...baseConversation,
      folderId: null,
      messages: [...baseConversation.messages, { role: 'model', parts: [{ text: 'Answer' }] }]
    }],
    folders: [{ ...baseFolder, conversationIds: [] }]
  };

  const merged = mergeConcurrentWorkspaceAppData(base, local, remote);

  assert.equal(merged.conversations[0].folderId, null);
  assert.equal(merged.conversations[0].messages[1].parts[0].text, 'Answer');
  assert.equal(merged.folders[0].isOpen, true);
  assert.deepEqual(merged.folders[0].conversationIds, []);
});

test('cloud value comparison ignores object property insertion order', () => {
  assert.equal(cloudValuesEqual(
    { conversations: [{ id: '1', title: 'Hello' }], folders: [] },
    { folders: [], conversations: [{ title: 'Hello', id: '1' }] }
  ), true);
});
