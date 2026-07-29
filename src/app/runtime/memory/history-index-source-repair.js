const asArray = value => Array.isArray(value) ? value : [];

export function createHistoryIndexSourceRepair({
  getMemoryState,
  indexCapsule,
  indexConversationFragments,
  indexMediaMemory
} = {}) {
  if (typeof getMemoryState !== 'function'
    || typeof indexCapsule !== 'function'
    || typeof indexConversationFragments !== 'function'
    || typeof indexMediaMemory !== 'function') {
    throw new TypeError('History index source repair requires memory and indexing access.');
  }

  return async ({ conversationId, sourceHash, turns }) => {
    const memoryState = getMemoryState() || {};
    const capsule = asArray(memoryState.conversationCapsules)
      .find(item => item?.conversationId === conversationId);
    if (!capsule) return { indexed: false, reason: 'missing-capsule' };
    await indexCapsule({ capsule, sourceHash });
    await indexConversationFragments({
      conversationId,
      sourceHash,
      turns,
      updatedAt: capsule.updatedAt || null
    });
    let mediaIndexed = 0;
    for (const mediaMemory of asArray(memoryState.mediaMemories)
      .filter(item => item?.conversationId === conversationId && item?.sourceHash)) {
      const turn = asArray(turns).find(item => item?.id === mediaMemory.messageId);
      const attachment = asArray(turn?.attachments)
        .find(item => item?.partIndex === mediaMemory.partIndex);
      if (!attachment) continue;
      const result = await indexMediaMemory({ mediaMemory, attachment });
      if (result?.indexed !== false) mediaIndexed += 1;
    }
    return { indexed: true, mediaIndexed };
  };
}
