// The memory of notes as the page uses it (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §4.2 and §8 P3): one store for the account that is signed in
// (the database of the account, or the browser's storage for an account that is only local), loaded when the page knows who it is, and what the model is given from it
// for a message: the first page for the system instructions, and the slip that goes after the message.
//
// Nothing here may break a reply. A store that cannot be read (the table is not there, the network is down) leaves the memory empty for this page: `contextFor` then
// gives nothing and the reply goes on without notes. `contextFor` is synchronous (it reads what is held in memory); loading and writing are not.
// No `window`, no `document`: the page gives the storage and the database client.

import { buildPrefetch, buildSystemText } from '../memory-notes/inject.js';
import { isActive } from '../memory-notes/notes.js';
import { notesInScope } from '../memory-notes/scope.js';
import { createCloudBackend, createLocalBackend, createMirroredBackend } from './backends.js';
import { carriedNotes, clearCarried, joinCarried } from './notes-carry.js';
import { createNotesStore } from './notes-store.js';

const EMPTY = Object.freeze({ systemText: '', slipText: '', noteIds: [], historyIds: [] });
const LOCAL_KEY = (who) => `noureon.memoryNotes.v1.${who}`;
// The copy of the notes of a cloud account kept in the browser, for when the database cannot be reached.
const MIRROR_KEY = (userId) => `noureon.memoryNotes.mirror.v1.${userId}`;

/**
 * `getSupabase()` gives the database client (or null), `storage` is { getItem, setItem } of the browser. Returns the memory: `attach(user)`, `contextFor(...)`,
 * `markUsed(ids)`, `getStore()`, `isReady()`, `onChange(listener)`.
 */
export function createNotesMemory({ getSupabase = () => null, storage = null, now = () => new Date().toISOString(), logger = console } = {}) {
  let store = null;
  let who = '';
  let attaching = null;
  let failed = false;
  const listeners = new Set();
  // (question, { excludeConversationId }) -> pieces of past conversations that bear on it (memory-notes/history-index.js), set by the page; none by default.
  let historySearch = null;
  let historyMeaning = null;

  const open = async (user) => {
    const userId = String(user?.supabaseUserId || '');
    const name = String(user?.username || '');
    const supabase = userId ? getSupabase() : null;
    let backend = null;
    if (supabase) {
      const remote = createCloudBackend({ supabase, userId, logger });
      backend = storage ? createMirroredBackend({ remote, storage, key: MIRROR_KEY(userId), now, logger }) : remote;
    }
    else if (storage && name) backend = createLocalBackend({ storage, key: LOCAL_KEY(name), now });
    if (!backend) return null;
    const next = createNotesStore({ backend, now, logger });
    await next.load();
    // The notes of the local account that was linked to this cloud account join its memory (notes-carry.js).
    if (supabase && storage && name) {
      const carried = carriedNotes({ name, storage, now });
      if (carried.length) {
        await next.commitNotes(joinCarried(next.getNotes(), carried));
        clearCarried({ name, storage });
      }
    }
    next.subscribe(() => { for (const listener of [...listeners]) { try { listener(); } catch (error) { logger.warn?.('A memory listener failed.', error); } } });
    return next;
  };

  // The slip and the system text for a message. `meaningPieces` (from the search by meaning) stand in for the keyword hits of the past conversations when given.
  const compose = ({ question = '', canSearch = false, excludeConversationId = '', scopeId = '', projectId = '' }, meaningPieces) => {
    if (!store?.isLoaded()) return EMPTY;
    const settings = store.getSettings();
    if (!settings.use) return EMPTY;
    // A chat of a project that keeps its notes for itself reads those only; every other chat leaves them out (memory-notes/scope.js).
    const notes = notesInScope(store.getNotes(), scopeId);
    let history = meaningPieces || [];
    if (!meaningPieces) {
      try {
        history = historySearch ? historySearch(question, { excludeConversationId, scopeId, projectId }) : [];
      } catch (error) {
        logger.warn?.('The history could not be searched.', error);
      }
    }
    // No notes and nothing of the past that bears on the question: nothing to say. (Past conversations alone make a slip.)
    if (!notes.some(isActive) && !history.length) return EMPTY;
    const systemText = buildSystemText({ notes, canSearch });
    const slip = buildPrefetch({ notes, question, history });
    return { systemText, slipText: slip.text, noteIds: slip.noteIds, historyIds: slip.historyIds };
  };

  return {
    /** Loads the memory of the person. Safe to call again for the same person (nothing is read twice) and never throws. */
    attach(user) {
      const key = String(user?.supabaseUserId || user?.username || '');
      if (key && key === who && (store || attaching)) return attaching || Promise.resolve(store);
      store?.stop();
      store = null;
      who = key;
      attaching = open(user)
        .then((opened) => { store = opened; failed = false; return store; })
        .catch((error) => {
          logger.warn?.('The memory of notes could not be read; replies go on without it.', error);
          store = null;
          failed = true;
          return null;
        })
        .finally(() => { attaching = null; for (const listener of [...listeners]) { try { listener(); } catch { /* A broken listener must not stop the others. */ } } });
      return attaching;
    },
    isReady: () => Boolean(store?.isLoaded()),
    /** Resolves the store once the memory has loaded (or null when it could not): a reply waits for this before it decides about the memory tools. */
    ready: () => (attaching ? attaching.then(() => store) : Promise.resolve(store)),
    /** The last try to load the memory failed (the table is missing, the network is down): the part that shows the notes says so. */
    failed: () => failed,
    getStore: () => store,
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /**
     * What the model is given for a message: `{ systemText, slipText, noteIds, historyIds }`, all empty when the memory is not loaded, the person switched the use of
     * memory off, or there is nothing to say. The pieces of old conversation that bear on the question come from the history search the page set.
     */
    /** The page gives the way to look into the past conversations (the index of history); without it the slip holds notes only. */
    setHistorySearch(fn) { historySearch = typeof fn === 'function' ? fn : null; },
    /** The page gives the search by meaning for the slip (page-history.js `meaning`); it is asked only when the keywords found nothing. */
    setHistoryMeaning(fn) { historyMeaning = typeof fn === 'function' ? fn : null; },
    contextFor(options = {}) {
      return compose(options, null);
    },
    /**
     * Like `contextFor`, but when the keywords found no past conversation for the question and the search by meaning is on, it also asks the vectors, waiting at most `waitMs`
     * (the vectors never delay a reply longer than that, and a failure just leaves the slip as `contextFor` made it).
     */
    async contextWithMeaning(options = {}, { waitMs = 700 } = {}) {
      const first = compose(options, null);
      if (first.historyIds.length || !historyMeaning || !store?.isLoaded() || !store.getSettings().use) return first;
      try {
        const found = await historyMeaning(options.question || '', { excludeConversationId: options.excludeConversationId || '', scopeId: options.scopeId || '', projectId: options.projectId || '', waitMs });
        return Array.isArray(found) && found.length ? compose(options, found) : first;
      } catch (error) {
        logger.warn?.('The search by meaning for the slip failed.', error);
        return first;
      }
    },
    /** The notes of the slip were given to the model: when and how often they were used (for fading and for the person to see). Never throws. */
    async markUsed(noteIds) {
      if (!store || !noteIds?.length) return 0;
      try {
        const ids = new Set(noteIds);
        const at = now();
        const next = store.getNotes().map((note) => (ids.has(note.id) && isActive(note) ? { ...note, lastUsedAt: at, recallCount: note.recallCount + 1 } : note));
        return await store.commitNotes(next);
      } catch (error) {
        logger.warn?.('The use of notes could not be recorded.', error);
        return 0;
      }
    }
  };
}
