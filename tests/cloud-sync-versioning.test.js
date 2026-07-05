import assert from 'node:assert/strict';
import test from 'node:test';

import { cloudValuesEqual, mergeWorkspaceAppData, settleCloudUpload, shouldApplyCloudRemote } from '../src/app/sync/cloud-sync-versioning.js';

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

test('cloud value comparison ignores object property insertion order', () => {
  assert.equal(cloudValuesEqual(
    { conversations: [{ id: '1', title: 'Hello' }], folders: [] },
    { folders: [], conversations: [{ title: 'Hello', id: '1' }] }
  ), true);
});
