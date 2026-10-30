// Where the rows of the memory are kept (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §4.1): in the browser for an account that is not signed in to the cloud,
// in the database of the account (the table workspace_memory_records) for one that is, and in memory for the tests. All three give the same three things:
//
//   readAll()        -> [{ record_key, payload, version, updated_at, deleted_at }]
//   write(changes)   -> [{ key, status: 'ok', row } | { key, status: 'conflict', row }]   changes: [{ key, payload, baseVersion (null for a new row), deleted }]
//   subscribe(fn)    -> a function that stops it; fn is called with the rows that changed somewhere else (another device, the server)
//
// A change says the version it read (`baseVersion`). When the row has moved on, nothing is written and the row as it is now comes back (`conflict`), so that the one who
// asked can join the two and try again. The version and the time are the database's (a trigger): the other backends do the same.
// No `window`, no `document`: shared by the page and its tests.

const PAGE = 500;
const parse = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

/** The rows in memory. `rows` are the ones it starts with. */
export function createMemoryBackend({ rows = [], now = () => new Date().toISOString(), onWrite = null } = {}) {
  const table = new Map(rows.map((row) => [row.record_key, { version: 1, updated_at: now(), deleted_at: null, ...row }]));
  const listeners = new Set();
  const emit = (changed) => { for (const listener of [...listeners]) listener(changed); };
  return {
    async readAll() {
      return [...table.values()].map((row) => ({ ...row }));
    },
    async write(changes) {
      const results = [];
      for (const change of changes) {
        const current = table.get(change.key);
        if (change.baseVersion == null ? current : !current || current.version !== change.baseVersion) {
          results.push({ key: change.key, status: 'conflict', row: current ? { ...current } : null });
          continue;
        }
        const row = { record_key: change.key, payload: change.payload, version: (current?.version || 0) + 1, updated_at: now(), deleted_at: change.deleted ? now() : null };
        table.set(change.key, row);
        results.push({ key: change.key, status: 'ok', row: { ...row } });
      }
      if (onWrite) await onWrite(changes);
      return results;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** For the tests: a row that was changed by somebody else. */
    injectRemote(row) {
      const current = table.get(row.record_key);
      const next = { version: (current?.version || 0) + 1, updated_at: now(), deleted_at: null, ...row };
      table.set(row.record_key, next);
      emit([{ ...next }]);
    }
  };
}

/**
 * The rows kept in the browser's storage (one item, as JSON), for an account that is not signed in to the cloud. `storage` is { getItem, setItem } (they may be async).
 */
export function createLocalBackend({ storage, key, now = () => new Date().toISOString() }) {
  let loaded = null;
  const load = async () => {
    if (loaded) return loaded;
    const saved = parse(await storage.getItem(key));
    loaded = createMemoryBackend({ rows: saved?.version === 1 && Array.isArray(saved.rows) ? saved.rows : [], now });
    return loaded;
  };
  const save = async (backend) => storage.setItem(key, JSON.stringify({ version: 1, rows: await backend.readAll() }));
  return {
    async readAll() {
      return (await load()).readAll();
    },
    async write(changes) {
      const backend = await load();
      const results = await backend.write(changes);
      if (results.some((result) => result.status === 'ok')) await save(backend);
      return results;
    },
    subscribe: () => () => {}
  };
}

const COLUMNS = 'record_key,payload,version,updated_at,deleted_at';

/**
 * The rows kept in the database of the account. `supabase` is the client of the page; `userId` is the account. A row is added with `insert` (a row that is already there is a
 * conflict), and changed with an `update` that asks for the version that was read, so that nothing another device or the server wrote is overwritten.
 */
export function createCloudBackend({ supabase, userId, table = 'workspace_memory_records', logger = console }) {
  const readOne = async (key) => {
    const { data, error } = await supabase.from(table).select(COLUMNS).eq('user_id', userId).eq('record_key', key).limit(1);
    if (error) throw error;
    return data?.[0] || null;
  };
  return {
    async readAll() {
      const rows = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase.from(table).select(COLUMNS).eq('user_id', userId).order('record_key').range(from, from + PAGE - 1);
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < PAGE) break;
      }
      return rows;
    },
    async write(changes) {
      const results = [];
      for (const change of changes) {
        const deletedAt = change.deleted ? new Date().toISOString() : null;
        if (change.baseVersion == null) {
          const { data, error } = await supabase.from(table).insert({ user_id: userId, record_key: change.key, payload: change.payload, deleted_at: deletedAt }).select(COLUMNS);
          if (error) {
            if (error.code === '23505') {
              results.push({ key: change.key, status: 'conflict', row: await readOne(change.key) });
              continue;
            }
            throw error;
          }
          results.push({ key: change.key, status: 'ok', row: data?.[0] || null });
          continue;
        }
        const { data, error } = await supabase.from(table).update({ payload: change.payload, deleted_at: deletedAt }).eq('user_id', userId).eq('record_key', change.key).eq('version', change.baseVersion).select(COLUMNS);
        if (error) throw error;
        if (data?.length) results.push({ key: change.key, status: 'ok', row: data[0] });
        else results.push({ key: change.key, status: 'conflict', row: await readOne(change.key) });
      }
      return results;
    },
    subscribe(listener) {
      const channel = supabase
        .channel(`user-memory-records:${userId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter: `user_id=eq.${userId}` }, (payload) => listener([payload.new]))
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table, filter: `user_id=eq.${userId}` }, (payload) => listener([payload.new]))
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') logger.warn?.('The memory is not heard from other devices until it reconnects:', status);
        });
      return () => { void supabase.removeChannel(channel); };
    }
  };
}
