// The memory of notes as the page uses it (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §4.2 and §8 P3): one store for the account that is signed in
// (the database of the account, or the browser's storage for an account that is only local), loaded when the page knows who it is, and what the model is given from it
// for a message: the first page for the system instructions, and the slip that goes after the message.
//
// Nothing here may break a reply. A store that cannot be read (the table is not there, the network is down) leaves the memory empty for this page: `contextFor` then
// gives nothing and the reply goes on without notes. `contextFor` is synchronous (it reads what is held in memory); loading and writing are not.
// No `window`, no `document`: the page gives the storage and the database client.

import { buildPrefetch, buildSystemText } from '../memory-notes/inject.js';
import { isActive } from '../memory-notes/notes.js';
import { createCloudBackend, createLocalBackend } from './backends.js';
import { createNotesStore } from './notes-store.js';

const EMPTY = Object.freeze({ systemText: '', slipText: '', noteIds: [], historyIds: [] });
const LOCAL_KEY = (who) => `noureon.memoryNotes.v1.${who}`;

/**
 * `getSupabase()` gives the database client (or null), `storage` is { getItem, setItem } of the browser. Returns the memory: `attach(user)`, `contextFor(...)`,
 * `markUsed(ids)`, `getStore()`, `isReady()`, `onChange(listener)`.
 */
export function createNotesMemory({ getSupabase = () => null, storage = null, now = () => new Date().toISOString(), logger = console } = {}) {
  let store = null;
  let who = '';
  let attaching = null;
  const listeners = new Set();

  const open = async (user) => {
    const userId = String(user?.supabaseUserId || '');
    const name = String(user?.username || '');
    const supabase = userId ? getSupabase() : null;
    let backend = null;
    if (supabase) backend = createCloudBackend({ supabase, userId, logger });
    else if (storage && name) backend = createLocalBackend({ storage, key: LOCAL_KEY(name), now });
    if (!backend) return null;
    const next = createNotesStore({ backend, now, logger });
    await next.load();
    next.subscribe(() => { for (const listener of [...listeners]) { try { listener(); } catch (error) { logger.warn?.('A memory listener failed.', error); } } });
    return next;
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
        .then((opened) => { store = opened; return store; })
        .catch((error) => {
          logger.warn?.('The memory of notes could not be read; replies go on without it.', error);
          store = null;
          return null;
        })
        .finally(() => { attaching = null; for (const listener of [...listeners]) { try { listener(); } catch { /* A broken listener must not stop the others. */ } } });
      return attaching;
    },
    isReady: () => Boolean(store?.isLoaded()),
    getStore: () => store,
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /**
     * What the model is given for a message: `{ systemText, slipText, noteIds, historyIds }`, all empty when the memory is not loaded, the person switched the use of
     * memory off, or there is nothing to say. `history` is the pieces of old conversation that bear on the question (P5).
     */
    contextFor({ question = '', canSearch = false, history = [] } = {}) {
      if (!store?.isLoaded()) return EMPTY;
      const settings = store.getSettings();
      if (!settings.use) return EMPTY;
      const notes = store.getNotes();
      if (!notes.some(isActive)) return EMPTY;
      const systemText = buildSystemText({ notes, canSearch });
      const slip = buildPrefetch({ notes, question, history });
      return { systemText, slipText: slip.text, noteIds: slip.noteIds, historyIds: slip.historyIds };
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

let shared = null;

/** The memory of this page: made once, by the code that starts it (see start-notes-memory.js); the request code only asks for it. */
export const getNotesMemory = () => shared;
export const setNotesMemory = (memory) => { shared = memory; return shared; };
