// What the person does with their notes by hand (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §4.7): add one, change its words, put it on the first page or take
// it off, say "do not bring it up", delete it (it becomes a tombstone so it is not learned again), find notes, and undo a change the model or the curator made. Each function takes
// the whole list of notes and gives the new list (the page saves it with the store), so they are plain to test. Shared by the page and the tests: no window, no document, no browser storage.

import { LIMITS, NOTE_KINDS, NOTE_STATUS, createNote, isActive, isTombstone, normalizeKeywords } from './notes.js';
import { canBeStanding } from './standing.js';
import { makeTombstone } from './tombstone.js';
import { plainWords } from './tokenize.js';

const squash = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
const same = (left, right) => squash(left).toLowerCase() === squash(right).toLowerCase();
const replaceNote = (notes, id, change) => notes.map((note) => (note.id === id ? change(note) : note));
const find = (notes, id) => notes.find((note) => note.id === id) || null;
const fail = (code) => ({ ok: false, code });

/** A note the person writes: their own words are its source. Refused when it is empty, there is no room, or the same note is there. */
export function addByUser(notes, { text, kind = 'fact', createId, now = () => new Date().toISOString() }) {
  const clean = squash(text).slice(0, LIMITS.maxText);
  if (!clean) return fail('empty');
  if (notes.filter(isActive).length >= LIMITS.maxActive) return fail('full');
  const twin = notes.find((note) => isActive(note) && same(note.text, clean));
  if (twin) return { ...fail('duplicate'), note: twin };
  const note = createNote({
    id: createId(),
    text: clean,
    kind: NOTE_KINDS.includes(kind) ? kind : 'fact',
    source: { conversationId: '', messageIds: [], quote: clean },
    now
  });
  return { ok: true, notes: [...notes, note], note };
}

/** New words for a note. The person wrote them, so the note is locked (the curator and the model do not rewrite it). */
export function editByUser(notes, id, { text, now = () => new Date().toISOString() }) {
  const clean = squash(text).slice(0, LIMITS.maxText);
  const target = find(notes, id);
  if (!target || !isActive(target)) return fail('missing');
  if (!clean) return fail('empty');
  if (notes.some((note) => note.id !== id && isActive(note) && same(note.text, clean))) return fail('duplicate');
  const at = now();
  return {
    ok: true,
    notes: replaceNote(notes, id, (note) => ({ ...note, text: clean, keywords: normalizeKeywords([...plainWords(clean), ...note.keywords]), observedAt: at, updatedAt: at, locked: true, standing: note.standing && canBeStanding({ ...note, text: clean }) }))
  };
}

/** Puts a note on the first page (or takes it off). Only preferences and facts that may be mentioned can be there, and there is a limit. */
export function setStandingByUser(notes, id, value, { now = () => new Date().toISOString() } = {}) {
  const target = find(notes, id);
  if (!target || !isActive(target)) return fail('missing');
  if (value) {
    if (!canBeStanding(target)) return fail('cannot');
    if (!target.standing && notes.filter((note) => isActive(note) && note.standing).length >= LIMITS.maxStanding) return fail('full');
  }
  return { ok: true, notes: replaceNote(notes, id, (note) => ({ ...note, standing: Boolean(value), updatedAt: now() })) };
}

/** "Do not bring it up": the note shapes answers but is never said out loud, and it is not on the first page. `never` false puts it back. */
export function setNeverByUser(notes, id, never, { now = () => new Date().toISOString() } = {}) {
  const target = find(notes, id);
  if (!target || !isActive(target)) return fail('missing');
  return { ok: true, notes: replaceNote(notes, id, (note) => ({ ...note, surface: never ? 'never' : 'normal', standing: never ? false : note.standing, updatedAt: now() })) };
}

/** Deleting leaves a tombstone (no text), so the same thing is not learned again from the old conversations. */
export function deleteByUser(notes, id, { now = () => new Date().toISOString() } = {}) {
  const target = find(notes, id);
  if (!target || isTombstone(target)) return fail('missing');
  return { ok: true, notes: replaceNote(notes, id, (note) => makeTombstone(note, now)) };
}

/** The notes to show: `view` is 'active' (the default), 'standing' or 'archived'; `query` is looked for in the words and the keywords; `kind` narrows to one kind. The newest change first. */
export function filterNotes(notes, { view = 'active', kind = '', query = '' } = {}) {
  const needle = squash(query).toLowerCase();
  return notes
    .filter((note) => (view === 'archived' ? note.status === NOTE_STATUS.archived : isActive(note) && (view !== 'standing' || note.standing)))
    .filter((note) => !kind || note.kind === kind)
    .filter((note) => !needle || `${note.text} ${note.keywords.join(' ')}`.toLowerCase().includes(needle))
    .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
}

/** The numbers of the summary: notes in use, on the first page, archived, and when something changed last. */
export function summarize(notes) {
  const active = notes.filter(isActive);
  const stamps = active.map((note) => String(note.updatedAt)).sort();
  return {
    active: active.length,
    standing: active.filter((note) => note.standing).length,
    archived: notes.filter((note) => note.status === NOTE_STATUS.archived).length,
    updatedAt: stamps.length ? stamps[stamps.length - 1] : null
  };
}

const CHANGES = ['add', 'update', 'forget', 'archive'];

const time = (value) => Date.parse(value || '') || 0;

/** The tidy of the notes (src/data/memory-consolidate.js) is one event with an operation for each note it touched: `{ count, summary }`, or null for any other event. */
export function describeTidy(event) {
  if (event?.who !== 'consolidation') return null;
  const count = (event.ops || []).filter((op) => op.action === 'tidy').length;
  return count ? { count, summary: event.summary && typeof event.summary === 'object' ? event.summary : {} } : null;
}

/** The events as the person sees them: the parts of one tidy (the same `batch`) are one event with all the operations and the ids of the parts (`ids`). The order is kept. */
export function joinTidyEvents(events) {
  const out = [];
  const byBatch = new Map();
  for (const event of events || []) {
    if (event?.who !== 'consolidation' || !event.batch) {
      out.push(event);
      continue;
    }
    const joined = byBatch.get(event.batch);
    if (!joined) {
      const first = { ...event, ids: [event.id], ops: [...(event.ops || [])] };
      byBatch.set(event.batch, first);
      out.push(first);
    } else {
      joined.ids.push(event.id);
      joined.ops.push(...(event.ops || []));
      if (event.summary && Object.keys(event.summary).length) joined.summary = event.summary;
    }
  }
  return out;
}

/**
 * Undoes a tidy: every note it touched gets back what it was before. A note the person has changed or deleted since (its time is later than the tidy's) is left as it is.
 * Returns { ok, notes, undone, skipped }.
 */
export function undoTidy(notes, event) {
  let next = notes;
  let undone = 0;
  let skipped = 0;
  for (const op of event?.ops || []) {
    const target = find(next, op.noteId);
    if (op.action !== 'tidy' || !op.before || !target) continue;
    if (isTombstone(target) || time(target.updatedAt) > time(event.at)) {
      skipped += 1;
      continue;
    }
    next = replaceNote(next, op.noteId, () => op.before);
    undone += 1;
  }
  return { ok: undone > 0, notes: next, undone, skipped };
}

/** What an event (see write-check.js) did, for the line the person reads: `{ action, text, beforeText }`, or null when it only saw a note again (nothing to undo). */
export function describeEvent(event) {
  const op = (event?.ops || []).find((entry) => CHANGES.includes(entry.action));
  if (!op) return null;
  return { action: op.action, text: op.after?.text || op.before?.text || '', beforeText: op.before?.text || '' };
}

/**
 * Undoes what an event did: a note that was added is deleted (as a tombstone, the person does not want it), a note that was changed gets its old words back, a note that was
 * forgotten or sent to the archive comes back. Returns { ok, notes, undone: number of operations undone }.
 */
export function undoEvent(notes, event, { now = () => new Date().toISOString() } = {}) {
  if (event?.who === 'consolidation') return undoTidy(notes, event);
  let next = notes;
  let undone = 0;
  for (const op of [...(event?.ops || [])].reverse()) {
    const target = find(next, op.noteId);
    if (!target) continue;
    if (op.action === 'add' && isActive(target)) {
      next = replaceNote(next, op.noteId, (note) => makeTombstone(note, now));
      undone += 1;
    } else if (op.action === 'update' && isActive(target) && op.before?.text) {
      next = replaceNote(next, op.noteId, (note) => ({ ...note, text: op.before.text, observedAt: op.before.observedAt || note.observedAt, updatedAt: now(), supersededBy: null }));
      undone += 1;
    } else if ((op.action === 'forget' || op.action === 'archive') && !isActive(target) && op.before?.text) {
      next = replaceNote(next, op.noteId, (note) => ({ ...note, text: op.before.text, observedAt: op.before.observedAt || note.observedAt, status: NOTE_STATUS.active, updatedAt: now(), supersededBy: null, hint: undefined }));
      undone += 1;
    }
  }
  return { ok: undone > 0, notes: next, undone };
}
