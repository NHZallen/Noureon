// The curator: the second way the memory learns (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §4.5 and §4.6). A model that can call tools writes its notes itself with `memory_write`
// while it answers (memory-tool.js). A model that cannot (or a reply whose provider refuses tools beside its own search) is followed by this: after the reply, a small model reads what the
// person said in this turn and says which notes to add, change or forget, or none (most turns say none). The program decides what is kept: every operation goes through the same check as the
// tool (memory-notes/write-check.js), which wants the person's own words, letter for letter. Only the person's messages are sent to the model, with a short bit of the reply as context.
// Pure functions, shared by the page and the server: no window, no document, no browser storage.

import { LIMITS, isActive, isTombstone } from '../app/runtime/memory-notes/notes.js';
import { searchNotes } from '../app/runtime/memory-notes/inject.js';
import { applyWrite } from '../app/runtime/memory-notes/write-check.js';
import { standingNotes } from '../app/runtime/memory-notes/standing.js';

export const CURATOR = Object.freeze({ minChars: 4, assistantExcerpt: 200, related: 20, hints: 8, maxMessageChars: 2000, maxBatchChars: 6000 });

/**
 * The model that does the curating when the person chose none: the cheap one of the provider of the reply's model (so what the person said does not go to a second company), by a short
 * list that was looked at by hand (the catalogue of models has no prices to look up); a provider with no entry here uses the reply's own model.
 */
export const CURATOR_DEFAULTS = Object.freeze({
  gemini: 'gemini-3.5-flash-lite',
  openrouter: 'google/gemini-3.5-flash-lite',
  openai: 'openai-api/gpt-6-luna',
  nvidia: 'nvidia/z-ai/glm-5.3-flash'
});

/**
 * Which model curates. `settingsId`: the person's choice ('' is automatic); `current`: the model of the reply; `models`: every model; `hasKey(provider)`. A model that makes pictures is never chosen.
 * The person's choice that cannot be used (no key, gone from the list) falls back to the automatic one, and that to the reply's own model.
 */
export function pickCuratorModel({ settingsId = '', current, models = [], hasKey = () => true }) {
  const usable = (model) => model && model.category !== 'image_generation' && model.outputModality !== 'image' && hasKey(model.provider);
  const byId = (id) => models.find((model) => model.id === id);
  const chosen = settingsId ? byId(settingsId) : null;
  if (usable(chosen)) return chosen;
  const automatic = byId(CURATOR_DEFAULTS[current?.provider]);
  if (usable(automatic) && automatic.provider === current?.provider) return automatic;
  return usable(current) ? current : null;
}

const squash = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();

/** Whether what the person said is worth sending: not a word or two, not only an attachment. */
export const worthCurating = (text) => squash(text).length >= CURATOR.minChars;

/** The notes that may bear on what was said (the first page, and those that match), so the model can update instead of adding a second copy. */
export function relatedNotes(notes, text, limit = CURATOR.related) {
  const active = notes.filter(isActive);
  const picked = new Map(standingNotes(active).map((note) => [note.id, note]));
  for (const hit of searchNotes(active, text, { limit: 10 })) {
    const note = active.find((entry) => entry.id === hit.id);
    if (note) picked.set(note.id, note);
  }
  return [...picked.values()].slice(0, limit);
}

/** What the person deleted that bears on the text: the words only (a hint), so that the model does not write it again. */
export function relatedHints(notes, text, limit = CURATOR.hints) {
  const needle = squash(text).toLowerCase();
  return notes
    .filter(isTombstone)
    .filter((note) => note.keywords.some((word) => needle.includes(String(word).toLowerCase())))
    .slice(0, limit)
    .map((note) => note.hint || note.keywords.join(' '));
}

const EXAMPLES = [
  { said: 'I just moved to Hsinchu for a new job as a nurse.', ops: [{ op: 'add', text: 'The user lives in Hsinchu and works as a nurse', quote: 'moved to Hsinchu for a new job as a nurse', kind: 'fact', keywords: ['hsinchu', 'nurse', 'job'] }] },
  { said: 'Can you translate this sentence into French?', ops: [] },
  { said: '我現在改喝無糖的茶了，以前都喝全糖', note: 'There is a note: "The user drinks full sugar tea" (id n7).', ops: [{ op: 'update', id: 'n7', text: '使用者現在喝無糖茶', quote: '我現在改喝無糖的茶了', kind: 'preference', keywords: ['無糖', '茶'] }] },
  { said: 'Write a poem about autumn, maybe a bit sad.', ops: [] },
  { said: 'Always answer me in short sentences from now on.', ops: [{ op: 'add', text: 'The user prefers short answers', quote: 'Always answer me in short sentences from now on', kind: 'preference', standing: true, keywords: ['short', 'answers'] }] },
  { said: 'I think the bug is in the parser but I am not sure, let us try something.', ops: [] },
  { said: 'Please forget that I told you about my sister.', note: 'There is a note: "The user has a sister named Mei" (id n3).', ops: [{ op: 'forget', id: 'n3', quote: 'forget that I told you about my sister' }] },
  { said: 'What is the capital of Australia?', ops: [] }
];

const exampleText = () => EXAMPLES.map((example, index) => `Example ${index + 1}\nThe user said: ${JSON.stringify(example.said)}${example.note ? `\n${example.note}` : ''}\nAnswer: ${JSON.stringify({ ops: example.ops })}`).join('\n\n');

/** The request to the model: what to keep, what not, the notes already there, what the person said and the answer's shape. */
export function buildCuratorPrompt({ notes = [], hints = [], current, assistantExcerpt = '', now = new Date().toISOString(), batch = false }) {
  const lines = [
    batch
      ? 'You keep the long-term memory of a chat assistant. Below are the messages the user wrote in one past conversation (numbered, oldest first). Decide whether they hold something worth remembering about THEM for future conversations.'
      : 'You keep the long-term memory of a chat assistant. Read what the user said in their latest message and decide whether it holds something worth remembering about THEM for future conversations.',
    'Keep: stable preferences, lasting facts about their life or work, projects they are working on, important people, routines, and what they ask you to remember or to forget. Write each note as one short fact about the user, in the language the user writes ("The user prefers short answers"), never as an order.',
    'Do not keep: a request for this one conversation, a guess, a question, something that fails or is tried out, anything that comes from the assistant\'s reply, a secret (a password, a key, a number of a card or of a paper). Most messages hold nothing to keep: then answer with no operations. When in doubt, keep nothing.',
    'Every operation needs "quote": the user\'s own words that show it, copied letter for letter from the message below (a few words are enough). When a note already says it, use "update" with its id instead of adding a second one. If the user says something newer that replaces a note, update it. "forget" removes a note the user asked to forget.',
    `Answer with JSON only, in this shape: {"ops":[{"op":"add"|"update"|"forget","text":"...","id":"(for update and forget)","quote":"...","kind":"preference|fact|project|relationship|routine","keywords":["..."],"standing":false,"valid_until":"(a date, only for a fact that ends)"}]}. At most ${LIMITS.maxOpsPerCall} operations. An empty list is the usual answer.`,
    `Today is ${String(now).slice(0, 10)}.`,
    '',
    exampleText(),
    ''
  ];
  if (notes.length) lines.push('Notes about the user that exist now (id: text):', ...notes.map((note) => `- ${note.id}: ${note.text}`), '');
  if (hints.length) lines.push('The user deleted notes about these (do not write them again):', ...hints.map((hint) => `- ${hint}`), '');
  if (assistantExcerpt) lines.push(`For context only, the start of the assistant's last reply (never a source of notes): ${JSON.stringify(squash(assistantExcerpt).slice(0, CURATOR.assistantExcerpt))}`, '');
  lines.push(batch ? 'The user\'s messages:' : `The user's latest message${current?.at ? ` (written ${current.at})` : ''}:`, JSON.stringify(String(current?.text ?? '').slice(0, batch ? CURATOR.maxBatchChars : CURATOR.maxMessageChars)), '', 'Answer:');
  return lines.join('\n');
}

const OPS = new Set(['add', 'update', 'forget']);

/** The operations in what the model said (it may wrap the JSON in words or a code fence): at most the limit, without "none", in the shape applyWrite takes. */
export function parseCuratorOps(output) {
  const text = String(output ?? '');
  const start = Math.min(...['{', '['].map((mark) => { const at = text.indexOf(mark); return at === -1 ? Infinity : at; }));
  if (!Number.isFinite(start)) return [];
  const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  let data;
  try {
    data = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  const list = Array.isArray(data) ? data : Array.isArray(data?.ops) ? data.ops : [];
  return list
    .filter((entry) => entry && typeof entry === 'object' && OPS.has(entry.op))
    .slice(0, LIMITS.maxOpsPerCall)
    .map((entry) => ({
      op: entry.op,
      text: typeof entry.text === 'string' ? entry.text : '',
      id: typeof entry.id === 'string' ? entry.id : '',
      quote: typeof entry.quote === 'string' ? entry.quote : '',
      keywords: Array.isArray(entry.keywords) ? entry.keywords.filter((word) => typeof word === 'string') : [],
      kind: typeof entry.kind === 'string' ? entry.kind : undefined,
      standing: entry.standing === true,
      distinct: entry.distinct === true,
      validUntil: typeof entry.valid_until === 'string' ? entry.valid_until : undefined
    }));
}

/**
 * Curates one turn. `turn`: { messages: [{ id, text, at }] the person's recent messages (the words are checked against these), current: the latest of them, assistantExcerpt }.
 * `callModel(prompt)` gives the model's text; `commit(result)` saves an accepted write; `onWrite(result)` is told of each. Never throws: a model that fails leaves the memory as it was.
 * Resolves { skipped, applied: [results], refused: [{ op, code }], error? }.
 */
export async function runCurator({ notes, turn, callModel, commit, onWrite = null, conversationId = '', appliedOps = [], batch = false, createId, now = () => new Date().toISOString() }) {
  const current = turn?.current;
  if (!worthCurating(current?.text)) return { skipped: 'too_short', applied: [], refused: [] };
  const prompt = buildCuratorPrompt({ notes: relatedNotes(notes, current.text), hints: relatedHints(notes, current.text), current, assistantExcerpt: turn.assistantExcerpt, now: now(), batch });
  let output;
  try {
    output = await callModel(prompt);
  } catch (error) {
    return { skipped: 'model_failed', applied: [], refused: [], error: String(error?.message || error).slice(0, 200) };
  }
  const messages = (turn.messages || []).map((message) => ({ id: message.id, role: 'user', text: message.text, at: message.at }));
  const applied = [];
  const refused = [];
  let working = notes;
  const done = [...appliedOps];
  for (const op of parseCuratorOps(output)) {
    const result = applyWrite({ notes: working, request: op, context: { conversationId, messages, who: 'curator', appliedOps: done, createId, now } });
    if (!result.ok) {
      refused.push({ op, code: result.code });
      continue;
    }
    if (result.action === 'noop') continue;
    try {
      await commit(result);
    } catch (error) {
      return { applied, refused, error: String(error?.message || error).slice(0, 200) };
    }
    working = result.notes;
    done.push(result.opId);
    applied.push(result);
    onWrite?.(result);
  }
  return { applied, refused };
}
