// The memory of a person as the server reaches it (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §5): when the model of a reply asks to remember something
// the page may be closed, so the server writes the note into the same table the page reads (workspace_memory_records), with the service key. What it writes went through the
// check of writes (src/app/runtime/memory-notes/write-check.js) first. The version and the time are the database's; a note that changed under it (the person edited it
// from a page, another reply saved one) is joined with what is there and saved again, as the page does.

import { changedNotes, cursorKey, eventKey, keyKind, mergeNotes, noteFromRow, noteKey, normalizeCursor, normalizeSettings, SETTINGS_KEY } from '../src/app/runtime/memory-notes/records.js';

const TABLE = 'workspace_memory_records';
const COLUMNS = 'record_key,payload,version,updated_at,deleted_at';
const ATTEMPTS = 4;

export function createMemoryRecords({ db, now = () => new Date().toISOString() }) {
  const readRows = (userId, { prefix = '' } = {}) => db.select(TABLE, { select: COLUMNS, filters: { user_id: `eq.${userId}`, ...(prefix ? { record_key: `like.${prefix}*` } : {}), deleted_at: 'is.null' }, order: 'record_key', limit: 1000 });
  const readRow = async (userId, key) => (await db.select(TABLE, { select: COLUMNS, filters: { user_id: `eq.${userId}`, record_key: `eq.${key}` }, limit: 1 }))[0] || null;

  /** Saves one row with the version that was read; returns { ok: true, version } or { ok: false, row } when it moved on. */
  async function save(userId, key, payload, baseVersion) {
    if (baseVersion == null) {
      try {
        const [row] = await db.insert(TABLE, { user_id: userId, record_key: key, payload }, { returning: COLUMNS });
        return { ok: true, row };
      } catch (error) {
        if (error?.code === '23505') return { ok: false, row: await readRow(userId, key) };
        throw error;
      }
    }
    const rows = await db.update(TABLE, { user_id: `eq.${userId}`, record_key: `eq.${key}`, version: `eq.${baseVersion}` }, { payload }, { returning: COLUMNS });
    return rows.length ? { ok: true, row: rows[0] } : { ok: false, row: await readRow(userId, key) };
  }

  return {
    /** What a reply needs: all the notes (with the version each was read at), the settings, and how far the conversation was read. */
    async load(userId, { conversationId = '' } = {}) {
      const rows = await readRows(userId);
      const versions = new Map(rows.map((row) => [row.record_key, row.version]));
      const notes = rows.map((row) => noteFromRow(row, { now })).filter(Boolean);
      const settings = normalizeSettings(rows.find((row) => row.record_key === SETTINGS_KEY)?.payload);
      const cursor = normalizeCursor(rows.find((row) => row.record_key === cursorKey(conversationId))?.payload);
      return { notes, settings, cursor, versions };
    },
    /**
     * Saves what an accepted write brought (see write-check.js `applyWrite`): the notes that are new or changed, the event, and the operation done for the conversation.
     * `before` is what `load` gave (the notes and the versions). Returns the number of rows written.
     */
    async saveWrite(userId, { before, result, conversationId = '' }) {
      const known = new Map(before.notes.map((note) => [note.id, note]));
      const versions = new Map(before.versions);
      const pending = changedNotes(known, result.notes).map((note) => ({ key: noteKey(note.id), payload: note }));
      if (result.event) pending.push({ key: eventKey(result.event.id), payload: result.event });
      if (result.opId && conversationId) pending.push({ key: cursorKey(conversationId), payload: { ...before.cursor, appliedOps: [...before.cursor.appliedOps, result.opId].slice(-50) } });
      let written = 0;
      let todo = pending;
      for (let attempt = 0; attempt < ATTEMPTS && todo.length; attempt += 1) {
        const again = [];
        for (const item of todo) {
          const saved = await save(userId, item.key, item.payload, versions.get(item.key) ?? null);
          if (saved.ok) {
            written += 1;
            versions.set(item.key, saved.row.version);
            continue;
          }
          if (saved.row) versions.set(item.key, saved.row.version);
          if (keyKind(item.key) === 'note') {
            const joined = saved.row && !saved.row.deleted_at ? mergeNotes(item.payload, noteFromRow(saved.row, { now })) : item.payload;
            if (joined) again.push({ key: item.key, payload: joined });
          } else if (!saved.row || saved.row.deleted_at) again.push(item);
        }
        todo = again;
      }
      return written;
    }
  };
}
