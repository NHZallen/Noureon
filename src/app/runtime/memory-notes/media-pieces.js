// The attachments of the past conversations as pieces of their own for the search by meaning (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §4.9): a picture, a video, a sound or
// a document in a message becomes one piece with its bytes and a short label (what it is and what the message around it said), so that a question can find "the photo of the receipt" or "the
// recording of the meeting". The keyword index does not see them (they have no words); only the vectors do, and only after the person agreed. Only what is in the page now is taken: a file
// that is still in the cloud and was not opened has no bytes here yet, and is looked at the next time. Pure functions; shared by the page and the tests: no window, no document, no browser storage.

import { textHash } from './vector-math.js';

/** What the model of the vectors can read (a mime type that begins with one of these, or is a PDF). */
const KINDS = Object.freeze([['image/', 'image'], ['video/', 'video'], ['audio/', 'audio'], ['application/pdf', 'document']]);
/** The biggest file sent inside a request (base64 characters, about 9 MB of file): bigger ones are left out. */
export const MAX_MEDIA_CHARS = 12 * 1024 * 1024;

export const mediaKindOf = (mimeType) => KINDS.find(([prefix]) => String(mimeType || '').toLowerCase().startsWith(prefix))?.[1] || '';

const squash = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
const searchable = (conversation) => Boolean(conversation?.id) && !conversation.deletedAt && !conversation.isTemporary && conversation.retentionMode !== 'ephemeral';

/** [{ id, conversationId, at, role, text (the label), media: { mimeType, data, kind }, hash }] of one conversation. */
export function mediaPiecesOf(conversation) {
  const out = [];
  (conversation?.messages || []).forEach((message, index) => {
    if (message?.role !== 'user' && message?.role !== 'model') return;
    const parts = Array.isArray(message.parts) ? message.parts : [];
    const around = squash(parts.filter((part) => typeof part?.text === 'string').map((part) => part.text).join(' ')).slice(0, 200);
    parts.forEach((part, partIndex) => {
      const data = part?.inlineData?.data;
      const mimeType = part?.inlineData?.mimeType;
      const kind = mediaKindOf(mimeType);
      if (!kind || typeof data !== 'string' || !data || data.length > MAX_MEDIA_CHARS) return;
      out.push({
        id: `${conversation.id}:${index}:m${partIndex}`,
        conversationId: conversation.id,
        at: message.createdAt || conversation.lastUpdatedAt || conversation.createdAt || '',
        role: message.role,
        text: `[${kind}: ${mimeType}]${around ? ` ${around}` : ''}`,
        media: { mimeType, data, kind },
        // The bytes are not read again to tell whether a file changed: its size and both ends say it.
        hash: textHash(`${mimeType}|${data.length}|${data.slice(0, 96)}|${data.slice(-96)}`)
      });
    });
  });
  return out;
}

/** The media pieces of every conversation that may be searched. */
export const mediaPiecesOfAll = (conversations) => (conversations || []).filter(searchable).flatMap(mediaPiecesOf);
