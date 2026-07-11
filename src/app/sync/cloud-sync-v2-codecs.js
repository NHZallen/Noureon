const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MESSAGE_STATUSES = new Set(['streaming', 'complete', 'error']);
const MESSAGE_ROLES = new Set(['user', 'model', 'system']);
const CLOUD_ASSET_MARKER = '__astraCloudAsset';

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

function isCloudAssetMarker(value) {
  return Boolean(value && typeof value === 'object' && value[CLOUD_ASSET_MARKER]);
}

function sanitizePartForShadow(part = {}) {
  const output = { ...part };
  if (part.inlineData) {
    const { data, cloudAssetPending, ...metadata } = part.inlineData;
    output.inlineData = { ...metadata };
    if (isCloudAssetMarker(data)) {
      output.inlineData.data = data;
    } else if (data || cloudAssetPending) {
      output.inlineData.cloudAssetPending = true;
    }
  }
  if (part.generatedImage) {
    const { cloudAsset, _zipRef: _zipRef, cloudAssetPending, ...descriptor } = part.generatedImage;
    output.generatedImage = { ...descriptor };
    if (isCloudAssetMarker(cloudAsset)) {
      output.generatedImage.cloudAsset = cloudAsset;
    } else if (cloudAsset || cloudAssetPending || descriptor.storageKey) {
      output.generatedImage.cloudAssetPending = true;
    }
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
    isNaming: false,
    legacyFolderId: conversation.folderId || null,
    clientUpdatedAt: conversation.lastUpdatedAt || conversation.updatedAt || null,
    stateUpdatedAt: conversation.stateUpdatedAt || conversation.lastUpdatedAt || conversation.updatedAt || null
  };
}

function folderFromRow(row = {}, conversationIds = []) {
  return {
    id: row.id,
    name: row.name || 'Folder',
    conversationIds,
    color: row.color || 'gray',
    icon: row.icon || 'default',
    textColor: row.text_color || row.textColor || 'gray',
    deletedAt: row.deleted_at || null
  };
}

function conversationFromRow(row = {}, messages = []) {
  const metadata = row.metadata || {};
  return {
    id: row.id,
    title: row.title || 'New chat',
    model: row.model || 'unknown',
    provider: row.provider || 'unknown',
    messages,
    archived: Boolean(row.archived),
    pinned: Boolean(row.pinned),
    folderId: row.folder_id || metadata.legacyFolderId || null,
    createdAt: canonicalizeTimestamp(row.created_at) || new Date(0).toISOString(),
    lastUpdatedAt: canonicalizeTimestamp(metadata.clientUpdatedAt || row.updated_at || row.created_at),
    stateUpdatedAt: canonicalizeTimestamp(metadata.stateUpdatedAt || metadata.clientUpdatedAt || row.updated_at || row.created_at),
    deletedAt: row.deleted_at || null,
    genConfig: metadata.genConfig || null,
    imageConfig: metadata.imageConfig || null,
    council: metadata.council || null,
    isRenamed: Boolean(metadata.isRenamed),
    astrasId: metadata.astrasId || null,
    isWebSearchEnabled: Boolean(metadata.isWebSearchEnabled),
    isTemporary: Boolean(metadata.isTemporary),
    isNaming: false
  };
}

function messageFromRow(row = {}) {
  return {
    id: row.id,
    role: MESSAGE_ROLES.has(row.role) ? row.role : 'model',
    parts: Array.isArray(row.parts) ? row.parts : [],
    status: row.status === 'error' ? 'error' : 'complete',
    createdAt: canonicalizeTimestamp(row.created_at) || new Date(0).toISOString(),
    deletedAt: row.deleted_at || null
  };
}

function astraFromRow(row = {}) {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  return {
    ...metadata,
    id: row.id,
    name: row.name || 'Noura',
    description: row.description || '',
    instructions: row.instructions || '',
    avatarUrl: metadata.avatarUrl ?? null,
    officialId: metadata.officialId ?? null,
    lastUpdatedAt: canonicalizeTimestamp(row.updated_at) || new Date(0).toISOString()
  };
}

function encodeAstraShadow(astra = {}, userId) {
  if (!isUuid(astra.id) || !isUuid(userId)) return null;
  const {
    id,
    name,
    description,
    instructions,
    lastUpdatedAt: _lastUpdatedAt,
    updatedAt: _updatedAt,
    deletedAt: _deletedAt,
    ...metadata
  } = astra;
  return {
    id,
    user_id: userId,
    name: String(name || 'Noura'),
    description: String(description || ''),
    instructions: String(instructions || ''),
    metadata: canonicalize(metadata)
  };
}

function conversationRank(conversation = {}) {
  const messages = Array.isArray(conversation.messages) ? conversation.messages : [];
  const contentSize = messages.reduce((total, message) => total + (message.parts || []).reduce(
    (partTotal, part) => partTotal
      + (part.text?.length || 0)
      + (part.inlineData ? 1 : 0)
      + (part.generatedImage ? 1 : 0),
    0
  ), 0);
  return [
    conversation.deletedAt ? 1 : 0,
    messages.length,
    contentSize,
    Date.parse(conversation.stateUpdatedAt || conversation.lastUpdatedAt || conversation.updatedAt || conversation.createdAt || 0) || 0
  ];
}

function preferConversation(left, right) {
  const leftRank = conversationRank(left);
  const rightRank = conversationRank(right);
  for (let index = 0; index < leftRank.length; index += 1) {
    if (leftRank[index] !== rightRank[index]) return leftRank[index] > rightRank[index] ? left : right;
  }
  return right || left;
}

function uniqueWorkspaceConversations(conversations = []) {
  const byId = new Map();
  const unique = [];
  for (const conversation of conversations || []) {
    if (!conversation?.id) continue;
    const id = String(conversation.id);
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, conversation);
      unique.push(conversation);
      continue;
    }
    const selected = preferConversation(existing, conversation);
    if (selected !== existing) {
      byId.set(id, selected);
      const index = unique.indexOf(existing);
      if (index >= 0) unique[index] = selected;
    }
  }
  return unique;
}

function messageContentSize(row = {}) {
  return JSON.stringify(row.parts || []).length;
}

function messageRank(row = {}) {
  return [
    row.deleted_at ? 0 : 1,
    row.status === 'complete' ? 2 : row.status === 'error' ? 1 : 0,
    messageContentSize(row),
    Date.parse(row.created_at || 0) || 0
  ];
}

function preferMessageRow(left, right) {
  const leftRank = messageRank(left);
  const rightRank = messageRank(right);
  for (let index = 0; index < leftRank.length; index += 1) {
    if (leftRank[index] !== rightRank[index]) return leftRank[index] > rightRank[index] ? left : right;
  }
  return right || left;
}

async function uniqueWorkspaceMessages(rows = [], cryptoProvider = globalThis.crypto) {
  const byConversationSequence = new Map();
  for (const row of rows || []) {
    if (!row?.conversation_id) continue;
    const key = `${row.conversation_id}:${row.sequence}`;
    const existing = byConversationSequence.get(key);
    byConversationSequence.set(key, existing ? preferMessageRow(existing, row) : row);
  }

  const seenIds = new Set();
  const unique = [];
  for (const row of byConversationSequence.values()) {
    let nextRow = row;
    let id = row.id;
    if (seenIds.has(id)) {
      let collisionIndex = 0;
      do {
        id = await deterministicUuid(JSON.stringify(canonicalize({
          originalId: row.id,
          conversationId: row.conversation_id,
          sequence: row.sequence,
          role: row.role,
          createdAt: row.created_at,
          collisionIndex
        })), cryptoProvider);
        collisionIndex += 1;
      } while (seenIds.has(id));
      nextRow = { ...row, id };
    }
    seenIds.add(id);
    unique.push(nextRow);
  }
  return unique;
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
    summary: '',
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
      createdAt: messageCreatedAt
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
  const folderIds = new Set((workspace.folders || [])
    .map(folder => folder?.id)
    .filter(isUuid));
  const folders = (workspace.folders || [])
    .filter(folder => isUuid(folder?.id))
    .map(folder => ({
      id: folder.id,
      user_id: userId,
      name: String(folder.name || 'Folder'),
      color: String(folder.color || 'gray'),
      icon: String(folder.icon || 'default'),
      text_color: String(folder.textColor || folder.text_color || 'gray'),
      deleted_at: folder.deletedAt || null
    }));
  const conversations = [];
  const messages = [];
  const astras = (workspace.astras || [])
    .map(astra => encodeAstraShadow(astra, userId))
    .filter(Boolean);
  const skippedConversationIds = [];
  for (const conversation of uniqueWorkspaceConversations(workspace.conversations || [])) {
    if (conversation?.isTemporary && !(conversation.messages?.length)) continue;
    const encoded = await encodeConversationShadow({ conversation, userId, cryptoProvider });
    if (!encoded) {
      skippedConversationIds.push(conversation?.id || null);
      continue;
    }
    encoded.conversation.folder_id = folderIds.has(conversation.folderId) ? conversation.folderId : null;
    conversations.push(encoded.conversation);
    messages.push(...encoded.messages);
  }
  return {
    folders,
    conversations,
    messages: await uniqueWorkspaceMessages(messages, cryptoProvider),
    astras,
    skippedConversationIds
  };
}

export function shadowRowsEqual(left, right) {
  return JSON.stringify(canonicalizeShadowRow(left)) === JSON.stringify(canonicalizeShadowRow(right));
}

export function decodeWorkspaceConversationShadow({
  folders = [],
  conversations = [],
  messages = [],
  astras = []
} = {}) {
  const messagesByConversation = new Map();
  for (const row of [...messages].sort((left, right) => (left.sequence || 0) - (right.sequence || 0))) {
    if (!row?.conversation_id) continue;
    const list = messagesByConversation.get(row.conversation_id) || [];
    list.push(messageFromRow(row));
    messagesByConversation.set(row.conversation_id, list);
  }
  const decodedConversations = conversations.map(row => conversationFromRow(
    row,
    messagesByConversation.get(row.id) || []
  ));
  const visibleConversations = decodedConversations.filter(conversation => !conversation.deletedAt);
  const decodedFolders = folders
    .filter(row => !row?.deleted_at)
    .map(row => folderFromRow(
      row,
      visibleConversations
        .filter(conversation => conversation.folderId === row.id)
        .map(conversation => conversation.id)
    ));

  return {
    conversations: decodedConversations,
    folders: decodedFolders,
    astras: astras.filter(row => !row?.deleted_at).map(astraFromRow),
    personalMemories: []
  };
}
