// On-demand loading of conversations, as the app uses it (docs/superpowers/specs/2026-11-12-on-demand-loading-design.md): the one loader of this tab, what
// asks it for a conversation (`ensureConversationsLoaded`), what tells it a conversation is in use, and the background work that makes the stubs of old
// records and lets go of conversations nobody uses. Without the loader (the feature is off) every conversation is whole already and these do nothing.

import { withWorkspaceStorageExclusive } from '../../sync/workspace-storage-coordinator.js';
import { createConversationLoader } from './conversation-loader.js';
import { conversationStubFlags } from './conversation-stub-flags.js';

let loader = null;
let stopWork = () => {};
const inUseProviders = new Set();

/** The loader of this tab, or null when conversations are not loaded on demand. */
export const getConversationLoader = () => loader;

/** Resolves when these conversations have their messages in memory. A no-op when nothing is on demand. */
export const ensureConversationsLoaded = ids => (loader ? loader.ensureLoaded(ids) : Promise.resolve());

/** Whether this conversation is only a stub (its messages are not in memory). */
export const isConversationUnloaded = id => Boolean(loader && loader.isUnloaded(id));

/** `provider(conversation)` returns true while something works on that conversation (it is shown, a reply or a research is running). Returns a function that removes it. */
export function registerConversationInUse(provider) {
  inUseProviders.add(provider);
  return () => inUseProviders.delete(provider);
}

const idle = () => new Promise(resolve => (typeof globalThis.requestIdleCallback === 'function' ? globalThis.requestIdleCallback(() => resolve(), { timeout: 2000 }) : setTimeout(resolve, 50)));

// Makes the stubs that are missing, a few records at a time while the page is idle (inside the lock that orders this tab's writes with the other tabs').
async function backfillStubs(store, isStopped, logger) {
  for (let round = 0; round < 10000 && !isStopped(); round += 1) {
    let result;
    try {
      result = await withWorkspaceStorageExclusive(() => store.backfillStubs({ limit: 8 }));
    } catch (error) {
      logger.warn?.('The stubs of the stored conversations could not be made.', error);
      return;
    }
    if (!result.written || !result.remaining) return;
    await idle();
  }
}

/**
 * Starts the loader for the conversations the app holds. `normalizeRecord` makes a stored conversation what the app uses. Returns { loader, stop }.
 */
export function startOnDemandLoading({ store, appDataStore, normalizeRecord, keep = 5, trimEveryMs = 60_000, logger = console, setInterval: setTimer = globalThis.setInterval, clearInterval: clearTimer = globalThis.clearInterval } = {}) {
  stopWork();
  let stopped = false;
  loader = createConversationLoader({
    getStore: () => store,
    getConversations: () => appDataStore.getConversations(),
    normalizeRecord,
    inUse: conversation => [...inUseProviders].some(provider => provider(conversation)),
    stubFlags: conversationStubFlags,
    keep,
    logger
  });
  const timer = trimEveryMs > 0 ? setTimer(() => { loader?.trim().catch(error => logger.warn?.('Conversations could not be let go.', error)); }, trimEveryMs) : null;
  void backfillStubs(store, () => stopped, logger);
  const current = loader;
  stopWork = () => {
    stopped = true;
    if (timer != null) clearTimer(timer);
    if (loader === current) loader = null;
  };
  return { loader: current, stop: stopWork };
}

export const stopOnDemandLoading = () => stopWork();
