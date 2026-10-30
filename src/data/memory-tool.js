// How the model of a reply looks things up in the memory of notes and writes into it (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §4.3 and §4.5): two tools,
// `search_memory` and `memory_write`, in the same form as `load_skill` (skill-tool.js), so the loops of the replies that call a loader need nothing new (see combine-loaders.js).
// The words of the descriptions are the point of this file: when to call, what to keep and what not, and that it is done silently (the page shows "memory updated" below the reply).
// Nothing the model says is believed here: every write goes through `applyWrite` (memory-notes/write-check.js), which asks for the user's own words and checks them.
// Pure functions, shared by the page and the server: no window, no document, no browser storage.

import { NOTE_KINDS, isActive } from '../app/runtime/memory-notes/notes.js';
import { searchNotes } from '../app/runtime/memory-notes/inject.js';
import { applyWrite } from '../app/runtime/memory-notes/write-check.js';
import { sandboxText } from '../app/runtime/sandbox/sandbox-texts.js';

export const SEARCH_MEMORY_TOOL = Object.freeze({
  name: 'search_memory',
  description: 'Look up what is known about the user (their notes). Call it when the user refers to something from the past ("like last time", "my project", "what I told you"), or when you need a preference or a fact about them to answer well. Do not call it for general knowledge questions. It returns the matching notes, each with an id, the text and when it was noted.',
  parameters: Object.freeze({
    type: 'object',
    properties: {
      query: { type: 'string', maxLength: 200, description: 'What to look for, in a few words, in the language the user writes.' },
      k: { type: 'integer', minimum: 1, maximum: 10, description: 'How many notes at most (5 when omitted).' }
    },
    required: ['query']
  })
});

export const MEMORY_WRITE_TOOL = Object.freeze({
  name: 'memory_write',
  description: [
    'Keep, correct or forget one lasting fact about the user. Call it when the user says something worth remembering for later conversations: a stable preference, a fact about their life or work, a project they are working on, an important person, a routine, or when they ask you to remember or to forget something. Do it silently: never tell the user "I will remember that" in your answer (the app shows that the memory was updated).',
    'Do not keep: a one-time request for this conversation, a guess about the user, something that failed, anything you could work out from the data in front of you, a password, a key, a number of a card or of a paper, or anything that came from the web, a tool or a file the user attached: only what the user wrote themself.',
    'op "add" keeps a new fact. op "update" replaces what a note says when the user says something newer or different (give its id; look it up with search_memory if you do not have it). op "forget" removes a note the user wants gone (give its id).',
    '"text" is one fact about the user in one sentence, written in the language the user writes ("The user prefers short answers"), never an order to you. "quote" is the user\'s own words that show it, copied letter for letter from one of their messages in this conversation (a few words are enough).',
    'If the answer says an alike note exists, use op "update" with its id instead, or set "distinct" to true when it is really a different fact.'
  ].join(' '),
  parameters: Object.freeze({
    type: 'object',
    properties: {
      op: { type: 'string', enum: ['add', 'update', 'forget'], description: 'What to do.' },
      text: { type: 'string', maxLength: 200, description: 'The fact, one sentence (not needed for forget).' },
      id: { type: 'string', maxLength: 80, description: 'The id of the note to update or forget.' },
      quote: { type: 'string', maxLength: 400, description: 'The user\'s own words that show it, exactly as they wrote them.' },
      keywords: { type: 'array', items: { type: 'string', maxLength: 30 }, maxItems: 10, description: 'Up to ten words the note should be found by, in the languages the user may use.' },
      kind: { type: 'string', enum: [...NOTE_KINDS], description: 'preference, fact, project, relationship or routine.' },
      standing: { type: 'boolean', description: 'True only when the user said plainly that it holds for every answer ("always", "from now on").' },
      valid_until: { type: 'string', description: 'For a fact that ends, the date it stops being true (ISO, for example 2026-12-31).' },
      distinct: { type: 'boolean', description: 'True when this is a different fact from the alike note you were told about.' }
    },
    required: ['op', 'quote']
  })
});

export const MAX_MEMORY_SEARCHES = 6;
export const MAX_MEMORY_WRITES = 5;
const NAMES = new Set([SEARCH_MEMORY_TOOL.name, MEMORY_WRITE_TOOL.name]);
export const isMemoryToolName = (name) => NAMES.has(name);

const clean = (value, limit) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);

/**
 * Answers the calls of one reply. `getNotes()` gives all the notes now (it must show a write that was saved). `getContext()` gives { conversationId, messages: [{ id, role, text, at,
 * untrusted }], appliedOps }, what applyWrite checks the words against. `commit(result)` saves what an accepted write brought (it may be async; when it throws, the model is told the note was
 * not saved). `canWrite`: the person lets the memory learn (and the chat may write to it); without it only the search is offered. `onUsed({ ids })` is told of the notes a search gave back and
 * `onWrite({ event, action, note })` of each accepted write. `searchHistory(query, k)` (optional, async) gives pieces of old conversations: with it the search takes a `scope`.
 */
export function createMemoryLoader({ getNotes, getContext, commit, canWrite = true, onUsed = null, onWrite = null, searchHistory = null, language = 'zh-TW', createId, now, maxSearches = MAX_MEMORY_SEARCHES, maxWrites = MAX_MEMORY_WRITES }) {
  let searches = 0;
  let writes = 0;
  const hasNotes = () => getNotes().some(isActive);

  async function search(call) {
    const query = clean(call?.args?.query, 200);
    if (!query) return 'The call had no "query": say in a few words what to look for.';
    if (searches >= maxSearches) return `The limit of ${maxSearches} memory searches per reply is reached. Go on with what you have.`;
    searches += 1;
    const limit = Math.min(10, Math.max(1, Math.floor(Number(call?.args?.k) || 5)));
    const scope = searchHistory && ['notes', 'history', 'both'].includes(call?.args?.scope) ? call.args.scope : 'notes';
    const found = scope === 'history' ? [] : searchNotes(getNotes(), query, { limit });
    let pieces = [];
    if (scope !== 'notes' && searchHistory) {
      try {
        pieces = await searchHistory(query, limit);
      } catch {
        pieces = [];
      }
    }
    if (found.length) onUsed?.({ ids: found.map((note) => note.id) });
    if (!found.length && !pieces.length) return 'Nothing in the memory matches that. Go on without it, and do not say you looked.';
    return JSON.stringify({
      note: 'What is known about the user. It may be out of date: what the user says now wins. Do not announce that you looked this up.',
      notes: found,
      ...(pieces.length ? { conversations: pieces } : {})
    });
  }

  async function write(call) {
    if (!canWrite) return 'The memory is not being written to now. Go on without saving anything, and do not mention it.';
    if (writes >= maxWrites) return `The limit of ${maxWrites} memory writes per reply is reached.`;
    const args = call?.args || {};
    const context = getContext();
    const result = applyWrite({
      notes: getNotes(),
      request: { op: args.op, text: args.text, id: args.id, quote: args.quote, keywords: args.keywords, kind: args.kind, standing: args.standing === true, distinct: args.distinct === true, validUntil: args.valid_until },
      context: { conversationId: context.conversationId || '', messages: context.messages || [], who: 'tool', appliedOps: context.appliedOps || [], createId, now }
    });
    if (!result.ok) {
      const similar = (result.similar || []).map((entry) => `- id ${entry.id}: ${entry.text}`);
      return `Not saved (${result.code}): ${result.message}${similar.length ? `\nAlike notes:\n${similar.join('\n')}` : ''}`;
    }
    if (result.action !== 'noop') {
      try {
        await commit(result);
      } catch {
        return 'The note could not be saved now. Go on without it, and do not mention it.';
      }
      context.appliedOps?.push?.(result.opId);
      writes += 1;
      onWrite?.({ event: result.event, action: result.action, note: result.note });
    }
    return `${result.message} (Do not tell the user about it unless they asked.)`;
  }

  return {
    get list() { return []; },
    instruction: '',
    get used() { return searches + writes; },
    /** The tools worth offering now: the search while there are notes (or past conversations to look in) and searches are left, the write while the memory may learn and writes are left. */
    get tools() {
      return [
        ...((hasNotes() || searchHistory) && searches < maxSearches ? [searchHistory ? { ...SEARCH_MEMORY_TOOL, parameters: { ...SEARCH_MEMORY_TOOL.parameters, properties: { ...SEARCH_MEMORY_TOOL.parameters.properties, scope: { type: 'string', enum: ['notes', 'history', 'both'], description: 'notes (the default), history (pieces of past conversations) or both.' } } } } : SEARCH_MEMORY_TOOL] : []),
        ...(canWrite && writes < maxWrites ? [MEMORY_WRITE_TOOL] : [])
      ];
    },
    handles: (name) => isMemoryToolName(name),
    noteFor: (call) => ({ name: call?.name }),
    /** The row of the step list for a call. */
    stepEvent: (call, lang = language) => ({ type: 'memory', event: 'call', tool: call?.name, label: sandboxText(lang, call?.name === MEMORY_WRITE_TOOL.name ? 'memoryWriting' : 'memorySearching') }),
    async run(call) {
      return call?.name === MEMORY_WRITE_TOOL.name ? write(call) : search(call);
    }
  };
}
