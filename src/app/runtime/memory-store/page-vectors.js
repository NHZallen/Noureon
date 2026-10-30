// The search by meaning on this page (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §4.9, D15). It is OFF until the person turns it on and agrees: only then are the texts of
// their past conversations sent, in groups, to the embedding model of a provider they have a key for (Gemini or OpenAI), and the vectors that come back are kept in this browser only
// (vector-store.js). The question of a search is turned into a vector the same way; the pieces of past conversations nearest to it are put together with what the keywords found
// (page-history.js). Without a key, without consent, or when the provider fails, the search just uses the keywords: nothing here may break a reply. Turning it off throws the vectors away.

import { fuseRanks, textHash, topByCosine } from '../memory-notes/vector-math.js';
import { createEmbeddingClient, EMBEDDING_PROVIDERS, pickEmbeddingProvider, versionOf } from './embedding-client.js';
import { createIdbBackend, createMemoryBackend, createVectorStore } from './vector-store.js';

export const VECTOR = Object.freeze({ minChars: 12, batchTexts: 32, batchChars: 16_000, failures: 3, minCosine: 0.5, pauseMs: 150, tokensPerChar: 0.4 });

const hashed = (piece) => textHash(piece.text);

export function createPageVectors({ getStore, getHistory, getApiKeyForProvider = () => '', indexedDB = null, userKey = () => 'local', fetchImpl, now = () => new Date().toISOString(), wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), logger = console, options = {} }) {
  const config = { ...VECTOR, ...options };
  const listeners = new Set();
  let state = { status: 'off', done: 0, total: 0, error: '' };
  let store = null;
  let storeKey = '';
  let running = null;
  let stopRequested = false;

  const set = (patch) => {
    state = { ...state, ...patch };
    for (const listener of [...listeners]) { try { listener(state); } catch { /* A broken listener must not stop the others. */ } }
    return state;
  };
  const settings = () => getStore()?.getSettings?.()?.vector || { enabled: false, consentAt: null, provider: '' };
  // A piece of a few words ("Sure.") says nothing a vector could find, so it is not sent.
  const worth = () => (getHistory()?.pieces() || []).filter((piece) => piece.text.length >= config.minChars);
  const hasKey = (name) => Boolean(getApiKeyForProvider(name));
  const providerNow = () => pickEmbeddingProvider({ chosen: settings().provider, hasKey });
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
      const pieces = worth();
      await vectors.prune(pieces.map((piece) => piece.id));
      const missing = pieces.filter((piece) => !vectors.has(piece.id, hashed(piece)));
      set({ done: pieces.length - missing.length, total: pieces.length });
      const client = clientFor(provider);
      let failures = 0;
      for (const group of groups(missing)) {
        if (stopRequested) break;
        try {
          const made = await client.embed(group.map((piece) => piece.text), { kind: 'document' });
          await vectors.putMany(group.map((piece, index) => ({ id: piece.id, hash: hashed(piece), vector: made[index] })));
          set({ done: Math.min(state.total, state.done + group.length) });
          failures = 0;
        } catch (error) {
          failures += 1;
          if (failures >= config.failures || error?.status === 401 || error?.status === 403) {
            return set({ status: 'error', error: String(error?.message || error).slice(0, 160) });
          }
        }
        if (config.pauseMs) await wait(config.pauseMs);
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
      return { provider: providerNow(), pieces: pieces.length, chars, tokens: Math.round(chars * config.tokensPerChar) };
    },
    /** The person agreed: remember the time of the consent and the provider, and start building. Resolves false when there is no key. */
    async enable(chosen = '') {
      const provider = pickEmbeddingProvider({ chosen, hasKey });
      if (!provider || !getStore()?.isLoaded?.()) return false;
      await getStore().setSettings({ vector: { enabled: true, consentAt: now(), provider } });
      void this.sync();
      return true;
    },
    /** Off: the vectors of this device are thrown away and nothing more is sent. */
    async disable() {
      stopRequested = true;
      await running?.catch(() => {});
      const provider = providerNow() || settings().provider;
      await getStore()?.setSettings?.({ vector: { enabled: false, consentAt: null, provider: settings().provider } });
      if (provider) { try { await (await ensureStore(provider)).clear(); } catch { /* The next time the vectors are made they start from nothing anyway. */ } }
      store = null;
      storeKey = '';
      set({ status: 'off', done: 0, total: 0, error: '' });
    },
    /** Builds the vectors that are missing (and drops those of pieces that are gone). One run at a time; does nothing when it is off. */
    sync() {
      if (!enabled()) return Promise.resolve(set({ status: 'off' }));
      if (running) return running;
      stopRequested = false;
      running = build().finally(() => { running = null; });
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
    async search(query, { limit = 5, excludeConversationId = '', minCosine = config.minCosine, signal } = {}) {
      try {
        const provider = providerNow();
        if (!enabled() || !store?.isLoaded() || !store.size || !String(query || '').trim()) return [];
        const [vector] = await clientFor(provider).embed([String(query).slice(0, 2000)], { kind: 'query', signal });
        const byId = new Map(worth().map((piece) => [piece.id, piece]));
        const taken = new Set();
        const found = [];
        for (const hit of topByCosine(vector, store.entries(), { limit: limit * 4, minCosine })) {
          const piece = byId.get(hit.id);
          if (!piece || piece.conversationId === excludeConversationId || taken.has(piece.conversationId)) continue;
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
    /** The keyword hits and the vector hits put together into one list of at most `limit` pieces (one for each conversation). */
    fuse(keywordHits, vectorHits, limit = 5) {
      const byConversation = new Map();
      for (const hit of [...keywordHits, ...vectorHits]) if (!byConversation.has(hit.conversationId)) byConversation.set(hit.conversationId, hit);
      const order = fuseRanks([keywordHits.map((hit) => hit.conversationId), vectorHits.map((hit) => hit.conversationId)], { limit });
      return order.map((id) => byConversation.get(id));
    }
  };
}
