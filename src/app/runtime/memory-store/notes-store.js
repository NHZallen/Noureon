// The memory of the account as the page holds it (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §4.1): the notes, the settings, how far each conversation was
// read, and the changes made without being asked. It reads every row once, keeps them in memory, and writes what changes through a backend (see backends.js): the browser's
// storage, or the database of the account. A change that finds the row moved on (another device, or the server saving what a model asked to remember) is joined with
// what is there and written again, so nothing is lost; what another device changes is heard and folded in. Writes go one after another.
// No `window`, no `document`: shared by the page and its tests.

import { noteScopeOf } from '../memory-notes/scope.js';
import { changedNotes, cursorKey, defaultSettings, eventKey, expiredEventKeys, keyId, keyKind, mergeNotes, noteFromRow, noteKey, normalizeCursor, normalizeSettings, SETTINGS_KEY } from '../memory-notes/records.js';

const ATTEMPTS = 4;

export function createNotesStore({ backend, now = () => new Date().toISOString(), logger = console } = {}) {
  const rows = new Map();
  const listeners = new Set();
  let queue = Promise.resolve();
  let stopListening = null;
  let loaded = false;

  const emit = () => { for (const listener of [...listeners]) { try { listener(); } catch (error) { logger.warn?.('A memory listener failed.', error); } } };
  const enqueue = (task) => {
    const run = queue.then(task);
    queue = run.catch(() => {});
    return run;
  };

  const notes = () => [...rows.values()].map((row) => noteFromRow(row, { now })).filter(Boolean);
  const notesById = () => new Map(notes().map((note) => [note.id, note]));

  function fold(changedRows) {
    let changed = false;
    for (const row of changedRows || []) {
      const current = rows.get(row.record_key);
      if (!current || Number(row.version) > Number(current.version)) {
        rows.set(row.record_key, row);
        changed = true;
      }
    }
    if (changed) emit();
  }

  /** Writes changes (`[{ key, payload, deleted }]`) with the versions that were read; joins a note that moved on and tries again. */
  async function persist(changes, joinOnConflict) {
    let pending = changes;
    for (let attempt = 0; attempt < ATTEMPTS && pending.length; attempt += 1) {
      const results = await backend.write(pending.map((change) => ({ ...change, baseVersion: rows.get(change.key)?.version ?? null })));
      const next = [];
      for (const result of results) {
        const change = pending.find((entry) => entry.key === result.key);
        if (result.status === 'ok') {
          if (result.row) rows.set(result.key, result.row);
          continue;
        }
        const remote = result.row;
        if (remote) rows.set(result.key, remote);
        next.push(joinOnConflict(change, remote));
      }
      pending = next.filter(Boolean);
    }
    if (pending.length) logger.warn?.('Some changes to the memory could not be saved after several tries:', pending.map((change) => change.key));
  }

  const joinNote = (change, remote) => {
    const local = change.payload;
    const joined = remote ? mergeNotes(local, noteFromRow(remote, { now })) : local;
    return joined ? { key: change.key, payload: joined, deleted: false } : null;
  };
  const takeRemote = (change, remote) => (remote && !remote.deleted_at ? null : change);

  return {
    /** Reads everything and starts hearing the changes of other devices. */
    async load() {
      const all = await backend.readAll();
      rows.clear();
      for (const row of all) rows.set(row.record_key, row);
      loaded = true;
      stopListening?.();
      stopListening = backend.subscribe(fold);
      emit();
      return this;
    },
    isLoaded: () => loaded,
    /** Every note: in use, archived, and tombstones. */
    getNotes: notes,
    getSettings: () => normalizeSettings(rows.get(SETTINGS_KEY)?.payload),
    getCursor: (conversationId) => normalizeCursor(rows.get(cursorKey(conversationId))?.payload),
    getEvents: () => [...rows.values()].filter((row) => keyKind(row.record_key) === 'event' && !row.deleted_at).map((row) => ({ id: keyId(row.record_key), ...row.payload })).sort((left, right) => String(right.at).localeCompare(String(left.at))),
    getRow: (key) => rows.get(key) || null,

    /** Saves the notes that are new or different from what is held (`next` is the whole list). */
    commitNotes: (next) => enqueue(async () => {
      const changed = changedNotes(notesById(), next);
      if (!changed.length) return 0;
      await persist(changed.map((note) => ({ key: noteKey(note.id), payload: note, deleted: false })), joinNote);
      emit();
      return changed.length;
    }),
    /** What a write that was accepted brings (see write-check.js): the notes, the event that says what changed, and the operation that is now done for the conversation. */
    commitWrite: (result, { conversationId = '' } = {}) => enqueue(async () => {
      const changed = changedNotes(notesById(), result.notes);
      const changes = changed.map((note) => ({ key: noteKey(note.id), payload: note, deleted: false }));
      if (result.event) changes.push({ key: eventKey(result.event.id), payload: result.event, deleted: false });
      for (const event of result.events || []) changes.push({ key: eventKey(event.id), payload: event, deleted: false });
      if (result.opId && conversationId) {
        const cursor = normalizeCursor(rows.get(cursorKey(conversationId))?.payload);
        changes.push({ key: cursorKey(conversationId), payload: { ...cursor, appliedOps: [...cursor.appliedOps, result.opId].slice(-50) }, deleted: false });
      }
      await persist(changes, (change, remote) => (keyKind(change.key) === 'note' ? joinNote(change, remote) : takeRemote(change, remote)));
      emit();
      return changes.length;
    }),
    setSettings: (patch) => enqueue(async () => {
      const merged = normalizeSettings({ ...defaultSettings(), ...normalizeSettings(rows.get(SETTINGS_KEY)?.payload), ...patch });
      await persist([{ key: SETTINGS_KEY, payload: merged, deleted: false }], (change, remote) => ({ ...change, payload: { ...normalizeSettings(remote?.payload), ...merged } }));
      emit();
      return merged;
    }),
    setCursor: (conversationId, patch) => enqueue(async () => {
      const merged = normalizeCursor({ ...normalizeCursor(rows.get(cursorKey(conversationId))?.payload), ...patch });
      await persist([{ key: cursorKey(conversationId), payload: merged, deleted: false }], (change) => change);
      emit();
      return merged;
    }),
    /** Takes one event away (the person undid it, or dismissed it). */
    removeEvent: (id) => enqueue(async () => {
      const key = eventKey(id);
      const row = rows.get(key);
      if (!row || row.deleted_at) return 0;
      await persist([{ key, payload: row.payload, deleted: true }], (change, remote) => (remote ? { ...change, payload: remote.payload } : null));
      emit();
      return 1;
    }),
    /** Takes away the events older than thirty days. */
    pruneEvents: () => enqueue(async () => {
      const old = expiredEventKeys([...rows.values()], now);
      if (!old.length) return 0;
      await persist(old.map((key) => ({ key, payload: rows.get(key).payload, deleted: true })), (change, remote) => (remote ? { ...change, payload: remote.payload } : null));
      emit();
      return old.length;
    }),
    /**
     * Marks every row as taken away (the person cleared the memory; `keepTombstones` leaves the notes the person deleted, so they are not learned again). With `scopeId` only the notes
     * of that scope go ('' is the memory of the account, an id is a project that keeps its notes for itself, memory-notes/scope.js); events and the other rows stay.
     */
    clearAll: ({ keepTombstones = true, scopeId } = {}) => enqueue(async () => {
      const scoped = typeof scopeId === 'string';
      const targets = [...rows.values()].filter((row) => !row.deleted_at && keyKind(row.record_key) !== 'meta'
        && !(scoped && (keyKind(row.record_key) !== 'note' || noteScopeOf(row.payload) !== scopeId))
        && !(keepTombstones && keyKind(row.record_key) === 'note' && row.payload?.status === 'deleted'));
      await persist(targets.map((row) => ({ key: row.record_key, payload: row.payload, deleted: true })), (change, remote) => (remote ? { ...change, payload: remote.payload } : null));
      emit();
      return targets.length;
    }),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    stop() {
      stopListening?.();
      stopListening = null;
      listeners.clear();
    }
  };
}
