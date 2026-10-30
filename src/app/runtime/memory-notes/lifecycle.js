// What happens to a note with time (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §4.5 and §4.7): it is seen again (and counts more), it is used, it runs out
// (a fact with a date), it fades when nobody used it and it was seen only once, and when the notebook is full the weakest make room. Every function gives a new list; none of them
// deletes a note (a note leaves by being archived, or by the person deleting it). Shared by the page and the server: no window, no document, no browser storage.

import { LIMITS, NOTE_STATUS, isActive } from './notes.js';
import { later } from './supersede.js';

const DAY = 24 * 60 * 60 * 1000;
const time = (value) => Date.parse(value || '') || 0;
const dayOf = (value) => String(value || '').slice(0, 10);

/** The key of one sighting: the conversation and the day. */
export const sightingKey = (conversationId, observedAt) => `${conversationId || ''}|${dayOf(observedAt)}`;

/** A note seen again: it counts once for each conversation and day it is seen in, and what was seen later says when it was last seen. */
export function reinforce(note, { conversationId = '', observedAt, messageId = '', now = () => new Date().toISOString() }) {
  const key = sightingKey(conversationId, observedAt);
  const seen = note.source.seen || [];
  const counted = !seen.includes(key);
  return {
    ...note,
    evidenceCount: note.evidenceCount + (counted ? 1 : 0),
    observedAt: later(observedAt, note.observedAt),
    updatedAt: now(),
    source: {
      ...note.source,
      seen: counted ? [...seen, key].slice(-10) : seen,
      messageIds: messageId && !note.source.messageIds.includes(messageId) ? [...note.source.messageIds, messageId].slice(-20) : note.source.messageIds
    }
  };
}

/** The notes (by id) that were used to answer: when, and how many times. */
export function touchUsed(notes, ids, now = () => new Date().toISOString()) {
  const used = new Set(ids);
  const at = now();
  return notes.map((note) => (used.has(note.id) && isActive(note) ? { ...note, lastUsedAt: at, recallCount: note.recallCount + 1 } : note));
}

const archive = (note, reason, now) => ({ ...note, status: NOTE_STATUS.archived, archivedReason: reason, standing: false, updatedAt: now });

/** Notes with a date that has passed are archived (a note the person locked stays). Returns { notes, changed: [ids] }. */
export function expire(notes, now = () => new Date().toISOString()) {
  const at = now();
  const changed = [];
  const next = notes.map((note) => {
    if (isActive(note) && !note.locked && note.validUntil && time(note.validUntil) < time(at)) {
      changed.push(note.id);
      return archive(note, 'expired', at);
    }
    return note;
  });
  return { notes: next, changed };
}

/** Notes seen only once, not in the first page, and not used for ninety days fade into the archive. Returns { notes, changed }. */
export function fade(notes, now = () => new Date().toISOString(), days = LIMITS.fadeDays) {
  const at = now();
  const changed = [];
  const next = notes.map((note) => {
    const lastTouched = Math.max(time(note.lastUsedAt), time(note.updatedAt), time(note.createdAt));
    if (isActive(note) && !note.locked && !note.standing && note.evidenceCount === 1 && time(at) - lastTouched > days * DAY) {
      changed.push(note.id);
      return archive(note, 'faded', at);
    }
    return note;
  });
  return { notes: next, changed };
}

/** The weakest notes first: the fewest sightings, then the longest unused. The first page and the locked ones are not among them. */
export function weakest(notes, count = 1) {
  return notes
    .filter((note) => isActive(note) && !note.locked && !note.standing)
    .sort((left, right) => left.evidenceCount - right.evidenceCount || Math.max(time(left.lastUsedAt), time(left.updatedAt)) - Math.max(time(right.lastUsedAt), time(right.updatedAt)))
    .slice(0, Math.max(0, count));
}

/** Room for `count` more notes under the limit: the weakest are archived. Returns { notes, evicted: [notes before they were archived] }. */
export function makeRoom(notes, count = 1, { max = LIMITS.maxActive, now = () => new Date().toISOString() } = {}) {
  const active = notes.filter(isActive).length;
  const needed = Math.max(0, active + count - max);
  if (!needed) return { notes, evicted: [] };
  const chosen = weakest(notes, needed);
  const ids = new Set(chosen.map((note) => note.id));
  const at = now();
  return { notes: notes.map((note) => (ids.has(note.id) ? archive(note, 'evicted', at) : note)), evicted: chosen };
}

/** The chores of time in one go: what ran out, what faded. */
export function sweep(notes, now) {
  const expired = expire(notes, now);
  const faded = fade(expired.notes, now);
  return { notes: faded.notes, expired: expired.changed, faded: faded.changed };
}
