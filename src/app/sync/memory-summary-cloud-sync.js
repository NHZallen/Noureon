import {
  MEMORY_SUMMARY_RECORD_TABLE,
  createMemorySummaryRecordManifest,
  diffMemorySummaryRecords,
  projectMemorySummaryRecords
} from '../runtime/memory/memory-summary-records.js';

const SYNC_DEBOUNCE_MS = 750;
const MANIFEST_VERSION = 1;
const RECORD_COLUMNS = 'record_key,layer,record_type,payload,updated_at,deleted_at';

const parseJson = value => {
  if (!value) return null;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return null; }
};

const timestamp = value => Date.parse(value || '') || 0;
const online = window => window?.navigator?.onLine !== false;
const hasMemoryLayers = state => Boolean(
  state?.memorySummary && typeof state.memorySummary === 'object'
  || state?.memoryOverview && typeof state.memoryOverview === 'object'
);

const mergeRecord = (cache, record) => {
  if (!record?.record_key) return;
  const existing = cache.get(record.record_key);
  if (!existing || timestamp(record.updated_at) >= timestamp(existing.updated_at)) {
    cache.set(record.record_key, record);
  }
};

const localRecordsNewerThanRemote = (memoryState, remoteRecords) => {
  const remoteByKey = new Map(remoteRecords.map(record => [record.record_key, record]));
  return projectMemorySummaryRecords(memoryState).filter(record => {
    const remote = remoteByKey.get(record.record_key);
    // A newer normal write may legitimately recreate a removed section or a
    // regenerable overview. The server still rejects older offline writes by
    // timestamp, so a tombstone is not an irreversible state.
    return !remote || timestamp(record.updated_at) > timestamp(remote.updated_at);
  });
};

/**
 * Record-level cloud sync for the complete memory and the user-visible
 * overview. It never reads or writes the monolithic workspace config. Each
 * save contains only modified metadata/sections (or one soft tombstone).
 */
export function initializeMemorySummaryCloudSync({
  window,
  supabase,
  storage,
  user,
  username,
  appDataKey,
  logger = console
} = {}) {
  if (!window || !supabase || !storage || !user?.id || !appDataKey) {
    return Object.freeze({
      enabled: false,
      captureMemoryState: () => false,
      refresh: async () => [],
      flush: async () => false,
      stop: () => Promise.resolve()
    });
  }

  const manifestKey = `noureon:memory-summary-sync:v${MANIFEST_VERSION}:${username || user.id}`;
  const remoteCache = new Map();
  let localManifest = {};
  let queuedMemoryState = null;
  let queuedMode = 'full';
  let timer = null;
  let ready = false;
  let stopped = false;
  let work = Promise.resolve();
  let channel = null;

  const enqueue = task => {
    work = work.then(task).catch(error => {
      logger.warn('Noureon memory summary sync will retry after an error:', error);
      return false;
    });
    return work;
  };
  const saveManifest = async () => storage.setItem(manifestKey, JSON.stringify({
    version: MANIFEST_VERSION,
    records: localManifest
  }));
  const loadManifest = async () => {
    const saved = parseJson(await storage.getItem(manifestKey));
    localManifest = saved?.version === MANIFEST_VERSION && saved.records && typeof saved.records === 'object'
      ? saved.records
      : {};
  };
  const emitRecords = () => {
    const detail = { records: [...remoteCache.values()] };
    window.dispatchEvent?.(new window.CustomEvent('astra:cloud-memory-summary', { detail }));
  };
  const rememberRemoteRows = async rows => {
    for (const row of rows || []) mergeRecord(remoteCache, row);
    emitRecords();
  };
  const readLocalMemoryState = async () => {
    const appData = parseJson(await storage.getItem(appDataKey));
    return appData?.memoryState || {};
  };
  const scheduleFlush = delay => {
    if (stopped || !queuedMemoryState) return;
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      void flush();
    }, delay);
  };

  async function fetchRemoteRecords() {
    const { data, error } = await supabase
      .from(MEMORY_SUMMARY_RECORD_TABLE)
      .select(RECORD_COLUMNS)
      .eq('user_id', user.id);
    if (error) throw error;
    remoteCache.clear();
    for (const record of data || []) mergeRecord(remoteCache, record);
    emitRecords();
    return [...remoteCache.values()];
  }

  async function uploadRecords(rows) {
    if (!rows.length) return [];
    const { data, error } = await supabase.rpc('upsert_workspace_memory_summary_records', {
      p_rows: rows.map(({ record_key, layer, record_type, payload, updated_at, deleted_at }) => ({
        record_key, layer, record_type, payload, updated_at, deleted_at
      }))
    });
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  async function flush() {
    if (stopped || !ready || !queuedMemoryState || !online(window)) return false;
    const memoryState = queuedMemoryState;
    const records = projectMemorySummaryRecords(memoryState);
    const { changed: fullChanged, manifest } = diffMemorySummaryRecords({ records, manifest: localManifest });
    const changed = queuedMode === 'newer'
      ? localRecordsNewerThanRemote(memoryState, [...remoteCache.values()])
      : fullChanged;
    if (!changed.length) {
      queuedMemoryState = null;
      queuedMode = 'full';
      return true;
    }
    const accepted = await uploadRecords(changed);
    await rememberRemoteRows(accepted);
    // Do not persist summary text in the manifest: it holds only deterministic
    // fingerprints, and is used exclusively to identify the next small delta.
    if (queuedMode === 'newer') {
      for (const record of changed) localManifest[record.record_key] = createMemorySummaryRecordManifest([record])[record.record_key];
    } else {
      localManifest = manifest;
    }
    await saveManifest();
    queuedMemoryState = null;
    queuedMode = 'full';
    return true;
  }

  const captureMemoryState = memoryState => {
    if (stopped || !memoryState || typeof memoryState !== 'object') return false;
    queuedMemoryState = memoryState;
    queuedMode = 'full';
    if (ready) scheduleFlush(SYNC_DEBOUNCE_MS);
    return true;
  };

  const refresh = () => enqueue(async () => {
    const rows = await fetchRemoteRecords();
    if (queuedMemoryState && hasMemoryLayers(queuedMemoryState)) scheduleFlush(0);
    return rows;
  });

  const handleOnline = () => {
    if (stopped) return;
    void refresh();
  };

  const api = {
    enabled: true,
    captureMemoryState,
    refresh,
    flush: () => enqueue(flush),
    getStatus: () => Object.freeze({
      enabled: true,
      ready,
      pending: Boolean(queuedMemoryState),
      recordCount: remoteCache.size
    }),
    stop: () => {
      stopped = true;
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener?.('online', handleOnline);
      if (window.__astraMemorySummarySync === api) delete window.__astraMemorySummarySync;
      return channel ? supabase.removeChannel(channel) : Promise.resolve();
    }
  };
  window.__astraMemorySummarySync = api;

  channel = supabase
    .channel(`user-memory-summary:${user.id}`)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: MEMORY_SUMMARY_RECORD_TABLE, filter: `user_id=eq.${user.id}`
    }, payload => enqueue(() => rememberRemoteRows([payload.new])))
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: MEMORY_SUMMARY_RECORD_TABLE, filter: `user_id=eq.${user.id}`
    }, payload => enqueue(() => rememberRemoteRows([payload.new])))
    .subscribe(status => {
      if (status === 'SUBSCRIBED') void refresh();
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        logger.warn('Noureon memory summary realtime subscription needs to reconnect:', status);
      }
    });
  window.addEventListener('online', handleOnline);

  api.ready = enqueue(async () => {
    await loadManifest();
    const remoteRows = await fetchRemoteRecords();
    const localMemoryState = queuedMemoryState || await readLocalMemoryState();
    ready = true;
    if (!remoteRows.length) {
      captureMemoryState(localMemoryState);
    } else {
      const newerLocalRows = localRecordsNewerThanRemote(localMemoryState, remoteRows);
      if (newerLocalRows.length) {
        // Preserve offline work without treating an older local cache as a
        // request to delete records that only arrived from another device.
        queuedMemoryState = localMemoryState;
        queuedMode = 'newer';
        scheduleFlush(0);
      }
    }
    return api.getStatus();
  });
  return api;
}
