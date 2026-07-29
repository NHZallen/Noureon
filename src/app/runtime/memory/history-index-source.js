const asArray = value => Array.isArray(value) ? value : [];

/**
 * Normalizes a conversation into the rich local form used by memory capture
 * and fragment indexing. Message ids remain available for provenance, but do
 * not participate in the stable source fingerprint below: cloud sync may add
 * deterministic ids to old messages after the text has not changed.
 */
export function buildHistoryIndexTurns(conversation = {}) {
  return asArray(conversation?.messages)
    .map((message, index) => ({
      id: message?.id || `${conversation.id}:${index}`,
      role: message?.role,
      text: asArray(message?.parts).map(part => part?.text || '').join('\n').trim(),
      attachments: asArray(message?.parts).flatMap((part, partIndex) => part?.inlineData?.data ? [{
        partIndex,
        name: part.inlineData.name || 'attachment',
        mimeType: part.inlineData.mimeType || 'application/octet-stream',
        data: part.inlineData.data,
        size: part.inlineData.size || 0
      }] : [])
    }))
    .filter(turn => turn.text || turn.attachments.length > 0);
}

/**
 * Excludes transport-only fields from the index freshness check. In
 * particular, message ids may be assigned during cloud decoding and an
 * attachment may move between inline data and cloud storage without its
 * conversational meaning changing.
 */
export function serializeHistoryIndexSource(turns = []) {
  return JSON.stringify(asArray(turns).map(turn => ({
    role: String(turn?.role || ''),
    text: String(turn?.text || '').trim(),
    attachments: asArray(turn?.attachments).map(attachment => ({
      partIndex: Number(attachment?.partIndex) || 0,
      name: String(attachment?.name || 'attachment'),
      mimeType: String(attachment?.mimeType || 'application/octet-stream'),
      size: Number(attachment?.size) || 0
    }))
  })));
}
