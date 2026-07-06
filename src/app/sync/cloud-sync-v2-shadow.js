import {
  decodeWorkspaceConversationShadow,
  deterministicUuid,
  encodeWorkspaceConversationShadow,
  isUuid,
  shadowRowsEqual
} from './cloud-sync-v2-codecs.js';
import { mergeWorkspaceAppData } from './cloud-sync-versioning.js';
import {
  applyAstraTombstones,
  applyWorkspaceTombstones,
  createAstraTombstoneIndex,
  createTombstoneIndex,
  filterEncodedWorkspaceByTombstones
} from './cloud-sync-v2-deletions.js';
import { repairWorkspaceEntityIds } from './cloud-sync-v2-id-repair.js';
import { withWorkspaceStorageExclusive } from './workspace-storage-coordinator.js';

const SCHEMA_VERSION = 2;
const CAPTURE_DEBOUNCE_MS = 1000;
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
    || /relation .* does not exist|could not find the table|function .* does not exist|could not find the function|function .*schema cache|schema cache.*function/i.test(message);
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

export function createConversationShadowRepository({ supabase, userId } = {}) {
  async function probe() {
    const { data, error } = await supabase
      .from('sync_profiles')
      .select('user_id,schema_version,migration_state,legacy_backup_created_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return data;
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

  async function upsertMessages(rows) {
    await runInChunks(rows, 200, async chunk => {
      const { error } = await supabase.rpc('upsert_workspace_messages', { p_rows: chunk });
      if (error) throw error;
    });
  }

  async function upsertAstras(rows) {
    await runInChunks(rows, 100, async chunk => {
      const { error } = await supabase
        .from('workspace_astras')
        .upsert(chunk, { onConflict: 'id' });
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
    const selectRows = async (table, columns) => {
      const { data, error } = await supabase
        .from(table)
        .select(columns)
        .eq('user_id', userId);
      if (error) throw error;
      return data || [];
    };
    const folders = await selectRows('workspace_folders', FOLDER_COLUMNS);
    const conversations = await selectRows('workspace_conversations', CONVERSATION_FETCH_COLUMNS);
    const messages = await selectRows('workspace_messages', MESSAGE_FETCH_COLUMNS);
    const astras = await selectRows('workspace_astras', ASTRA_FETCH_COLUMNS);
    return { folders, conversations, messages, astras };
  }

  async function fetchTombstones() {
    const { data, error } = await supabase
      .from('workspace_tombstones')
      .select('entity_type,entity_id,deleted_at')
      .eq('user_id', userId);
    if (error) throw error;
    return data || [];
  }

  async function permanentlyDeleteConversations(conversationIds) {
    const ids = [...new Set((conversationIds || []).filter(Boolean))];
    if (!ids.length) return;
    const { error } = await supabase.rpc('permanently_delete_workspace_conversations', {
      p_conversation_ids: ids
    });
    if (error) throw error;
  }

  async function permanentlyDeleteAstras(rows, deletedAt = new Date().toISOString()) {
    const tombstoneRows = (rows || []).map(row => ({ ...row, deleted_at: deletedAt }));
    await runInChunks(tombstoneRows, 100, async chunk => {
      const { error } = await supabase
        .from('workspace_astras')
        .upsert(chunk, { onConflict: 'id' });
      if (error) throw error;
    });
  }

  return {
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
    permanentlyDeleteAstras
  };
}

export function createConversationShadowSync({
  repository,
  readWorkspace,
  writeWorkspace = async () => {},
  commitWorkspace,
  userId,
  cryptoProvider = globalThis.crypto,
  online = () => globalThis.navigator?.onLine !== false,
  normalizeWorkspace = async workspace => workspace,
  schedule = (callback, delay) => globalThis.setTimeout(callback, delay),
  cancel = timer => globalThis.clearTimeout(timer),
  now = () => new Date().toISOString(),
  logger = console
} = {}) {
  let enabled = false;
  let pendingWorkspace = null;
  let timer = null;
  let work = Promise.resolve();
  let backupMarker = null;
  let tombstoneIndex = createTombstoneIndex();
  let astraTombstoneIds = new Set();
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

  async function captureNow(workspace, allowDisabled = false, assertCurrent = () => {}) {
    if ((!enabled && !allowDisabled) || !workspace || !online()) {
      return setStatus({ state: online() ? 'idle' : 'offline' });
    }
    assertCurrent();
    setStatus({ state: 'uploading' });
    assertCurrent();
    const uploadWorkspace = await normalizeWorkspace(workspace);
    assertCurrent();
    const encoded = filterEncodedWorkspaceByTombstones(
      await encodeWorkspaceConversationShadow({ workspace: uploadWorkspace, userId, cryptoProvider }),
      tombstoneIndex,
      astraTombstoneIds
    );
    assertCurrent();
    if (encoded.skippedConversationIds.length) {
      logger.warn('AstraChat Sync V2 shadow skipped conversations with invalid IDs.', {
        count: encoded.skippedConversationIds.length,
        ids: encoded.skippedConversationIds.slice(0, 10)
      });
    }
    setStatus({
      state: 'uploading',
      enabled,
      pending: false,
      conversations: encoded.conversations.length,
      messages: encoded.messages.length,
      folders: encoded.folders.length,
      astras: encoded.astras.length,
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
    await repository.setMigrationState('shadow', backupMarker);
    assertCurrent();
    backupMarker = null;
    if (encoded.folders.length) {
      await repository.upsertFolders(encoded.folders);
      assertCurrent();
    }
    if (encoded.conversations.length) {
      await repository.upsertConversations(encoded.conversations);
      assertCurrent();
    }
    if (encoded.messages.length) {
      await repository.upsertMessages(encoded.messages);
      assertCurrent();
    }
    if (encoded.astras.length) {
      await repository.upsertAstras(encoded.astras);
      assertCurrent();
    }
    const verified = await repository.verify(encoded);
    assertCurrent();
    if (!verified) throw new Error('Sync V2 shadow verification did not match the local workspace.');
    await repository.setMigrationState('ready');
    assertCurrent();
    const readyStatus = setStatus({
      state: 'ready',
      enabled,
      pending: false,
      conversations: encoded.conversations.length,
      messages: encoded.messages.length,
      folders: encoded.folders.length,
      astras: encoded.astras.length,
      skipped: encoded.skippedConversationIds.length,
      lastCompletedAt: now()
    });
    assertCurrent();
    return readyStatus;
  }

  async function pullWorkspace(localWorkspace = {}) {
    const tombstones = await repository.fetchTombstones();
    const nextTombstoneIndex = createTombstoneIndex(tombstones);
    const conversationSanitizedLocal = applyWorkspaceTombstones(localWorkspace, nextTombstoneIndex);
    const rows = await repository.fetchWorkspace();
    const nextAstraTombstoneIds = createAstraTombstoneIndex(rows.astras);
    const sanitizedLocal = applyAstraTombstones(
      conversationSanitizedLocal,
      nextAstraTombstoneIds
    );
    const remoteWorkspace = applyAstraTombstones(applyWorkspaceTombstones(
      decodeWorkspaceConversationShadow(rows),
      nextTombstoneIndex
    ), nextAstraTombstoneIds);
    const merged = mergeWorkspaceAppData(sanitizedLocal, remoteWorkspace);
    tombstoneIndex = nextTombstoneIndex;
    astraTombstoneIds = nextAstraTombstoneIds;
    return applyAstraTombstones(
      applyWorkspaceTombstones(merged, tombstoneIndex),
      astraTombstoneIds
    );
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
      .then(() => captureNow(pending?.workspace, false, assertCurrent))
      .catch(error => {
        if (error instanceof ShadowSyncStoppedError) {
          return setStatus({ state: 'stopped', enabled: false, pending: false });
        }
        logger.warn('AstraChat Sync V2 shadow upload will retry after the next local save or reload.', error);
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

  function captureWorkspace(workspace) {
    if (!enabled || !workspace) {
      setStatus({
        state: !workspace ? status.state : status.state === 'idle' ? 'disabled' : status.state,
        enabled,
        pending: false,
        lastCaptureRejectedAt: now(),
        lastCaptureRejectedReason: !workspace ? 'empty-workspace' : 'sync-not-ready'
      });
      return false;
    }
    pendingWorkspace = { workspace, generation };
    if (timer != null) cancel(timer);
    timer = schedule(drain, CAPTURE_DEBOUNCE_MS);
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
    if (timer != null) cancel(timer);
    timer = null;
    pendingWorkspace = null;
    setStatus({ pending: false });
    await work.catch(() => {});
    const residualRemoteIds = [];
    const optionSnapshots = Array.isArray(options.conversations) ? options.conversations : [];
    let localSnapshots = [];
    try {
      const localWorkspace = await readWorkspace();
      localSnapshots = (localWorkspace?.conversations || []).filter(conversation => {
        if (!conversation?.id) return false;
        const id = String(conversation.id);
        return ids.includes(id) || validIds.has(id);
      });
    } catch (error) {
      logger.warn('AstraChat Sync V2 shadow could not read local delete snapshots.', error);
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
      for (const remoteId of await collectMatchingRemoteIds()) {
        if (validIds.has(remoteId)) continue;
        validIds.add(remoteId);
        residualRemoteIds.push(remoteId);
      }
      if (residualRemoteIds.length) {
        await repository.permanentlyDeleteConversations(residualRemoteIds);
      }
      const refreshedTombstones = await repository.fetchTombstones();
      const refreshedTombstoneIndex = createTombstoneIndex(refreshedTombstones);
      const missingTombstoneIds = [...validIds]
        .filter(id => !refreshedTombstoneIndex.conversations.has(id));
      if (missingTombstoneIds.length) {
        const error = new Error('Cloud permanent delete did not create durable deletion markers.');
        error.code = 'ASTRA_TOMBSTONE_VERIFY_FAILED';
        error.details = { missingConversationIds: missingTombstoneIds.slice(0, 10) };
        throw error;
      }
      tombstoneIndex = refreshedTombstoneIndex;
      const finalResidualRemoteIds = await collectMatchingRemoteIds();
      if (finalResidualRemoteIds.length) {
        const error = new Error('Cloud permanent delete left matching remote conversations behind.');
        error.code = 'ASTRA_REMOTE_DELETE_VERIFY_FAILED';
        error.details = { remainingConversationIds: finalResidualRemoteIds.slice(0, 10) };
        throw error;
      }
      const finalDeleteIds = [...validIds];
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
    if (!enabled) throw new Error('Cloud Astra sync is not ready yet.');
    if (timer != null) cancel(timer);
    timer = null;
    pendingWorkspace = null;
    setStatus({ pending: false });
    await work.catch(() => {});

    const localWorkspace = await readWorkspace() || {};
    const optionSnapshots = Array.isArray(options.astras) ? options.astras : [];
    const snapshotById = new Map(
      [...(localWorkspace.astras || []), ...optionSnapshots]
        .filter(astra => requestedIds.includes(String(astra?.id || '')))
        .map(astra => [String(astra.id), astra])
    );
    if (snapshotById.size < requestedIds.length) {
      const error = new Error('Cloud Astra deletion requires local snapshots.');
      error.code = 'ASTRA_ASTRA_DELETE_SNAPSHOT_REQUIRED';
      throw error;
    }

    const deletionWorkspace = await normalizeWorkspace({
      conversations: [],
      folders: [],
      astras: [...snapshotById.values()]
    });
    const encoded = await encodeWorkspaceConversationShadow({
      workspace: deletionWorkspace,
      userId,
      cryptoProvider
    });
    if (encoded.astras.length !== requestedIds.length) {
      const error = new Error('Cloud Astra deletion could not encode every Astra.');
      error.code = 'ASTRA_ASTRA_DELETE_ENCODE_FAILED';
      throw error;
    }

    try {
      const deletedAt = now();
      await repository.permanentlyDeleteAstras(encoded.astras, deletedAt);
      const rows = await repository.fetchWorkspace();
      const nextAstraTombstoneIds = createAstraTombstoneIndex(rows.astras);
      const deletedIds = encoded.astras.map(row => row.id);
      const missingIds = deletedIds.filter(id => !nextAstraTombstoneIds.has(id));
      if (missingIds.length) {
        const error = new Error('Cloud Astra deletion did not create durable deletion markers.');
        error.code = 'ASTRA_ASTRA_TOMBSTONE_VERIFY_FAILED';
        error.details = { missingAstraIds: missingIds.slice(0, 10) };
        throw error;
      }
      astraTombstoneIds = nextAstraTombstoneIds;
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
    const assertCurrent = () => {
      if (generation !== initializeGeneration) throw new ShadowSyncStoppedError();
    };
    try {
      const profile = await repository.probe();
      assertCurrent();
      backupMarker = profile?.legacy_backup_created_at ? null : now();
    } catch (error) {
      if (error instanceof ShadowSyncStoppedError) return setStatus({ state: 'stopped', enabled: false, pending: false });
      if (isMissingSchemaError(error)) return setStatus({ state: 'migration-required', enabled: false, pending: false, ...describeShadowError(error) });
      logger.warn('AstraChat Sync V2 shadow probe failed; local mode remains active.', error);
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
      const remoteWorkspace = applyAstraTombstones(applyWorkspaceTombstones(
        decodeWorkspaceConversationShadow(rows),
        nextTombstoneIndex
      ), nextAstraTombstoneIds);
      const mergedWorkspace = applyAstraTombstones(applyWorkspaceTombstones(
        mergeWorkspaceAppData(sanitizedLocal, remoteWorkspace),
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
      const result = await captureNow(committedWorkspace, true, assertCurrent);
      assertCurrent();
      if (result.state === 'ready') {
        enabled = true;
        setStatus({ enabled: true, pending: false });
        return result;
      }
      return result;
    } catch (error) {
      enabled = false;
      if (error instanceof ShadowSyncStoppedError) {
        return setStatus({ state: 'stopped', enabled: false, pending: false });
      }
      if (isMissingSchemaError(error)) {
        enabled = false;
        return setStatus({ state: 'migration-required', enabled: false, pending: false, ...describeShadowError(error) });
      }
      logger.warn('AstraChat Sync V2 shadow initialization is incomplete; local mode remains active.', error);
      return setStatus({ state: 'retry', enabled: false, pending: false, lastErrorAt: now(), ...describeShadowError(error) });
    }
  }

  function stop() {
    generation += 1;
    enabled = false;
    if (timer != null) cancel(timer);
    timer = null;
    pendingWorkspace = null;
    setStatus({ state: 'stopped', enabled: false, pending: false });
  }

  return {
    initialize,
    captureWorkspace,
    permanentlyDeleteConversations,
    permanentlyDeleteAstras,
    pullWorkspace,
    diagnose,
    flush: drain,
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
  logger = console
} = {}) {
  const repository = createConversationShadowRepository({ supabase, userId: user.id });
  const storageKey = `chatAppData_v8.6_${username}`;
  const normalizeWorkspace = async (workspace) => {
    const repaired = await repairWorkspaceEntityIds({
      workspace,
      userId: user.id
    });
    if (repaired.changed) {
      await storage.setItem(storageKey, JSON.stringify(repaired.workspace));
      try {
        logger.info('AstraChat Sync V2 repaired legacy workspace IDs before upload.', repaired.repaired);
      } catch {}
    }
    return repaired.workspace;
  };
  const sync = createConversationShadowSync({
    repository,
    readWorkspace: async () => {
      const raw = await storage.getItem(storageKey);
      return parseLocalWorkspace(raw);
    },
    commitWorkspace: ({ remoteWorkspace, tombstoneIndex, astraTombstoneIds, assertCurrent }) => withWorkspaceStorageExclusive(async () => {
      const latestWorkspace = await normalizeWorkspace(parseLocalWorkspace(await storage.getItem(storageKey)));
      assertCurrent();
      const sanitizedLatest = applyAstraTombstones(
        applyWorkspaceTombstones(latestWorkspace, tombstoneIndex),
        astraTombstoneIds
      );
      const committedWorkspace = applyAstraTombstones(applyWorkspaceTombstones(
        mergeWorkspaceAppData(sanitizedLatest, remoteWorkspace),
        tombstoneIndex
      ), astraTombstoneIds);
      assertCurrent();
      await storage.setItem(storageKey, JSON.stringify(committedWorkspace));
      assertCurrent();
      return committedWorkspace;
    }),
    userId: user.id,
    normalizeWorkspace,
    logger
  });
  exposeConversationShadowSync(window, sync);
  sync.ready = sync.initialize().catch(error => {
    try {
      logger.warn('AstraChat Sync V2 initialization escaped its local fallback boundary.', error);
    } catch {}
    return sync.getStatus();
  });
  return sync;
}

export const conversationShadowSyncPolicy = Object.freeze({
  mode: 'refresh-merge',
  realtime: false,
  schemaVersion: SCHEMA_VERSION
});
