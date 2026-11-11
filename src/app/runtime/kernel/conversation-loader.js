// Brings the messages of a conversation into memory when something needs them, and lets go of the ones nobody needs any more
// (docs/superpowers/specs/2026-11-12-on-demand-loading-design.md §3.3). The conversation stays the same object: a stub (kernel/conversation-stub.js)
// is filled in place by `ensureLoaded`, and `trim` empties the ones not used for a while back to stubs, once they are known to be saved.
//
// `getStore()` gives the split workspace store (readConversations, isUnchanged); `getConversations()` the conversations the app holds;
// `normalizeRecord(record)` makes a stored conversation what the app uses (the same normalization the workspace gets at load);
// `inUse(conversation)` says that something is working on it (shown, a reply being made, a research); `stubFlags` is the store's.

import { evictInPlace, hydrateInPlace, isStub } from './conversation-stub.js';

export class ConversationLoadError extends Error {
  constructor(ids, problems) {
    super(`Conversations could not be read: ${ids.join(', ')}`);
    this.name = 'ConversationLoadError';
    this.code = 'conversation-unreadable';
    this.ids = ids;
    this.problems = problems;
  }
}

export function createConversationLoader({
  getStore,
  getConversations,
  normalizeRecord = record => record,
  inUse = () => false,
  stubFlags = null,
  keep = 5,
  now = () => Date.now(),
  logger = console
} = {}) {
  const lastUsed = new Map(); // id -> time, for the conversations this loader filled
  const loading = new Map(); // id -> promise, so one conversation is read once however many ask
  let trimming = null;

  const find = id => (getConversations() || []).find(conversation => conversation?.id === id) || null;

  /** Whether this conversation is only a stub now. */
  const isUnloaded = id => isStub(find(id));

  const touch = id => { if (lastUsed.has(id)) lastUsed.set(id, now()); };

  async function readAndFill(ids) {
    const store = getStore();
    if (!store) throw new ConversationLoadError(ids, [{ reason: 'no-store' }]);
    const { found, problems } = await store.readConversations(ids);
    const failed = [];
    for (const id of ids) {
      const record = found.get(id);
      if (!record) {
        failed.push(id);
        continue;
      }
      const current = find(id);
      if (!current || !isStub(current)) continue; // taken out meanwhile, or filled by someone else
      hydrateInPlace(current, normalizeRecord(record));
      lastUsed.set(id, now());
    }
    if (failed.length) throw new ConversationLoadError(failed, problems);
  }

  /** Resolves when every one of these conversations has its messages in memory. Rejects with ConversationLoadError for the ones that cannot be read. */
  function ensureLoaded(ids) {
    const wanted = [...new Set((Array.isArray(ids) ? ids : [ids]).filter(Boolean))];
    const waits = [];
    const toRead = [];
    for (const id of wanted) {
      if (!isUnloaded(id)) {
        touch(id);
        continue;
      }
      if (loading.has(id)) waits.push(loading.get(id));
      else toRead.push(id);
    }
    if (toRead.length) {
      const promise = readAndFill(toRead);
      for (const id of toRead) loading.set(id, promise);
      const clear = () => { for (const id of toRead) if (loading.get(id) === promise) loading.delete(id); };
      promise.then(clear, clear);
      waits.push(promise);
    }
    return waits.length ? Promise.all(waits).then(() => undefined) : Promise.resolve();
  }

  /** Empties the conversations this loader filled that are not among the `keep` most recently used, not in use, and saved. Returns the ids emptied. */
  async function trim() {
    if (trimming) return trimming;
    trimming = (async () => {
      const store = getStore();
      if (!store) return [];
      const candidates = [...lastUsed.entries()].sort((a, b) => b[1] - a[1]).slice(keep).map(([id]) => id);
      const emptied = [];
      for (const id of candidates) {
        const conversation = find(id);
        if (!conversation) {
          lastUsed.delete(id);
          continue;
        }
        if (isStub(conversation) || inUse(conversation) || conversation.__astraPendingResponse) continue;
        try {
          if (!(await store.isUnchanged(conversation))) continue; // not saved yet: it stays
          if (inUse(conversation) || conversation.__astraPendingResponse) continue; // became busy while it was checked
          evictInPlace(conversation, stubFlags);
          lastUsed.delete(id);
          emptied.push(id);
        } catch (error) {
          logger.warn?.('A conversation could not be checked before it was let go.', error);
        }
      }
      return emptied;
    })();
    const done = () => { trimming = null; };
    trimming.then(done, done);
    return trimming;
  }

  return { ensureLoaded, isUnloaded, touch, trim, tracked: () => [...lastUsed.keys()] };
}
