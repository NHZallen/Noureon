import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';

import {
  decodeWorkspaceConversationShadow,
  deterministicUuid,
  encodeWorkspaceConversationShadow,
  isUuid,
  shadowRowsEqual
} from '../src/app/sync/cloud-sync-v2-codecs.js';

const userId = '11111111-1111-4111-8111-111111111111';
const conversationId = '22222222-2222-4222-8222-222222222222';

test('deterministic message IDs are stable UUIDs', async () => {
  const first = await deterministicUuid('same-message', webcrypto);
  const second = await deterministicUuid('same-message', webcrypto);

  assert.equal(first, second);
  assert.equal(isUuid(first), true);
  assert.equal(first[14], '5');
});

test('conversation shadow codec keeps text but never uploads attachment bytes', async () => {
  const encoded = await encodeWorkspaceConversationShadow({
    userId,
    cryptoProvider: webcrypto,
    workspace: {
      conversations: [{
        id: conversationId,
        title: 'Shadow copy',
        model: 'model-1',
        provider: 'provider-1',
        createdAt: '2026-07-06T01:00:00.000Z',
        lastUpdatedAt: '2026-07-06T01:01:00.000Z',
        messages: [{
          role: 'user',
          createdAt: '2026-07-06T01:00:01.000Z',
          parts: [
            { text: 'Hello' },
            { inlineData: { name: 'photo.png', mimeType: 'image/png', data: 'BASE64_BYTES' } }
          ]
        }]
      }]
    }
  });

  assert.equal(encoded.conversations.length, 1);
  assert.equal(encoded.messages.length, 1);
  assert.equal(encoded.messages[0].parts[0].text, 'Hello');
  assert.equal('data' in encoded.messages[0].parts[1].inlineData, false);
  assert.equal(encoded.messages[0].parts[1].inlineData.cloudAssetPending, true);
  assert.equal(JSON.stringify(encoded).includes('BASE64_BYTES'), false);
});

test('conversation shadow codec includes folders and restores folder membership', async () => {
  const folderId = '33333333-3333-4333-8333-333333333333';
  const encoded = await encodeWorkspaceConversationShadow({
    userId,
    cryptoProvider: webcrypto,
    workspace: {
      folders: [{
        id: folderId,
        name: 'Work',
        color: 'blue',
        icon: 'star',
        textColor: 'white',
        conversationIds: [conversationId]
      }],
      conversations: [{
        id: conversationId,
        title: 'Foldered chat',
        model: 'model-1',
        provider: 'provider-1',
        folderId,
        createdAt: '2026-07-06T01:00:00.000Z',
        messages: [{ role: 'user', parts: [{ text: 'Hello' }] }]
      }]
    }
  });

  assert.equal(encoded.folders.length, 1);
  assert.equal(encoded.conversations[0].folder_id, folderId);

  const decoded = decodeWorkspaceConversationShadow(encoded);

  assert.equal(decoded.folders[0].id, folderId);
  assert.deepEqual(decoded.folders[0].conversationIds, [conversationId]);
  assert.equal(decoded.conversations[0].folderId, folderId);
});

test('conversation shadow codec never persists transient naming or streaming state', async () => {
  const encoded = await encodeWorkspaceConversationShadow({
    userId,
    cryptoProvider: webcrypto,
    workspace: {
      conversations: [{
        id: conversationId,
        title: 'Transient state',
        model: 'model-1',
        provider: 'provider-1',
        isNaming: true,
        createdAt: '2026-07-06T01:00:00.000Z',
        messages: [{ role: 'model', status: 'streaming', parts: [{ text: 'Done' }] }]
      }]
    }
  });

  assert.equal(encoded.conversations[0].metadata.isNaming, false);

  const decoded = decodeWorkspaceConversationShadow(encoded);

  assert.equal(decoded.conversations[0].isNaming, false);
  assert.equal(decoded.conversations[0].messages[0].status, 'complete');
});

test('shadow codec skips empty drafts and invalid legacy conversation IDs without mutating input', async () => {
  const workspace = {
    conversations: [
      { id: 'invalid', messages: [{ role: 'user', parts: [{ text: 'Legacy' }] }] },
      { id: '33333333-3333-4333-8333-333333333333', isTemporary: true, messages: [] }
    ]
  };
  const original = structuredClone(workspace);
  const encoded = await encodeWorkspaceConversationShadow({ workspace, userId, cryptoProvider: webcrypto });

  assert.deepEqual(encoded.conversations, []);
  assert.deepEqual(encoded.messages, []);
  assert.deepEqual(encoded.skippedConversationIds, ['invalid']);
  assert.deepEqual(workspace, original);
});

test('shadow row comparison treats equivalent timestamptz formats as equal', () => {
  assert.equal(shadowRowsEqual(
    { id: conversationId, created_at: '2026-07-06T01:00:00.000Z', deleted_at: null },
    { id: conversationId, created_at: '2026-07-06T01:00:00+00:00', deleted_at: null }
  ), true);
});
