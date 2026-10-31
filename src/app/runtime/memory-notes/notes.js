// The shape of one note of the memory and what is true of every note (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §4.1). A note is one fact in one sentence
// ("User prefers concise answers"), kept in the language the person writes, with the words it is found by, where it came from (the message and the words of the person that
// show it) and what has happened to it (how often it was seen again, when it was last used). A note the person deletes becomes a tombstone: no text, only the words and the
// source, so that it is not learned again. Shared by the page and the server: no window, no document, no browser storage.

import { plainWords } from './tokenize.js';

export const NOTE_KINDS = Object.freeze(['preference', 'fact', 'project', 'relationship', 'routine']);
export const NOTE_STATUS = Object.freeze({ active: 'active', archived: 'archived', deleted: 'deleted' });
export const SURFACES = Object.freeze(['normal', 'never']);

export const LIMITS = Object.freeze({
  /** Notes in use (the ones faded into the archive and the tombstones are not counted). */
  maxActive: 300,
  maxText: 200,
  maxKeywords: 10,
  maxKeywordLength: 30,
  /** Notes in the first page, the ones every message carries. */
  maxStanding: 15,
  /** The first page, in characters of the notes (about 400 to 600 tokens). */
  standingBudget: 1800,
  /** How many changes one call (of the model or of the curator) may bring. */
  maxOpsPerCall: 5,
  maxQuote: 400,
  minQuote: 4,
  /** A note nobody used for this long and seen only once fades into the archive. */
  fadeDays: 90,
  /** The person said "not relevant" this many times: the note is no longer in the first page. */
  notRelevantLimit: 3
});

const asArray = (value) => (Array.isArray(value) ? value : []);
const isoOr = (value, fallback) => (typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : fallback);
const cleanText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

/** The keywords of a note: trimmed, without repeats, at most ten, each short. */
export function normalizeKeywords(list) {
  const seen = new Set();
  const out = [];
  for (const item of asArray(list)) {
    const word = cleanText(item).slice(0, LIMITS.maxKeywordLength);
    const key = word.toLowerCase();
    if (word && !seen.has(key)) {
      seen.add(key);
      out.push(word);
    }
    if (out.length >= LIMITS.maxKeywords) break;
  }
  return out;
}

export const isActive = (note) => note?.status === NOTE_STATUS.active;
export const isTombstone = (note) => note?.status === NOTE_STATUS.deleted;

/** One note as it is kept, from whatever was read (a record of the store, a note of a request); null when it is not a note. */
export function normalizeNote(raw, { now = () => new Date().toISOString() } = {}) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id) return null;
  const status = Object.values(NOTE_STATUS).includes(raw.status) ? raw.status : NOTE_STATUS.active;
  const at = now();
  const text = status === NOTE_STATUS.deleted ? '' : cleanText(raw.text).slice(0, LIMITS.maxText);
  if (status !== NOTE_STATUS.deleted && !text) return null;
  const source = raw.source && typeof raw.source === 'object' ? raw.source : {};
  const createdAt = isoOr(raw.createdAt, at);
  const note = {
    id: raw.id,
    text,
    keywords: normalizeKeywords(raw.keywords),
    kind: NOTE_KINDS.includes(raw.kind) ? raw.kind : 'fact',
    standing: raw.standing === true,
    surface: SURFACES.includes(raw.surface) ? raw.surface : 'normal',
    locked: raw.locked === true,
    evidenceCount: Math.max(1, Math.floor(Number(raw.evidenceCount) || 1)),
    observedAt: isoOr(raw.observedAt, createdAt),
    createdAt,
    updatedAt: isoOr(raw.updatedAt, createdAt),
    lastUsedAt: isoOr(raw.lastUsedAt, null),
    validUntil: isoOr(raw.validUntil, null),
    recallCount: Math.max(0, Math.floor(Number(raw.recallCount) || 0)),
    notRelevant: Math.max(0, Math.floor(Number(raw.notRelevant) || 0)),
    source: {
      conversationId: typeof source.conversationId === 'string' ? source.conversationId : '',
      messageIds: asArray(source.messageIds).filter((id) => typeof id === 'string').slice(0, 20),
      quote: cleanText(source.quote).slice(0, LIMITS.maxQuote),
      // The conversations and days it was seen on ("<conversation>|<day>"), so that being seen twice in one conversation on one day counts once.
      seen: asArray(source.seen).filter((key) => typeof key === 'string').slice(-10)
    },
    status,
    supersededBy: typeof raw.supersededBy === 'string' && raw.supersededBy ? raw.supersededBy : null
  };
  // The project whose notes these are (a project that keeps its notes for itself, memory-notes/scope.js); none for the memory of the account.
  if (typeof raw.projectId === 'string' && raw.projectId) note.projectId = raw.projectId.slice(0, 80);
  // A tombstone remembers what it was about, not what was said: the words, and a few of them as a hint.
  if (status === NOTE_STATUS.deleted) {
    note.keywords = note.keywords.length ? note.keywords : normalizeKeywords(plainWords(raw.hint || ''));
    note.hint = cleanText(raw.hint || note.keywords.join(' ')).slice(0, 80);
  }
  if (typeof raw.archivedReason === 'string' && raw.archivedReason) note.archivedReason = raw.archivedReason.slice(0, 40);
  return note;
}

/** A new note. `createId` makes its id (the store makes it from crypto.randomUUID). */
export function createNote({ id, text, keywords, kind = 'fact', standing = false, surface = 'normal', source = {}, observedAt, validUntil = null, now = () => new Date().toISOString() }) {
  const at = now();
  const clean = cleanText(text).slice(0, LIMITS.maxText);
  return normalizeNote({
    id,
    text: clean,
    keywords: normalizeKeywords(keywords && keywords.length ? keywords : plainWords(clean)),
    kind,
    standing,
    surface,
    evidenceCount: 1,
    observedAt: observedAt || at,
    createdAt: at,
    updatedAt: at,
    validUntil,
    source
  }, { now });
}

/** The words a note is found by: its text and its keywords. */
export const noteSearchTexts = (note) => [note.text || '', ...asArray(note.keywords)];

export const countActive = (notes) => asArray(notes).filter(isActive).length;
