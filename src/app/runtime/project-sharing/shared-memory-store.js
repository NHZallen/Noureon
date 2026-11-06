// The memory of a shared project as one page holds it (docs/superpowers/specs/2026-11-06-project-sharing-design.md, §7 and §18.5): the notes are the project notes of the OWNER (rows of the owner's
// table that carry the id of the project), read and written through the database functions `read_project_memory` and `write_project_memory`, which check the role (the owner and the editors write,
// a chat member only reads). The rest of what a store keeps (the settings, how far each conversation was read, the events) is the person's own and comes from the person's own store (`personal`).
// It answers like the store of the account (memory-store/notes-store.js), so the loader and the curator use it the same way. No `window`, no `document`.

import { changedNotes, mergeNotes, noteFromRow, noteKey } from '../memory-notes/records.js';

const ATTEMPTS = 4;

export function createSharedMemoryStore({ personal, getSupabase, projectId, role = 'chat', now = () => new Date().toISOString(), pollMs = 20000, logger = console, setTimer = (fn, ms) => globalThis.setInterval(fn, ms), clearTimer = (id) => globalThis.clearInterval(id) }) {
  const rows = new Map();
  const listeners = new Set();
  let loaded = false;
  let timer = null;
  let queue = Promise.resolve();
  const readOnly = role === 'chat';

  const rpc = async (name, args) => {
    const client = getSupabase();
    if (!client) throw new Error('No cloud account.');
    const { data, error } = await client.rpc(name, args);
    if (error) throw error;
    return data;
  };
  const emit = () => { for (const listener of [...listeners]) { try { listener(); } catch (error) { logger.warn?.('A memory listener failed.', error); } } };
  const notes = () => [...rows.values()].map((row) => noteFromRow(row, { now })).filter(Boolean);
  const byId = () => new Map(notes().map((note) => [note.id, note]));
  const enqueue = (task) => { const run = queue.then(task); queue = run.catch(() => {}); return run; };

  async function refresh() {
    const data = await rpc('read_project_memory', { p_project_id: projectId });
    let changed = false;
    for (const row of Array.isArray(data) ? data : []) {
      const current = rows.get(row.record_key);
      if (!current || Number(row.version) > Number(current.version)) { rows.set(row.record_key, row); changed = true; }
    }
    if (changed) emit();
  }

  /** Writes notes (`[{ key, payload, deleted }]`) with the versions that were read; a note that moved on is joined with what is there and written again. */
  async function persist(changes) {
    let pending = changes;
    for (let attempt = 0; attempt < ATTEMPTS && pending.length; attempt += 1) {
      const results = await rpc('write_project_memory', { p_project_id: projectId, p_changes: pending.map((change) => ({ key: change.key, payload: change.payload, deleted: change.deleted === true, baseVersion: rows.get(change.key)?.version ?? null })) });
      const next = [];
      for (const result of Array.isArray(results) ? results : []) {
        const change = pending.find((entry) => entry.key === result.key);
        if (!change) continue;
        if (result.status === 'ok' && result.row) { rows.set(result.row.record_key, result.row); continue; }
        if (result.status !== 'conflict') { logger.warn?.('The project memory refused a change.', result.key); continue; }
        if (result.row) rows.set(result.row.record_key, result.row);
        const joined = result.row && !result.row.deleted_at ? mergeNotes(change.payload, noteFromRow(result.row, { now })) : change.payload;
        if (joined) next.push({ ...change, payload: joined });
      }
      pending = next;
    }
    if (pending.length) logger.warn?.('Some changes to the project memory could not be saved after several tries.');
  }

  const noteChanges = (next) => changedNotes(byId(), next).map((note) => ({ key: noteKey(note.id), payload: note, deleted: false }));

  return {
    ...personal,
    projectId,
    role,
    readOnly,
    async load() {
      await refresh();
      loaded = true;
      if (!timer) { timer = setTimer(() => { void refresh().catch(() => {}); }, pollMs); timer?.unref?.(); }
      emit();
      return this;
    },
    isLoaded: () => loaded,
    /** Reads the project notes again (a reply does this first, so it never works from notes that others have changed since). */
    refresh,
    getNotes: notes,
    commitNotes: (next) => enqueue(async () => {
      const changes = readOnly ? [] : noteChanges(next);
      if (changes.length) await persist(changes);
      emit();
      return changes.length;
    }),
    // The notes go to the project; the event and the cursor are the person's own.
    commitWrite: (result, options = {}) => enqueue(async () => {
      const changes = readOnly ? [] : noteChanges(result.notes);
      if (changes.length) await persist(changes);
      const rest = await personal.commitWrite({ ...result, notes: [] }, options);
      emit();
      return changes.length + (Number(rest) || 0);
    }),
    // Clearing the memory of the account never touches the notes of a project of someone else.
    clearAll: async () => 0,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    stop() {
      if (timer) clearTimer(timer);
      timer = null;
      listeners.clear();
    }
  };
}
