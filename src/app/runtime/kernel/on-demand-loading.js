// On-demand loading of conversations, as the app uses it (docs/superpowers/specs/2026-11-12-on-demand-loading-design.md): the one loader of this tab, what
// asks it for a conversation (`ensureConversationsLoaded`), what tells it a conversation is in use, and the background work that makes the stubs of old
// records and lets go of conversations nobody uses. Without the loader (the feature is off) every conversation is whole already and these do nothing.

import { withWorkspaceStorageExclusive } from '../../sync/workspace-storage-coordinator.js';
import { createConversationLoader } from './conversation-loader.js';
import { conversationStubFlags } from './conversation-stub-flags.js';
import { isStub } from './conversation-stub.js';

let loader = null;
let stopWork = () => {};
const inUseProviders = new Set();

/** The loader of this tab, or null when conversations are not loaded on demand. */
export const getConversationLoader = () => loader;

/** Resolves when these conversations have their messages in memory. A no-op when nothing is on demand. */
export const ensureConversationsLoaded = ids => (loader ? loader.ensureLoaded(ids) : Promise.resolve());

/**
 * Calls `visit(conversation, messages)` for each of these conversations, a batch at a time, without keeping the messages of the ones that are stubs. The way to
 * read "every conversation" (search, statistics, exports): the memory it holds is one batch, not the whole workspace. Without on-demand loading it is a plain loop.
 * Resolves false when `shouldStop()` ended it early.
 */
export async function forEachConversationMessages(conversations, visit, options = {}) {
  if (loader) return loader.scanMessages(conversations, visit, options);
  for (const conversation of Array.isArray(conversations) ? conversations : []) {
    if (options.shouldStop?.()) return false;
    // (A stub with no loader to read it cannot be read: its empty messages must not be taken for the conversation's.)
    if (isStub(conversation)) throw new Error('A conversation kept as a stub cannot be read without the loader.');
    visit(conversation, conversation.messages || []);
  }
  return true;
}

/** `pick(message)` for every message of these conversations (what a statistic needs of them), read a batch at a time. */
export async function collectFromMessages(conversations, pick, options = {}) {
  const collected = [];
  const finished = await forEachConversationMessages(conversations, (conversation, messages) => {
    for (const message of messages) collected.push(pick(message, conversation));
  }, options);
  return finished ? collected : null;
}

/** Whether this conversation is only a stub (its messages are not in memory). */
export const isConversationUnloaded = id => Boolean(loader && loader.isUnloaded(id));

/** `provider(conversation)` returns true while something works on that conversation (it is shown, a reply or a research is running). Returns a function that removes it. */
export function registerConversationInUse(provider) {
  inUseProviders.add(provider);
  return () => inUseProviders.delete(provider);
}

const pinned = new Set();

/** A conversation a reply is being written into stays in memory until the reply is over, whichever conversation is shown meanwhile. */
export const pinConversation = id => { if (id != null) pinned.add(id); };
export const unpinConversation = id => { pinned.delete(id); };

let pinnedForReply = null;
/** Called as a reply starts and ends: the conversation shown when it starts is kept in memory until it ends. */
export function setReplyPin(isGenerating, activeId) {
  if (isGenerating && pinnedForReply === null) {
    pinnedForReply = activeId ?? null;
    pinConversation(pinnedForReply);
  } else if (!isGenerating && pinnedForReply !== null) {
    unpinConversation(pinnedForReply);
    pinnedForReply = null;
  }
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
    inUse: conversation => pinned.has(conversation.id) || [...inUseProviders].some(provider => provider(conversation)),
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
