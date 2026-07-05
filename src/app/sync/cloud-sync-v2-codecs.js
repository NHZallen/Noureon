const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MESSAGE_STATUSES = new Set(['streaming', 'complete', 'error']);
const MESSAGE_ROLES = new Set(['user', 'model', 'system']);

function toIsoTimestamp(value, fallback) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
}

function canonicalizeTimestamp(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : value;
}

function canonicalizeShadowRow(value) {
  const row = canonicalize(value || {});
  for (const key of ['created_at', 'updated_at', 'deleted_at']) {
    if (row[key]) row[key] = canonicalizeTimestamp(row[key]);
  }
  return row;
}

function sanitizePartForShadow(part = {}) {
  const output = { ...part };
  if (part.inlineData) {
    const { data: _data, ...metadata } = part.inlineData;
    output.inlineData = { ...metadata, cloudAssetPending: Boolean(_data) };
  }
  if (part.generatedImage) {
    const { cloudAsset: _cloudAsset, _zipRef: _zipRef, ...descriptor } = part.generatedImage;
    output.generatedImage = { ...descriptor, cloudAssetPending: true };
  }
  return output;
}

function conversationMetadata(conversation = {}) {
  return {
    genConfig: conversation.genConfig || null,
    imageConfig: conversation.imageConfig || null,
    council: conversation.council || null,
    isRenamed: Boolean(conversation.isRenamed),
    astrasId: conversation.astrasId || null,
    isWebSearchEnabled: Boolean(conversation.isWebSearchEnabled),
    isTemporary: Boolean(conversation.isTemporary),
    isNaming: Boolean(conversation.isNaming),
    legacyFolderId: conversation.folderId || null,
    clientUpdatedAt: conversation.lastUpdatedAt || conversation.updatedAt || null
  };
}

export function isUuid(value) {
  return UUID_PATTERN.test(String(value || ''));
}

export async function deterministicUuid(value, cryptoProvider = globalThis.crypto) {
  if (!cryptoProvider?.subtle) throw new Error('Web Crypto is required for deterministic message IDs.');
  const digest = await cryptoProvider.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
  const bytes = new Uint8Array(digest).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function encodeConversationShadow({
  conversation,
  userId,
  cryptoProvider = globalThis.crypto
} = {}) {
  if (!isUuid(conversation?.id) || !isUuid(userId)) return null;
  const createdAt = toIsoTimestamp(conversation.createdAt, new Date(0).toISOString());
  const updatedAt = toIsoTimestamp(
    conversation.lastUpdatedAt || conversation.updatedAt,
    createdAt
  );
  const conversationRow = {
    id: conversation.id,
    user_id: userId,
    folder_id: null,
    title: String(conversation.title || 'New chat'),
    summary: String(conversation.summary || ''),
    model: String(conversation.model || 'unknown'),
    provider: String(conversation.provider || 'unknown'),
    metadata: conversationMetadata(conversation),
    archived: Boolean(conversation.archived),
    pinned: Boolean(conversation.pinned),
    created_at: createdAt,
    deleted_at: conversation.deletedAt || null
  };
  const messages = [];
  for (let sequence = 0; sequence < (conversation.messages || []).length; sequence += 1) {
    const message = conversation.messages[sequence] || {};
    const role = MESSAGE_ROLES.has(message.role) ? message.role : 'model';
    const messageCreatedAt = toIsoTimestamp(
      message.createdAt,
      new Date(Date.parse(createdAt) + sequence).toISOString()
    );
    const parts = (message.parts || []).map(sanitizePartForShadow);
    const seed = JSON.stringify(canonicalize({
      conversationId: conversation.id,
      sequence,
      role,
      createdAt: messageCreatedAt,
      parts
    }));
    const id = isUuid(message.id) ? message.id : await deterministicUuid(seed, cryptoProvider);
    messages.push({
      id,
      user_id: userId,
      conversation_id: conversation.id,
      role,
      parts,
      status: MESSAGE_STATUSES.has(message.status)
        ? message.status
        : message.error ? 'error' : 'complete',
      sequence,
      created_at: messageCreatedAt,
      deleted_at: message.deletedAt || null
    });
  }
  return { conversation: conversationRow, messages, clientUpdatedAt: updatedAt };
}

export async function encodeWorkspaceConversationShadow({
  workspace = {},
  userId,
  cryptoProvider = globalThis.crypto
} = {}) {
  const conversations = [];
  const messages = [];
  const skippedConversationIds = [];
  for (const conversation of workspace.conversations || []) {
    if (conversation?.isTemporary && !(conversation.messages?.length)) continue;
    const encoded = await encodeConversationShadow({ conversation, userId, cryptoProvider });
    if (!encoded) {
      skippedConversationIds.push(conversation?.id || null);
      continue;
    }
    conversations.push(encoded.conversation);
    messages.push(...encoded.messages);
  }
  return { conversations, messages, skippedConversationIds };
}

export function shadowRowsEqual(left, right) {
  return JSON.stringify(canonicalizeShadowRow(left)) === JSON.stringify(canonicalizeShadowRow(right));
}
