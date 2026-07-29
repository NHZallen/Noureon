const asArray = value => Array.isArray(value) ? value : [];

export function createHistoryIndexSourceRepair({
  getMemoryState,
  indexCapsule,
  indexConversationFragments
} = {}) {
  if (typeof getMemoryState !== 'function'
    || typeof indexCapsule !== 'function'
    || typeof indexConversationFragments !== 'function') {
    throw new TypeError('History index source repair requires memory and indexing access.');
  }

  return async ({ conversationId, sourceHash, turns }) => {
    const capsule = asArray(getMemoryState()?.conversationCapsules)
      .find(item => item?.conversationId === conversationId);
    if (!capsule) return { indexed: false, reason: 'missing-capsule' };
    await indexCapsule({ capsule, sourceHash });
    await indexConversationFragments({
      conversationId,
      sourceHash,
      turns,
      updatedAt: capsule.updatedAt || null
    });
    return { indexed: true };
  };
}
