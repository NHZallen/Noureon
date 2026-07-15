import { shadowRowsEqual } from './cloud-sync-v2-codecs.js';

const SHADOW_COLLECTIONS = Object.freeze([
  'folders',
  'conversations',
  'messages',
  'astras'
]);

const SERVER_ONLY_FIELDS = new Set(['updated_at', 'sync_seq']);
const COMPARABLE_FIELDS = Object.freeze({
  folders: Object.freeze([
    'id', 'user_id', 'name', 'color', 'icon', 'text_color', 'deleted_at'
  ]),
  conversations: Object.freeze([
    'id', 'user_id', 'folder_id', 'title', 'summary', 'model', 'provider',
    'metadata', 'archived', 'pinned', 'created_at', 'deleted_at'
  ]),
  messages: Object.freeze([
    'id', 'user_id', 'conversation_id', 'role', 'parts', 'status', 'sequence',
    'created_at', 'deleted_at'
  ]),
  astras: Object.freeze([
    'id', 'user_id', 'name', 'description', 'instructions', 'metadata', 'deleted_at'
  ])
});

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isValidRowId(value) {
  return typeof value === 'string' && Boolean(value.trim());
}

function normalizeComparableRow(collection, row, { local = false } = {}) {
  if (!isRecord(row) || !isValidRowId(row.id)) return null;
  const fields = COMPARABLE_FIELDS[collection];
  const allowedFields = new Set(fields);
  if (Object.keys(row).some(key => !allowedFields.has(key) && !SERVER_ONLY_FIELDS.has(key))) {
    return null;
  }

  const normalized = {};
  for (const field of fields) {
    if (collection === 'astras' && field === 'deleted_at' && local && !Object.prototype.hasOwnProperty.call(row, field)) {
      normalized[field] = null;
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(row, field)) return null;
    normalized[field] = row[field];
  }
  return normalized;
}

function analyzeRemoteRows(collection, rows) {
  const comparableById = new Map();
  const unsafeIds = new Set();
  let containsUnscopedInvalidRow = false;

  for (const row of rows) {
    if (!isRecord(row) || !isValidRowId(row.id)) {
      containsUnscopedInvalidRow = true;
      continue;
    }
    const comparable = normalizeComparableRow(collection, row);
    if (!comparable || comparableById.has(row.id) || unsafeIds.has(row.id)) {
      comparableById.delete(row.id);
      unsafeIds.add(row.id);
      continue;
    }
    comparableById.set(row.id, comparable);
  }

  return { comparableById, unsafeIds, containsUnscopedInvalidRow };
}

function duplicateLocalIds(rows) {
  const seen = new Set();
  const duplicates = new Set();
  for (const row of rows) {
    if (!isRecord(row) || !isValidRowId(row.id)) continue;
    if (seen.has(row.id)) duplicates.add(row.id);
    else seen.add(row.id);
  }
  return duplicates;
}

export function createShadowUploadDelta(encoded = {}, remoteRows = {}, {
  forceFull = false
} = {}) {
  const delta = {};
  for (const collection of SHADOW_COLLECTIONS) {
    const localRows = Array.isArray(encoded[collection]) ? encoded[collection] : [];
    if (forceFull) {
      delta[collection] = [...localRows];
      continue;
    }
    const remote = Array.isArray(remoteRows[collection]) ? remoteRows[collection] : [];
    const analysis = analyzeRemoteRows(collection, remote);
    const localDuplicates = duplicateLocalIds(localRows);
    delta[collection] = localRows.filter(row => {
      if (analysis.containsUnscopedInvalidRow) return true;
      const comparableLocal = normalizeComparableRow(collection, row, { local: true });
      if (!comparableLocal || localDuplicates.has(row.id) || analysis.unsafeIds.has(row.id)) return true;
      const comparableRemote = analysis.comparableById.get(row.id);
      return !comparableRemote || !shadowRowsEqual(comparableLocal, comparableRemote);
    });
  }
  return {
    ...delta,
    skippedConversationIds: encoded.skippedConversationIds || []
  };
}

export function mergeShadowUploadIntoBaseline(remoteRows = {}, uploadedRows = {}) {
  const next = {};
  for (const collection of SHADOW_COLLECTIONS) {
    const remote = Array.isArray(remoteRows[collection]) ? remoteRows[collection] : [];
    const uploaded = Array.isArray(uploadedRows[collection]) ? uploadedRows[collection] : [];
    const merged = remote.map(row => isRecord(row) ? { ...row } : row);
    const remoteIndexes = new Map();
    for (let index = 0; index < remote.length; index += 1) {
      const row = remote[index];
      if (!isRecord(row) || !isValidRowId(row.id)) continue;
      const indexes = remoteIndexes.get(row.id) || [];
      indexes.push(index);
      remoteIndexes.set(row.id, indexes);
    }
    const uploadedCounts = new Map();
    for (const row of uploaded) {
      if (!isRecord(row) || !isValidRowId(row.id)) continue;
      uploadedCounts.set(row.id, (uploadedCounts.get(row.id) || 0) + 1);
    }
    for (const row of uploaded) {
      if (!isRecord(row) || !isValidRowId(row.id)) {
        merged.push(row);
        continue;
      }
      const indexes = remoteIndexes.get(row.id) || [];
      if (indexes.length === 1 && uploadedCounts.get(row.id) === 1) {
        const index = indexes[0];
        merged[index] = { ...merged[index], ...row };
      } else {
        merged.push({ ...row });
      }
    }
    next[collection] = merged;
  }
  return next;
}

export function countShadowUploadRows(rows = {}) {
  return SHADOW_COLLECTIONS.reduce(
    (total, collection) => total + (Array.isArray(rows[collection]) ? rows[collection].length : 0),
    0
  );
}
