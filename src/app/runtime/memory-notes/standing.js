// The first page: the few notes every message carries (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §4.2 and §4.4). They are the ones that hold for every
// answer (the language, the tone, who the person is, a long habit), not facts about this or that. A mistake here is made again in every answer, so the model can only PROPOSE
// that a note is on the first page: the program decides, and only for preferences and facts that the person said plainly or that were seen again on another day or in another
// conversation. Shared by the page and the server: no window, no document, no browser storage.

import { LIMITS, isActive } from './notes.js';

const time = (value) => Date.parse(value || '') || 0;

// What a person says when a thing is meant to hold for good (a few of each language).
const EXPLICIT = [
  /\b(?:always|never|prefer|i like|i love|i hate|i want you to|remember that|from now on|by default|usually|my name is|call me)\b/i,
  /(?:記住|以後|總是|一律|平常|通常|習慣|偏好|喜歡|討厭|希望你|請你|叫我|我是)/,
  /(?:いつも|必ず|好き|嫌い|覚えて|普段)/,
  /\b(?:toujours|jamais|je préfère|je prefere|j'aime|je veux que|souviens-toi|appelle-moi|en général)\b/i,
  /\b(?:siempre|nunca|prefiero|me gusta|quiero que|recuerda que|llámame|normalmente)\b/i,
  /(?:всегда|никогда|предпочитаю|мне нравится|запомни|называй меня|обычно)/i
];

/** Whether what the person said says plainly that a thing is meant to hold for every answer. */
export const isExplicitPreference = (quote) => EXPLICIT.some((pattern) => pattern.test(String(quote || '')));

/** Whether a note may be on the first page at all. */
export const canBeStanding = (note) => isActive(note) && note.surface === 'normal' && (note.kind === 'preference' || note.kind === 'fact') && note.notRelevant < LIMITS.notRelevantLimit;

/** Whether a note earns the first page by being seen again (on another day or in another conversation). */
export const earnsStanding = (note) => canBeStanding(note) && note.evidenceCount >= 2;

/**
 * The first page after the rules: the ones that earn it are put in, a note the person called "not relevant" three times is taken out, and when there are too many the ones
 * used longest ago leave. Returns { notes, promoted: [ids], demoted: [ids] }.
 */
export function reconcileStanding(notes, { max = LIMITS.maxStanding } = {}) {
  const promoted = [];
  const demoted = [];
  let next = notes.map((note) => {
    if (note.standing && (!isActive(note) || note.notRelevant >= LIMITS.notRelevantLimit || !canBeStanding(note))) {
      demoted.push(note.id);
      return { ...note, standing: false };
    }
    return note;
  });
  const standing = () => next.filter((note) => note.standing && isActive(note));
  const candidates = next
    .filter((note) => !note.standing && earnsStanding(note))
    .sort((left, right) => right.evidenceCount - left.evidenceCount || time(right.observedAt) - time(left.observedAt));
  for (const candidate of candidates) {
    if (standing().length >= max) break;
    promoted.push(candidate.id);
    next = next.map((note) => (note.id === candidate.id ? { ...note, standing: true } : note));
  }
  const over = standing().length - max;
  if (over > 0) {
    const leaving = standing()
      .sort((left, right) => Math.max(time(left.lastUsedAt), time(left.updatedAt)) - Math.max(time(right.lastUsedAt), time(right.updatedAt)))
      .slice(0, over)
      .map((note) => note.id);
    next = next.map((note) => (leaving.includes(note.id) ? { ...note, standing: false } : note));
    demoted.push(...leaving);
  }
  return { notes: next, promoted, demoted };
}

/** The notes of the first page, as they go into a request: the best seen first, as many as fit in the budget of characters. */
export function standingNotes(notes, { max = LIMITS.maxStanding, budget = LIMITS.standingBudget } = {}) {
  const chosen = [];
  let used = 0;
  for (const note of notes
    .filter((entry) => entry.standing && isActive(entry) && entry.surface === 'normal')
    .sort((left, right) => right.evidenceCount - left.evidenceCount || time(right.observedAt) - time(left.observedAt))) {
    if (chosen.length >= max || used + note.text.length > budget) break;
    chosen.push(note);
    used += note.text.length;
  }
  return chosen;
}

/** The person said a note does not fit here: it counts, and at the limit it is no longer in the first page. */
export function markNotRelevant(note) {
  const count = note.notRelevant + 1;
  return { ...note, notRelevant: count, standing: count >= LIMITS.notRelevantLimit ? false : note.standing };
}
