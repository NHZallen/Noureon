import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';

import {
  decodeWorkspaceConversationShadow,
  deterministicUuid,
  encodeWorkspaceConversationShadow,
  getShadowRowDifferingFields,
  isUuid,
  shadowRowsEqual
} from '../src/app/sync/cloud-sync-v2-codecs.js';

const userId = '11111111-1111-4111-8111-111111111111';
const conversationId = '22222222-2222-4222-8222-222222222222';
const astraId = '44444444-4444-4444-8444-444444444444';

test('deterministic message IDs are stable UUIDs', async () => {
  const first = await deterministicUuid('same-message', webcrypto);
  const second = await deterministicUuid('same-message', webcrypto);

  assert.equal(first, second);
  assert.equal(isUuid(first), true);
  assert.equal(first[14], '5');
});

test('shadow row diagnostics report field names without returning field values', () => {
  const fields = getShadowRowDifferingFields(
    {
      id: conversationId,
      title: 'private local title',
      metadata: { clientUpdatedAt: '2026-07-16T08:00:00.000Z', secret: 'local' }
    },
    {
      id: conversationId,
      title: 'private remote title',
      metadata: { clientUpdatedAt: '2026-07-16T08:00:00Z', secret: 'remote' }
    }
  );

  assert.deepEqual(fields, ['metadata', 'title']);
  assert.equal(JSON.stringify(fields).includes('private'), false);
  assert.equal(JSON.stringify(fields).includes('secret'), false);
});

test('active conversation metadata omits an empty trash clock and compares it as absent', async () => {
  const encoded = await encodeWorkspaceConversationShadow({
    userId,
    cryptoProvider: webcrypto,
    workspace: {
      conversations: [{
        id: conversationId,
        title: 'Active chat',
        model: 'model-1',
        provider: 'provider-1',
        createdAt: '2026-07-06T01:00:00.000Z',
        messages: []
      }]
    }
  });
  const local = encoded.conversations[0];
  const remote = structuredClone(local);
  delete remote.metadata.trashStateUpdatedAt;

  assert.equal('trashStateUpdatedAt' in local.metadata, false);
  assert.equal(shadowRowsEqual({ metadata: { trashStateUpdatedAt: null } }, { metadata: {} }), true);
  assert.equal(shadowRowsEqual(local, remote), true);
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

test('conversation shadow codec round-trips quote references and hidden request context', async () => {
  const quotePart = {
    text: 'Quoted text:\n「Original answer」',
    quoteContext: true,
    quoteReference: {
      text: 'Original answer',
      sourceMessageIndex: 1,
      sourceMessageId: null
    }
  };
  const encoded = await encodeWorkspaceConversationShadow({
    userId,
    cryptoProvider: webcrypto,
    workspace: {
      conversations: [{
        id: conversationId,
        title: 'Quote chat',
        model: 'model-1',
        provider: 'provider-1',
        createdAt: '2026-07-06T01:00:00.000Z',
        messages: [{
          role: 'user',
          createdAt: '2026-07-06T01:00:01.000Z',
          parts: [{ text: 'Question', displayText: 'Question' }, quotePart]
        }]
      }]
    }
  });
  const decoded = decodeWorkspaceConversationShadow(encoded);

  assert.deepEqual(encoded.messages[0].parts[1], quotePart);
  assert.deepEqual(decoded.conversations[0].messages[0].parts[1], quotePart);
});

test('conversation shadow codec preserves cloud asset markers for attachments and generated images', async () => {
  const inlineMarker = {
    __astraCloudAsset: {
      path: `${userId}/inline-image`,
      mimeType: 'image/png',
      encoding: 'base64'
    }
  };
  const generatedMarker = {
    __astraCloudAsset: {
      path: `${userId}/generated-image`,
      mimeType: 'image/webp',
      encoding: 'blob'
    }
  };
  const encoded = await encodeWorkspaceConversationShadow({
    userId,
    cryptoProvider: webcrypto,
    workspace: {
      conversations: [{
        id: conversationId,
        title: 'Asset markers',
        model: 'model-1',
        provider: 'provider-1',
        createdAt: '2026-07-06T01:00:00.000Z',
        messages: [{
          role: 'model',
          createdAt: '2026-07-06T01:00:01.000Z',
          parts: [
            { inlineData: { name: 'photo.png', mimeType: 'image/png', data: inlineMarker } },
            { generatedImage: {
              id: 'generated-1',
              storageKey: `generatedImage:supabase:${userId}:generated-1`,
              mediaType: 'image/webp',
              cloudAsset: generatedMarker,
              _zipRef: 'images/generated-1.webp'
            } }
          ]
        }]
      }]
    }
  });

  assert.deepEqual(encoded.messages[0].parts[0].inlineData.data, inlineMarker);
  assert.equal('cloudAssetPending' in encoded.messages[0].parts[0].inlineData, false);
  assert.deepEqual(encoded.messages[0].parts[1].generatedImage.cloudAsset, generatedMarker);
  assert.equal('cloudAssetPending' in encoded.messages[0].parts[1].generatedImage, false);
  assert.equal('_zipRef' in encoded.messages[0].parts[1].generatedImage, false);
});

test('conversation shadow codec keeps message IDs stable when image bytes become cloud markers', async () => {
  const createdAt = '2026-07-06T01:00:01.000Z';
  const inlineEncoded = await encodeWorkspaceConversationShadow({
    userId,
    cryptoProvider: webcrypto,
    workspace: {
      conversations: [{
        id: conversationId,
        title: 'Image chat',
        model: 'model-1',
        provider: 'provider-1',
        createdAt: '2026-07-06T01:00:00.000Z',
        messages: [{
          role: 'user',
          createdAt,
          parts: [{ inlineData: { mimeType: 'image/png', data: 'LOCAL_IMAGE_BYTES' } }]
        }]
      }]
    }
  });
  const markerEncoded = await encodeWorkspaceConversationShadow({
    userId,
    cryptoProvider: webcrypto,
    workspace: {
      conversations: [{
        id: conversationId,
        title: 'Image chat',
        model: 'model-1',
        provider: 'provider-1',
        createdAt: '2026-07-06T01:00:00.000Z',
        messages: [{
          role: 'user',
          createdAt,
          parts: [{
            inlineData: {
              mimeType: 'image/png',
              data: { __astraCloudAsset: { path: `${userId}/image`, mimeType: 'image/png' } }
            }
          }]
        }]
      }]
    }
  });

  assert.equal(inlineEncoded.messages[0].id, markerEncoded.messages[0].id);
});

test('conversation shadow codec deduplicates repeated conversation ids before RPC upload', async () => {
  const encoded = await encodeWorkspaceConversationShadow({
    userId,
    cryptoProvider: webcrypto,
    workspace: {
      conversations: [
        {
          id: conversationId,
          title: 'Older copy',
          model: 'model-1',
          provider: 'provider-1',
          createdAt: '2026-07-06T01:00:00.000Z',
          lastUpdatedAt: '2026-07-06T01:01:00.000Z',
          messages: [{ role: 'user', parts: [{ text: 'old' }] }]
        },
        {
          id: conversationId,
          title: 'Newer copy',
          model: 'model-1',
          provider: 'provider-1',
          createdAt: '2026-07-06T01:00:00.000Z',
          lastUpdatedAt: '2026-07-06T01:02:00.000Z',
          messages: [
            { role: 'user', parts: [{ text: 'new' }] },
            { role: 'model', parts: [{ text: 'answer' }] }
          ]
        }
      ]
    }
  });

  assert.equal(encoded.conversations.length, 1);
  assert.equal(encoded.conversations[0].title, 'Newer copy');
  assert.equal(encoded.messages.length, 2);
});

test('conversation shadow codec repairs duplicate message ids without dropping separate sequence rows', async () => {
  const duplicateMessageId = '55555555-5555-4555-8555-555555555555';
  const encoded = await encodeWorkspaceConversationShadow({
    userId,
    cryptoProvider: webcrypto,
    workspace: {
      conversations: [{
        id: conversationId,
        title: 'Duplicate message IDs',
        model: 'model-1',
        provider: 'provider-1',
        createdAt: '2026-07-06T01:00:00.000Z',
        messages: [
          { id: duplicateMessageId, role: 'user', createdAt: '2026-07-06T01:00:01.000Z', parts: [{ text: 'first' }] },
          { id: duplicateMessageId, role: 'model', createdAt: '2026-07-06T01:00:02.000Z', parts: [{ text: 'second' }] }
        ]
      }]
    }
  });
  const ids = encoded.messages.map(row => row.id);

  assert.equal(encoded.messages.length, 2);
  assert.equal(new Set(ids).size, 2);
  assert.equal(ids.includes(duplicateMessageId), true);
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

test('conversation shadow codec removes a dangling legacy folder reference before verification', async () => {
  const missingFolderId = '33333333-3333-4333-8333-333333333333';
  const encoded = await encodeWorkspaceConversationShadow({
    userId,
    cryptoProvider: webcrypto,
    workspace: {
      folders: [],
      conversations: [{
        id: conversationId,
        title: 'Orphaned folder chat',
        model: 'model-1',
        provider: 'provider-1',
        folderId: missingFolderId,
        createdAt: '2026-07-06T01:00:00.000Z',
        messages: []
      }]
    }
  });

  const conversation = encoded.conversations[0];
  assert.equal(conversation.folder_id, null);
  assert.equal('legacyFolderId' in conversation.metadata, false);
  assert.equal(shadowRowsEqual(conversation, {
    ...conversation,
    metadata: { ...conversation.metadata }
  }), true);
});

test('conversation shadow codec round-trips a dedicated trash clock and clears deleted folder state', async () => {
  const folderId = '33333333-3333-4333-8333-333333333333';
  const deletedAt = '2026-07-06T01:10:00.000Z';
  const encoded = await encodeWorkspaceConversationShadow({
    userId,
    cryptoProvider: webcrypto,
    workspace: {
      folders: [{ id: folderId, name: 'Work' }],
      conversations: [{
        id: conversationId,
        title: 'Deleted chat',
        model: 'model-1',
        provider: 'provider-1',
        folderId,
        archived: true,
        createdAt: '2026-07-06T01:00:00.000Z',
        deletedAt,
        stateUpdatedAt: deletedAt,
        trashStateUpdatedAt: deletedAt,
        messages: []
      }]
    }
  });

  assert.equal(encoded.conversations[0].folder_id, null);
  assert.equal(encoded.conversations[0].archived, false);
  assert.equal('legacyFolderId' in encoded.conversations[0].metadata, false);
  assert.equal(encoded.conversations[0].metadata.trashStateUpdatedAt, deletedAt);

  const decoded = decodeWorkspaceConversationShadow(encoded);
  assert.equal(decoded.conversations[0].deletedAt, deletedAt);
  assert.equal(decoded.conversations[0].trashStateUpdatedAt, deletedAt);
  assert.equal(decoded.conversations[0].folderId, null);
});

test('conversation shadow decode falls back to deletedAt when the metadata trash clock is invalid', () => {
  const deletedAt = '2026-07-06T01:20:00+00:00';
  const decoded = decodeWorkspaceConversationShadow({
    conversations: [{
      id: conversationId,
      title: 'Deleted chat',
      model: 'model-1',
      provider: 'provider-1',
      metadata: { trashStateUpdatedAt: 'invalid', legacyFolderId: '33333333-3333-4333-8333-333333333333' },
      archived: false,
      pinned: false,
      created_at: '2026-07-06T01:00:00.000Z',
      updated_at: '2026-07-06T01:20:00.000Z',
      deleted_at: deletedAt
    }]
  });

  assert.equal(decoded.conversations[0].trashStateUpdatedAt, '2026-07-06T01:20:00.000Z');
  assert.equal(decoded.conversations[0].folderId, null);
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

test('workspace shadow codec round-trips active Astras and filters deleted Astra tombstones', async () => {
  const encoded = await encodeWorkspaceConversationShadow({
    userId,
    cryptoProvider: webcrypto,
    workspace: {
      astras: [{
        id: astraId,
        name: 'Researcher',
        description: 'Finds evidence',
        instructions: 'Be precise',
        avatarUrl: 'avatar-marker',
        officialId: 'official-researcher'
      }]
    }
  });

  assert.deepEqual(encoded.astras, [{
    id: astraId,
    user_id: userId,
    name: 'Researcher',
    description: 'Finds evidence',
    instructions: 'Be precise',
    metadata: { avatarUrl: 'avatar-marker', officialId: 'official-researcher' }
  }]);

  const active = decodeWorkspaceConversationShadow({
    astras: [{ ...encoded.astras[0], updated_at: '2026-07-06T08:00:00.000Z', deleted_at: null }]
  });
  assert.equal(active.astras[0].name, 'Researcher');
  assert.equal(active.astras[0].avatarUrl, 'avatar-marker');
  assert.equal(active.astras[0].officialId, 'official-researcher');

  const deleted = decodeWorkspaceConversationShadow({
    astras: [{ ...encoded.astras[0], deleted_at: '2026-07-06T08:05:00.000Z' }]
  });
  assert.deepEqual(deleted.astras, []);
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
  assert.equal(shadowRowsEqual(
    {
      id: conversationId,
      metadata: {
        clientUpdatedAt: '2026-07-06T01:00:00.000Z',
        stateUpdatedAt: '2026-07-06T01:05:00.000Z',
        trashStateUpdatedAt: '2026-07-06T01:10:00.000Z'
      }
    },
    {
      id: conversationId,
      metadata: {
        clientUpdatedAt: '2026-07-06T01:00:00+00:00',
        stateUpdatedAt: '2026-07-06T01:05:00+00:00',
        trashStateUpdatedAt: '2026-07-06T01:10:00+00:00'
      }
    }
  ), true);
});
