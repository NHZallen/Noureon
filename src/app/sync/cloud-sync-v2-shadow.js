import {
  decodeWorkspaceConversationShadow,
  encodeWorkspaceConversationShadow,
  isUuid,
  shadowRowsEqual
} from './cloud-sync-v2-codecs.js';
import { mergeWorkspaceAppData } from './cloud-sync-versioning.js';
import {
  applyWorkspaceTombstones,
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
  const messages = conversations.reduce(
    (total, conversation) => total + (Array.isArray(conversation?.messages) ? conversation.messages.length : 0),
    0
  );
  return {
    conversations: conversations.length,
    activeConversations: conversations.filter(conversation => !conversation?.deletedAt).length,
    trashedConversations: conversations.filter(conversation => conversation?.deletedAt).length,
    messages,
    folders: folders.length
  };
}

function summarizeShadowRows(rows = {}) {
  return {
    conversations: rows.conversations?.length || 0,
    messages: rows.messages?.length || 0,
    folders: rows.folders?.length || 0
  };
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

  async function verify({ folders, conversations, messages }) {
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
    return await verifyRows('workspace_folders', FOLDER_COLUMNS, folders)
      && await verifyRows('workspace_conversations', CONVERSATION_COLUMNS, conversations)
      && await verifyRows('workspace_messages', MESSAGE_COLUMNS, messages);
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
    return { folders, conversations, messages };
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

  return {
    probe,
    setMigrationState,
    upsertFolders,
    upsertConversations,
    upsertMessages,
    verify,
    fetchWorkspace,
    fetchTombstones,
    permanentlyDeleteConversations
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
  let generation = 0;
  let status = Object.freeze({
    state: 'idle',
    enabled: false,
    pending: false,
    conversations: 0,
    messages: 0,
    folders: 0
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
      tombstoneIndex
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
      skipped: encoded.skippedConversationIds.length,
      lastCompletedAt: now()
    });
    assertCurrent();
    return readyStatus;
  }

  async function pullWorkspace(localWorkspace = {}) {
    const tombstones = await repository.fetchTombstones();
    const nextTombstoneIndex = createTombstoneIndex(tombstones);
    const sanitizedLocal = applyWorkspaceTombstones(localWorkspace, nextTombstoneIndex);
    const rows = await repository.fetchWorkspace();
    const remoteWorkspace = applyWorkspaceTombstones(
      decodeWorkspaceConversationShadow(rows),
      nextTombstoneIndex
    );
    const merged = mergeWorkspaceAppData(sanitizedLocal, remoteWorkspace);
    tombstoneIndex = nextTombstoneIndex;
    return applyWorkspaceTombstones(merged, tombstoneIndex);
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

  async function permanentlyDeleteConversations(conversationIds) {
    const ids = [...new Set((conversationIds || []).filter(Boolean))];
    const validIds = ids.filter(isUuid);
    const invalidIds = ids.filter(id => !isUuid(id));
    if (!ids.length) return status;
    if (!enabled) throw new Error('Cloud conversation sync is not ready yet.');
    if (!validIds.length) {
      return setStatus({
        state: 'ready',
        enabled,
        pending: false,
        lastPermanentDeleteAt: now(),
        lastPermanentDeleteCount: 0,
        lastPermanentDeleteSkippedIds: invalidIds.slice(0, 10),
        lastCompletedAt: now()
      });
    }
    try {
      await repository.permanentlyDeleteConversations(validIds);
      const tombstones = await repository.fetchTombstones();
      tombstoneIndex = createTombstoneIndex(tombstones);
      return setStatus({
        state: 'ready',
        enabled,
        pending: false,
        lastPermanentDeleteAt: now(),
        lastPermanentDeleteCount: validIds.length,
        lastPermanentDeleteSkippedIds: invalidIds.slice(0, 10),
        lastCompletedAt: now(),
        lastPermanentDeleteError: undefined
      });
    } catch (error) {
      setStatus({
        state: 'retry',
        enabled,
        pending: false,
        lastPermanentDeleteAt: now(),
        lastPermanentDeleteCount: validIds.length,
        lastPermanentDeleteSkippedIds: invalidIds.slice(0, 10),
        lastPermanentDeleteError: describeShadowError(error),
        lastErrorAt: now(),
        ...describeShadowError(error)
      });
      throw error;
    }
  }

  async function diagnose() {
    const diagnosis = {
      status,
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
      const sanitizedLocal = applyWorkspaceTombstones(normalizedWorkspace, nextTombstoneIndex);
      const rows = await repository.fetchWorkspace();
      assertCurrent();
      const remoteWorkspace = applyWorkspaceTombstones(
        decodeWorkspaceConversationShadow(rows),
        nextTombstoneIndex
      );
      const mergedWorkspace = applyWorkspaceTombstones(
        mergeWorkspaceAppData(sanitizedLocal, remoteWorkspace),
        nextTombstoneIndex
      );
      assertCurrent();
      let committedWorkspace;
      if (commitWorkspace) {
        committedWorkspace = await commitWorkspace({
          remoteWorkspace,
          tombstoneIndex: nextTombstoneIndex,
          assertCurrent
        });
      } else {
        await writeWorkspace(mergedWorkspace);
        committedWorkspace = mergedWorkspace;
      }
      assertCurrent();
      tombstoneIndex = nextTombstoneIndex;
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
    commitWorkspace: ({ remoteWorkspace, tombstoneIndex, assertCurrent }) => withWorkspaceStorageExclusive(async () => {
      const latestWorkspace = await normalizeWorkspace(parseLocalWorkspace(await storage.getItem(storageKey)));
      assertCurrent();
      const sanitizedLatest = applyWorkspaceTombstones(latestWorkspace, tombstoneIndex);
      const committedWorkspace = applyWorkspaceTombstones(
        mergeWorkspaceAppData(sanitizedLatest, remoteWorkspace),
        tombstoneIndex
      );
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
