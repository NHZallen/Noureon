// The periodic tidy of the notes, as it is run (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §4.7; the rules are in memory-notes/consolidate.js). Two layers: the program alone
// archives what ran out, lets what nobody used fade and joins notes that say the same; then, when a model may be used, a few suspect groups (notes that may say the same or contradict
// each other) are read by the cheap model, one group at a time, and what it answers is checked by the program before it is applied (only notes of the group, the later one wins, a
// locked note is never touched, a merged sentence holds nothing new). Nothing is deleted: a note joined into another is archived with a pointer to it, and the whole tidy is written as ONE
// event that keeps every note as it was, so that "Undo" in the settings brings it all back (events are kept thirty days). Shared by the page and the server: no window, no document,
// no browser storage.

import { NOTE_STATUS, isActive, normalizeKeywords } from '../app/runtime/memory-notes/notes.js';
import { applyGroupOps, checkGroupOps, layerOne, shouldConsolidate, suspectGroups } from '../app/runtime/memory-notes/consolidate.js';
import { changedNotes } from '../app/runtime/memory-notes/records.js';
import { CURATOR_DEFAULTS, pickCuratorModel } from './memory-curator.js';

// A row of the table may hold 20000 bytes, so a tidy that touched many notes is written as a few events (of the same `batch`) that the settings show and undo as one.
export const CONSOLIDATE = Object.freeze({ maxGroups: 6, maxOps: 300, eventBytes: 14_000, modelFailures: 2, serverMs: 20_000 });

const time = (value) => Date.parse(value || '') || 0;

/**
 * The model that reads the groups: the person's choice, the cheap one of the provider of `currentId`, that model itself; failing all those, the cheap model of any provider that has a
 * key (the tidy is not made in a conversation, so there may be no model to start from). Null when no model can be used (then only the first layer runs).
 */
export function pickTidyModel({ settingsId = '', currentId = '', models = [], hasKey = () => true }) {
  const picked = pickCuratorModel({ settingsId, current: models.find((model) => model.id === currentId), models, hasKey });
  if (picked) return picked;
  for (const id of Object.values(CURATOR_DEFAULTS)) {
    const model = models.find((entry) => entry.id === id);
    if (model && model.category !== 'image_generation' && model.outputModality !== 'image' && hasKey(model.provider)) return model;
  }
  return null;
}

/** The request for one group: what to do with notes that say the same or disagree, and the answer's shape. */
export function buildGroupPrompt({ group, now = new Date().toISOString() }) {
  return [
    'You tidy the long-term memory of a chat assistant. Below is a group of notes about the user that may say the same thing or may contradict each other. Each line is: id, the day it was last seen, the text.',
    'Decide for THIS group only, with these operations:',
    '- merge: notes that say the same thing. Give ONE sentence, in the language of the notes, that holds all of what they say and nothing else. {"type":"merge","ids":["a","b"],"text":"...","keywords":["..."]}',
    '- supersede: two notes about the same thing that disagree. The one seen later is the one that holds. {"type":"supersede","keep":"id of the later","drop":"id of the earlier"}',
    '- keep: they are different facts. Leave them as they are. {"type":"keep"}',
    'Never add a fact that is not in the notes. Never merge notes about different things. When in doubt, keep.',
    'Answer with JSON only: {"ops":[...]}. An empty list means keep everything.',
    `Today is ${String(now).slice(0, 10)}.`,
    '',
    'Example. Notes: "n1 2026-03-02 The user lives in Taipei" / "n2 2026-08-15 The user lives in Taichung". Answer: {"ops":[{"type":"supersede","keep":"n2","drop":"n1"}]}',
    'Example. Notes: "n1 2026-05-01 The user likes short answers" / "n2 2026-06-01 The user wants brief replies". Answer: {"ops":[{"type":"merge","ids":["n1","n2"],"text":"The user prefers short answers","keywords":["short","brief","answers"]}]}',
    'Example. Notes: "n1 2026-05-01 The user has a dog named Momo" / "n2 2026-05-02 The user has a cat named Lulu". Answer: {"ops":[{"type":"keep"}]}',
    '',
    'The notes:',
    ...group.map((note) => `- ${note.id} ${String(note.observedAt).slice(0, 10)} ${note.text}`),
    '',
    'Answer:'
  ].join('\n');
}

/** The operations in what the model said (it may wrap the JSON in words or a fence): in the shape checkGroupOps takes; anything else is dropped. */
export function parseGroupOps(output) {
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
    .filter((entry) => entry && typeof entry === 'object' && ['merge', 'supersede', 'keep'].includes(entry.type))
    .slice(0, 5)
    .map((entry) => ({
      type: entry.type,
      ids: Array.isArray(entry.ids) ? entry.ids.filter((id) => typeof id === 'string') : [],
      text: typeof entry.text === 'string' ? entry.text : '',
      keywords: normalizeKeywords(entry.keywords),
      keep: typeof entry.keep === 'string' ? entry.keep : '',
      drop: typeof entry.drop === 'string' ? entry.drop : ''
    }));
}

/** The operations cut into groups whose JSON is small enough for one row. */
function chunkOps(ops) {
  const groups = [];
  let current = [];
  let size = 0;
  for (const op of ops) {
    const bytes = JSON.stringify(op).length;
    if (current.length && size + bytes > CONSOLIDATE.eventBytes) {
      groups.push(current);
      current = [];
      size = 0;
    }
    current.push(op);
    size += bytes;
  }
  if (current.length) groups.push(current);
  return groups;
}

/**
 * Runs the tidy if it is due (or `force`). `settings.consolidatedAt` is when it last ran; `claim(at)` is told the tidy is starting (it saves that time, so another device or the server
 * does not start one too); `commit({ notes, events })` saves the result (the notes, and the events that let it be undone); `callModel(prompt)` gives the model's text (null: the first layer only). The model is not used when the person
 * switched learning off. Never throws. Resolves { ran, skipped?, notes, changed, events, summary, rejected, asked, failures, error? }.
 */
export async function runConsolidation({ notes, settings = {}, callModel = null, claim = null, commit, createId, now = () => new Date().toISOString(), force = false, deadlineAt = Infinity, clock = Date.now }) {
  const nothing = (skipped, extra = {}) => ({ ran: false, skipped, notes, changed: [], events: [], summary: {}, rejected: [], asked: 0, failures: 0, ...extra });
  const lastRunAt = settings.consolidatedAt || null;
  const changedSince = notes.filter((note) => isActive(note) && time(note.updatedAt) > time(lastRunAt)).length;
  if (!notes.some(isActive)) return nothing('empty');
  if (!force && !shouldConsolidate({ notes, lastRunAt, changedSince, now })) return nothing('not_due');
  const at = now();
  const fixed = () => at;
  try {
    await claim?.(at);
  } catch (error) {
    return nothing('claim_failed', { error: String(error?.message || error).slice(0, 200) });
  }
  const before = new Map(notes.map((note) => [note.id, note]));
  const first = layerOne(notes, fixed);
  let next = first.notes;
  const actions = [...first.actions];
  const rejected = [];
  let asked = 0;
  let failures = 0;
  if (typeof callModel === 'function' && settings.learn !== false) {
    for (const group of suspectGroups(next, { maxGroups: CONSOLIDATE.maxGroups })) {
      if (clock() >= deadlineAt || failures >= CONSOLIDATE.modelFailures) break;
      let output;
      try {
        output = await callModel(buildGroupPrompt({ group, now: at }));
      } catch {
        failures += 1;
        continue;
      }
      asked += 1;
      const checked = checkGroupOps(group, parseGroupOps(output));
      rejected.push(...checked.rejected);
      const applied = applyGroupOps(next, checked.ops, fixed);
      next = applied.notes;
      actions.push(...applied.actions);
    }
  }
  // A note joined into another is not thrown away: it is archived, with a pointer to the note that took its place.
  const kept = new Set(next.map((note) => note.id));
  const survivorOf = (id) => {
    for (const action of actions) {
      const survivor = action.ids.includes(id) ? action.ids.find((other) => other !== id && kept.has(other)) : null;
      if (survivor) return survivor;
    }
    return null;
  };
  const joined = notes.filter((note) => !kept.has(note.id)).map((note) => ({ ...note, status: NOTE_STATUS.archived, archivedReason: 'merged', standing: false, supersededBy: survivorOf(note.id), updatedAt: at }));
  const result = [...next, ...joined];
  const changed = changedNotes(before, result);
  const summary = {};
  const typeOf = new Map();
  for (const action of actions) {
    summary[action.type] = (summary[action.type] || 0) + 1;
    for (const id of action.ids) if (!typeOf.has(id)) typeOf.set(id, action.type);
  }
  const events = chunkOps(changed.slice(0, CONSOLIDATE.maxOps).map((note) => ({ action: 'tidy', why: typeOf.get(note.id) || 'other', noteId: note.id, before: before.get(note.id) || null, after: { id: note.id, text: note.text, observedAt: note.observedAt } })))
    .map((ops, index) => ({ id: createId(), at, conversationId: '', messageId: '', who: 'consolidation', batch: '', summary: index === 0 ? summary : {}, ops }));
  events.forEach((event) => { event.batch = events[0].id; });
  if (changed.length) {
    try {
      await commit({ notes: result, events });
    } catch (error) {
      return { ran: false, skipped: 'commit_failed', notes, changed: [], events: [], summary: {}, rejected, asked, failures, error: String(error?.message || error).slice(0, 200) };
    }
  }
  return { ran: true, notes: result, changed, events, summary, rejected, asked, failures };
}
