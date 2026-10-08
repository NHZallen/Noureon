// The judgements made for the message that is being sent, kept until its reply has been prepared: the places that decide what to add to the
// request (the guidance for files and charts, whether Python and the command tools are needed) only have the text of the message, so they find the
// judgements by that text. Only the last message is kept, and for a few minutes.

// A probability of this much or more is a yes.
export const DECISION_THRESHOLD = 0.6;

const KEEP_MS = 10 * 60 * 1000;

let current = null;

export function rememberDecisions(text, decisions, now = Date.now()) {
  current = decisions && String(text || '').trim() ? { text: String(text).trim(), decisions, at: now } : null;
}

/** The judgements made for exactly this text (the last message sent), or null. */
export function decisionsFor(text, now = Date.now()) {
  if (!current || now - current.at > KEEP_MS) return null;
  return current.text === String(text || '').trim() ? current.decisions : null;
}

export function forgetDecisions() {
  current = null;
}

/** true or false for one question of the answers, null when there is no answer (then the caller does what it did before). */
export const verdictOf = (decisions, question, threshold = DECISION_THRESHOLD) => {
  const value = decisions?.[question];
  return typeof value === 'number' ? value >= threshold : null;
};
