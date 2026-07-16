export const CLOUD_SYNC_BASELINE_VERSION = 1;

const COLLECTIONS = Object.freeze([
  'folders',
  'conversations',
  'messages',
  'astras',
  'tombstones'
]);
const COLLECTION_SET = new Set(COLLECTIONS);

function parseValue(value) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeUserId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeSequence(value) {
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

function rowKey(collection, row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  if (collection === 'tombstones') {
    const type = typeof row.entity_type === 'string' ? row.entity_type : null;
    const id = typeof row.entity_id === 'string' ? row.entity_id : null;
    return type && id ? `${type}:${id}` : null;
  }
  return typeof row.id === 'string' && row.id ? row.id : null;
}

function compareRows(collection, left, right) {
  const leftSeq = BigInt(normalizeSequence(left.sync_seq));
  const rightSeq = BigInt(normalizeSequence(right.sync_seq));
  if (leftSeq < rightSeq) return -1;
  if (leftSeq > rightSeq) return 1;
  return rowKey(collection, left).localeCompare(rowKey(collection, right));
}

function normalizeRows(rows, { userId } = {}) {
  if (!rows || typeof rows !== 'object' || Array.isArray(rows)) {
    throw new TypeError('Remote baseline rows must be an object.');
  }
  const normalized = {};
  for (const collection of COLLECTIONS) {
    if (!Array.isArray(rows[collection])) {
      throw new TypeError(`Remote baseline collection ${collection} must be an array.`);
    }
    const byKey = new Map();
    for (const sourceRow of rows[collection]) {
      const key = rowKey(collection, sourceRow);
      const sequence = normalizeSequence(sourceRow?.sync_seq);
      if (!key || sequence == null) {
        throw new TypeError(`Remote baseline collection ${collection} contains an invalid row.`);
      }
      if (sourceRow.user_id != null && sourceRow.user_id !== userId) {
        throw new TypeError('Remote baseline row belongs to another user.');
      }
      const current = byKey.get(key);
      if (!current || BigInt(sequence) >= BigInt(normalizeSequence(current.sync_seq))) {
        byKey.set(key, { ...structuredClone(sourceRow), sync_seq: sequence });
      }
    }
    normalized[collection] = [...byKey.values()].sort((left, right) => (
      compareRows(collection, left, right)
    ));
  }
  return normalized;
}

export function createRemoteBaseline({ userId, rows, watermark } = {}) {
  const normalizedUserId = normalizeUserId(userId);
  const normalizedWatermark = normalizeSequence(watermark);
  if (!normalizedUserId) throw new TypeError('Remote baseline requires a user ID.');
  if (normalizedWatermark == null) throw new TypeError('Remote baseline requires a valid watermark.');
  return {
    version: CLOUD_SYNC_BASELINE_VERSION,
    userId: normalizedUserId,
    watermark: normalizedWatermark,
    rows: normalizeRows(rows, { userId: normalizedUserId })
  };
}

export function validateRemoteBaseline(value, { userId } = {}) {
  const candidate = parseValue(value);
  const expectedUserId = normalizeUserId(userId);
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  if (candidate.version !== CLOUD_SYNC_BASELINE_VERSION) return null;
  if (!expectedUserId || normalizeUserId(candidate.userId) !== expectedUserId) return null;
  try {
    return createRemoteBaseline({
      userId: expectedUserId,
      watermark: candidate.watermark,
      rows: candidate.rows
    });
  } catch {
    return null;
  }
}

function createCollectionMaps(rows) {
  return Object.fromEntries(COLLECTIONS.map(collection => [
    collection,
    new Map(rows[collection].map(row => [rowKey(collection, row), structuredClone(row)]))
  ]));
}

function applyTombstone(maps, row) {
  if (row.entity_type === 'conversation') {
    maps.conversations.delete(row.entity_id);
    for (const [key, message] of maps.messages) {
      if (message.conversation_id === row.entity_id) maps.messages.delete(key);
    }
    return;
  }
  if (row.entity_type === 'folder') {
    maps.folders.delete(row.entity_id);
    for (const conversation of maps.conversations.values()) {
      if (conversation.folder_id === row.entity_id) conversation.folder_id = null;
    }
    return;
  }
  throw new TypeError('Remote delta tombstone has an unsupported entity type.');
}

export function applyRemoteDeltaPage(baselineValue, page) {
  const baseline = validateRemoteBaseline(baselineValue, {
    userId: baselineValue?.userId
  });
  if (!baseline) throw new TypeError('Remote baseline is invalid.');
  if (!page || typeof page !== 'object' || !Array.isArray(page.changes)) {
    throw new TypeError('Remote delta page is malformed.');
  }
  if (typeof page.has_more !== 'boolean') {
    throw new TypeError('Remote delta page has_more must be boolean.');
  }

  const maps = createCollectionMaps(baseline.rows);
  let previousSequence = BigInt(baseline.watermark);
  for (const change of page.changes) {
    if (!COLLECTION_SET.has(change?.collection)) {
      throw new TypeError('Remote delta collection is unsupported.');
    }
    const sequence = normalizeSequence(change.sync_seq);
    if (sequence == null || BigInt(sequence) <= previousSequence) {
      throw new TypeError('Remote delta sequence must be strictly increasing.');
    }
    if (!change.row || typeof change.row !== 'object' || Array.isArray(change.row)) {
      throw new TypeError('Remote delta row is malformed.');
    }
    if (change.row.user_id != null && change.row.user_id !== baseline.userId) {
      throw new TypeError('Remote delta row belongs to another user.');
    }
    const rowSequence = normalizeSequence(change.row.sync_seq);
    if (rowSequence != null && rowSequence !== sequence) {
      throw new TypeError('Remote delta row sequence does not match its envelope.');
    }
    const row = { ...structuredClone(change.row), sync_seq: sequence };
    const key = rowKey(change.collection, row);
    if (!key) throw new TypeError('Remote delta row has no stable identity.');
    maps[change.collection].set(key, row);
    if (change.collection === 'tombstones') applyTombstone(maps, row);
    previousSequence = BigInt(sequence);
  }

  const nextSequence = normalizeSequence(page.next_seq);
  if (nextSequence == null || BigInt(nextSequence) !== previousSequence) {
    throw new TypeError('Remote delta next_seq does not match the applied page.');
  }
  const rows = Object.fromEntries(COLLECTIONS.map(collection => [
    collection,
    [...maps[collection].values()].sort((left, right) => compareRows(collection, left, right))
  ]));
  return createRemoteBaseline({
    userId: baseline.userId,
    watermark: nextSequence,
    rows
  });
}
