// The search over the past conversations of this page (memory-notes/history-index.js): made from the conversations the page holds, brought up to date when it is used (only what changed is cut
// again), with no model and nothing sent anywhere. The slip of the memory and the tool `search_memory` use it. Temporary conversations, deleted ones and the one being written are left out.

import { summarizeFileBlocks } from '../../ui/files/file-history-compaction.js';
import { createHistoryIndex } from '../memory-notes/history-index.js';
import { mediaPiecesOfAll } from '../memory-notes/media-pieces.js';

import { canSearchConversation } from '../memory-notes/scope.js';

export function createPageHistory({ getConversations, getProjectOf = () => '' }) {
  // Which past conversations a search may look into (memory-notes/scope.js, canSearchConversation): the chats of a project are seen from that project only, never from a chat outside it.
  const allowFor = (scopeId = '', projectId = '') => (conversationId) => canSearchConversation({ scopeId, projectId }, getProjectOf(conversationId));
  const withAllow = ({ scopeId = '', projectId = '', ...options } = {}) => ({ ...options, allow: allowFor(scopeId, projectId) });
  // A file the person attached or a reply made is in the text as a block: the index sees a short summary of it, not the whole body.
  const index = createHistoryIndex({ clean: summarizeFileBlocks });
  const fresh = () => index.update(getConversations() || []);
  let vectors = null;
  return {
    /** For the slip: at most two pieces from two other conversations that clearly bear on the question. */
    search(question, options = {}) {
      fresh();
      return index.search(question, { limit: 2, ...withAllow(options) });
    },
    /** For the tool: a few more, with a lower bar (the model asked for them). */
    lookup(query, limit = 5, options = {}) {
      fresh();
      return index.search(query, { limit, minNorm: 0.1, minStrong: 1, coverage: 0, soleNorm: 0.1, ...withAllow(options) }).map((piece) => ({ conversationId: piece.conversationId, at: piece.at, role: piece.role, text: piece.text.slice(0, 400) }));
    },
    /** Every piece the index holds (the search by meaning gives each a vector). */
    pieces() {
      fresh();
      return index.pieces();
    },
    /** The files of the conversations (pictures, videos, sounds, documents) as pieces for the vectors; the keyword index does not hold them. */
    mediaPieces: () => mediaPiecesOfAll(getConversations()),
    /** The search by meaning, when the person turned it on (page-vectors.js); the tool then puts it together with the keywords. */
    setVectors(value) { vectors = value || null; },
    /** For the tool, async: the keyword hits, and when the search by meaning is on, the nearest in meaning, put together. Always resolves a list. */
    async lookupHybrid(query, limit = 5, options = {}) {
      const keywords = this.lookup(query, limit, options);
      if (!vectors?.available?.()) return keywords;
      const meaning = (await vectors.search(query, { limit, excludeConversationId: options.excludeConversationId || '', allow: allowFor(options.scopeId, options.projectId) })).map((hit) => ({ conversationId: hit.conversationId, at: hit.at, role: hit.role, text: hit.text.slice(0, 400) }));
      return meaning.length ? vectors.fuse(keywords, meaning, limit) : keywords;
    },
    /**
     * For the slip, when the keywords found nothing: the pieces nearest in meaning to the question, at a higher bar than the tool's, and the wait is cut short after `waitMs`
     * (the reply must not wait for the network). Always resolves a list (at most two), marked `meaning: true`.
     */
    async meaning(question, { excludeConversationId = '', scopeId = '', projectId = '', waitMs = 700, minCosine = 0.6 } = {}) {
      if (!vectors?.available?.() || !String(question || '').trim()) return [];
      const controller = new AbortController();
      let timer = null;
      const wait = new Promise((resolve) => { timer = setTimeout(() => { controller.abort(); resolve([]); }, waitMs); });
      try {
        const hits = await Promise.race([vectors.search(question, { limit: 2, excludeConversationId, allow: allowFor(scopeId, projectId), minCosine, signal: controller.signal }), wait]);
        return hits.map((hit) => ({ conversationId: hit.conversationId, at: hit.at, role: hit.role, text: hit.text.slice(0, 400), meaning: true }));
      } catch {
        return [];
      } finally {
        clearTimeout(timer);
      }
    },
    /** The conversations the page holds (the rebuild reads them). */
    conversations: () => getConversations() || [],
    stats() {
      fresh();
      return { conversations: getConversations()?.length || 0, pieces: index.pieceCount };
    }
  };
}
