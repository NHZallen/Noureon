// The search over the past conversations of this page (memory-notes/history-index.js): made from the conversations the page holds, brought up to date when it is used (only what changed is cut
// again), with no model and nothing sent anywhere. The slip of the memory and the tool `search_memory` use it. Temporary conversations, deleted ones and the one being written are left out.

import { createHistoryIndex } from '../memory-notes/history-index.js';

export function createPageHistory({ getConversations }) {
  const index = createHistoryIndex();
  const fresh = () => index.update(getConversations() || []);
  return {
    /** For the slip: at most two pieces from two other conversations that clearly bear on the question. */
    search(question, options = {}) {
      fresh();
      return index.search(question, { limit: 2, ...options });
    },
    /** For the tool: a few more, with a lower bar (the model asked for them). */
    lookup(query, limit = 5, options = {}) {
      fresh();
      return index.search(query, { limit, minNorm: 0.1, minStrong: 1, coverage: 0, soleNorm: 0.1, ...options }).map((piece) => ({ conversationId: piece.conversationId, at: piece.at, role: piece.role, text: piece.text.slice(0, 400) }));
    },
    /** The conversations the page holds (the rebuild reads them). */
    conversations: () => getConversations() || [],
    stats() {
      fresh();
      return { conversations: getConversations()?.length || 0, pieces: index.pieceCount };
    }
  };
}
