import {
  normalizeMemoryOverview,
  normalizeMemorySummary
} from './memory-summary-state.js';
import { mergeSyncedMemoryState } from './memory-sync-projection.js';

const asArray = value => Array.isArray(value) ? value : [];
const asString = value => String(value || '').trim();
const timestamp = value => Date.parse(value || '') || 0;

export const MEMORY_SUMMARY_RECORD_TABLE = 'workspace_memory_summary_records';
export const MEMORY_SUMMARY_RECORD_VERSION = 1;

const layerKey = layer => String(layer || '').trim() === 'overview' ? 'overview' : 'summary';
const sectionRecordKey = (layer, section) => `${layerKey(layer)}:section:${encodeURIComponent(section.id)}`;
const metaRecordKey = layer => `${layerKey(layer)}:meta`;
const sortJson = value => {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortJson(value[key])]));
};
const stableJson = value => JSON.stringify(sortJson(value));
const hashText = value => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `v${MEMORY_SUMMARY_RECORD_VERSION}:${(hash >>> 0).toString(36)}:${value.length}`;
};

const cleanSummaryMeta = summary => ({
  version: summary.version,
  overview: summary.overview,
  updatedAt: summary.updatedAt,
  lastModelId: summary.lastModelId
});

const cleanOverviewMeta = overview => ({
  version: overview.version,
  overview: overview.overview,
  updatedAt: overview.updatedAt,
  lastModelId: overview.lastModelId,
  basedOnMemorySummaryUpdatedAt: overview.basedOnMemorySummaryUpdatedAt
});

const createRecord = ({ layer, type, key, payload, updatedAt }) => ({
  record_key: key,
  layer,
  record_type: type,
  payload,
  updated_at: updatedAt,
  deleted_at: null
});

/**
 * Splits the two memory layers into independently synchronisable rows. Raw
 * evidence, history-index data, and transient request status never appear in
 * these records.
 */
export function projectMemorySummaryRecords(memoryState = {}) {
  const records = [];
  if (memoryState.memorySummary && typeof memoryState.memorySummary === 'object') {
    const summary = normalizeMemorySummary(memoryState.memorySummary);
    records.push(createRecord({
      layer: 'summary',
      type: 'meta',
      key: metaRecordKey('summary'),
      payload: cleanSummaryMeta(summary),
      updatedAt: summary.updatedAt
    }));
    for (const section of summary.sections) {
      records.push(createRecord({
        layer: 'summary',
        type: 'section',
        key: sectionRecordKey('summary', section),
        payload: section,
        updatedAt: section.updatedAt
      }));
    }
  }
  if (memoryState.memoryOverview && typeof memoryState.memoryOverview === 'object') {
    const overview = normalizeMemoryOverview(memoryState.memoryOverview);
    records.push(createRecord({
      layer: 'overview',
      type: 'meta',
      key: metaRecordKey('overview'),
      payload: cleanOverviewMeta(overview),
      updatedAt: overview.updatedAt
    }));
    for (const section of overview.sections) {
      records.push(createRecord({
        layer: 'overview',
        type: 'section',
        key: sectionRecordKey('overview', section),
        payload: section,
        updatedAt: section.updatedAt
      }));
    }
  }
  return records;
}

export function fingerprintMemorySummaryRecord(record = {}) {
  return hashText(stableJson({
    record_key: record.record_key,
    layer: record.layer,
    record_type: record.record_type,
    payload: record.payload || {},
    updated_at: record.updated_at || '',
    deleted_at: record.deleted_at || null
  }));
}

export function createMemorySummaryRecordManifest(records = []) {
  return Object.fromEntries(asArray(records)
    .filter(record => asString(record?.record_key))
    .map(record => [record.record_key, fingerprintMemorySummaryRecord(record)]));
}

/** Returns only records whose payload changed, plus one tiny tombstone per removed section.
 *
 * A layer meta record is a regenerable container, not a user-deletable entity.
 * Tombstoning it lets an older/partial client erase a whole summary layer, so
 * meta records are intentionally never emitted as deletions.
 */
export function diffMemorySummaryRecords({ records = [], manifest = {}, now = () => new Date().toISOString() } = {}) {
  const next = createMemorySummaryRecordManifest(records);
  const changed = asArray(records).filter(record => next[record.record_key] !== manifest?.[record.record_key]);
  for (const key of Object.keys(manifest || {})) {
    if (next[key]) continue;
    const [layer, type, ...rest] = key.split(':');
    if (type !== 'section' || rest.length === 0) continue;
    changed.push({
      record_key: key,
      layer: layerKey(layer),
      record_type: 'section',
      payload: {},
      updated_at: now(),
      deleted_at: now()
    });
  }
  return { changed, manifest: next };
}

const activeRows = rows => asArray(rows).filter(row => row && !row.deleted_at);
const sectionIdFromRecord = row => {
  const encoded = String(row?.record_key || '').split(':').slice(2).join(':');
  try { return decodeURIComponent(encoded); } catch { return encoded; }
};

function decodeLayer(rows, layer) {
  const layerRows = activeRows(rows).filter(row => row.layer === layer);
  const meta = layerRows.find(row => row.record_type === 'meta')?.payload;
  const sections = layerRows
    .filter(row => row.record_type === 'section' && row.payload && typeof row.payload === 'object')
    .map(row => row.payload);
  if (!meta && !sections.length) return null;
  const latestSectionUpdatedAt = sections.reduce((latest, section) => (
    timestamp(section.updatedAt) > timestamp(latest) ? section.updatedAt : latest
  ), '');
  // Refresh state is derived on each device from the revisions below. Older
  // rows included it in the payload, so strip it during decoding as well:
  // otherwise a stale historical `true` would reappear after every reload.
  const { needsRefresh: _needsRefresh, status: _status, lastError: _lastError, ...syncMeta } = (
    meta && typeof meta === 'object' ? meta : {}
  );
  const value = {
    ...syncMeta,
    sections,
    updatedAt: meta?.updatedAt || latestSectionUpdatedAt || new Date(0).toISOString()
  };
  return layer === 'overview'
    ? normalizeMemoryOverview(value)
    : normalizeMemorySummary(value);
}

export function decodeMemorySummaryRecords(rows = []) {
  const memorySummary = decodeLayer(rows, 'summary');
  const memoryOverview = decodeLayer(rows, 'overview');
  return {
    ...(memorySummary ? { memorySummary } : {}),
    ...(memoryOverview ? { memoryOverview } : {})
  };
}

/**
 * Applies a complete remote record cache to local state. Only section
 * tombstones are destructive: meta records represent a complete or visible
 * summary layer and are deliberately regenerable. Ignoring legacy meta
 * tombstones keeps a stale client from erasing a user's local display
 * overview.
 */
export function mergeMemoryStateWithSummaryRecords(memoryState = {}, rows = []) {
  let local = { ...memoryState };
  for (const row of asArray(rows).filter(row => row?.deleted_at)) {
    const target = row.layer === 'overview' ? 'memoryOverview' : 'memorySummary';
    if (row.record_type !== 'section') continue;
    if (!local[target]) continue;
    const removedId = sectionIdFromRecord(row);
    local[target] = {
      ...local[target],
      sections: asArray(local[target].sections).filter(section => (
        String(section?.id || '') !== removedId
      ))
    };
  }
  const projection = decodeMemorySummaryRecords(rows);
  if (!projection.memorySummary && !projection.memoryOverview) return local;
  return mergeSyncedMemoryState(local, {
    version: 1,
    ...projection
  });
}
