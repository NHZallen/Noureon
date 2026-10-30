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

import { keyKind, mergeNotes, noteFromRow } from '../memory-notes/records.js';

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

/**
 * The same rows with a copy kept in the browser, so that the memory works when the database cannot be reached (the server is down, no network): `remote` is the backend of the cloud (or
 * anything with the same three calls). Whenever the rows are read from the cloud, the copy is made again. When the cloud cannot be read, the copy is given instead; when it cannot be written
 * to, the change is applied to the copy and kept in a list, and sent the next time the cloud answers (a note that was also changed elsewhere meanwhile is joined with it, as everywhere). The
 * list and the copy live in `storage` ({ getItem, setItem }, maybe async) under `key`. Without a copy to fall back on, a cloud that cannot be read is still an error.
 */
export function createMirroredBackend({ remote, storage, key, now = () => new Date().toISOString(), retryMs = 30_000, setTimer = (fn, ms) => { const id = setTimeout(fn, ms); id?.unref?.(); return id; }, clearTimer = (id) => clearTimeout(id), logger = console }) {
  let mirror = null;
  let offline = false;
  let timer = null;
  let listener = null;

  const load = async () => {
    if (mirror) return mirror;
    const saved = parse(await storage.getItem(key));
    mirror = { rows: new Map(), pending: new Map() };
    if (saved?.version === 1) {
      for (const row of saved.rows || []) if (row?.record_key) mirror.rows.set(row.record_key, row);
      for (const change of saved.pending || []) if (change?.key) mirror.pending.set(change.key, change);
    }
    return mirror;
  };
  const save = async () => {
    try {
      await storage.setItem(key, JSON.stringify({ version: 1, rows: [...mirror.rows.values()], pending: [...mirror.pending.values()] }));
    } catch (error) {
      logger.warn?.('The copy of the memory could not be kept in this browser.', error);
    }
  };
  const schedule = () => {
    if (timer) return;
    timer = setTimer(() => { timer = null; void retry(); }, retryMs);
  };

  /** Sends what waited while the cloud could not be reached, joined with what is there now. `all` is what the cloud holds (read just now). */
  async function flush(all) {
    const byKey = new Map(all.map((row) => [row.record_key, row]));
    for (const change of [...mirror.pending.values()]) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const current = byKey.get(change.key) || null;
        let payload = change.payload;
        if (keyKind(change.key) === 'note') {
          if (current && !current.deleted_at) payload = mergeNotes(noteFromRow({ record_key: change.key, payload }), noteFromRow(current)) || payload;
          else if (current?.deleted_at && !change.deleted) break;
        } else if (current && keyKind(change.key) === 'meta') payload = { ...current.payload, ...payload };
        const [result] = await remote.write([{ key: change.key, payload, baseVersion: current ? current.version : null, deleted: change.deleted }]);
        if (result.status === 'ok') {
          if (result.row) byKey.set(change.key, result.row);
          break;
        }
        if (result.row) byKey.set(change.key, result.row);
      }
      mirror.pending.delete(change.key);
    }
    return [...byKey.values()];
  }

  async function readFromRemote() {
    await load();
    let all = await remote.readAll();
    if (mirror.pending.size) all = await flush(all);
    mirror.rows = new Map(all.map((row) => [row.record_key, row]));
    offline = false;
    await save();
    return all;
  }

  async function retry() {
    try {
      await readFromRemote();
    } catch {
      offline = true;
      schedule();
    }
  }

  return {
    async readAll() {
      await load();
      try {
        return await readFromRemote();
      } catch (error) {
        if (!mirror.rows.size && !mirror.pending.size) throw error;
        offline = true;
        schedule();
        return [...mirror.rows.values()].map((row) => ({ ...row }));
      }
    },
    async write(changes) {
      await load();
      if (!offline) {
        try {
          const results = await remote.write(changes);
          for (const result of results) if (result.status === 'ok' && result.row) mirror.rows.set(result.key, result.row);
          await save();
          return results;
        } catch {
          offline = true;
          schedule();
        }
      }
      const results = changes.map((change) => {
        const row = { record_key: change.key, payload: change.payload, version: change.baseVersion ?? mirror.rows.get(change.key)?.version ?? 0, updated_at: now(), deleted_at: change.deleted ? now() : null };
        mirror.rows.set(change.key, row);
        mirror.pending.set(change.key, { key: change.key, payload: change.payload, deleted: Boolean(change.deleted) });
        return { key: change.key, status: 'ok', row: { ...row } };
      });
      await save();
      if (!timer) schedule();
      return results;
    },
    subscribe(fn) {
      listener = fn;
      return remote.subscribe((rows) => {
        for (const row of rows || []) if (row?.record_key) mirror?.rows.set(row.record_key, row);
        listener?.(rows);
      });
    },
    /** Whether the last try to reach the cloud failed (the copy is in use). */
    isOffline: () => offline,
    /** How many changes wait to be sent. */
    pendingCount: () => mirror?.pending.size || 0,
    /** Tries the cloud now (the page calls it when the network is back). */
    retry,
    stop() {
      if (timer) clearTimer(timer);
      timer = null;
    }
  };
}
