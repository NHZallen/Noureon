// Building the memory again from the old conversations, as the settings use it (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §4.9; the reading itself is src/data/memory-rebuild.js).
// One run at a time: it can be started (over what is there, or with the notes cleared first), paused, and carried on further back (the next 30). Progress is told to whoever listens. The model
// of each conversation is chosen as for the curator after a reply: the person's choice, the cheap model of the provider of the conversation's model, or that model itself.

import { pickCuratorModel } from '../../../data/memory-curator.js';
import { REBUILD, pickConversations, rebuildFromHistory } from '../../../data/memory-rebuild.js';
import { tidyNotes } from './page-tidy.js';

// `serverRebuild` ({ canUse(), start({ modelId, key, language }), stop() }) lets the server make the first build, so that it goes on when the page is closed (server/memory-rebuild.js).
export function createRebuildController({ getStore, getConversations, getConfig, getModelRunner, models, getApiKeyForProvider, serverRebuild = null, createId = () => globalThis.crypto.randomUUID(), now = () => new Date().toISOString(), logger = console }) {
  const listeners = new Set();
  let state = { status: 'idle', done: 0, total: 0, added: 0, skip: 0, error: '' };
  let stopRequested = false;
  const set = (patch) => {
    state = { ...state, ...patch };
    for (const listener of [...listeners]) { try { listener(state); } catch { /* A broken listener must not stop the others. */ } }
    return state;
  };

  // The job the server makes (its state is in the memory settings, so every page of the person sees it). One that has not written for two minutes lost its server: it shows as interrupted.
  const SERVER_STALE_MS = 120_000;
  const serverState = () => {
    const job = getStore()?.getSettings?.()?.rebuildJob;
    if (!job) return null;
    const stale = job.status === 'running' && Date.now() - (Date.parse(job.updatedAt || '') || 0) > SERVER_STALE_MS;
    const status = stale ? 'error' : { running: 'running', done: 'done', stopped: 'paused', failed: 'error' }[job.status];
    return { status, done: job.done, total: job.total, added: job.added, skip: 0, error: stale ? 'interrupted' : job.error, onServer: true };
  };
  let storeWatch = null;
  const watchStore = () => {
    if (storeWatch || !getStore()?.subscribe) return;
    storeWatch = getStore().subscribe(() => { for (const listener of [...listeners]) { try { listener(serverState() || state); } catch { /* A broken listener must not stop the others. */ } } });
  };
  // The model that reads and the key of its provider, chosen as the page's own run chooses; null when there is none.
  const readerForServer = (store) => {
    const current = models.find((model) => model.id === getConfig()?.memoryModelId);
    const model = pickCuratorModel({ settingsId: store.getSettings().curatorModelId, current, models, hasKey: (provider) => Boolean(getApiKeyForProvider(provider)) });
    return model ? { modelId: model.id, key: getApiKeyForProvider(model.provider) } : null;
  };
  /** Starts the build on the server when it can (an account in the cloud, the first build, a model with a key). Resolves true when the server took it. */
  async function startOnServer() {
    const store = getStore();
    if (!serverRebuild?.canUse?.() || !store?.isLoaded()) return false;
    const reader = readerForServer(store);
    if (!reader) return false;
    const answer = await serverRebuild.start({ ...reader, language: getConfig()?.uiLanguage || 'en' });
    return Boolean(answer?.ok) || answer?.reason === 'already_running';
  }

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
    getState: () => (state.status === 'running' ? state : serverState() || state),
    subscribe(listener) {
      listeners.add(listener);
      watchStore();
      return () => listeners.delete(listener);
    },
    /** How many conversations there are to read (the newest 30 are read at a time). */
    available: (skip = 0) => pickConversations(getConversations(), { skip, limit: REBUILD.conversations }).length,
    /** Reads the newest conversations; `clearFirst` empties the notes before (what the person deleted stays deleted). */
    start: async ({ clearFirst = false } = {}) => {
      // Adding to the notes (not clearing them) can be left to the server; anything else, and a server that does not take it, is made here.
      if (!clearFirst && await startOnServer()) return serverState() || state;
      return run({ clearFirst, skip: 0 });
    },
    /** The 30 conversations before the ones already read. */
    older: () => run({ clearFirst: false, skip: state.skip + REBUILD.conversations }),
    pause() {
      stopRequested = true;
      if (serverState()?.status === 'running') void serverRebuild?.stop?.();
    },
    /**
     * The first time (an account whose memory was never built and has no notes at all, with learning on and a model to read with): builds it from the newest conversations without being asked,
     * once for the account. The time is written first, so that another device or page does not start it too, and a person who clears the notes is not started again. Resolves true when it started.
     */
    async maybeAutoStart() {
      const store = getStore();
      if (!store?.isLoaded() || state.status === 'running') return false;
      const settings = store.getSettings();
      if (!settings.use || !settings.learn || settings.paused || settings.rebuiltAt || store.getNotes().length) return false;
      if (!pickConversations(getConversations(), { limit: REBUILD.conversations }).length) return false;
      if (typeof getModelRunner() !== 'function') return false;
      const current = models.find((model) => model.id === getConfig()?.memoryModelId);
      if (!pickCuratorModel({ settingsId: settings.curatorModelId, current, models, hasKey: (provider) => Boolean(getApiKeyForProvider(provider)) })) return false;
      await store.setSettings({ rebuiltAt: now() });
      if (await startOnServer()) return true;
      void run({ clearFirst: false, skip: 0 });
      return true;
    },
    /** Tidies the notes now, whatever the schedule says (the settings button). Resolves the result of the tidy. */
    tidyNow: () => tidyNotes({ store: getStore(), getConfig, getRunner: getModelRunner, models, getApiKeyForProvider, createId, now, force: true, logger })
  };
}
