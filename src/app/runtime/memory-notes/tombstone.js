// A note the person deleted must not come back (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §4.8): it would, the next time the same conversation is read
// (above all when memory is built again from the old conversations). So the deleted note stays as a tombstone with no text, only the words it was found by, where it came from
// and a short hint, and a new note is stopped when it says nearly the same: in the same words, or from the same message with something of the same words. A tombstone holds no
// text of what was said, because the person wanted it gone. Shared by the page and the server: no window, no document, no browser storage.

import { NOTE_STATUS, isTombstone, normalizeKeywords } from './notes.js';
import { termSet } from './tokenize.js';

const SHARED_WORDS = 0.5;
const SHARED_WORDS_SAME_SOURCE = 0.25;
const COVERAGE = 0.2;

/** The tombstone of a note: its words and source, no text. */
export function makeTombstone(note, now = () => new Date().toISOString()) {
  const keywords = normalizeKeywords(note.keywords);
  return {
    ...note,
    text: '',
    keywords,
    hint: keywords.join(' ').slice(0, 80),
    status: NOTE_STATUS.deleted,
    standing: false,
    updatedAt: now()
  };
}

function shared(candidate, tombstone) {
  if (!candidate.size || !tombstone.size) return { ofTombstone: 0, ofCandidate: 0 };
  let found = 0;
  for (const term of tombstone) if (candidate.has(term)) found += 1;
  return { ofTombstone: found / tombstone.size, ofCandidate: found / candidate.size };
}

/**
 * Whether a candidate (`{ text, keywords, messageIds }`) is what a tombstone stands for. Returns the tombstone that stops it, or null. The words of the tombstone must be
 * mostly in the candidate, and they must be a part of what the candidate says (so a new fact that only mentions the same place is not stopped).
 */
export function findTombstone(candidate, notes) {
  const words = termSet(candidate.text || '', candidate.keywords || []);
  const messages = new Set(candidate.messageIds || []);
  for (const note of notes) {
    if (!isTombstone(note)) continue;
    const { ofTombstone, ofCandidate } = shared(words, termSet(note.keywords, note.hint || ''));
    const sameSource = note.source.messageIds.some((id) => messages.has(id));
    if (ofCandidate >= COVERAGE && ofTombstone >= (sameSource ? SHARED_WORDS_SAME_SOURCE : SHARED_WORDS)) return note;
  }
  return null;
}

/** The tombstones that bear on a text (for the curator: "do not store"), the closest first. */
export function relatedTombstones(text, notes, limit = 5) {
  const words = termSet(text);
  return notes
    .filter(isTombstone)
    .map((note) => ({ note, ...shared(words, termSet(note.keywords, note.hint || '')) }))
    .filter((entry) => entry.ofTombstone >= 0.34)
    .sort((left, right) => right.ofTombstone - left.ofTombstone)
    .slice(0, limit)
    .map((entry) => entry.note);
}
