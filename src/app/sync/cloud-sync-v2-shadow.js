import {
  decodeWorkspaceConversationShadow,
  deterministicUuid,
  encodeWorkspaceConversationShadow,
  isUuid,
  shadowRowsEqual
} from './cloud-sync-v2-codecs.js';
import {
  mergeConversationVersions,
  mergeWorkspaceAppData,
} from './cloud-sync-versioning.js';
import {
  applyAstraTombstones,
  applyWorkspaceTombstones,
  createAstraTombstoneIndex,
  createTombstoneIndex,
  filterEncodedWorkspaceByTombstones
} from './cloud-sync-v2-deletions.js';
import { repairWorkspaceEntityIds } from './cloud-sync-v2-id-repair.js';
import {
  countShadowUploadRows,
  createShadowUploadDelta,
  mergeShadowUploadIntoBaseline
} from './cloud-sync-v2-delta.js';
import { withWorkspaceStorageExclusive } from './workspace-storage-coordinator.js';
import {
  acknowledgeCloudSyncJournal,
  createCloudSyncRevision,
  diffCloudSyncWorkspaceEntities,
  getCloudSyncJournalKey,
  markCloudSyncJournalDirty,
  normalizeCloudSyncJournal,
  requireCloudSyncFullResync
} from './cloud-sync-journal.js';

const SCHEMA_VERSION = 2;
const TRASH_SYNC_CAPABILITY = 1;
const CAPTURE_DEBOUNCE_MS = 1000;
const REMOTE_FETCH_PAGE_SIZE = 1000;
const FOLDER_COLUMNS = [
  'id', 'user_id', 'name', 'color', 'icon', 'text_color', 'deleted_at'
].join(',');
const CONVERSATION_COLUMNS = [
  'id', 'user_id', 'folder_id', 'title', 'summary', 'model', 'provider', 'metadata',
  'archived', 'pinned', 'created_at', 'deleted_at'
].join(',');
const MESSAGE_COLUMNS = [
  'id', 'user_id', 'conversation_id', 'role', 'parts', 'status', 'sequence',
  'created_at', 'deleted_at'
].join(',');
const CONVERSATION_FETCH_COLUMNS = `${CONVERSATION_COLUMNS},updated_at`;
const MESSAGE_FETCH_COLUMNS = `${MESSAGE_COLUMNS},updated_at`;
const ASTRA_COLUMNS = [
  'id', 'user_id', 'name', 'description', 'instructions', 'metadata'
].join(',');
const ASTRA_FETCH_COLUMNS = `${ASTRA_COLUMNS},updated_at,deleted_at`;

export class LocalWorkspaceDataError extends Error {
  constructor(message = 'Local workspace data is invalid.', options) {
    super(message, options);
    this.name = 'LocalWorkspaceDataError';
  }
}

class ShadowSyncStoppedError extends Error {
  constructor() {
    super('Conversation shadow sync was stopped.');
    this.name = 'ShadowSyncStoppedError';
  }
}

function parseLocalWorkspace(raw) {
  if (raw == null) return {};
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new LocalWorkspaceDataError('Local workspace JSON is invalid.', { cause: error });
  }
}

function isMissingSchemaError(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || error || '');
  return code === '42P01'
    || code === 'PGRST202'
    || code === 'PGRST205'
    || code === 'ASTRA_TRASH_SYNC_CAPABILITY_MISSING'
    || /relation .* does not exist|could not find the table|function .* does not exist|could not find the function|function .*schema cache|schema cache.*function/i.test(message);
}

function isWorkspaceSyncSequencePermissionError(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || error || '');
  return code === '42501' && /workspace_sync_seq|sequence/i.test(message);
}

async function runInChunks(items, size, task) {
  for (let index = 0; index < items.length; index += size) {
    await task(items.slice(index, index + size));
  }
}

function includesLocalRows(localRows, remoteRows) {
  const remoteById = new Map((remoteRows || []).map(row => [row.id, row]));
  return localRows.every(local => shadowRowsEqual(local, remoteById.get(local.id)));
}

function describeShadowError(error) {
  if (!error || typeof error !== 'object') return { error: String(error) };
  return {
    error: error.message || String(error),
    code: error.code || undefined,
    status: error.status || error.statusCode || undefined,
    details: error.details || undefined,
    hint: error.hint || undefined
  };
}

function withClientSyncSequence(rows = []) {
  const base = Date.now() * 1000;
  return rows.map((row, index) => (
    row && row.sync_seq === undefined
      ? { ...row, sync_seq: base + index }
      : row
  ));
}

function summarizeWorkspace(workspace = {}) {
  const conversations = Array.isArray(workspace.conversations) ? workspace.conversations : [];
  const folders = Array.isArray(workspace.folders) ? workspace.folders : [];
  const astras = Array.isArray(workspace.astras) ? workspace.astras : [];
  const trashedConversations = conversations.filter(conversation => conversation?.deletedAt);
  const messages = conversations.reduce(
    (total, conversation) => total + (Array.isArray(conversation?.messages) ? conversation.messages.length : 0),
    0
  );
  return {
    conversations: conversations.length,
    activeConversations: conversations.filter(conversation => !conversation?.deletedAt).length,
    trashedConversations: trashedConversations.length,
    trashedConversationIds: trashedConversations
      .map(conversation => conversation?.id)
      .filter(Boolean)
      .slice(0, 10),
    messages,
    folders: folders.length,
    astras: astras.length
  };
}

function summarizeShadowRows(rows = {}) {
  return {
    conversations: rows.conversations?.length || 0,
    messages: rows.messages?.length || 0,
    folders: rows.folders?.length || 0,
    astras: rows.astras?.filter(row => !row?.deleted_at).length || 0,
    deletedAstras: rows.astras?.filter(row => row?.deleted_at).length || 0
  };
}

function emptyShadowRows() {
  return { folders: [], conversations: [], messages: [], astras: [] };
}

function cloneShadowRows(rows = {}) {
  return {
    folders: (rows.folders || []).map(row => row && typeof row === 'object' ? { ...row } : row),
    conversations: (rows.conversations || []).map(row => row && typeof row === 'object' ? { ...row } : row),
    messages: (rows.messages || []).map(row => row && typeof row === 'object' ? { ...row } : row),
    astras: (rows.astras || []).map(row => row && typeof row === 'object' ? { ...row } : row)
  };
}

function normalizeVerifiedShadowBaseline(rows = {}) {
  const baseline = cloneShadowRows(rows);
  baseline.astras = baseline.astras.map(row => (
    row && typeof row === 'object' && !Object.prototype.hasOwnProperty.call(row, 'deleted_at')
      ? { ...row, deleted_at: null }
      : row
  ));
  return baseline;
}

function messageSequenceKey(row) {
  if (!row?.conversation_id || row.sequence === undefined || row.sequence === null) return null;
  const sequence = Number(row.sequence);
  if (!Number.isFinite(sequence)) return null;
  return `${row.conversation_id}:${sequence}`;
}

function reconcileEncodedMessageIds(encoded, baseline) {
  const remoteIdByKey = new Map();
  const remoteKeyById = new Map();
  for (const row of baseline?.messages || []) {
    const key = messageSequenceKey(row);
    if (!key || !row?.id || remoteIdByKey.has(key)) {
      return { encoded, safe: false, reason: 'ambiguous-remote-message-sequence' };
    }
    const existingKey = remoteKeyById.get(row.id);
    if (existingKey && existingKey !== key) {
      return { encoded, safe: false, reason: 'ambiguous-remote-message-id' };
    }
    remoteIdByKey.set(key, row.id);
    remoteKeyById.set(row.id, key);
  }

  const localKeys = new Set();
  const finalLocalIds = new Set();
  const messages = [];
  for (const row of encoded?.messages || []) {
    const key = messageSequenceKey(row);
    if (!key || !row?.id || localKeys.has(key)) {
      return { encoded, safe: false, reason: 'ambiguous-local-message-sequence' };
    }
    const remoteOwnerKey = remoteKeyById.get(row.id);
    if (remoteOwnerKey && remoteOwnerKey !== key) {
      return { encoded, safe: false, reason: 'local-message-id-owned-by-another-sequence' };
    }
    localKeys.add(key);
    const remoteId = remoteIdByKey.get(key);
    const finalId = remoteId || row.id;
    if (finalLocalIds.has(finalId)) {
      return { encoded, safe: false, reason: 'duplicate-reconciled-message-id' };
    }
    finalLocalIds.add(finalId);
    messages.push(finalId !== row.id ? { ...row, id: finalId } : row);
  }
  return { encoded: { ...encoded, messages }, safe: true, reason: null };
}

function mergeWorkspacePreservingLocalTopLevel(local = {}, remote = {}) {
  return { ...local, ...mergeWorkspaceAppData(local, remote) };
}

function mergeRemoteIntoEntityDirtyLocal(local = {}, remote = {}, dirtyEntities = {}) {
  const normallyMerged = mergeWorkspacePreservingLocalTopLevel(local, remote);
  const localConversations = new Map((local.conversations || []).map(item => [item?.id, item]));
  const remoteConversations = new Map((remote.conversations || []).map(item => [item?.id, item]));
  const dirtyConversationIds = new Set(dirtyEntities.conversations || []);
  const dirtyFolderIds = new Set(dirtyEntities.folders || []);
  const dirtyAstraIds = new Set(dirtyEntities.astras || []);
  const conversations = normallyMerged.conversations.map(preferred => {
    if (!dirtyConversationIds.has(preferred?.id)) return preferred;
    const localConversation = localConversations.get(preferred?.id);
    const remoteConversation = remoteConversations.get(preferred?.id);
    if (!localConversation || !remoteConversation) return preferred;
    const stateResolved = mergeConversationVersions(localConversation, remoteConversation);
    const merged = {
      ...remoteConversation,
      ...localConversation,
      messages: preferred.messages
    };
    merged.deletedAt = stateResolved.deletedAt || null;
    if (stateResolved.stateUpdatedAt !== undefined) {
      merged.stateUpdatedAt = stateResolved.stateUpdatedAt;
    }
    merged.trashStateUpdatedAt = stateResolved.trashStateUpdatedAt || stateResolved.deletedAt || null;
    if (Boolean(localConversation.deletedAt) !== Boolean(remoteConversation.deletedAt)) {
      merged.folderId = stateResolved.folderId || null;
      merged.archived = Boolean(stateResolved.archived);
    }
    return merged;
  });
  const localFolders = new Map((local.folders || []).map(item => [item?.id, item]));
  const folders = normallyMerged.folders.map(folder => {
    const selected = dirtyFolderIds.has(folder?.id) && localFolders.has(folder.id)
      ? localFolders.get(folder.id)
      : folder;
    return {
      ...selected,
      conversationIds: conversations
        .filter(conversation => conversation?.folderId === folder?.id && !conversation.deletedAt)
        .map(conversation => conversation.id)
    };
  });
  const localAstras = new Map((local.astras || []).map(item => [item?.id, item]));
  const astras = normallyMerged.astras.map(astra => (
    dirtyAstraIds.has(astra?.id) && localAstras.has(astra.id) ? localAstras.get(astra.id) : astra
  ));
  return {
    ...normallyMerged,
    conversations,
    folders,
    astras
  };
}

function stableDeleteTimestamp(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : '';
}

function normalizeDeleteText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 2000);
}

function stableDeletePart(part = {}) {
  const inlineData = part.inlineData || null;
  const generatedImage = part.generatedImage || null;
  return {
    text: normalizeDeleteText(part.text),
    inlineData: inlineData ? {
      mimeType: inlineData.mimeType || inlineData.mime_type || '',
      displayName: inlineData.displayName || inlineData.name || inlineData.fileName || '',
      size: inlineData.size || null
    } : null,
    generatedImage: generatedImage ? {
      id: generatedImage.id || '',
      mimeType: generatedImage.mimeType || generatedImage.mime_type || '',
      prompt: generatedImage.prompt || '',
      aspectRatio: generatedImage.aspectRatio || ''
    } : null
  };
}

function conversationDeleteSignature(conversation = {}) {
  const messages = (conversation.messages || []).map(message => ({
    role: message.role || '',
    createdAt: stableDeleteTimestamp(message.createdAt),
    parts: (message.parts || []).map(stableDeletePart)
  }));
  return {
    id: conversation.id || '',
    title: normalizeDeleteText(conversation.title),
    summary: normalizeDeleteText(conversation.summary),
    model: String(conversation.model || ''),
    provider: String(conversation.provider || ''),
    createdAt: stableDeleteTimestamp(conversation.createdAt),
    deletedAt: stableDeleteTimestamp(conversation.deletedAt),
    messages,
    textMessages: messages
      .map(message => `${message.role}:${message.parts.map(part => part.text).filter(Boolean).join('\n')}`)
      .filter(value => /:\S/.test(value))
  };
}

function conversationDeleteFingerprint(conversation = {}) {
  if (!conversation) return null;
  const signature = conversationDeleteSignature(conversation);
  const { messages } = signature;
  if (!conversation.createdAt && !messages.length && !conversation.title) return null;
  return JSON.stringify({
    title: signature.title,
    summary: signature.summary,
    model: signature.model,
    provider: signature.provider,
    createdAt: signature.createdAt,
    messages
  });
}

function conversationDeleteMatchKeys(conversation = {}) {
  const signature = conversationDeleteSignature(conversation);
  const keys = new Set();
  const messageText = signature.textMessages.join('\n---\n');
  const firstText = signature.textMessages[0] || '';
  if (signature.title && signature.createdAt) keys.add(`title-created:${signature.title}\n${signature.createdAt}`);
  if (signature.createdAt && firstText) keys.add(`created-first:${signature.createdAt}\n${firstText}`);
  if (signature.createdAt && messageText) keys.add(`created-messages:${signature.createdAt}\n${messageText}`);
  if (signature.title && messageText) keys.add(`title-messages:${signature.title}\n${messageText}`);
  if (signature.title && firstText) keys.add(`title-first:${signature.title}\n${firstText}`);
  if (signature.deletedAt && signature.createdAt) keys.add(`trash-created:${signature.createdAt}`);
  if (signature.deletedAt && firstText) keys.add(`trash-first:${firstText}`);
  if (signature.deletedAt && messageText) keys.add(`trash-messages:${messageText}`);
  if (messageText && signature.textMessages.length >= 2) keys.add(`messages:${messageText}`);
  return keys;
}

function uniqueConversationsById(conversations = []) {
  const seen = new Set();
  const unique = [];
  for (const conversation of conversations || []) {
    if (!conversation) continue;
    const id = conversation.id ? String(conversation.id) : '';
    const key = id || conversationDeleteFingerprint(conversation) || JSON.stringify([...conversationDeleteMatchKeys(conversation)]);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(conversation);
  }
  return unique;
}

function exposeConversationShadowSync(window, sync) {
  if (window) window.__astraCloudSyncV2 = sync;
  if (typeof globalThis !== 'undefined') globalThis.__astraCloudSyncV2 = sync;
}

export function createConversationShadowRepository({
  supabase,
  userId,
  fetchPageSize = REMOTE_FETCH_PAGE_SIZE
} = {}) {
  const pageSize = Math.max(1, Math.floor(Number(fetchPageSize) || REMOTE_FETCH_PAGE_SIZE));

  async function fetchRangePages(createQuery) {
    const rows = [];
    let offset = 0;
    while (true) {
      const { data, error } = await createQuery().range(offset, offset + pageSize - 1);
      if (error) throw error;
      if (!Array.isArray(data)) {
        const invalidPageError = new Error('Cloud snapshot range query returned an invalid page.');
        invalidPageError.code = 'ASTRA_SHADOW_INVALID_PAGE';
        throw invalidPageError;
      }
      const page = data;
      if (!page.length) return rows;
      rows.push(...page);
      offset += page.length;
    }
  }

  async function probe() {
    const profileQuery = supabase
      .from('sync_profiles')
      .select('user_id,schema_version,migration_state,legacy_backup_created_at')
      .eq('user_id', userId)
      .maybeSingle();
    const [profileResult, capabilityResult] = await Promise.all([
      profileQuery,
      supabase.rpc('workspace_trash_sync_capability')
    ]);
    if (profileResult.error) throw profileResult.error;
    if (capabilityResult.error) throw capabilityResult.error;
    if (Number(capabilityResult.data) !== TRASH_SYNC_CAPABILITY) {
      const error = new Error('Workspace trash sync database capability is unavailable.');
      error.code = 'ASTRA_TRASH_SYNC_CAPABILITY_MISSING';
      throw error;
    }
    return profileResult.data;
  }

  async function setMigrationState(migrationState, legacyBackupCreatedAt) {
    const payload = {
      user_id: userId,
      schema_version: SCHEMA_VERSION,
      migration_state: migrationState
    };
    if (legacyBackupCreatedAt) payload.legacy_backup_created_at = legacyBackupCreatedAt;
    const { error } = await supabase.from('sync_profiles').upsert(payload, { onConflict: 'user_id' });
    if (error) throw error;
  }

  async function upsertConversations(rows) {
    await runInChunks(rows, 100, async chunk => {
      const { error } = await supabase.rpc('upsert_workspace_conversations', { p_rows: chunk });
      if (error) throw error;
    });
  }

  async function upsertFolders(rows) {
    await runInChunks(rows, 100, async chunk => {
      const { error } = await supabase.rpc('upsert_workspace_folders', { p_rows: chunk });
      if (error) throw error;
    });
  }

  async function reuseRemoteMessageIds(rows = []) {
    const keyedRows = (rows || []).filter(row => (
      row?.conversation_id
      && row.sequence !== undefined
      && row.sequence !== null
      && Number.isFinite(Number(row.sequence))
    ));
    if (!keyedRows.length) return rows;

    const conversationIds = [...new Set(keyedRows.map(row => row.conversation_id).filter(Boolean))];
    if (!conversationIds.length) return rows;

    const existingRows = [];
    for (let index = 0; index < conversationIds.length; index += 100) {
      const ids = conversationIds.slice(index, index + 100);
      existingRows.push(...await fetchRangePages(() => supabase
        .from('workspace_messages')
        .select('id,conversation_id,sequence')
        .eq('user_id', userId)
        .in('conversation_id', ids)
        .order('id', { ascending: true })));
    }
    if (!existingRows.length) return rows;

    const idBySequenceKey = new Map();
    const sequenceKeyById = new Map();
    for (const row of existingRows) {
      const key = messageSequenceKey(row);
      if (!key || !row?.id || idBySequenceKey.has(key) || sequenceKeyById.has(row.id)) {
        const error = new Error('Remote message IDs are ambiguous for conversation sequence rows.');
        error.code = 'ASTRA_MESSAGE_ID_RECONCILIATION_AMBIGUOUS';
        throw error;
      }
      idBySequenceKey.set(key, row.id);
      sequenceKeyById.set(row.id, key);
    }
    const reconciledIds = new Set();
    return rows.map(row => {
      const key = messageSequenceKey(row);
      const remoteOwnerKey = sequenceKeyById.get(row?.id);
      if (remoteOwnerKey && remoteOwnerKey !== key) {
        const error = new Error('A local message ID belongs to another remote sequence row.');
        error.code = 'ASTRA_MESSAGE_ID_RECONCILIATION_AMBIGUOUS';
        throw error;
      }
      const remoteId = idBySequenceKey.get(key);
      const finalId = remoteId || row?.id;
      if (finalId && reconciledIds.has(finalId)) {
        const error = new Error('Message ID reconciliation produced duplicate IDs.');
        error.code = 'ASTRA_MESSAGE_ID_RECONCILIATION_AMBIGUOUS';
        throw error;
      }
      if (finalId) reconciledIds.add(finalId);
      return remoteId && remoteId !== row.id ? { ...row, id: remoteId } : row;
    });
  }

  function messageRowRank(row = {}) {
    return [
      row.deleted_at ? 0 : 1,
      row.status === 'complete' ? 2 : row.status === 'error' ? 1 : 0,
      JSON.stringify(row.parts || []).length,
      Date.parse(row.created_at || 0) || 0
    ];
  }

  function preferMessageRow(left, right) {
    const leftRank = messageRowRank(left);
    const rightRank = messageRowRank(right);
    for (let index = 0; index < leftRank.length; index += 1) {
      if (leftRank[index] !== rightRank[index]) return leftRank[index] > rightRank[index] ? left : right;
    }
    return right || left;
  }

  function uniqueMessageRows(rows = []) {
    const bySequence = new Map();
    const withoutSequenceKey = [];
    for (const row of rows || []) {
      if (!row?.conversation_id) {
        withoutSequenceKey.push(row);
        continue;
      }
      const key = `${row.conversation_id}:${row.sequence}`;
      const existing = bySequence.get(key);
      bySequence.set(key, existing ? preferMessageRow(existing, row) : row);
    }
    const byId = new Map();
    for (const row of [...withoutSequenceKey, ...bySequence.values()]) {
      const existing = byId.get(row.id);
      byId.set(row.id, existing ? preferMessageRow(existing, row) : row);
    }
    return [...byId.values()];
  }

  async function upsertMessages(rows, { idsReconciled = false } = {}) {
    const uniqueRows = uniqueMessageRows(rows);
    await runInChunks(uniqueRows, 200, async chunk => {
      const payload = idsReconciled
        ? chunk
        : uniqueMessageRows(await reuseRemoteMessageIds(chunk));
      const { error } = await supabase.rpc('upsert_workspace_messages', { p_rows: payload });
      if (error) throw error;
    });
  }

  async function upsertAstras(rows) {
    await runInChunks(rows, 100, async chunk => {
      const { error } = await supabase
        .from('workspace_astras')
        .upsert(chunk, { onConflict: 'id' });
      if (isWorkspaceSyncSequencePermissionError(error)) {
        const retry = await supabase
          .from('workspace_astras')
          .upsert(withClientSyncSequence(chunk), { onConflict: 'id' });
        if (retry.error) throw retry.error;
        return;
      }
      if (error) throw error;
    });
  }

  async function verify({ folders = [], conversations = [], messages = [], astras = [] }) {
    const verifyRows = async (table, columns, localRows) => {
      for (let index = 0; index < localRows.length; index += 200) {
        const chunk = localRows.slice(index, index + 200);
        const { data, error } = await supabase
          .from(table)
          .select(columns)
          .eq('user_id', userId)
          .in('id', chunk.map(row => row.id));
        if (error) throw error;
        if (!includesLocalRows(chunk, data)) return false;
      }
      return true;
    };
    const verifyAstras = async (localRows) => {
      for (let index = 0; index < localRows.length; index += 200) {
        const chunk = localRows.slice(index, index + 200);
        const { data, error } = await supabase
          .from('workspace_astras')
          .select(`${ASTRA_COLUMNS},deleted_at`)
          .eq('user_id', userId)
          .in('id', chunk.map(row => row.id));
        if (error) throw error;
        if ((data || []).some(row => row.deleted_at)) return false;
        const comparable = (data || []).map(({ deleted_at: _deletedAt, ...row }) => row);
        if (!includesLocalRows(chunk, comparable)) return false;
      }
      return true;
    };
    return await verifyRows('workspace_folders', FOLDER_COLUMNS, folders)
      && await verifyRows('workspace_conversations', CONVERSATION_COLUMNS, conversations)
      && await verifyRows('workspace_messages', MESSAGE_COLUMNS, messages)
      && await verifyAstras(astras);
  }

  async function fetchWorkspace() {
    const selectRows = (table, columns) => fetchRangePages(() => supabase
        .from(table)
        .select(columns)
        .eq('user_id', userId)
        .order('id', { ascending: true }));
    const [folders, conversations, messages, astras] = await Promise.all([
      selectRows('workspace_folders', FOLDER_COLUMNS),
      selectRows('workspace_conversations', CONVERSATION_FETCH_COLUMNS),
      selectRows('workspace_messages', MESSAGE_FETCH_COLUMNS),
      selectRows('workspace_astras', ASTRA_FETCH_COLUMNS)
    ]);
    return { folders, conversations, messages, astras };
  }

  async function fetchTombstones() {
    return fetchRangePages(() => supabase
      .from('workspace_tombstones')
      .select('entity_type,entity_id,deleted_at')
      .eq('user_id', userId)
      .order('entity_type', { ascending: true })
      .order('entity_id', { ascending: true }));
  }

  async function permanentlyDeleteConversations(conversationIds) {
    const ids = [...new Set((conversationIds || []).filter(Boolean))];
    if (!ids.length) return;
    const { error } = await supabase.rpc('permanently_delete_workspace_conversations', {
      p_conversation_ids: ids
    });
    if (error) throw error;
  }

  async function permanentlyDeleteFolder(folderId) {
    if (!folderId) return;
    const { error } = await supabase.rpc('permanently_delete_workspace_folder', {
      p_folder_id: folderId
    });
    if (error) throw error;
  }

  async function permanentlyDeleteAstras(rows, deletedAt = new Date().toISOString()) {
    const tombstoneRows = (rows || []).map(row => ({ ...row, deleted_at: deletedAt }));
    await runInChunks(tombstoneRows, 100, async chunk => {
      const { error } = await supabase
        .from('workspace_astras')
        .upsert(chunk, { onConflict: 'id' });
      if (isWorkspaceSyncSequencePermissionError(error)) {
        const retry = await supabase
          .from('workspace_astras')
          .upsert(withClientSyncSequence(chunk), { onConflict: 'id' });
        if (retry.error) throw retry.error;
        return;
      }
      if (error) throw error;
    });
  }

  return {
    paginatedSnapshotsAreComplete: true,
    probe,
    setMigrationState,
    upsertFolders,
    upsertConversations,
    upsertMessages,
    upsertAstras,
    verify,
    fetchWorkspace,
    fetchTombstones,
    permanentlyDeleteConversations,
    permanentlyDeleteFolder,
    permanentlyDeleteAstras
  };
}

export function createConversationShadowSync({
  repository,
  readWorkspace,
  writeWorkspace = async () => {},
  commitWorkspace,
  onWorkspaceCommitted = () => {},
  userId,
  cryptoProvider = globalThis.crypto,
  online = () => globalThis.navigator?.onLine !== false,
  normalizeWorkspace = async workspace => workspace,
  prepareWorkspaceForUpload = async workspace => workspace,
  hydrateRemoteWorkspace = async workspace => workspace,
  readCaptureState,
  acknowledgeCapture,
  canSkipInitialUpload = () => false,
  schedule = (callback, delay) => globalThis.setTimeout(callback, delay),
  cancel = timer => globalThis.clearTimeout(timer),
  now = () => new Date().toISOString(),
  logger = console
} = {}) {
  let enabled = false;
  let acceptingCaptures = false;
  let pendingWorkspace = null;
  let timer = null;
  let work = Promise.resolve();
  let backupMarker = null;
  let tombstoneIndex = createTombstoneIndex();
  let astraTombstoneIds = new Set();
  let uploadBaseline = null;
  let baselineTrusted = false;
  let migrationPending = true;
  let generation = 0;
  let status = Object.freeze({
    state: 'idle',
    enabled: false,
    pending: false,
    conversations: 0,
    messages: 0,
    folders: 0,
    astras: 0
  });

  const setStatus = next => {
    status = Object.freeze({ ...status, ...next });
    return status;
  };

  const invalidateUploadBaseline = () => {
    uploadBaseline = null;
    baselineTrusted = false;
    setStatus({ baselineTrusted: false });
  };

  const acceptFetchedUploadBaseline = rows => {
    if (repository?.paginatedSnapshotsAreComplete !== true) {
      invalidateUploadBaseline();
      return false;
    }
    uploadBaseline = cloneShadowRows(rows);
    baselineTrusted = true;
    setStatus({ baselineTrusted: true });
    return true;
  };

  const refreshCompleteUploadBaseline = async assertCurrent => {
    if (repository?.paginatedSnapshotsAreComplete !== true) return false;
    const [tombstones, rows] = await Promise.all([
      repository.fetchTombstones(),
      repository.fetchWorkspace()
    ]);
    assertCurrent();
    tombstoneIndex = createTombstoneIndex(tombstones);
    astraTombstoneIds = createAstraTombstoneIndex(rows.astras);
    return acceptFetchedUploadBaseline(rows);
  };

  async function resolveCaptureState(workspace, metadata, assertCurrent) {
    if (typeof readCaptureState !== 'function') {
      return { workspace, revision: metadata?.revision || null, journal: null };
    }
    const resolved = await readCaptureState({ workspace, metadata, assertCurrent });
    assertCurrent();
    return {
      ...resolved,
      workspace: resolved?.workspace ?? workspace,
      revision: resolved?.revision ?? resolved?.journal?.workspaceRevision ?? null
    };
  }

  async function captureNow(
    workspace,
    allowDisabled = false,
    assertCurrent = () => {},
    resolvedCapture = null,
    metadata = null
  ) {
    if ((!enabled && !allowDisabled) || !workspace || !online()) {
      return setStatus({ state: online() ? 'idle' : 'offline' });
    }
    assertCurrent();
    const capture = resolvedCapture || await resolveCaptureState(workspace, metadata, assertCurrent);
    const latestWorkspace = capture.workspace;
    const attemptedRevision = capture.revision;
    assertCurrent();
    setStatus({ state: 'uploading' });
    assertCurrent();
    const normalizedWorkspace = await normalizeWorkspace(latestWorkspace);
    assertCurrent();
    const uploadWorkspace = await prepareWorkspaceForUpload(normalizedWorkspace);
    assertCurrent();
    const baselineMissingAtStart = !(baselineTrusted && uploadBaseline);
    if (baselineMissingAtStart) {
      try {
        await refreshCompleteUploadBaseline(assertCurrent);
      } catch (error) {
        invalidateUploadBaseline();
        throw error;
      }
      assertCurrent();
    }
    const initiallyEncoded = filterEncodedWorkspaceByTombstones(
      await encodeWorkspaceConversationShadow({ workspace: uploadWorkspace, userId, cryptoProvider }),
      tombstoneIndex,
      astraTombstoneIds
    );
    assertCurrent();
    if (initiallyEncoded.skippedConversationIds.length) {
      logger.warn('Noureon Sync V2 shadow skipped conversations with invalid IDs.', {
        count: initiallyEncoded.skippedConversationIds.length,
        ids: initiallyEncoded.skippedConversationIds.slice(0, 10)
      });
    }
    const hadTrustedBaseline = Boolean(baselineTrusted && uploadBaseline);
    const reconciliation = hadTrustedBaseline
      ? reconcileEncodedMessageIds(initiallyEncoded, uploadBaseline)
      : { encoded: initiallyEncoded, safe: true, reason: null };
    if (!reconciliation.safe) {
      invalidateUploadBaseline();
      const error = new Error('Cloud message IDs could not be reconciled safely.');
      error.code = 'ASTRA_MESSAGE_ID_RECONCILIATION_AMBIGUOUS';
      error.details = { reason: reconciliation.reason };
      throw error;
    }
    const encoded = reconciliation.encoded;
    const fullResyncRequired = capture.journal?.fullResyncRequired === true;
    const forceFullUpload = fullResyncRequired || baselineMissingAtStart || !hadTrustedBaseline;
    const uploadRows = createShadowUploadDelta(
      encoded,
      hadTrustedBaseline ? uploadBaseline : emptyShadowRows(),
      { forceFull: forceFullUpload }
    );
    const uploadedRows = countShadowUploadRows(uploadRows);
    const writeMigrationState = migrationPending || forceFullUpload;
    setStatus({
      state: 'uploading',
      enabled,
      pending: false,
      conversations: encoded.conversations.length,
      messages: encoded.messages.length,
      folders: encoded.folders.length,
      astras: encoded.astras.length,
      fullConversations: encoded.conversations.length,
      fullMessages: encoded.messages.length,
      fullFolders: encoded.folders.length,
      fullAstras: encoded.astras.length,
      uploadedConversations: uploadRows.conversations.length,
      uploadedMessages: uploadRows.messages.length,
      uploadedFolders: uploadRows.folders.length,
      uploadedAstras: uploadRows.astras.length,
      uploadedRows,
      fullUpload: forceFullUpload,
      fullUploadReason: fullResyncRequired
        ? 'journal-full-resync'
        : baselineMissingAtStart || !hadTrustedBaseline ? 'missing-trusted-baseline' : null,
      baselineTrusted: Boolean(hadTrustedBaseline),
      skipped: encoded.skippedConversationIds.length,
      skippedConversationIds: encoded.skippedConversationIds.slice(0, 10),
      lastUploadStartedAt: now(),
      error: undefined,
      code: undefined,
      status: undefined,
      details: undefined,
      hint: undefined
    });
    assertCurrent();
    const baselineBeforeUpload = hadTrustedBaseline
      ? uploadBaseline
      : emptyShadowRows();
    try {
      if (writeMigrationState) {
        await repository.setMigrationState('shadow', backupMarker);
        assertCurrent();
      }
      if (uploadRows.folders.length) {
        await repository.upsertFolders(uploadRows.folders);
        assertCurrent();
      }
      if (uploadRows.conversations.length) {
        await repository.upsertConversations(uploadRows.conversations);
        assertCurrent();
      }
      if (uploadRows.messages.length) {
        await repository.upsertMessages(uploadRows.messages, {
          idsReconciled: Boolean(hadTrustedBaseline)
        });
        assertCurrent();
      }
      if (uploadRows.astras.length) {
        await repository.upsertAstras(uploadRows.astras);
        assertCurrent();
      }
      const verified = await repository.verify(encoded);
      assertCurrent();
      if (!verified) {
        const error = new Error('Sync V2 shadow verification did not match the local workspace.');
        error.code = 'ASTRA_SHADOW_VERIFY_MISMATCH';
        throw error;
      }
      if (writeMigrationState) {
        await repository.setMigrationState('ready');
        assertCurrent();
        migrationPending = false;
        backupMarker = null;
      }
      if (hadTrustedBaseline) {
        uploadBaseline = normalizeVerifiedShadowBaseline(
          mergeShadowUploadIntoBaseline(baselineBeforeUpload, uploadRows)
        );
        baselineTrusted = true;
      } else {
        invalidateUploadBaseline();
      }
    } catch (error) {
      invalidateUploadBaseline();
      throw error;
    }
    let acknowledgement = null;
    if (typeof acknowledgeCapture === 'function' && attemptedRevision) {
      acknowledgement = await acknowledgeCapture({ attemptedRevision, capture, assertCurrent });
      assertCurrent();
      if (acknowledgement?.acknowledged === false && !pendingWorkspace) {
        pendingWorkspace = { workspace: latestWorkspace, metadata: null, generation };
        if (enabled && timer == null) timer = schedule(drain, CAPTURE_DEBOUNCE_MS);
      }
    }
    const readyStatus = setStatus({
      state: 'ready',
      enabled,
      pending: Boolean(pendingWorkspace),
      conversations: encoded.conversations.length,
      messages: encoded.messages.length,
      folders: encoded.folders.length,
      astras: encoded.astras.length,
      fullConversations: encoded.conversations.length,
      fullMessages: encoded.messages.length,
      fullFolders: encoded.folders.length,
      fullAstras: encoded.astras.length,
      uploadedConversations: uploadRows.conversations.length,
      uploadedMessages: uploadRows.messages.length,
      uploadedFolders: uploadRows.folders.length,
      uploadedAstras: uploadRows.astras.length,
      uploadedRows,
      fullUpload: forceFullUpload,
      baselineTrusted,
      skipped: encoded.skippedConversationIds.length,
      journalAcknowledged: acknowledgement?.acknowledged,
      lastCompletedAt: now()
    });
    assertCurrent();
    return readyStatus;
  }

  async function pullWorkspace(localWorkspace = {}) {
    const operationGeneration = generation;
    const assertOperationCurrent = () => {
      if (generation !== operationGeneration) throw new ShadowSyncStoppedError();
    };
    try {
      const tombstones = await repository.fetchTombstones();
      assertOperationCurrent();
      const nextTombstoneIndex = createTombstoneIndex(tombstones);
      const conversationSanitizedLocal = applyWorkspaceTombstones(localWorkspace, nextTombstoneIndex);
      const rows = await repository.fetchWorkspace();
      assertOperationCurrent();
      const nextAstraTombstoneIds = createAstraTombstoneIndex(rows.astras);
      const sanitizedLocal = applyAstraTombstones(
        conversationSanitizedLocal,
        nextAstraTombstoneIds
      );
      const decodedRemoteWorkspace = decodeWorkspaceConversationShadow(rows);
      const hydratedRemoteWorkspace = await hydrateRemoteWorkspace(decodedRemoteWorkspace);
      assertOperationCurrent();
      const remoteWorkspace = applyAstraTombstones(applyWorkspaceTombstones(
        hydratedRemoteWorkspace,
        nextTombstoneIndex
      ), nextAstraTombstoneIds);
      const merged = mergeWorkspacePreservingLocalTopLevel(sanitizedLocal, remoteWorkspace);
      assertOperationCurrent();
      tombstoneIndex = nextTombstoneIndex;
      astraTombstoneIds = nextAstraTombstoneIds;
      acceptFetchedUploadBaseline(rows);
      return applyAstraTombstones(
        applyWorkspaceTombstones(merged, tombstoneIndex),
        astraTombstoneIds
      );
    } catch (error) {
      invalidateUploadBaseline();
      throw error;
    }
  }

  async function refreshWorkspaceNow(assertOperationCurrent = () => {}) {
    const tombstones = await repository.fetchTombstones();
    assertOperationCurrent();
    const nextTombstoneIndex = createTombstoneIndex(tombstones);
    const rows = await repository.fetchWorkspace();
    assertOperationCurrent();
    const nextAstraTombstoneIds = createAstraTombstoneIndex(rows.astras);
    const decodedRemoteWorkspace = decodeWorkspaceConversationShadow(rows);
    const hydratedRemoteWorkspace = await hydrateRemoteWorkspace(decodedRemoteWorkspace);
    assertOperationCurrent();
    const remoteWorkspace = applyAstraTombstones(applyWorkspaceTombstones(
      hydratedRemoteWorkspace,
      nextTombstoneIndex
    ), nextAstraTombstoneIds);
    let committedWorkspace;
    if (commitWorkspace) {
      committedWorkspace = await commitWorkspace({
        remoteWorkspace,
        tombstoneIndex: nextTombstoneIndex,
        astraTombstoneIds: nextAstraTombstoneIds,
        assertCurrent: assertOperationCurrent
      });
    } else {
      const localWorkspace = await normalizeWorkspace(await readWorkspace() || {});
      assertOperationCurrent();
      const sanitizedLocal = applyAstraTombstones(
        applyWorkspaceTombstones(localWorkspace, nextTombstoneIndex),
        nextAstraTombstoneIds
      );
      committedWorkspace = applyAstraTombstones(applyWorkspaceTombstones(
        mergeWorkspacePreservingLocalTopLevel(sanitizedLocal, remoteWorkspace),
        nextTombstoneIndex
      ), nextAstraTombstoneIds);
      await writeWorkspace(committedWorkspace);
    }
    assertOperationCurrent();
    tombstoneIndex = nextTombstoneIndex;
    astraTombstoneIds = nextAstraTombstoneIds;
    acceptFetchedUploadBaseline(rows);
    try {
      onWorkspaceCommitted({
        workspace: committedWorkspace,
        tombstones: {
          conversationIds: [...nextTombstoneIndex.conversations],
          folderIds: [...nextTombstoneIndex.folders],
          astraIds: [...nextAstraTombstoneIds]
        }
      });
    } catch (error) {
      logger.warn('Noureon could not hand the refreshed cloud workspace to the live runtime.', error);
    }
    return committedWorkspace;
  }

  function refreshWorkspace() {
    if (!enabled) return Promise.resolve(status);
    const refreshGeneration = generation;
    const assertOperationCurrent = () => {
      if (generation !== refreshGeneration) throw new ShadowSyncStoppedError();
    };
    work = work
      .catch(() => {})
      .then(async () => {
        assertOperationCurrent();
        setStatus({ state: 'refreshing', enabled, pending: Boolean(pendingWorkspace) });
        const committedWorkspace = await refreshWorkspaceNow(assertOperationCurrent);
        const summary = summarizeWorkspace(committedWorkspace);
        return setStatus({
          state: 'ready',
          enabled,
          pending: Boolean(pendingWorkspace),
          conversations: summary.conversations,
          messages: summary.messages,
          folders: summary.folders,
          astras: summary.astras,
          lastRemoteRefreshAt: now(),
          error: undefined,
          code: undefined,
          details: undefined,
          hint: undefined
        });
      })
      .catch(error => {
        invalidateUploadBaseline();
        if (error instanceof ShadowSyncStoppedError) {
          return setStatus({ state: 'stopped', enabled: false, pending: false });
        }
        logger.warn('Noureon Sync V2 remote refresh will retry after reconnect or reload.', error);
        return setStatus({
          state: 'retry',
          enabled,
          pending: Boolean(pendingWorkspace),
          lastErrorAt: now(),
          ...describeShadowError(error)
        });
      });
    return work;
  }

  function flush() {
    if (!enabled) return work.then(() => status);
    if (timer != null) cancel(timer);
    timer = null;
    return drain();
  }

  async function retry() {
    try {
      if (!online()) return setStatus({ state: 'offline', enabled, pending: Boolean(pendingWorkspace) });
      if (!enabled) {
        return status.state === 'retry' ? initialize() : status;
      }
      const refreshed = await refreshWorkspace();
      if (refreshed.state !== 'ready' || !enabled) return refreshed;
      const workspace = await readWorkspace();
      if (!workspace) return status;
      const capture = await resolveCaptureState(workspace, null, () => {});
      if (capture.journal && !capture.journal.dirty && !capture.journal.fullResyncRequired) return status;
      captureWorkspace(capture.workspace, { revision: capture.revision });
      return flush();
    } catch (error) {
      invalidateUploadBaseline();
      logger.warn('Noureon Sync V2 retry will continue after the next reconnect or remote change.', error);
      return setStatus({
        state: 'retry',
        enabled,
        pending: Boolean(pendingWorkspace),
        lastErrorAt: now(),
        ...describeShadowError(error)
      });
    }
  }

  function drain() {
    timer = null;
    const pending = pendingWorkspace;
    pendingWorkspace = null;
    if (!pending) return work;
    const captureGeneration = pending?.generation;
    const assertCurrent = () => {
      if (generation !== captureGeneration) throw new ShadowSyncStoppedError();
    };
    work = work
      .catch(() => {})
      .then(() => captureNow(pending?.workspace, false, assertCurrent, null, pending?.metadata))
      .catch(error => {
        if (error instanceof ShadowSyncStoppedError) {
          return setStatus({ state: 'stopped', enabled: false, pending: false });
        }
        logger.warn('Noureon Sync V2 shadow upload will retry after the next local save or reload.', error);
        setStatus({
          state: 'retry',
          enabled,
          pending: false,
          lastErrorAt: now(),
          ...describeShadowError(error)
        });
      });
    return work;
  }

  function captureWorkspace(workspace, metadata = null) {
    if ((!enabled && !acceptingCaptures) || !workspace) {
      setStatus({
        state: !workspace ? status.state : status.state === 'idle' ? 'disabled' : status.state,
        enabled,
        pending: false,
        lastCaptureRejectedAt: now(),
        lastCaptureRejectedReason: !workspace ? 'empty-workspace' : 'sync-not-ready'
      });
      return false;
    }
    pendingWorkspace = { workspace, metadata, generation };
    if (timer != null) cancel(timer);
    timer = enabled ? schedule(drain, CAPTURE_DEBOUNCE_MS) : null;
    setStatus({
      enabled,
      pending: true,
      lastCaptureQueuedAt: now(),
      local: summarizeWorkspace(workspace)
    });
    return true;
  }

  async function permanentlyDeleteConversations(conversationIds, options = {}) {
    const ids = [...new Set((conversationIds || []).filter(Boolean))];
    const validIds = new Set();
    for (const id of ids) {
      const stringId = String(id);
      if (isUuid(stringId)) {
        validIds.add(stringId);
        continue;
      }
      const cloudId = await deterministicUuid(
        `astra-sync-v2:${userId}:conversation:${stringId}`,
        cryptoProvider
      );
      validIds.add(cloudId);
    }
    if (!ids.length) return status;
    if (!enabled) throw new Error('Cloud conversation sync is not ready yet.');
    const operationGeneration = generation;
    const assertOperationCurrent = () => {
      if (generation !== operationGeneration) throw new ShadowSyncStoppedError();
    };
    if (timer != null) cancel(timer);
    timer = null;
    pendingWorkspace = null;
    setStatus({ pending: false });
    await work.catch(() => {});
    assertOperationCurrent();
    const residualRemoteIds = [];
    const optionSnapshots = Array.isArray(options.conversations) ? options.conversations : [];
    let localSnapshots = [];
    try {
      const localWorkspace = await readWorkspace();
      assertOperationCurrent();
      localSnapshots = (localWorkspace?.conversations || []).filter(conversation => {
        if (!conversation?.id) return false;
        const id = String(conversation.id);
        return ids.includes(id) || validIds.has(id);
      });
    } catch (error) {
      if (error instanceof ShadowSyncStoppedError) throw error;
      logger.warn('Noureon Sync V2 shadow could not read local delete snapshots.', error);
    }
    const conversationSnapshots = uniqueConversationsById([
      ...optionSnapshots,
      ...localSnapshots
    ]);
    if (options.requireSnapshots && conversationSnapshots.length < ids.length) {
      const error = new Error('Cloud permanent delete requires local conversation snapshots.');
      error.code = 'ASTRA_DELETE_SNAPSHOT_REQUIRED';
      error.details = {
        requestedIds: ids.slice(0, 10),
        snapshotIds: conversationSnapshots.map(conversation => conversation?.id).filter(Boolean).slice(0, 10)
      };
      setStatus({
        state: 'retry',
        enabled,
        pending: false,
        lastPermanentDeleteAt: now(),
        lastPermanentDeleteCount: validIds.size,
        lastPermanentDeleteError: describeShadowError(error),
        lastErrorAt: now(),
        ...describeShadowError(error)
      });
      throw error;
    }
    const selectedFingerprints = new Set(
      conversationSnapshots
        .map(conversationDeleteFingerprint)
        .filter(Boolean)
    );
    const selectedMatchKeys = new Set(
      conversationSnapshots
        .flatMap(conversation => [...conversationDeleteMatchKeys(conversation)])
        .filter(Boolean)
    );
    if (options.requireSnapshots && !selectedFingerprints.size && !selectedMatchKeys.size) {
      const error = new Error('Cloud permanent delete could not build remote match keys.');
      error.code = 'ASTRA_DELETE_MATCH_KEYS_REQUIRED';
      error.details = {
        requestedIds: ids.slice(0, 10),
        snapshotIds: conversationSnapshots.map(conversation => conversation?.id).filter(Boolean).slice(0, 10)
      };
      setStatus({
        state: 'retry',
        enabled,
        pending: false,
        lastPermanentDeleteAt: now(),
        lastPermanentDeleteCount: validIds.size,
        lastPermanentDeleteError: describeShadowError(error),
        lastErrorAt: now(),
        ...describeShadowError(error)
      });
      throw error;
    }
    const collectMatchingRemoteIds = async () => {
      if (!validIds.size && !selectedFingerprints.size && !selectedMatchKeys.size) return [];
      const remoteWorkspace = decodeWorkspaceConversationShadow(await repository.fetchWorkspace());
      assertOperationCurrent();
      const matches = [];
      for (const remoteConversation of remoteWorkspace.conversations || []) {
        if (!remoteConversation?.id) continue;
        if (validIds.has(String(remoteConversation.id))) {
          matches.push(remoteConversation.id);
          continue;
        }
        const fingerprint = conversationDeleteFingerprint(remoteConversation);
        const matchKeys = conversationDeleteMatchKeys(remoteConversation);
        const matched = (fingerprint && selectedFingerprints.has(fingerprint))
          || [...matchKeys].some(key => selectedMatchKeys.has(key));
        if (matched) {
          matches.push(remoteConversation.id);
        }
      }
      return [...new Set(matches)];
    };
    for (const remoteId of await collectMatchingRemoteIds()) {
      if (validIds.has(remoteId)) continue;
      validIds.add(remoteId);
    }
    const deleteIds = [...validIds];
    try {
      await repository.permanentlyDeleteConversations(deleteIds);
      assertOperationCurrent();
      for (const remoteId of await collectMatchingRemoteIds()) {
        if (validIds.has(remoteId)) continue;
        validIds.add(remoteId);
        residualRemoteIds.push(remoteId);
      }
      if (residualRemoteIds.length) {
        await repository.permanentlyDeleteConversations(residualRemoteIds);
        assertOperationCurrent();
      }
      const refreshedTombstones = await repository.fetchTombstones();
      assertOperationCurrent();
      const refreshedTombstoneIndex = createTombstoneIndex(refreshedTombstones);
      const missingTombstoneIds = [...validIds]
        .filter(id => !refreshedTombstoneIndex.conversations.has(id));
      if (missingTombstoneIds.length) {
        const error = new Error('Cloud permanent delete did not create durable deletion markers.');
        error.code = 'ASTRA_TOMBSTONE_VERIFY_FAILED';
        error.details = { missingConversationIds: missingTombstoneIds.slice(0, 10) };
        throw error;
      }
      const finalResidualRemoteIds = await collectMatchingRemoteIds();
      if (finalResidualRemoteIds.length) {
        const error = new Error('Cloud permanent delete left matching remote conversations behind.');
        error.code = 'ASTRA_REMOTE_DELETE_VERIFY_FAILED';
        error.details = { remainingConversationIds: finalResidualRemoteIds.slice(0, 10) };
        throw error;
      }
      tombstoneIndex = refreshedTombstoneIndex;
      const finalDeleteIds = [...validIds];
      if (baselineTrusted && uploadBaseline) {
        const deletedIds = new Set(finalDeleteIds.map(String));
        uploadBaseline = {
          ...cloneShadowRows(uploadBaseline),
          conversations: uploadBaseline.conversations.filter(row => !deletedIds.has(String(row?.id || ''))),
          messages: uploadBaseline.messages.filter(row => !deletedIds.has(String(row?.conversation_id || '')))
        };
      }
      return setStatus({
        state: 'ready',
        enabled,
        pending: false,
        lastPermanentDeleteAt: now(),
        lastPermanentDeleteCount: finalDeleteIds.length,
        lastPermanentDeleteVerifiedCount: finalDeleteIds.length,
        lastCompletedAt: now(),
        lastPermanentDeleteError: undefined
      });
    } catch (error) {
      invalidateUploadBaseline();
      if (error instanceof ShadowSyncStoppedError) throw error;
      setStatus({
        state: 'retry',
        enabled,
        pending: false,
        lastPermanentDeleteAt: now(),
        lastPermanentDeleteCount: validIds.size,
        lastPermanentDeleteError: describeShadowError(error),
        lastErrorAt: now(),
        ...describeShadowError(error)
      });
      throw error;
    }
  }

  async function permanentlyDeleteAstras(astraIds, options = {}) {
    const requestedIds = [...new Set((astraIds || []).filter(Boolean).map(String))];
    if (!requestedIds.length) return status;
    if (!enabled) throw new Error('Cloud Noura sync is not ready yet.');
    const operationGeneration = generation;
    const assertOperationCurrent = () => {
      if (generation !== operationGeneration) throw new ShadowSyncStoppedError();
    };
    if (timer != null) cancel(timer);
    timer = null;
    pendingWorkspace = null;
    setStatus({ pending: false });
    await work.catch(() => {});
    assertOperationCurrent();

    const localWorkspace = await readWorkspace() || {};
    assertOperationCurrent();
    const optionSnapshots = Array.isArray(options.astras) ? options.astras : [];
    const snapshotById = new Map(
      [...(localWorkspace.astras || []), ...optionSnapshots]
        .filter(astra => requestedIds.includes(String(astra?.id || '')))
        .map(astra => [String(astra.id), astra])
    );
    if (snapshotById.size < requestedIds.length) {
      const error = new Error('Cloud Noura deletion requires local snapshots.');
      error.code = 'ASTRA_ASTRA_DELETE_SNAPSHOT_REQUIRED';
      throw error;
    }

    const deletionWorkspace = await normalizeWorkspace({
      conversations: [],
      folders: [],
      astras: [...snapshotById.values()]
    });
    assertOperationCurrent();
    const encoded = await encodeWorkspaceConversationShadow({
      workspace: deletionWorkspace,
      userId,
      cryptoProvider
    });
    assertOperationCurrent();
    if (encoded.astras.length !== requestedIds.length) {
      const error = new Error('Cloud Noura deletion could not encode every Noura.');
      error.code = 'ASTRA_ASTRA_DELETE_ENCODE_FAILED';
      throw error;
    }

    try {
      const deletedAt = now();
      await repository.permanentlyDeleteAstras(encoded.astras, deletedAt);
      assertOperationCurrent();
      const rows = await repository.fetchWorkspace();
      assertOperationCurrent();
      const nextAstraTombstoneIds = createAstraTombstoneIndex(rows.astras);
      const deletedIds = encoded.astras.map(row => row.id);
      const missingIds = deletedIds.filter(id => !nextAstraTombstoneIds.has(id));
      if (missingIds.length) {
        const error = new Error('Cloud Noura deletion did not create durable deletion markers.');
        error.code = 'ASTRA_ASTRA_TOMBSTONE_VERIFY_FAILED';
        error.details = { missingAstraIds: missingIds.slice(0, 10) };
        throw error;
      }
      astraTombstoneIds = nextAstraTombstoneIds;
      acceptFetchedUploadBaseline(rows);
      return setStatus({
        state: 'ready',
        enabled,
        pending: false,
        lastAstraDeleteAt: deletedAt,
        lastAstraDeleteCount: deletedIds.length,
        lastAstraDeleteError: undefined,
        lastCompletedAt: now()
      });
    } catch (error) {
      invalidateUploadBaseline();
      if (error instanceof ShadowSyncStoppedError) throw error;
      setStatus({
        state: 'retry',
        enabled,
        pending: false,
        lastAstraDeleteAt: now(),
        lastAstraDeleteCount: 0,
        lastAstraDeleteError: describeShadowError(error),
        lastErrorAt: now(),
        ...describeShadowError(error)
      });
      throw error;
    }
  }

  async function permanentlyDeleteFolder(folderId) {
    const requestedId = String(folderId || '');
    if (!requestedId) return status;
    if (!enabled) throw new Error('Cloud folder sync is not ready yet.');
    const operationGeneration = generation;
    const assertOperationCurrent = () => {
      if (generation !== operationGeneration) throw new ShadowSyncStoppedError();
    };
    if (timer != null) cancel(timer);
    timer = null;
    pendingWorkspace = null;
    setStatus({ pending: false });
    await work.catch(() => {});
    assertOperationCurrent();

    const cloudFolderId = isUuid(requestedId)
      ? requestedId
      : await deterministicUuid(`astra-sync-v2:${userId}:folder:${requestedId}`, cryptoProvider);
    assertOperationCurrent();

    try {
      await repository.permanentlyDeleteFolder(cloudFolderId);
      assertOperationCurrent();
      const refreshedTombstones = await repository.fetchTombstones();
      assertOperationCurrent();
      const refreshedTombstoneIndex = createTombstoneIndex(refreshedTombstones);
      if (!refreshedTombstoneIndex.folders.has(cloudFolderId)) {
        const error = new Error('Cloud folder delete did not create a durable deletion marker.');
        error.code = 'ASTRA_FOLDER_TOMBSTONE_VERIFY_FAILED';
        error.details = { missingFolderId: cloudFolderId };
        throw error;
      }
      tombstoneIndex = refreshedTombstoneIndex;
      if (baselineTrusted && uploadBaseline) {
        const nextBaseline = cloneShadowRows(uploadBaseline);
        nextBaseline.folders = nextBaseline.folders.filter(row => row?.id !== cloudFolderId);
        nextBaseline.conversations = nextBaseline.conversations.map(row => (
          row?.folder_id === cloudFolderId ? { ...row, folder_id: null } : row
        ));
        uploadBaseline = nextBaseline;
      }
      return setStatus({
        state: 'ready',
        enabled,
        pending: false,
        lastFolderDeleteAt: now(),
        lastFolderDeleteCount: 1,
        lastFolderDeleteError: undefined,
        lastCompletedAt: now()
      });
    } catch (error) {
      invalidateUploadBaseline();
      if (error instanceof ShadowSyncStoppedError) throw error;
      setStatus({
        state: 'retry',
        enabled,
        pending: false,
        lastFolderDeleteAt: now(),
        lastFolderDeleteCount: 0,
        lastFolderDeleteError: describeShadowError(error),
        lastErrorAt: now(),
        ...describeShadowError(error)
      });
      throw error;
    }
  }

  async function diagnose() {
    const diagnosis = {
      status,
      permanentDelete: {
        at: status.lastPermanentDeleteAt || null,
        count: status.lastPermanentDeleteCount || 0,
        verifiedCount: status.lastPermanentDeleteVerifiedCount || 0,
        error: status.lastPermanentDeleteError || null
      },
      online: online(),
      userId
    };
    try {
      diagnosis.local = summarizeWorkspace(await readWorkspace() || {});
    } catch (error) {
      diagnosis.localError = describeShadowError(error);
    }
    try {
      diagnosis.profile = await repository.probe();
    } catch (error) {
      diagnosis.profileError = describeShadowError(error);
    }
    try {
      const tombstones = await repository.fetchTombstones();
      diagnosis.tombstones = {
        total: tombstones.length,
        conversations: tombstones.filter(row => row?.entity_type === 'conversation').length,
        folders: tombstones.filter(row => row?.entity_type === 'folder').length
      };
    } catch (error) {
      diagnosis.tombstoneError = describeShadowError(error);
    }
    try {
      diagnosis.remote = summarizeShadowRows(await repository.fetchWorkspace());
    } catch (error) {
      diagnosis.remoteError = describeShadowError(error);
    }
    return diagnosis;
  }

  async function initialize() {
    const initializeGeneration = ++generation;
    let profile = null;
    invalidateUploadBaseline();
    const assertCurrent = () => {
      if (generation !== initializeGeneration) throw new ShadowSyncStoppedError();
    };
    try {
      profile = await repository.probe();
      assertCurrent();
      backupMarker = profile?.legacy_backup_created_at ? null : now();
      migrationPending = Number(profile?.schema_version) !== SCHEMA_VERSION
        || !['ready', 'active'].includes(profile?.migration_state);
    } catch (error) {
      if (error instanceof ShadowSyncStoppedError) return setStatus({ state: 'stopped', enabled: false, pending: false });
      if (isMissingSchemaError(error)) return setStatus({ state: 'migration-required', enabled: false, pending: false, ...describeShadowError(error) });
      logger.warn('Noureon Sync V2 shadow probe failed; local mode remains active.', error);
      return setStatus({ state: 'retry', enabled: false, pending: false, lastErrorAt: now(), ...describeShadowError(error) });
    }
    try {
      const workspace = await readWorkspace() || {};
      assertCurrent();
      const normalizedWorkspace = await normalizeWorkspace(workspace);
      assertCurrent();
      const tombstones = await repository.fetchTombstones();
      assertCurrent();
      const nextTombstoneIndex = createTombstoneIndex(tombstones);
      const rows = await repository.fetchWorkspace();
      assertCurrent();
      const nextAstraTombstoneIds = createAstraTombstoneIndex(rows.astras);
      const sanitizedLocal = applyAstraTombstones(
        applyWorkspaceTombstones(normalizedWorkspace, nextTombstoneIndex),
        nextAstraTombstoneIds
      );
      const decodedRemoteWorkspace = decodeWorkspaceConversationShadow(rows);
      assertCurrent();
      const hydratedRemoteWorkspace = await hydrateRemoteWorkspace(decodedRemoteWorkspace);
      assertCurrent();
      const remoteWorkspace = applyAstraTombstones(applyWorkspaceTombstones(
        hydratedRemoteWorkspace,
        nextTombstoneIndex
      ), nextAstraTombstoneIds);
      const mergedWorkspace = applyAstraTombstones(applyWorkspaceTombstones(
        mergeWorkspacePreservingLocalTopLevel(sanitizedLocal, remoteWorkspace),
        nextTombstoneIndex
      ), nextAstraTombstoneIds);
      assertCurrent();
      let committedWorkspace;
      if (commitWorkspace) {
        committedWorkspace = await commitWorkspace({
            remoteWorkspace,
            tombstoneIndex: nextTombstoneIndex,
            astraTombstoneIds: nextAstraTombstoneIds,
            assertCurrent
        });
      } else {
        await writeWorkspace(mergedWorkspace);
        committedWorkspace = mergedWorkspace;
      }
      assertCurrent();
      tombstoneIndex = nextTombstoneIndex;
      astraTombstoneIds = nextAstraTombstoneIds;
      acceptFetchedUploadBaseline(rows);
      try {
        onWorkspaceCommitted({
          workspace: committedWorkspace,
          tombstones: {
            conversationIds: [...nextTombstoneIndex.conversations],
            folderIds: [...nextTombstoneIndex.folders],
            astraIds: [...nextAstraTombstoneIds]
          }
        });
      } catch (error) {
        logger.warn('Noureon could not hand the committed cloud workspace to the live runtime.', error);
      }
      acceptingCaptures = true;
      let initialCapture = await resolveCaptureState(committedWorkspace, null, assertCurrent);
      assertCurrent();
      const canSkip = await canSkipInitialUpload(initialCapture, { profile });
      assertCurrent();
      if (canSkip && !pendingWorkspace) {
        assertCurrent();
        enabled = true;
        acceptingCaptures = false;
        const summary = summarizeWorkspace(initialCapture.workspace);
        return setStatus({
          state: 'ready',
          enabled: true,
          pending: false,
          conversations: summary.conversations,
          messages: summary.messages,
          folders: summary.folders,
          astras: summary.astras,
          fullConversations: summary.conversations,
          fullMessages: summary.messages,
          fullFolders: summary.folders,
          fullAstras: summary.astras,
          uploadedConversations: 0,
          uploadedMessages: 0,
          uploadedFolders: 0,
          uploadedAstras: 0,
          uploadedRows: 0,
          fullUpload: false,
          baselineTrusted,
          skipped: 0,
          uploadSkipped: true,
          lastUploadSkippedAt: now(),
          error: undefined,
          code: undefined,
          status: undefined,
          details: undefined,
          hint: undefined
        });
      }
      if (canSkip && pendingWorkspace) {
        const pending = pendingWorkspace;
        pendingWorkspace = null;
        initialCapture = await resolveCaptureState(
          pending.workspace,
          pending.metadata,
          assertCurrent
        );
        assertCurrent();
      }
      const result = await captureNow(initialCapture.workspace, true, assertCurrent, initialCapture);
      assertCurrent();
      if (result.state === 'ready') {
        enabled = true;
        acceptingCaptures = false;
        if (pendingWorkspace && timer == null) timer = schedule(drain, CAPTURE_DEBOUNCE_MS);
        return setStatus({ enabled: true, pending: Boolean(pendingWorkspace) });
      }
      return result;
    } catch (error) {
      enabled = false;
      acceptingCaptures = false;
      invalidateUploadBaseline();
      if (error instanceof ShadowSyncStoppedError) {
        return setStatus({ state: 'stopped', enabled: false, pending: false });
      }
      if (isMissingSchemaError(error)) {
        enabled = false;
        return setStatus({ state: 'migration-required', enabled: false, pending: false, ...describeShadowError(error) });
      }
      logger.warn('Noureon Sync V2 shadow initialization is incomplete; local mode remains active.', error);
      return setStatus({ state: 'retry', enabled: false, pending: false, lastErrorAt: now(), ...describeShadowError(error) });
    }
  }

  function stop() {
    generation += 1;
    enabled = false;
    acceptingCaptures = false;
    if (timer != null) cancel(timer);
    timer = null;
    pendingWorkspace = null;
    invalidateUploadBaseline();
    setStatus({ state: 'stopped', enabled: false, pending: false });
  }

  return {
    initialize,
    captureWorkspace,
    permanentlyDeleteConversations,
    permanentlyDeleteFolder,
    permanentlyDeleteAstras,
    pullWorkspace,
    refresh: refreshWorkspace,
    retry,
    diagnose,
    flush,
    stop,
    getStatus: () => status
  };
}

export function initializeConversationShadowSync({
  window,
  supabase,
  storage,
  user,
  username,
  assetTransport,
  onWorkspaceCommitted,
  cryptoProvider = globalThis.crypto,
  schedule,
  cancel,
  now,
  logger = console
} = {}) {
  const repository = createConversationShadowRepository({ supabase, userId: user.id });
  const storageKey = `chatAppData_v8.6_${username}`;
  const journalKey = getCloudSyncJournalKey(username);
  const journalNow = typeof now === 'function' ? now : Date.now;
  const writeWorkspaceAndJournal = async (workspace, journal) => {
    const entries = [
      { key: storageKey, value: JSON.stringify(workspace) },
      { key: journalKey, value: JSON.stringify(journal) }
    ];
    if (typeof storage.setItemsAtomic === 'function') {
      await storage.setItemsAtomic(entries);
      return;
    }
    for (const { key, value } of entries) await storage.setItem(key, value);
  };
  const readWorkspaceAndJournal = async () => (
    typeof storage.readItems === 'function'
      ? storage.readItems([storageKey, journalKey])
      : Promise.all([
          storage.getItem(storageKey),
          storage.getItem(journalKey)
        ])
  );
  const markJournalForUpload = (journal, fullResyncRequired = false, dirtyEntities) => {
    const dirty = markCloudSyncJournalDirty(journal, {
      username,
      revision: createCloudSyncRevision({ cryptoProvider }),
      now: journalNow,
      dirtyEntities
    });
    return fullResyncRequired
      ? requireCloudSyncFullResync(dirty, { username })
      : dirty;
  };
  const logRepair = repaired => {
    if (!repaired.changed) return;
    try {
      logger.info('Noureon Sync V2 repaired legacy workspace IDs before upload.', repaired.repaired);
    } catch {}
  };
  const normalizeWorkspace = async (workspace) => {
    const repaired = await repairWorkspaceEntityIds({
      workspace,
      userId: user.id,
      cryptoProvider
    });
    return repaired.workspace;
  };
  const sync = createConversationShadowSync({
    repository,
    readWorkspace: async () => {
      const raw = await storage.getItem(storageKey);
      return parseLocalWorkspace(raw);
    },
    commitWorkspace: ({ remoteWorkspace, tombstoneIndex, astraTombstoneIds, assertCurrent }) => withWorkspaceStorageExclusive(async () => {
      const [workspaceRaw, journalRaw] = await readWorkspaceAndJournal();
      const storedWorkspace = parseLocalWorkspace(workspaceRaw);
      const repaired = await repairWorkspaceEntityIds({
        workspace: storedWorkspace,
        userId: user.id,
        cryptoProvider
      });
      const latestWorkspace = repaired.workspace;
      let journal = normalizeCloudSyncJournal(journalRaw, { username });
      if (repaired.changed) {
        journal = markJournalForUpload(
          journal,
          true,
          diffCloudSyncWorkspaceEntities(storedWorkspace, repaired.workspace)
        );
      }
      assertCurrent();
      const sanitizedLatest = applyAstraTombstones(
        applyWorkspaceTombstones(latestWorkspace, tombstoneIndex),
        astraTombstoneIds
      );
      const committedWorkspace = applyAstraTombstones(applyWorkspaceTombstones(
        journal.dirty
          ? mergeRemoteIntoEntityDirtyLocal(sanitizedLatest, remoteWorkspace, journal.dirtyEntities)
          : mergeWorkspacePreservingLocalTopLevel(sanitizedLatest, remoteWorkspace),
        tombstoneIndex
      ), astraTombstoneIds);
      assertCurrent();
      await writeWorkspaceAndJournal(committedWorkspace, journal);
      assertCurrent();
      logRepair(repaired);
      return committedWorkspace;
    }),
    onWorkspaceCommitted: onWorkspaceCommitted || (detail => {
      if (!window?.dispatchEvent || typeof window.CustomEvent !== 'function') return;
      window.dispatchEvent(new window.CustomEvent('astra:cloud-workspace-committed', { detail }));
    }),
    userId: user.id,
    cryptoProvider,
    normalizeWorkspace,
    readCaptureState: ({ assertCurrent }) => withWorkspaceStorageExclusive(async () => {
      const [workspaceRaw, journalRaw] = await readWorkspaceAndJournal();
      const storedWorkspace = parseLocalWorkspace(workspaceRaw);
      const repaired = await repairWorkspaceEntityIds({
        workspace: storedWorkspace,
        userId: user.id,
        cryptoProvider
      });
      let journal = normalizeCloudSyncJournal(journalRaw, { username });
      const needsRecoveryRevision = journal.fullResyncRequired
        && (!journal.dirty || !journal.workspaceRevision);
      if (repaired.changed || needsRecoveryRevision) {
        journal = markJournalForUpload(
          journal,
          repaired.changed || journal.fullResyncRequired,
          repaired.changed
            ? diffCloudSyncWorkspaceEntities(storedWorkspace, repaired.workspace)
            : undefined
        );
        assertCurrent();
        await writeWorkspaceAndJournal(repaired.workspace, journal);
        assertCurrent();
        logRepair(repaired);
      }
      return {
        workspace: repaired.workspace,
        journal,
        revision: journal.workspaceRevision
      };
    }),
    acknowledgeCapture: ({ attemptedRevision, assertCurrent }) => withWorkspaceStorageExclusive(async () => {
      const [, journalRaw] = await readWorkspaceAndJournal();
      const current = normalizeCloudSyncJournal(journalRaw, { username });
      const result = acknowledgeCloudSyncJournal(current, attemptedRevision, {
        username,
        acknowledgedAt: journalNow,
        fullResyncCompleted: true
      });
      assertCurrent();
      if (result.acknowledged) {
        await storage.setItem(journalKey, JSON.stringify(result.journal));
        assertCurrent();
      }
      return result;
    }),
    canSkipInitialUpload: ({ journal }, { profile }) => Boolean(
      journal
      && journal.dirty === false
      && journal.fullResyncRequired === false
      && ['ready', 'active'].includes(profile?.migration_state)
      && Number(profile?.schema_version) === SCHEMA_VERSION
    ),
    prepareWorkspaceForUpload: async workspace => assetTransport?.externalize
      ? assetTransport.externalize(workspace)
      : workspace,
    hydrateRemoteWorkspace: async workspace => assetTransport?.hydrate
      ? assetTransport.hydrate(workspace)
      : workspace,
    schedule,
    cancel,
    now,
    logger
  });
  exposeConversationShadowSync(window, sync);
  sync.ready = sync.initialize().catch(error => {
    try {
      logger.warn('Noureon Sync V2 initialization escaped its local fallback boundary.', error);
    } catch {}
    return sync.getStatus();
  });
  return sync;
}

export const conversationShadowSyncPolicy = Object.freeze({
  mode: 'refresh-merge',
  realtime: true,
  schemaVersion: SCHEMA_VERSION,
  trashSyncCapability: TRASH_SYNC_CAPABILITY
});
