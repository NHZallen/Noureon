export const CLOUD_SYNC_JOURNAL_VERSION = 1;
export const CLOUD_SYNC_JOURNAL_KEY_PREFIX = `chatCloudSyncJournal_v${CLOUD_SYNC_JOURNAL_VERSION}_`;

let fallbackRevisionCounter = 0;
const CLOUD_SYNC_DIRTY_ENTITY_FIELDS = ['conversations', 'folders', 'astras'];

function normalizeNonEmptyString(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

function normalizeTimestamp(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null;
  return value;
}

function normalizeWatermark(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

function nowIso(now = Date.now) {
  const value = typeof now === 'function' ? now() : now;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function parseJournal(value) {
  if (typeof value !== 'string') return value;
  if (!value.trim()) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function createDirtyEntities(unknown = false) {
  return {
    unknown: Boolean(unknown),
    conversations: [],
    folders: [],
    astras: []
  };
}

function normalizeDirtyEntityIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizeNonEmptyString).filter(Boolean))].sort();
}

export function normalizeCloudSyncDirtyEntities(value, { unknown = false } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return createDirtyEntities(unknown);
  }
  return {
    unknown: typeof value.unknown === 'boolean' ? value.unknown : Boolean(unknown),
    conversations: normalizeDirtyEntityIds(value.conversations),
    folders: normalizeDirtyEntityIds(value.folders),
    astras: normalizeDirtyEntityIds(value.astras)
  };
}

export function mergeCloudSyncDirtyEntities(...values) {
  const merged = createDirtyEntities(false);
  for (const value of values) {
    const normalized = normalizeCloudSyncDirtyEntities(value);
    merged.unknown ||= normalized.unknown;
    for (const field of CLOUD_SYNC_DIRTY_ENTITY_FIELDS) {
      merged[field].push(...normalized[field]);
    }
  }
  for (const field of CLOUD_SYNC_DIRTY_ENTITY_FIELDS) {
    merged[field] = [...new Set(merged[field])].sort();
  }
  return merged;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
}

function valuesEqual(left, right) {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

function comparableEntity(field, entity) {
  if (field !== 'folders' || !entity || typeof entity !== 'object') return entity;
  const { conversationIds: _derivedConversationIds, ...folder } = entity;
  return folder;
}

function indexWorkspaceEntities(workspace, field) {
  const items = workspace?.[field];
  if (items === undefined) return { byId: new Map(), idless: [], unknown: false };
  if (!Array.isArray(items)) return { byId: new Map(), idless: [], unknown: true };
  const byId = new Map();
  const idless = [];
  let unknown = false;
  for (const item of items) {
    const id = normalizeNonEmptyString(item?.id);
    if (!id) {
      idless.push(item);
      continue;
    }
    if (byId.has(id)) unknown = true;
    byId.set(id, item);
  }
  return { byId, idless, unknown };
}

export function diffCloudSyncWorkspaceEntities(previousWorkspace, nextWorkspace) {
  if (
    !previousWorkspace || typeof previousWorkspace !== 'object' || Array.isArray(previousWorkspace)
    || !nextWorkspace || typeof nextWorkspace !== 'object' || Array.isArray(nextWorkspace)
  ) return createDirtyEntities(true);

  const dirty = createDirtyEntities(false);
  for (const field of CLOUD_SYNC_DIRTY_ENTITY_FIELDS) {
    const previous = indexWorkspaceEntities(previousWorkspace, field);
    const next = indexWorkspaceEntities(nextWorkspace, field);
    dirty.unknown ||= previous.unknown || next.unknown || !valuesEqual(previous.idless, next.idless);
    const ids = new Set([...previous.byId.keys(), ...next.byId.keys()]);
    for (const id of ids) {
      if (!valuesEqual(
        comparableEntity(field, previous.byId.get(id)),
        comparableEntity(field, next.byId.get(id))
      )) dirty[field].push(id);
    }
  }
  return normalizeCloudSyncDirtyEntities(dirty);
}

export function getCloudSyncJournalKey(username) {
  const normalizedUsername = normalizeNonEmptyString(username);
  if (!normalizedUsername) throw new TypeError('Cloud sync journal requires a username.');
  return `${CLOUD_SYNC_JOURNAL_KEY_PREFIX}${normalizedUsername}`;
}

export function createFullResyncCloudSyncJournal({ username = null, lastError = null } = {}) {
  return {
    version: CLOUD_SYNC_JOURNAL_VERSION,
    username: normalizeNonEmptyString(username),
    workspaceRevision: null,
    lastAcknowledgedRevision: null,
    dirty: false,
    dirtySince: null,
    dirtyEntities: createDirtyEntities(true),
    fullResyncRequired: true,
    lastRemoteWatermark: null,
    lastSuccessfulSyncAt: null,
    lastError: normalizeNonEmptyString(lastError)
  };
}

export function normalizeCloudSyncJournal(value, { username = null } = {}) {
  const expectedUsername = normalizeNonEmptyString(username);
  const candidate = parseJournal(value);
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return createFullResyncCloudSyncJournal({ username: expectedUsername });
  }

  const candidateUsername = normalizeNonEmptyString(candidate.username);
  const workspaceRevision = normalizeNonEmptyString(candidate.workspaceRevision);
  const lastAcknowledgedRevision = normalizeNonEmptyString(candidate.lastAcknowledgedRevision);
  const dirtySince = normalizeTimestamp(candidate.dirtySince);
  const criticalFieldsAreValid = candidate.version === CLOUD_SYNC_JOURNAL_VERSION
    && Boolean(candidateUsername)
    && typeof candidate.dirty === 'boolean'
    && typeof candidate.fullResyncRequired === 'boolean'
    && (!expectedUsername || candidateUsername === expectedUsername)
    && (!candidate.dirty || (workspaceRevision && dirtySince))
    && (candidate.dirty
      || candidate.fullResyncRequired
      || (workspaceRevision && lastAcknowledgedRevision === workspaceRevision));

  if (!criticalFieldsAreValid) {
    return createFullResyncCloudSyncJournal({ username: expectedUsername || candidateUsername });
  }

  return {
    version: CLOUD_SYNC_JOURNAL_VERSION,
    username: expectedUsername || candidateUsername,
    workspaceRevision,
    lastAcknowledgedRevision,
    dirty: candidate.dirty,
    dirtySince: candidate.dirty ? dirtySince : null,
    dirtyEntities: candidate.dirty
      ? normalizeCloudSyncDirtyEntities(candidate.dirtyEntities, { unknown: true })
      : createDirtyEntities(candidate.fullResyncRequired),
    fullResyncRequired: candidate.fullResyncRequired,
    lastRemoteWatermark: normalizeWatermark(candidate.lastRemoteWatermark),
    lastSuccessfulSyncAt: normalizeTimestamp(candidate.lastSuccessfulSyncAt),
    lastError: normalizeNonEmptyString(candidate.lastError)
  };
}

export function createCloudSyncRevision({ cryptoProvider = globalThis.crypto, now = Date.now } = {}) {
  const uuid = cryptoProvider?.randomUUID?.();
  if (normalizeNonEmptyString(uuid)) return uuid;

  if (typeof cryptoProvider?.getRandomValues === 'function') {
    const bytes = cryptoProvider.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0'));
    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
  }

  fallbackRevisionCounter += 1;
  const timestamp = typeof now === 'function' ? now() : now;
  return `local-${Number.isFinite(Number(timestamp)) ? Number(timestamp) : Date.now()}-${fallbackRevisionCounter}`;
}

export function markCloudSyncJournalDirty(value, {
  username = null,
  revision = createCloudSyncRevision(),
  now = Date.now,
  dirtyEntities
} = {}) {
  const normalizedRevision = normalizeNonEmptyString(revision);
  if (!normalizedRevision) throw new TypeError('Cloud sync journal revision must be a non-empty string.');
  const journal = normalizeCloudSyncJournal(value, { username });
  return {
    ...journal,
    workspaceRevision: normalizedRevision,
    dirty: true,
    dirtySince: journal.dirty && journal.dirtySince ? journal.dirtySince : nowIso(now),
    dirtyEntities: dirtyEntities === undefined
      ? journal.dirtyEntities
      : mergeCloudSyncDirtyEntities(journal.dirtyEntities, dirtyEntities)
  };
}

export function acknowledgeCloudSyncJournal(value, attemptedRevision, {
  username = null,
  acknowledgedAt = Date.now,
  remoteWatermark,
  fullResyncCompleted = false
} = {}) {
  const journal = normalizeCloudSyncJournal(value, { username });
  const normalizedAttempt = normalizeNonEmptyString(attemptedRevision);
  if (!normalizedAttempt || journal.workspaceRevision !== normalizedAttempt) {
    return { acknowledged: false, journal };
  }

  return {
    acknowledged: true,
    journal: {
      ...journal,
      lastAcknowledgedRevision: normalizedAttempt,
      dirty: false,
      dirtySince: null,
      fullResyncRequired: fullResyncCompleted ? false : journal.fullResyncRequired,
      dirtyEntities: createDirtyEntities(
        !fullResyncCompleted && journal.fullResyncRequired && journal.dirtyEntities.unknown
      ),
      lastRemoteWatermark: remoteWatermark === undefined
        ? journal.lastRemoteWatermark
        : normalizeWatermark(remoteWatermark),
      lastSuccessfulSyncAt: nowIso(acknowledgedAt),
      lastError: null
    }
  };
}

export function requireCloudSyncFullResync(value, {
  username = null,
  lastError = null
} = {}) {
  return {
    ...normalizeCloudSyncJournal(value, { username }),
    fullResyncRequired: true,
    lastError: normalizeNonEmptyString(lastError)
  };
}
