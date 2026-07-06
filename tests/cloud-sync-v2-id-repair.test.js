import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';

import { repairWorkspaceEntityIds } from '../src/app/sync/cloud-sync-v2-id-repair.js';
import { isUuid } from '../src/app/sync/cloud-sync-v2-codecs.js';

const userId = '11111111-1111-4111-8111-111111111111';

test('repairs legacy conversation and folder IDs into stable UUIDs', async () => {
  const workspace = {
    folders: [{ id: 'legacy-folder', conversationIds: ['legacy-chat'] }],
    conversations: [{
      id: 'legacy-chat',
      folderId: 'legacy-folder',
      title: 'Legacy chat',
      messages: [{ role: 'user', parts: [{ text: 'hello' }] }]
    }]
  };

  const first = await repairWorkspaceEntityIds({ workspace, userId, cryptoProvider: webcrypto });
  const second = await repairWorkspaceEntityIds({ workspace, userId, cryptoProvider: webcrypto });

  assert.equal(first.changed, true);
  assert.equal(isUuid(first.workspace.folders[0].id), true);
  assert.equal(isUuid(first.workspace.conversations[0].id), true);
  assert.equal(first.workspace.conversations[0].folderId, first.workspace.folders[0].id);
  assert.deepEqual(first.workspace.folders[0].conversationIds, [first.workspace.conversations[0].id]);
  assert.equal(first.workspace.conversations[0].id, second.workspace.conversations[0].id);
  assert.equal(first.workspace.folders[0].id, second.workspace.folders[0].id);
});

test('leaves UUID workspace IDs unchanged', async () => {
  const workspace = {
    folders: [{
      id: '22222222-2222-4222-8222-222222222222',
      conversationIds: ['33333333-3333-4333-8333-333333333333']
    }],
    conversations: [{
      id: '33333333-3333-4333-8333-333333333333',
      folderId: '22222222-2222-4222-8222-222222222222',
      messages: []
    }]
  };

  const repaired = await repairWorkspaceEntityIds({ workspace, userId, cryptoProvider: webcrypto });

  assert.equal(repaired.changed, false);
  assert.deepEqual(repaired.workspace, workspace);
});
