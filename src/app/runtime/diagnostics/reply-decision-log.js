// What the page decided for the latest replies, kept in memory only (never saved, never sent): where each one was made and why. It is what
// the diagnostics (reply-diagnostics.js) read, so "why did this run on my device?" has an answer after the fact. Nothing in it is a secret:
// no text of a message, no key; only the kind of decision.

const LIMIT = 12;
const entries = [];

export function recordReplyDecision(entry) {
  entries.push({ at: new Date().toISOString(), ...entry });
  while (entries.length > LIMIT) entries.shift();
}

export const replyDecisions = () => entries.slice();

export const clearReplyDecisions = () => { entries.length = 0; };
