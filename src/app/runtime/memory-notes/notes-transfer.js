// Taking the notes out and putting them in again (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §4.7): the data export of the settings and the page that manages the notes
// write a file with the person's notes (the words, the kind, the keywords, whether it is on the first page, "do not bring up", locked, until when it holds) and the words of the notes the
// person deleted (so that they are not learned again, but no text of them). The same file read in again is checked as every write is: no secret, no number of a card or of a paper, no
// order to the assistant, no note that a deleted one stands for, no more than the notebook holds; a note that is there already is not added twice. The notes of a file the person wrote or
// exported are theirs: each keeps its own words as its source. Pure functions; shared by the page and the tests: no window, no document, no browser storage.

import { LIMITS, SURFACES, createNote, isActive, isTombstone, normalizeKeywords } from './notes.js';
import { MAX_CATEGORIES, categoryName, normalizeCategories, resolveKind } from './categories.js';
import { notesInScope } from './scope.js';
import { canBeStanding } from './standing.js';
import { findTombstone, makeTombstone } from './tombstone.js';
import { refusalFor } from './write-check.js';

export const TRANSFER_VERSION = 1;
export const MAX_IMPORT_NOTES = 600;

const squash = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
const same = (left, right) => squash(left).toLowerCase() === squash(right).toLowerCase();
const isoOr = (value, fallback) => (typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : fallback);

/** The file: `{ version, exportedAt, notes: [...], blocked: [{ keywords, hint }] }`. Notes in use only; the deleted ones are only their words. */
export function buildNotesExport(allNotes, now = () => new Date().toISOString(), categories = null) {
  // The memory of the account only: the notes a project keeps for itself stay in that project (scope.js).
  const notes = notesInScope(allNotes, '');
  return {
    version: TRANSFER_VERSION,
    exportedAt: now(),
    // The categories of the person (with the names they gave), so that a note comes back into a category of its own name.
    ...(categories ? { categories: categories.map((category) => ({ id: category.id, name: categoryName(category) })) } : {}),
    notes: notes.filter(isActive).map((note) => ({
      text: note.text,
      kind: note.kind,
      keywords: note.keywords,
      standing: note.standing,
      surface: note.surface,
      locked: note.locked,
      validUntil: note.validUntil,
      observedAt: note.observedAt,
      createdAt: note.createdAt
    })),
    blocked: notes.filter(isTombstone).map((note) => ({ keywords: note.keywords, hint: note.hint || '' })).filter((entry) => entry.keywords.length)
  };
}

/**
 * Reads a file into the notes. Returns { ok, notes: the whole list after, added, skipped: { empty, secret, forbidden_category, instruction, forgotten, duplicate, full }, blocked: how many deleted words were added }
 * or { ok: false, code } when the file is not one of ours.
 */
export function planNotesImport(notes, data, { createId, now = () => new Date().toISOString(), categories = null }) {
  if (!data || typeof data !== 'object' || data.version !== TRANSFER_VERSION || !Array.isArray(data.notes)) return { ok: false, code: 'not_a_notes_file' };
  // The categories of the file that this memory does not have are added (up to the limit); a note of a category that stays unknown goes to "fact", or is uncategorized without it.
  let known = categories || normalizeCategories(['preference', 'fact', 'project', 'relationship', 'routine'].map((id) => ({ id, name: '' })));
  for (const entry of (Array.isArray(data.categories) ? normalizeCategories(data.categories) || [] : [])) {
    if (known.length >= MAX_CATEGORIES) break;
    if (known.some((category) => category.id === entry.id || (entry.name && categoryName(category).toLowerCase() === entry.name.toLowerCase()))) continue;
    if (entry.name) known = [...known, entry];
  }
  const skipped = { empty: 0, secret: 0, forbidden_category: 0, instruction: 0, forgotten: 0, duplicate: 0, full: 0 };
  let next = [...notes];
  let added = 0;
  let blocked = 0;
  // What was added and what was left out and why, for the person to read after an import (a short text for each, never more than sixty of either).
  const details = { added: [], skipped: [] };
  const keep = (list, entry) => { if (list.length < 60) list.push(entry); };
  // What the person deleted comes first, so that a note of the same file that it stands for is not added.
  for (const entry of (Array.isArray(data.blocked) ? data.blocked : []).slice(0, MAX_IMPORT_NOTES)) {
    const keywords = normalizeKeywords(entry?.keywords);
    if (!keywords.length) continue;
    const stone = makeTombstone(createNote({ id: createId(), text: keywords.join(' '), keywords, source: { conversationId: '', messageIds: [], quote: '' }, now }), now);
    if (next.some((note) => isTombstone(note) && note.keywords.join('|').toLowerCase() === keywords.join('|').toLowerCase())) continue;
    next.push({ ...stone, hint: squash(entry?.hint || keywords.join(' ')).slice(0, 80) });
    blocked += 1;
  }
  for (const entry of data.notes.slice(0, MAX_IMPORT_NOTES)) {
    const text = squash(entry?.text).slice(0, LIMITS.maxText);
    if (!text) { skipped.empty += 1; continue; }
    const refusal = refusalFor(text);
    if (refusal) { skipped[refusal] += 1; keep(details.skipped, { text: text.slice(0, 80), reason: refusal }); continue; }
    if (next.filter(isActive).length >= LIMITS.maxActive) { skipped.full += 1; keep(details.skipped, { text: text.slice(0, 80), reason: 'full' }); continue; }
    if (next.some((note) => isActive(note) && same(note.text, text))) { skipped.duplicate += 1; keep(details.skipped, { text: text.slice(0, 80), reason: 'duplicate' }); continue; }
    const keywords = normalizeKeywords(Array.isArray(entry.keywords) ? entry.keywords : []);
    if (findTombstone({ text, keywords, messageIds: [] }, next)) { skipped.forgotten += 1; keep(details.skipped, { text: text.slice(0, 80), reason: 'forgotten' }); continue; }
    const at = now();
    let note = createNote({
      id: createId(),
      text,
      keywords: keywords.length ? keywords : undefined,
      kind: resolveKind(entry.kind, known),
      surface: SURFACES.includes(entry.surface) ? entry.surface : 'normal',
      source: { conversationId: '', messageIds: [], quote: text },
      observedAt: isoOr(entry.observedAt, at),
      validUntil: isoOr(entry.validUntil, null),
      now
    });
    note = { ...note, createdAt: isoOr(entry.createdAt, note.createdAt), locked: entry.locked === true };
    if (entry.standing === true && canBeStanding(note) && next.filter((other) => isActive(other) && other.standing).length < LIMITS.maxStanding) note = { ...note, standing: true };
    next.push(note);
    added += 1;
    keep(details.added, text.slice(0, 80));
  }
  return { ok: true, notes: next, added, skipped, blocked, details, categories: known };
}
