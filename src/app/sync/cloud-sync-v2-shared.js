// What the parts of the conversation sync (Sync V2) share: the version of the cloud schema, the errors, and the small helpers that
// describe a workspace or a set of cloud rows. The parts: cloud-sync-v2-repository.js (the database), -merge.js (local and cloud
// versions put together), -remote-apply.js (the cloud brought in), -capture.js (an upload), -permanent-delete.js, -local-runtime.js
// (the browser's storage), and cloud-sync-v2-shadow.js, which joins them.

export const SCHEMA_VERSION = 2;
export const TRASH_SYNC_CAPABILITY = 1;
// How long after a local save the upload waits (saves made meanwhile go with it).
export const CAPTURE_DEBOUNCE_MS = 1000;

export class LocalWorkspaceDataError extends Error {
  constructor(message = 'Local workspace data is invalid.', options) {
    super(message, options);
    this.name = 'LocalWorkspaceDataError';
  }
}

// The sync was stopped (or started again) while an operation was under way: the operation ends without touching anything.
export class ShadowSyncStoppedError extends Error {
  constructor() {
    super('Conversation shadow sync was stopped.');
    this.name = 'ShadowSyncStoppedError';
  }
}

export function parseLocalWorkspace(raw) {
  if (raw == null) return {};
  // A workspace that is already an object (read from the split store) needs no parsing.
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new LocalWorkspaceDataError('Local workspace JSON is invalid.', { cause: error });
  }
}

export function isMissingSchemaError(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || error || '');
  return code === '42P01'
    || code === 'PGRST202'
    || code === 'PGRST205'
    || code === 'ASTRA_TRASH_SYNC_CAPABILITY_MISSING'
    || /relation .* does not exist|could not find the table|function .* does not exist|could not find the function|function .*schema cache|schema cache.*function/i.test(message);
}

export function normalizeWorkspaceCommitResult(result) {
  if (result && typeof result === 'object'
    && Object.hasOwn(result, 'workspace')
    && typeof result.changed === 'boolean') {
    return result;
  }
  return { workspace: result, changed: true };
}

export function describeShadowError(error) {
  if (!error || typeof error !== 'object') return { error: String(error) };
  return {
    error: error.message || String(error),
    code: error.code || undefined,
    status: error.status || error.statusCode || undefined,
    details: error.details || undefined,
    hint: error.hint || undefined
  };
}

export function summarizeWorkspace(workspace = {}) {
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

export function summarizeShadowRows(rows = {}) {
  return {
    conversations: rows.conversations?.length || 0,
    messages: rows.messages?.length || 0,
    folders: rows.folders?.length || 0,
    astras: rows.astras?.filter(row => !row?.deleted_at).length || 0,
    deletedAstras: rows.astras?.filter(row => row?.deleted_at).length || 0
  };
}

export function emptyShadowRows() {
  return { folders: [], conversations: [], messages: [], astras: [] };
}

export function cloneShadowRows(rows = {}) {
  return {
    folders: (rows.folders || []).map(row => row && typeof row === 'object' ? { ...row } : row),
    conversations: (rows.conversations || []).map(row => row && typeof row === 'object' ? { ...row } : row),
    messages: (rows.messages || []).map(row => row && typeof row === 'object' ? { ...row } : row),
    astras: (rows.astras || []).map(row => row && typeof row === 'object' ? { ...row } : row)
  };
}

export function normalizeVerifiedShadowBaseline(rows = {}) {
  const baseline = cloneShadowRows(rows);
  baseline.astras = baseline.astras.map(row => (
    row && typeof row === 'object' && !Object.prototype.hasOwnProperty.call(row, 'deleted_at')
      ? { ...row, deleted_at: null }
      : row
  ));
  return baseline;
}

// A message row's place in its conversation ("<conversation id>:<sequence>"), or null when it has none.
export function messageSequenceKey(row) {
  if (!row?.conversation_id || row.sequence === undefined || row.sequence === null) return null;
  const sequence = Number(row.sequence);
  if (!Number.isFinite(sequence)) return null;
  return `${row.conversation_id}:${sequence}`;
}
