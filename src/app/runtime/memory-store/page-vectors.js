// The search by meaning on this page (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §4.9, D15). It is OFF until the person turns it on and agrees: only then are the texts of
// their past conversations, and the pictures, videos, sounds and documents they attached, sent to Gemini Embedding 2 (straight, or through OpenRouter, with their own key), and the vectors that
// come back are kept in this browser (vector-store.js) and, when the person also chose to sync them, in their cloud (vector-sync.js). The question of a search is turned into a vector the same way; the pieces of past conversations nearest to it are put together with what the keywords found
// (page-history.js). Without a key, without consent, or when the provider fails, the search just uses the keywords: nothing here may break a reply. Turning it off throws the vectors away.

import { sourceOfPieceId } from '../../../data/project-piece-id.js';
import { fuseRanks, textHash, topByCosine } from '../memory-notes/vector-math.js';
import { createEmbeddingClient, EMBEDDING_PROVIDERS, pickEmbeddingProvider, versionOf } from './embedding-client.js';
import { createVectorSync } from './vector-sync.js';
import { createIdbBackend, createMemoryBackend, createVectorStore } from './vector-store.js';

export const VECTOR = Object.freeze({ minChars: 12, batchTexts: 32, batchChars: 16_000, failures: 3, minCosine: 0.5, slipCosine: 0.6, slipWaitMs: 700, pauseMs: 150, tokensPerChar: 0.4 });

const hashed = (piece) => piece.hash || textHash(piece.text);
// A piece that is a file: its bytes are in it (a file of a message) or come from `loadMedia()` when it is its turn (a picture of a project: the bytes are not all held in memory at once).
const isMedia = (piece) => Boolean(piece.media || piece.loadMedia);

export function createPageVectors({ getStore, getHistory, getProjectPieces = () => null, getApiKeyForProvider = () => '', getCloud = () => null, indexedDB = null, userKey = () => 'local', fetchImpl, now = () => new Date().toISOString(), wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), logger = console, options = {} }) {
  const config = { ...VECTOR, ...options };
  const listeners = new Set();
  let state = { status: 'off', done: 0, total: 0, error: '' };
  let store = null;
  let storeKey = '';
  let running = null;
  let stopRequested = false;
  let again = false;

  const set = (patch) => {
    state = { ...state, ...patch };
    for (const listener of [...listeners]) { try { listener(state); } catch { /* A broken listener must not stop the others. */ } }
    return state;
  };
  const settings = () => getStore()?.getSettings?.()?.vector || { enabled: false, consentAt: null, provider: '', sync: false };
  // A piece of a few words ("Sure.") says nothing a vector could find, so it is not sent. The files of the messages are pieces of their own (one request each).
  const textPieces = () => (getHistory()?.pieces() || []).filter((piece) => piece.text.length >= config.minChars);
  const mediaPieces = () => getHistory()?.mediaPieces?.() || [];
  // The passages of the files of the projects (runtime/projects/project-pieces.js): made from the sources and kept in the same store under `src:` ids. `refresh()` reads what changed.
  const projectPieces = () => (getProjectPieces()?.pieces?.() || []).filter((piece) => piece.text.length >= config.minChars);
  const worth = () => [...textPieces(), ...mediaPieces(), ...projectPieces()];
  const hasKey = (name) => Boolean(getApiKeyForProvider(name));
  const hasKey_ = (name) => hasKey(EMBEDDING_PROVIDERS[name].keyProvider);
  const providerNow = () => pickEmbeddingProvider({ chosen: settings().provider, hasKey });
  // The cloud copy: only for a person signed in to a cloud account who also turned on syncing the vectors; `getCloud()` gives { supabase, userId } or null (a local account).
  const cloudFor = (provider) => {
    const cloud = settings().sync === true ? getCloud() : null;
    return cloud?.supabase && cloud.userId && provider ? createVectorSync({ supabase: cloud.supabase, userId: cloud.userId, model: versionOf(provider) }) : null;
  };
  const enabled = () => settings().enabled === true && Boolean(providerNow());

  async function ensureStore(provider) {
    const key = `${userKey()}|${versionOf(provider)}`;
    if (!store || storeKey !== key) {
      const backend = indexedDB ? createIdbBackend({ indexedDB, name: `noureon-memory-vectors-${userKey()}` }) : createMemoryBackend();
      store = createVectorStore({ backend });
      storeKey = key;
      await store.load(versionOf(provider));
    }
    return store;
  }

  const clientFor = (provider) => createEmbeddingClient({ provider, getApiKey: () => getApiKeyForProvider(EMBEDDING_PROVIDERS[provider].keyProvider), fetchImpl });

  /** Cuts the pieces to build into groups that fit one request. */
  function groups(pieces) {
    const out = [];
    let current = [];
    let chars = 0;
    for (const piece of pieces) {
      if (current.length && (current.length >= config.batchTexts || chars + piece.text.length > config.batchChars)) {
        out.push(current);
        current = [];
        chars = 0;
      }
      current.push(piece);
      chars += piece.text.length;
    }
    if (current.length) out.push(current);
    return out;
  }

  async function build() {
    const provider = providerNow();
    const history = getHistory();
    if (!provider || !history) return set({ status: 'off' });
    set({ status: 'building', error: '' });
    try {
      const vectors = await ensureStore(provider);
      // What the projects hold now (a source may have come or gone): read first, so that the pieces below are the ones there are.
      try { await getProjectPieces()?.refresh?.(); } catch (error) { logger.warn?.('The files of the projects could not be read for the vectors.', error); }
      const pieces = worth();
      await vectors.prune(pieces.map((piece) => piece.id));
      // What another device already made is taken from the cloud first (it costs nothing); when the cloud cannot be reached the page goes on with its own.
      const cloud = cloudFor(provider);
      if (cloud) { try { await cloud.pull(vectors, new Set(pieces.map((piece) => piece.id))); } catch (error) { logger.warn?.('The vectors in the cloud could not be fetched.', error); } }
      const missing = pieces.filter((piece) => !vectors.has(piece.id, hashed(piece)));
      set({ done: pieces.length - missing.length, total: pieces.length });
      const client = clientFor(provider);
      let failures = 0;
      const stopped = (error) => {
        failures += 1;
        return failures >= config.failures || error?.status === 401 || error?.status === 403 ? set({ status: 'error', error: String(error?.message || error).slice(0, 160) }) : null;
      };
      for (const group of groups(missing.filter((piece) => !isMedia(piece)))) {
        if (stopRequested) break;
        try {
          const made = await client.embed(group.map((piece) => piece.text), { kind: 'document' });
          await vectors.putMany(group.map((piece, index) => ({ id: piece.id, hash: hashed(piece), vector: made[index] })));
          set({ done: Math.min(state.total, state.done + group.length) });
          failures = 0;
        } catch (error) {
          const end = stopped(error);
          if (end) return end;
        }
        if (config.pauseMs) await wait(config.pauseMs);
      }
      // A file is a request of its own. One the model cannot read (too long, a kind it does not take) is marked, so that it is not tried at every build.
      for (const piece of missing.filter(isMedia)) {
        if (stopRequested) break;
        try {
          const media = piece.media || await piece.loadMedia();
          // A file that cannot be read now (not here, not in the cloud yet) is left for the next build.
          if (!media) { set({ done: Math.min(state.total, state.done + 1) }); continue; }
          const vector = await client.embedMedia(media);
          await vectors.putMany([{ id: piece.id, hash: hashed(piece), vector }]);
          failures = 0;
        } catch (error) {
          if ([400, 413, 415, 422].includes(error?.status)) await vectors.putMany([{ id: piece.id, hash: hashed(piece), vector: new Float32Array(0), failed: true }]);
          else {
            const end = stopped(error);
            if (end) return end;
          }
        }
        set({ done: Math.min(state.total, state.done + 1) });
        if (config.pauseMs) await wait(config.pauseMs);
      }
      if (cloud && !stopRequested) {
        try {
          await cloud.push(vectors);
          await cloud.prune(pieces.map((piece) => piece.id));
        } catch (error) {
          logger.warn?.('The vectors could not be kept in the cloud; they stay on this device.', error);
        }
      }
      return set({ status: 'idle', error: '' });
    } catch (error) {
      logger.warn?.('The vectors of the past conversations could not be built.', error);
      return set({ status: 'error', error: String(error?.message || error).slice(0, 160) });
    }
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    isEnabled: enabled,
    /** The provider that would be used now ('' when the person has no key for any). */
    provider: providerNow,
    /** What turning it on would send, for the person to read before agreeing: { provider, pieces, chars, tokens }. */
    estimate() {
      const pieces = worth();
      const chars = pieces.reduce((sum, piece) => sum + piece.text.length, 0);
      return { provider: providerNow(), pieces: pieces.length, media: pieces.filter(isMedia).length, chars, tokens: Math.round(chars * config.tokensPerChar) };
    },
    /** The person agreed: remember the time of the consent and the provider, and start building. Resolves false when there is no key. */
    async enable(chosen = '') {
      const provider = pickEmbeddingProvider({ chosen, hasKey });
      if (!provider || !getStore()?.isLoaded?.()) return false;
      await getStore().setSettings({ vector: { ...settings(), enabled: true, consentAt: now(), provider } });
      void this.sync();
      return true;
    },
    /** Off: the vectors of this device are thrown away and nothing more is sent. */
    async disable() {
      stopRequested = true;
      await running?.catch(() => {});
      const provider = providerNow() || settings().provider;
      const cloud = cloudFor(provider);
      await getStore()?.setSettings?.({ vector: { enabled: false, consentAt: null, provider: settings().provider, sync: settings().sync === true } });
      if (cloud) { try { await cloud.clear(); } catch (error) { logger.warn?.('The vectors in the cloud could not be deleted.', error); } }
      if (provider) { try { await (await ensureStore(provider)).clear(); } catch { /* The next time the vectors are made they start from nothing anyway. */ } }
      store = null;
      storeKey = '';
      set({ status: 'off', done: 0, total: 0, error: '' });
    },
    /** The providers the person has a key for ([{ name, label, current }]): both make the same vectors, so changing needs no rebuild. */
    providers() {
      const now = providerNow();
      return Object.keys(EMBEDDING_PROVIDERS).filter(hasKey_).map((name) => ({ name, label: EMBEDDING_PROVIDERS[name].label, current: name === now }));
    },
    /** Uses another provider from now on (it needs a key). The vectors made so far stay; the build goes on with the new one. */
    async setProvider(name) {
      if (!EMBEDDING_PROVIDERS[name] || !hasKey_(name) || !getStore()?.isLoaded?.()) return false;
      await getStore().setSettings({ vector: { ...settings(), provider: name } });
      void this.sync();
      return true;
    },
    /** Whether the vectors can be kept in a cloud account (a cloud account is signed in), and whether the person chose to. */
    canSync: () => Boolean(getCloud()?.supabase && getCloud()?.userId),
    isSyncing: () => settings().sync === true && Boolean(getCloud()?.userId),
    /** The provider and the key the server may use for the question of one reply (it keeps the key for that run only), or null: not when syncing is off, since the server finds no vectors then. */
    embeddingAccess() {
      const provider = providerNow();
      const key = provider ? getApiKeyForProvider(EMBEDDING_PROVIDERS[provider].keyProvider) : '';
      return enabled() && settings().sync === true && getCloud()?.userId && provider && key ? { provider, key } : null;
    },
    /** Turns keeping the vectors in the cloud on or off. Off deletes the cloud copy; the vectors of this device stay. */
    async setSync(on) {
      if (!getStore()?.isLoaded?.() || (on && !getCloud()?.userId)) return false;
      const provider = providerNow() || settings().provider;
      const before = cloudFor(provider);
      await getStore().setSettings({ vector: { ...settings(), sync: on === true } });
      if (on) void this.sync();
      else if (before) { try { await before.clear(); } catch (error) { logger.warn?.('The vectors in the cloud could not be deleted.', error); } }
      return true;
    },
    /** Builds the vectors that are missing (and drops those of pieces that are gone). One run at a time; does nothing when it is off. */
    sync({ rerun = false } = {}) {
      if (!enabled()) return Promise.resolve(set({ status: 'off' }));
      // Asked again while it builds with `rerun` (a source was added): one more run follows, so that nothing made after it started is missed.
      if (running) { if (rerun) again = true; return running; }
      stopRequested = false;
      running = build().finally(() => {
        running = null;
        const more = again && !stopRequested;
        again = false;
        if (more) void this.sync();
      });
      return running;
    },
    stop() {
      stopRequested = true;
    },
    /** Whether a search by meaning can be made now: on, a key, and some vectors. */
    available: () => enabled() && Boolean(store?.isLoaded()) && store.size > 0,
    /**
     * The pieces of past conversations nearest in meaning to `query`, one for each conversation: [{ conversationId, at, role, text, cosine }]. Resolves [] on any failure.
     */
    async search(query, { limit = 5, excludeConversationId = '', allow = null, minCosine = config.minCosine, signal } = {}) {
      try {
        const provider = providerNow();
        if (!enabled() || !store?.isLoaded() || !store.size || !String(query || '').trim()) return [];
        const [vector] = await clientFor(provider).embed([String(query).slice(0, 2000)], { kind: 'query', signal });
        const byId = new Map(worth().map((piece) => [piece.id, piece]));
        const taken = new Set();
        const found = [];
        for (const hit of topByCosine(vector, store.entries().filter((entry) => entry.vector.length && byId.get(entry.id)?.kind !== 'project'), { limit: limit * 4, minCosine })) {
          const piece = byId.get(hit.id);
          // (Passages of project files are left out above, so that they do not take the places of the conversations.)
          if (!piece || piece.conversationId === excludeConversationId || taken.has(piece.conversationId) || (allow && !allow(piece.conversationId))) continue;
          taken.add(piece.conversationId);
          found.push({ conversationId: piece.conversationId, at: piece.at, role: piece.role, text: piece.text, cosine: hit.cosine });
          if (found.length >= limit) break;
        }
        return found;
      } catch (error) {
        logger.warn?.('The search by meaning failed; the keywords are used alone.', error);
        return [];
      }
    },
    /**
     * The passages of project files nearest in meaning to `query`, among the sources `sourceIds`: [{ id, hash, cosine }] (`id` is the piece id; the hash lets the caller see that the
     * passage is still the one the vector was made from). Resolves [] when it is off, has no vectors yet, or fails.
     */
    async searchProject(query, { sourceIds = [], limit = 20, minCosine = config.minCosine, signal } = {}) {
      try {
        const provider = providerNow();
        const wanted = new Set(sourceIds);
        if (!enabled() || !store?.isLoaded() || !store.size || !wanted.size || !String(query || '').trim()) return [];
        const entries = store.entries().filter((entry) => entry.vector.length && wanted.has(sourceOfPieceId(entry.id)));
        if (!entries.length) return [];
        const [vector] = await clientFor(provider).embed([String(query).slice(0, 2000)], { kind: 'query', signal });
        const hashes = new Map(entries.map((entry) => [entry.id, entry.hash]));
        return topByCosine(vector, entries, { limit, minCosine }).map((hit) => ({ id: hit.id, hash: hashes.get(hit.id), cosine: hit.cosine }));
      } catch (error) {
        logger.warn?.('The search by meaning over the project files failed; the keywords are used alone.', error);
        return [];
      }
    },
    /**
     * The sources (of the ids given) in the order of how near they are in meaning to `question`: [id, ...], the nearest first; only sources that have a vector are in it. Resolves [] when it is
     * off, has no vectors yet, or fails (the caller then keeps the order the sources were added in).
     */
    async rankProjectSources(question, sourceIds = [], { signal } = {}) {
      const hits = await this.searchProject(question, { sourceIds, limit: Math.max(20, sourceIds.length * 40), minCosine: -1, signal });
      return [...new Set(hits.map((hit) => sourceOfPieceId(hit.id)))];
    },
    /**
     * Where the vectors of a source are: 'off' (the vectors are not turned on), 'pending' (still to build), 'ready', 'failed' (the model could not read the file; it is not tried again) or
     * 'none' (nothing of this source goes to the vectors: it has no text and is not a picture, or it is too big).
     */
    sourceStatus(sourceId) {
      if (!enabled()) return 'off';
      const mine = projectPieces().filter((piece) => piece.sourceId === sourceId);
      if (!mine.length) return 'none';
      let pending = false;
      let failed = 0;
      for (const piece of mine) {
        const record = store?.isLoaded?.() ? store.get(piece.id) : null;
        if (!record || record.hash !== hashed(piece)) pending = true;
        else if (record.failed) failed += 1;
      }
      if (pending) return 'pending';
      return failed === mine.length ? 'failed' : 'ready';
    },
    /** The keyword hits and the vector hits put together into one list of at most `limit` pieces (one for each conversation). */
    fuse(keywordHits, vectorHits, limit = 5) {
      const byConversation = new Map();
      for (const hit of [...keywordHits, ...vectorHits]) if (!byConversation.has(hit.conversationId)) byConversation.set(hit.conversationId, hit);
      const order = fuseRanks([keywordHits.map((hit) => hit.conversationId), vectorHits.map((hit) => hit.conversationId)], { limit });
      return order.map((id) => byConversation.get(id));
    }
  };
}
