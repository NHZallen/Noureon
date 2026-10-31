// The conversation sync's database (Sync V2): the profile, the rows of folders, conversations, messages and Nouras, the changes since a
// watermark (fetch_workspace_delta), the deletion markers, and the permanent deletes. Each call is one round of requests; what the rows mean
// is the business of the other parts of the sync (cloud-sync-v2-shared.js names them).

import { getShadowRowDifferingFields } from './cloud-sync-v2-codecs.js';
import { SCHEMA_VERSION, TRASH_SYNC_CAPABILITY, messageSequenceKey } from './cloud-sync-v2-shared.js';

const REMOTE_FETCH_PAGE_SIZE = 1000;
const REMOTE_DELTA_PAGE_SIZE = 500;
const FOLDER_COLUMNS = [
  'id', 'user_id', 'name', 'color', 'icon', 'text_color', 'instructions', 'deleted_at'
].join(',');
const CONVERSATION_COLUMNS = [
  'id', 'user_id', 'folder_id', 'title', 'summary', 'model', 'provider', 'metadata',
  'archived', 'pinned', 'created_at', 'deleted_at'
].join(',');
const MESSAGE_COLUMNS = [
  'id', 'user_id', 'conversation_id', 'role', 'parts', 'metadata', 'status', 'sequence',
  'created_at', 'deleted_at'
].join(',');
const CONVERSATION_FETCH_COLUMNS = `${CONVERSATION_COLUMNS},updated_at`;
const MESSAGE_FETCH_COLUMNS = `${MESSAGE_COLUMNS},updated_at`;
const ASTRA_COLUMNS = [
  'id', 'user_id', 'name', 'description', 'instructions', 'metadata'
].join(',');
const ASTRA_FETCH_COLUMNS = `${ASTRA_COLUMNS},updated_at,deleted_at`;

function isWorkspaceSyncSequencePermissionError(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || error || '');
  return code === '42501' && /workspace_sync_seq|sequence/i.test(message);
}

function normalizeRemoteSequence(value) {
  if (typeof value === 'bigint') return value >= 0n ? value.toString() : null;
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? String(value) : null;
  }
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return null;
  try {
    return BigInt(value.trim()).toString();
  } catch {
    return null;
  }
}

function isMissingWorkspaceDeltaError(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || error || '');
  return (code === 'PGRST202' || code === '42883')
    && /fetch_workspace_delta|could not find the function|function .* does not exist/i.test(message);
}

function createWorkspaceDeltaError(code, message, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  return error;
}

async function runInChunks(items, size, task) {
  for (let index = 0; index < items.length; index += size) {
    await task(items.slice(index, index + size));
  }
}

function withClientSyncSequence(rows = []) {
  const base = Date.now() * 1000;
  return rows.map((row, index) => (
    row && row.sync_seq === undefined
      ? { ...row, sync_seq: base + index }
      : row
  ));
}

export function createConversationShadowRepository({
  supabase,
  userId,
  fetchPageSize = REMOTE_FETCH_PAGE_SIZE
} = {}) {
  const pageSize = Math.max(1, Math.floor(Number(fetchPageSize) || REMOTE_FETCH_PAGE_SIZE));
  let deltaCapability = null;
  let deltaUnsupportedCause = null;

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

  // Nouras are written to their table directly; a database that does not let the page use its sequence gets one made here.
  async function upsertAstraRows(rows) {
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

  async function upsertAstras(rows) {
    await upsertAstraRows(rows);
  }

  async function verify({ folders = [], conversations = [], messages = [], astras = [] }) {
    const mismatch = (collection, local, remote, differingFields) => ({
      collection,
      id: local?.id || remote?.id || null,
      differingFields: differingFields || getShadowRowDifferingFields(local, remote)
    });
    // A reply the server is still writing is the server's: the database keeps the copy the browser sends out of it
    // (upsert_workspace_messages), so the cloud differs from the browser's copy on purpose. The finished message comes back by the sync.
    const writtenByLiveRun = async (id) => {
      const { data, error } = await supabase
        .from('server_runs')
        .select('id')
        .eq('message_id', id)
        .in('status', ['queued', 'running'])
        .limit(1);
      if (error) throw error;
      return Boolean(data?.length);
    };
    const verifyRows = async (collection, table, columns, localRows) => {
      for (let index = 0; index < localRows.length; index += 200) {
        const chunk = localRows.slice(index, index + 200);
        const { data, error } = await supabase
          .from(table)
          .select(columns)
          .eq('user_id', userId)
          .in('id', chunk.map(row => row.id));
        if (error) throw error;
        const remoteById = new Map((data || []).map(row => [row.id, row]));
        for (const local of chunk) {
          const remote = remoteById.get(local.id);
          const differingFields = getShadowRowDifferingFields(local, remote);
          if (!differingFields.length) continue;
          if (collection === 'messages' && remote && await writtenByLiveRun(local.id)) continue;
          return mismatch(collection, local, remote, differingFields);
        }
      }
      return null;
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
        const remoteById = new Map((data || []).map(row => [row.id, row]));
        for (const local of chunk) {
          const remote = remoteById.get(local.id);
          if (remote?.deleted_at) return mismatch('astras', local, remote, ['deleted_at']);
          const { deleted_at: _deletedAt, ...comparable } = remote || {};
          const differingFields = getShadowRowDifferingFields(local, comparable);
          if (differingFields.length) return mismatch('astras', local, remote, differingFields);
        }
      }
      return null;
    };
    const verificationMismatch = await verifyRows(
      'folders', 'workspace_folders', FOLDER_COLUMNS, folders
    ) || await verifyRows(
      'conversations', 'workspace_conversations', CONVERSATION_COLUMNS, conversations
    ) || await verifyRows(
      'messages', 'workspace_messages', MESSAGE_COLUMNS, messages
    ) || await verifyAstras(astras);
    return verificationMismatch
      ? { verified: false, mismatch: verificationMismatch }
      : { verified: true, mismatch: null };
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

  async function fetchWorkspaceDelta(afterSeq = 0, limit = REMOTE_DELTA_PAGE_SIZE) {
    if (deltaCapability === false) {
      throw createWorkspaceDeltaError(
        'ASTRA_WORKSPACE_DELTA_UNSUPPORTED',
        'Workspace delta RPC is not installed.',
        deltaUnsupportedCause
      );
    }
    const initialSequence = normalizeRemoteSequence(afterSeq);
    if (initialSequence == null) {
      throw createWorkspaceDeltaError(
        'ASTRA_WORKSPACE_DELTA_INVALID',
        'Workspace delta watermark is invalid.'
      );
    }
    const requestedLimit = Number(limit);
    const pageLimit = Math.max(1, Math.min(
      Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : REMOTE_DELTA_PAGE_SIZE,
      1000
    ));
    const pages = [];
    let currentSequence = initialSequence;
    let rowCount = 0;

    while (true) {
      const { data: rawData, error } = await supabase.rpc('fetch_workspace_delta', {
        p_after_seq: currentSequence,
        p_limit: pageLimit
      });
      if (error) {
        if (isMissingWorkspaceDeltaError(error)) {
          deltaCapability = false;
          deltaUnsupportedCause = error;
          throw createWorkspaceDeltaError(
            'ASTRA_WORKSPACE_DELTA_UNSUPPORTED',
            'Workspace delta RPC is not installed.',
            error
          );
        }
        throw error;
      }
      let data = rawData;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch { data = null; }
      }
      if (!data || typeof data !== 'object' || !Array.isArray(data.changes)
        || typeof data.has_more !== 'boolean') {
        throw createWorkspaceDeltaError(
          'ASTRA_WORKSPACE_DELTA_INVALID',
          'Workspace delta RPC returned a malformed page.'
        );
      }
      let previousSequence = BigInt(currentSequence);
      for (const change of data.changes) {
        const sequence = normalizeRemoteSequence(change?.sync_seq);
        if (!change || typeof change.collection !== 'string'
          || !change.row || typeof change.row !== 'object' || Array.isArray(change.row)
          || sequence == null || BigInt(sequence) <= previousSequence) {
          throw createWorkspaceDeltaError(
            'ASTRA_WORKSPACE_DELTA_INVALID',
            'Workspace delta RPC returned unordered changes.'
          );
        }
        previousSequence = BigInt(sequence);
      }
      const nextSequence = normalizeRemoteSequence(data.next_seq);
      if (nextSequence == null || BigInt(nextSequence) !== previousSequence
        || (data.has_more && nextSequence === currentSequence)) {
        throw createWorkspaceDeltaError(
          'ASTRA_WORKSPACE_DELTA_INVALID',
          'Workspace delta RPC returned a non-advancing watermark.'
        );
      }
      pages.push({
        changes: data.changes,
        next_seq: nextSequence,
        has_more: data.has_more
      });
      rowCount += data.changes.length;
      currentSequence = nextSequence;
      deltaCapability = true;
      if (!data.has_more) break;
    }

    return { pages, nextSeq: currentSequence, rowCount };
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

  // A Noura deleted forever stays as a row with its deletion time (the marker other devices see).
  async function permanentlyDeleteAstras(rows, deletedAt = new Date().toISOString()) {
    await upsertAstraRows((rows || []).map(row => ({ ...row, deleted_at: deletedAt })));
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
    fetchWorkspaceDelta,
    fetchTombstones,
    permanentlyDeleteConversations,
    permanentlyDeleteFolder,
    permanentlyDeleteAstras
  };
}
