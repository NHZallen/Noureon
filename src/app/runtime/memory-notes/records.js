// How the memory is kept as rows (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §4.1; supabase/migrations/20261030010000_add_workspace_memory_records.sql): one
// row for each note (`note:<id>`), for each conversation read (`cursor:<conversation>`), for each change that was made without being asked (`event:<id>`) and one for the
// settings (`meta:settings`). The page keeps the rows in the browser or in the database of the account, and the server reads and writes the same rows for a reply that
// asked to remember: both use the functions here to turn a row into a note and a note into a row, and to join two versions of one note when two devices changed it.
// Shared by the page and the server: no window, no document, no browser storage.

import { NOTE_STATUS, isTombstone, normalizeKeywords, normalizeNote } from './notes.js';
import { later } from './supersede.js';

export const SETTINGS_KEY = 'meta:settings';
export const noteKey = (id) => `note:${id}`;
export const cursorKey = (conversationId) => `cursor:${conversationId}`;
export const eventKey = (id) => `event:${id}`;
export const keyKind = (key) => String(key).split(':', 1)[0];
export const keyId = (key) => String(key).slice(String(key).indexOf(':') + 1);

/** How long an event is kept (it is there to undo a change; after that it is only more of the person's data). */
export const EVENT_DAYS = 30;

const DEFAULT_SETTINGS = Object.freeze({
  /** Learning: the model may write notes, and the curator reads conversations. */
  learn: true,
  /** Use: notes are given to the model (the first page, the slip, the tools). */
  use: true,
  /** Paused: nothing is written, nothing is learned, what is there is still used. */
  paused: false,
  /** The model that tidies and learns for a model with no tools ('' is automatic). */
  curatorModelId: '',
  /** When the notes were last tidied (src/data/memory-consolidate.js): the tidy is due after a week, or when twenty notes changed since. */
  consolidatedAt: null,
  /** The search by meaning over the conversations (needs the consent of the person). */
  vector: Object.freeze({ enabled: false, consentAt: null, provider: '' })
});

/** The settings as they are used, from whatever was saved. */
export function normalizeSettings(raw) {
  const value = raw && typeof raw === 'object' ? raw : {};
  const vector = value.vector && typeof value.vector === 'object' ? value.vector : {};
  return {
    learn: value.learn !== false,
    use: value.use !== false,
    paused: value.paused === true,
    curatorModelId: typeof value.curatorModelId === 'string' ? value.curatorModelId.slice(0, 120) : '',
    consolidatedAt: typeof value.consolidatedAt === 'string' && !Number.isNaN(Date.parse(value.consolidatedAt)) ? value.consolidatedAt : null,
    vector: {
      enabled: vector.enabled === true && typeof vector.consentAt === 'string',
      consentAt: typeof vector.consentAt === 'string' ? vector.consentAt : null,
      provider: typeof vector.provider === 'string' ? vector.provider.slice(0, 40) : ''
    }
  };
}
export const defaultSettings = () => normalizeSettings(DEFAULT_SETTINGS);

/** The row of a note (what is kept, as JSON): `{ record_key, payload }`. */
export const rowFromNote = (note) => ({ record_key: noteKey(note.id), payload: note });

/** The note of a row, or null when the row is not a note, was taken away, or is not readable. */
export function noteFromRow(row, options) {
  if (!row || keyKind(row.record_key) !== 'note' || row.deleted_at) return null;
  return normalizeNote({ ...(row.payload || {}), id: keyId(row.record_key) }, options);
}

/** The cursor of a conversation: how far it was read, and the operations already applied (so that the same one is not applied twice). */
export function normalizeCursor(raw) {
  const value = raw && typeof raw === 'object' ? raw : {};
  return {
    processedThroughMessageId: typeof value.processedThroughMessageId === 'string' ? value.processedThroughMessageId : '',
    processedAt: typeof value.processedAt === 'string' ? value.processedAt : null,
    appliedOps: Array.isArray(value.appliedOps) ? value.appliedOps.filter((id) => typeof id === 'string').slice(-50) : []
  };
}

const time = (value) => Date.parse(value || '') || 0;

/**
 * Two versions of one note (two devices changed it, or the server and a page did): one note. What the person deleted stays deleted. A note the person locked stays locked.
 * Otherwise the one changed later gives the text and the words; the sightings are the most of the two (a note seen once more on one device and edited on the other
 * keeps both).
 */
export function mergeNotes(left, right) {
  if (!left) return right || null;
  if (!right) return left;
  if (isTombstone(left)) return left;
  if (isTombstone(right)) return right;
  const [winner, other] = time(left.updatedAt) >= time(right.updatedAt) ? [left, right] : [right, left];
  return {
    ...winner,
    evidenceCount: Math.max(left.evidenceCount, right.evidenceCount),
    observedAt: later(left.observedAt, right.observedAt),
    lastUsedAt: later(left.lastUsedAt, right.lastUsedAt) || null,
    recallCount: Math.max(left.recallCount, right.recallCount),
    notRelevant: Math.max(left.notRelevant, right.notRelevant),
    locked: left.locked || right.locked,
    keywords: normalizeKeywords(winner.keywords.length ? winner.keywords : other.keywords),
    status: winner.status === NOTE_STATUS.archived && other.status === NOTE_STATUS.active && time(other.updatedAt) === time(winner.updatedAt) ? other.status : winner.status
  };
}

/** The notes that are new or different from what `before` (a Map of id to note) holds; the order of `after` is kept. */
export function changedNotes(before, after) {
  return after.filter((note) => {
    const old = before.get(note.id);
    return !old || JSON.stringify(old) !== JSON.stringify(note);
  });
}

/** The ids of events older than their time (a row of an event is taken away after it). */
export function expiredEventKeys(rows, now = () => new Date().toISOString(), days = EVENT_DAYS) {
  const limit = time(now()) - days * 24 * 60 * 60 * 1000;
  return rows.filter((row) => keyKind(row.record_key) === 'event' && !row.deleted_at && time(row.payload?.at || row.updated_at) < limit).map((row) => row.record_key);
}
