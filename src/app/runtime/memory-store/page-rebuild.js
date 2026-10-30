// Building the memory again from the old conversations, as the settings use it (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §4.9; the reading itself is src/data/memory-rebuild.js).
// One run at a time: it can be started (over what is there, or with the notes cleared first), paused, and carried on further back (the next 30). Progress is told to whoever listens. The model
// of each conversation is chosen as for the curator after a reply: the person's choice, the cheap model of the provider of the conversation's model, or that model itself.

import { pickCuratorModel } from '../../../data/memory-curator.js';
import { REBUILD, pickConversations, rebuildFromHistory } from '../../../data/memory-rebuild.js';
import { tidyNotes } from './page-tidy.js';

export function createRebuildController({ getStore, getConversations, getConfig, getModelRunner, models, getApiKeyForProvider, createId = () => globalThis.crypto.randomUUID(), now = () => new Date().toISOString(), logger = console }) {
  const listeners = new Set();
  let state = { status: 'idle', done: 0, total: 0, added: 0, skip: 0, error: '' };
  let stopRequested = false;
  const set = (patch) => {
    state = { ...state, ...patch };
    for (const listener of [...listeners]) { try { listener(state); } catch { /* A broken listener must not stop the others. */ } }
    return state;
  };

  const callModel = (store) => async (prompt, conversation) => {
    const runner = getModelRunner();
    if (typeof runner !== 'function') throw new Error('The model for the memory is not ready.');
    const settings = store.getSettings();
    const current = models.find((model) => model.id === conversation.model) || models.find((model) => model.id === getConfig()?.memoryModelId);
    const model = pickCuratorModel({ settingsId: settings.curatorModelId, current, models, hasKey: (provider) => Boolean(getApiKeyForProvider(provider)) });
    if (!model) throw new Error('There is no model with a key to read the conversations with.');
    return runner({ modelId: model.id, prompt });
  };

  async function run({ clearFirst, skip }) {
    const store = getStore();
    if (!store?.isLoaded()) return set({ status: 'error', error: 'not_loaded' });
    if (state.status === 'running') return state;
    stopRequested = false;
    set({ status: 'running', done: 0, total: pickConversations(getConversations(), { skip }).length, added: skip ? state.added : 0, skip, error: '' });
    try {
      const baseAdded = skip ? state.added : 0;
      const result = await rebuildFromHistory({
        conversations: getConversations(),
        store,
        callModel: callModel(store),
        skip,
        clearFirst,
        shouldStop: () => stopRequested,
        onProgress: (progress) => set({ done: progress.done, total: progress.total, added: baseAdded + progress.added }),
        createId,
        now
      });
      set({ status: result.error ? 'error' : result.stopped ? 'paused' : 'done', done: result.done, total: result.total, added: baseAdded + result.added, error: result.error || '' });
    } catch (error) {
      logger.warn?.('Building the memory from the old conversations failed.', error);
      set({ status: 'error', error: String(error?.message || error).slice(0, 200) });
    }
    return state;
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** How many conversations there are to read (the newest 30 are read at a time). */
    available: (skip = 0) => pickConversations(getConversations(), { skip, limit: REBUILD.conversations }).length,
    /** Reads the newest conversations; `clearFirst` empties the notes before (what the person deleted stays deleted). */
    start: ({ clearFirst = false } = {}) => run({ clearFirst, skip: 0 }),
    /** The 30 conversations before the ones already read. */
    older: () => run({ clearFirst: false, skip: state.skip + REBUILD.conversations }),
    pause() {
      stopRequested = true;
    },
    /** Tidies the notes now, whatever the schedule says (the settings button). Resolves the result of the tidy. */
    tidyNow: () => tidyNotes({ store: getStore(), getConfig, getRunner: getModelRunner, models, getApiKeyForProvider, createId, now, force: true, logger })
  };
}
