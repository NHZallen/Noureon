// Which of two things said about the same subject is the one that holds (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §4.4). The program decides, not the model:
// only what was seen LATER can take the place of what was seen before. This matters most when memory is built again from old conversations: they are read from the oldest to the
// newest, but whatever the order, "I live in Taichung" (said in March) never takes the place of "I live in Taipei" (said in May). What was seen earlier can only add to how often
// a note was seen. Shared by the page and the server: no window, no document, no browser storage.

const time = (value) => Date.parse(value || '') || 0;

export const later = (left, right) => (time(left) >= time(right) ? left : right);

/** Whether what was seen at `observedAt` is later than what the note says (a note the person locked is never taken). */
export const canSupersede = (note, observedAt) => Boolean(note) && note.locked !== true && time(observedAt) > time(note.observedAt);

/** The note with its place taken by what was seen later: the same note (its id, how often it was seen, when it was made), a new text, new words, a new source. */
export function supersede(note, { text, keywords, observedAt, source, validUntil, now = () => new Date().toISOString() }) {
  return {
    ...note,
    text,
    keywords: keywords && keywords.length ? keywords : note.keywords,
    observedAt,
    updatedAt: now(),
    validUntil: validUntil === undefined ? note.validUntil : validUntil,
    // A different fact starts again from one sighting.
    evidenceCount: 1,
    source: source ? { ...note.source, ...source } : note.source
  };
}
