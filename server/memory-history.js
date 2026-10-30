// The search over the past conversations of a person, made on the server (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §5), so that a reply that goes on after the page was
// closed can look back as the page does: `search_memory` with scope "history" or "both". The conversations are read from the cloud workspace (through the database function server_read_history;
// a local account has none there, and its page keeps doing this search itself), cut into pieces and searched with the same index as the page (memory-notes/history-index.js). When the person
// also synced the vectors (workspace_memory_vectors, a choice of its own) and the page put an embedding key in the request for this reply, the question is turned into a vector with that key
// and the nearest pieces are put together with what the keywords found; the key lives only for the run. Nothing here may break a reply: a failure gives the keywords alone, or nothing.

import { summarizeFileBlocks } from '../src/app/ui/files/file-history-compaction.js';
import { createHistoryIndex } from '../src/app/runtime/memory-notes/history-index.js';
import { fuseRanks, textHash } from '../src/app/runtime/memory-notes/vector-math.js';
import { createEmbeddingClient, versionOf } from '../src/app/runtime/memory-store/embedding-client.js';

export const HISTORY = Object.freeze({ conversations: 150, messages: 6000, cacheMs: 60_000, minCosine: 0.5, embedMs: 8000 });

const literal = (vector) => `[${Array.from(vector, (value) => Number(value.toFixed(6))).join(',')}]`;
const short = (hit) => ({ conversationId: hit.conversationId, at: hit.at, role: hit.role, text: String(hit.text).slice(0, 400) });

export function createHistorySearch({ db, now = () => Date.now(), fetchImpl = (...args) => globalThis.fetch(...args), logger = console, limits = HISTORY }) {
  const cache = new Map();

  /** The conversations of the person as the page holds them: { id, lastUpdatedAt, messages: [{ role, parts, createdAt }] }. The server has no grant on the workspace tables: it asks a function of the database. */
  async function conversationsOf(userId) {
    const read = await db.rpc('server_read_history', { p_user_id: userId, p_max_conversations: limits.conversations, p_max_messages: limits.messages });
    const byConversation = new Map((read?.conversations || []).map((row) => [row.id, { id: row.id, lastUpdatedAt: row.updated_at, messages: [] }]));
    for (const message of read?.messages || []) byConversation.get(message.conversation_id)?.messages.push({ role: message.role, parts: Array.isArray(message.parts) ? message.parts : [], createdAt: message.created_at });
    return [...byConversation.values()];
  }

  async function indexOf(userId) {
    const held = cache.get(userId);
    if (held && now() - held.at < limits.cacheMs) return held.index;
    const index = createHistoryIndex({ clean: summarizeFileBlocks });
    index.update(await conversationsOf(userId));
    cache.set(userId, { at: now(), index });
    if (cache.size > 50) cache.delete(cache.keys().next().value);
    return index;
  }

  return {
    /**
     * The search for one reply: `search(query, limit)` resolves the pieces of past conversations ([{ conversationId, at, role, text }]), the keyword hits and, when `vector` is given
     * ({ provider, key }) and the person synced their vectors, the nearest in meaning, put together. Never throws.
     */
    forReply({ userId, conversationId = '', vector = null, signal }) {
      return async (query, limit = 5) => {
        let index;
        try {
          index = await indexOf(userId);
        } catch (error) {
          logger.warn?.('The past conversations could not be read for a search.', error?.message || error);
          return [];
        }
        const keywords = index.search(query, { limit, minNorm: 0.1, minStrong: 1, coverage: 0, soleNorm: 0.1, excludeConversationId: conversationId }).map(short);
        if (!vector?.key) return keywords;
        try {
          const client = createEmbeddingClient({ provider: vector.provider, getApiKey: () => vector.key, fetchImpl });
          // A provider that does not answer must not hold the reply: the search by meaning waits a few seconds at most.
          const waiting = AbortSignal.timeout(limits.embedMs);
          const [embedding] = await client.embed([String(query).slice(0, 2000)], { kind: 'query', signal: signal ? AbortSignal.any([signal, waiting]) : waiting });
          const hits = await db.rpc('match_workspace_memory_vectors', { p_user_id: userId, p_model: versionOf(vector.provider), p_query: literal(embedding), p_limit: limit * 4, p_min_cosine: limits.minCosine });
          const pieces = new Map(index.pieces().map((piece) => [piece.id, piece]));
          const taken = new Set();
          const meaning = [];
          for (const hit of Array.isArray(hits) ? hits : []) {
            const piece = pieces.get(hit.piece_id);
            // A vector counts only while the text is the one it was made from.
            if (!piece || piece.conversationId === conversationId || taken.has(piece.conversationId) || textHash(piece.text) !== hit.hash) continue;
            taken.add(piece.conversationId);
            meaning.push(short(piece));
            if (meaning.length >= limit) break;
          }
          if (!meaning.length) return keywords;
          const byConversation = new Map();
          for (const hit of [...keywords, ...meaning]) if (!byConversation.has(hit.conversationId)) byConversation.set(hit.conversationId, hit);
          return fuseRanks([keywords.map((hit) => hit.conversationId), meaning.map((hit) => hit.conversationId)], { limit }).map((id) => byConversation.get(id));
        } catch (error) {
          logger.warn?.('The search by meaning failed on the server; the keywords are used alone.', error?.message || error);
          return keywords;
        }
      };
    }
  };
}
