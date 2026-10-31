// A search over the person's past conversations (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §4.9): each message is cut into pieces of at most 800 characters, each kept with its
// conversation, its time and who said it, and found by the same terms and BM25 as the notes (tokenize.js, bm25.js). It is made from the messages the page already has, with no model and
// nothing sent anywhere, so it can be thrown away and made again (a new device makes its own). A temporary conversation, a deleted one and the one being written are not searched.
// Shared by the page and the tests: no window, no document, no browser storage.

import { createBm25Index } from './bm25.js';
import { isStrongTerm, terms } from './tokenize.js';

export const PIECE_CHARS = 800;
const MAX_PIECES_PER_CONVERSATION = 2000;

const textOf = (message) => (Array.isArray(message?.parts) ? message.parts.filter((part) => typeof part?.text === 'string').map((part) => part.text).join('\n') : '');
const squash = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();

/** A text cut into pieces of at most `size` characters, at the end of a sentence or a space when there is one near. */
export function cutIntoPieces(text, size = PIECE_CHARS) {
  const clean = squash(text);
  if (!clean) return [];
  const pieces = [];
  let rest = clean;
  while (rest.length > size) {
    const span = rest.slice(0, size);
    // The end of a sentence is the best place to cut; failing that a space; failing that the size.
    const sentence = Math.max(span.lastIndexOf('。'), span.lastIndexOf('. '), span.lastIndexOf('！'), span.lastIndexOf('？'), span.lastIndexOf('\n'));
    const space = span.lastIndexOf(' ');
    const stop = sentence > size * 0.5 ? sentence : space > size * 0.5 ? space : -1;
    const at = stop > 0 ? stop + 1 : size;
    pieces.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) pieces.push(rest);
  return pieces;
}

/**
 * The pieces of one conversation: [{ id, conversationId, at, role, text }]. `clean(text)` may shorten a text first (the page gives it a summary of the files in a message, so that the body of an
 * attached file is not indexed).
 */
export function piecesOf(conversation, clean = (text) => text) {
  const out = [];
  (conversation?.messages || []).forEach((message, index) => {
    if (message?.role !== 'user' && message?.role !== 'model') return;
    cutIntoPieces(clean(textOf(message))).forEach((text, part) => {
      if (out.length < MAX_PIECES_PER_CONVERSATION) out.push({ id: `${conversation.id}:${index}:${part}`, conversationId: conversation.id, at: message.createdAt || conversation.lastUpdatedAt || conversation.createdAt || '', role: message.role, text });
    });
  });
  return out;
}

const searchable = (conversation) => Boolean(conversation?.id) && !conversation.deletedAt && !conversation.isTemporary && conversation.retentionMode !== 'ephemeral';
const signatureOf = (conversation) => `${conversation.messages?.length || 0}|${conversation.lastUpdatedAt || ''}|${conversation.deletedAt || ''}|${conversation.isTemporary ? 't' : ''}`;

/**
 * The index. `update(conversations)` takes the conversations as they are now: the ones that changed are cut again, the ones gone (or deleted, or temporary) leave. `search(question, options)` gives
 * [{ conversationId, at, role, text, norm, strong }], the best first, at most one piece for each conversation.
 */
export function createHistoryIndex({ clean = (text) => text } = {}) {
  const byConversation = new Map();
  let bm25 = null;
  let all = [];
  let dirty = true;

  const rebuild = () => {
    all = [...byConversation.values()].flatMap((entry) => entry.pieces);
    bm25 = all.length ? createBm25Index(all.map((piece) => ({ id: piece.id, terms: terms(piece.text) }))) : null;
    dirty = false;
  };

  return {
    update(conversations) {
      const seen = new Set();
      for (const conversation of conversations || []) {
        if (!searchable(conversation)) continue;
        seen.add(conversation.id);
        const signature = signatureOf(conversation);
        if (byConversation.get(conversation.id)?.signature === signature) continue;
        byConversation.set(conversation.id, { signature, pieces: piecesOf(conversation, clean) });
        dirty = true;
      }
      for (const id of [...byConversation.keys()]) {
        if (!seen.has(id)) {
          byConversation.delete(id);
          dirty = true;
        }
      }
      return byConversation.size;
    },
    remove(conversationId) {
      if (byConversation.delete(conversationId)) dirty = true;
    },
    get pieceCount() {
      if (dirty) rebuild();
      return all.length;
    },
    /** Every piece, [{ id, conversationId, at, role, text }] (the search by meaning gives each a vector). */
    pieces() {
      if (dirty) rebuild();
      return all;
    },
    /**
     * The bar for a piece: it shares at least `minStrong` words of weight with the question and covers `coverage` of the question's strong words (a piece of a long text holds each word once, so
     * its BM25 share is lower than a note's; coverage is what says it is about the same thing); a question of one or two words may be met by one word that only this piece holds.
     * `allow(conversationId)` leaves out the conversations it refuses (the chats of other projects, see scope.js).
     */
    search(question, { excludeConversationId = '', allow = null, limit = 2, minNorm = 0.25, minStrong = 2, coverage = 0.6, soleNorm = 0.3 } = {}) {
      if (dirty) rebuild();
      if (!bm25) return [];
      const queryTerms = terms(question);
      const queryStrong = new Set(queryTerms.filter(isStrongTerm)).size;
      if (!queryStrong) return [];
      const byId = new Map(all.map((piece) => [piece.id, piece]));
      const taken = new Set();
      const found = [];
      const accept = (candidate) => (candidate.strong >= minStrong && candidate.strong / queryStrong >= coverage)
        || (queryStrong <= 2 && candidate.strong >= 1 && candidate.specific >= 1 && candidate.norm >= soleNorm);
      for (const hit of bm25.search(queryTerms, { limit: 40, minNorm, accept })) {
        const piece = byId.get(hit.id);
        if (!piece || piece.conversationId === excludeConversationId || taken.has(piece.conversationId) || (allow && !allow(piece.conversationId))) continue;
        taken.add(piece.conversationId);
        found.push({ conversationId: piece.conversationId, at: piece.at, role: piece.role, text: piece.text, norm: hit.norm, strong: hit.strong });
        if (found.length >= limit) break;
      }
      return found;
    }
  };
}
