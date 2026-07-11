const asArray = value => Array.isArray(value) ? value : [];

const toTurns = conversation => asArray(conversation?.messages)
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

export function createHistoryIndexRebuildService({
  getConversations,
  getMemoryState,
  captureCompletedTurn,
  hashString
} = {}) {
  if (typeof getConversations !== 'function') throw new TypeError('History index rebuild requires getConversations.');
  if (typeof getMemoryState !== 'function') throw new TypeError('History index rebuild requires getMemoryState.');
  if (typeof captureCompletedTurn !== 'function') throw new TypeError('History index rebuild requires captureCompletedTurn.');
  if (typeof hashString !== 'function') throw new TypeError('History index rebuild requires hashString.');

  return {
    async rebuild({ signal, onProgress = () => {} } = {}) {
      const conversations = asArray(getConversations())
        .filter(conversation => conversation?.id && !conversation.deletedAt && !conversation.isTemporary)
        .map(conversation => ({ conversation, turns: toTurns(conversation) }))
        .filter(item => item.turns.length > 0);
      let completed = 0;
      let indexed = 0;
      let skipped = 0;
      let failed = 0;
      onProgress({ state: 'running', completed, total: conversations.length, indexed, skipped, failed });

      for (const { conversation, turns } of conversations) {
        if (signal?.aborted) throw signal.reason || new DOMException('Aborted', 'AbortError');
        try {
          const sourceHash = await hashString(JSON.stringify(turns));
          const recentState = asArray(getMemoryState()?.recentConversationStates)
            .find(state => state?.conversationId === conversation.id);
          if (recentState?.sourceHash === sourceHash) {
            skipped += 1;
          } else {
            const result = await captureCompletedTurn({
              conversationId: conversation.id,
              sourceHash,
              turns,
              signal,
              collectProfileCandidates: false,
              allowTopicSummary: false
            });
            if (result?.captured) indexed += 1;
            else skipped += 1;
          }
        } catch (error) {
          if (signal?.aborted || error?.name === 'AbortError') throw error;
          failed += 1;
        }
        completed += 1;
        onProgress({ state: 'running', completed, total: conversations.length, indexed, skipped, failed });
      }
      const result = { state: 'complete', completed, total: conversations.length, indexed, skipped, failed };
      onProgress(result);
      return result;
    }
  };
}
