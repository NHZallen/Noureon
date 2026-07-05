import {
  decodeWorkspaceConversationShadow,
  encodeWorkspaceConversationShadow,
  shadowRowsEqual
} from './cloud-sync-v2-codecs.js';
import { mergeWorkspaceAppData } from './cloud-sync-versioning.js';

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

function isMissingSchemaError(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || error || '');
  return code === '42P01'
    || code === 'PGRST205'
    || /relation .* does not exist|could not find the table/i.test(message);
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
      const { error } = await supabase.from('workspace_conversations').upsert(chunk, { onConflict: 'id' });
      if (error) throw error;
    });
  }

  async function upsertFolders(rows) {
    await runInChunks(rows, 100, async chunk => {
      const { error } = await supabase.from('workspace_folders').upsert(chunk, { onConflict: 'id' });
      if (error) throw error;
    });
  }

  async function upsertMessages(rows) {
    await runInChunks(rows, 200, async chunk => {
      const { error } = await supabase.from('workspace_messages').upsert(chunk, { onConflict: 'id' });
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

  return { probe, setMigrationState, upsertFolders, upsertConversations, upsertMessages, verify, fetchWorkspace };
}

export function createConversationShadowSync({
  repository,
  readWorkspace,
  userId,
  cryptoProvider = globalThis.crypto,
  online = () => globalThis.navigator?.onLine !== false,
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
  let status = Object.freeze({ state: 'idle', conversations: 0, messages: 0 });

  const setStatus = next => {
    status = Object.freeze({ ...status, ...next });
    return status;
  };

  async function captureNow(workspace) {
    if (!enabled || !workspace || !online()) return setStatus({ state: online() ? 'idle' : 'offline' });
    setStatus({ state: 'uploading' });
    const encoded = await encodeWorkspaceConversationShadow({ workspace, userId, cryptoProvider });
    if (encoded.skippedConversationIds.length) {
      logger.warn('AstraChat Sync V2 shadow skipped conversations with invalid IDs.', {
        count: encoded.skippedConversationIds.length
      });
    }
    setStatus({
      state: 'uploading',
      conversations: encoded.conversations.length,
      messages: encoded.messages.length,
      folders: encoded.folders.length,
      skipped: encoded.skippedConversationIds.length
    });
    await repository.setMigrationState('shadow', backupMarker);
    backupMarker = null;
    if (encoded.folders.length) await repository.upsertFolders(encoded.folders);
    if (encoded.conversations.length) await repository.upsertConversations(encoded.conversations);
    if (encoded.messages.length) await repository.upsertMessages(encoded.messages);
    const verified = await repository.verify(encoded);
    if (!verified) throw new Error('Sync V2 shadow verification did not match the local workspace.');
    await repository.setMigrationState('ready');
    return setStatus({
      state: 'ready',
      conversations: encoded.conversations.length,
      messages: encoded.messages.length,
      folders: encoded.folders.length,
      skipped: encoded.skippedConversationIds.length,
      lastCompletedAt: now()
    });
  }

  async function pullWorkspace(localWorkspace = {}) {
    const rows = await repository.fetchWorkspace();
    const remoteWorkspace = decodeWorkspaceConversationShadow(rows);
    return mergeWorkspaceAppData(localWorkspace, remoteWorkspace);
  }

  function drain() {
    timer = null;
    const workspace = pendingWorkspace;
    pendingWorkspace = null;
    work = work
      .catch(() => {})
      .then(() => captureNow(workspace))
      .catch(error => {
        logger.warn('AstraChat Sync V2 shadow upload will retry after the next local save or reload.', error);
        setStatus({ state: 'retry', error: error?.message || String(error) });
      });
    return work;
  }

  function captureWorkspace(workspace) {
    if (!enabled || !workspace) return false;
    pendingWorkspace = workspace;
    if (timer != null) cancel(timer);
    timer = schedule(drain, CAPTURE_DEBOUNCE_MS);
    return true;
  }

  async function initialize() {
    try {
      const profile = await repository.probe();
      backupMarker = profile?.legacy_backup_created_at ? null : now();
    } catch (error) {
      if (isMissingSchemaError(error)) return setStatus({ state: 'migration-required' });
      logger.warn('AstraChat Sync V2 shadow probe failed; local mode remains active.', error);
      return setStatus({ state: 'retry', ...describeShadowError(error) });
    }
    enabled = true;
    const workspace = await readWorkspace();
    try {
      return await captureNow(workspace || {});
    } catch (error) {
      logger.warn('AstraChat Sync V2 shadow initialization failed; local data was not changed.', error);
      return setStatus({ state: 'retry', ...describeShadowError(error) });
    }
  }

  function stop() {
    enabled = false;
    if (timer != null) cancel(timer);
    timer = null;
    pendingWorkspace = null;
  }

  return {
    initialize,
    captureWorkspace,
    pullWorkspace,
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
  const sync = createConversationShadowSync({
    repository,
    readWorkspace: async () => {
      const raw = await storage.getItem(`chatAppData_v8.6_${username}`);
      if (!raw) return {};
      try { return JSON.parse(raw); } catch { return {}; }
    },
    userId: user.id,
    logger
  });
  exposeConversationShadowSync(window, sync);
  void sync.initialize().then(async status => {
    if (status?.state !== 'ready') return;
    const raw = await storage.getItem(`chatAppData_v8.6_${username}`);
    const localWorkspace = raw ? JSON.parse(raw) : {};
    const mergedWorkspace = await sync.pullWorkspace(localWorkspace);
    await storage.setItem(`chatAppData_v8.6_${username}`, JSON.stringify(mergedWorkspace));
  }).catch(error => {
    logger.warn('AstraChat Sync V2 refresh pull failed; local workspace remains active.', error);
  });
  return sync;
}

export const conversationShadowSyncPolicy = Object.freeze({
  mode: 'write-only',
  realtime: false,
  schemaVersion: SCHEMA_VERSION
});
