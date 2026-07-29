import { buildConversationFragments } from './history-indexing-service.js';

const asArray = value => Array.isArray(value)
  ? value
  : value && typeof value[Symbol.iterator] === 'function' ? [...value] : [];

export function hasCurrentHistoryIndexRecords({
  records = [],
  conversationId,
  sourceHash,
  turns = [],
  mediaMemories = []
} = {}) {
  const entries = asArray(records);
  const capsuleMatches = entries.some(record => (
    record.recordId === `capsule:${conversationId}` && record.sourceHash === sourceHash
  ));
  const prefix = `fragment:${conversationId}:`;
  const expectedFragmentIds = new Set(buildConversationFragments(turns)
    .map((_fragment, index) => `${prefix}${index}`));
  const fragments = entries.filter(record => (
    record.recordType === 'conversation-fragment' && record.conversationId === conversationId
  ));
  const expectedMediaRecordIds = asArray(mediaMemories)
    .filter(media => media?.conversationId === conversationId && media?.sourceHash)
    .filter(media => asArray(turns).some(turn => (
      turn?.id === media.messageId
      && asArray(turn.attachments).some(attachment => attachment?.partIndex === media.partIndex)
    )))
    .map(media => `media:${conversationId}:${media.sourceHash}`);
  const mediaMatches = expectedMediaRecordIds.every(recordId => (
    entries.some(record => record.recordId === recordId)
  ));
  return capsuleMatches
    && fragments.length === expectedFragmentIds.size
    && fragments.every(record => (
      record.sourceHash === sourceHash && expectedFragmentIds.has(record.recordId)
    ))
    && mediaMatches;
}

export function migrateHistoryIndexSourceFingerprint({
  memoryState = {},
  replaceMemoryState = () => {},
  index,
  conversationId,
  previousSourceHash,
  nextSourceHash
} = {}) {
  const recentStates = asArray(memoryState.recentConversationStates);
  const matchingState = recentStates.find(state => state?.conversationId === conversationId);
  if (!matchingState || matchingState.sourceHash !== previousSourceHash || !index?.getAll || !index?.put) return false;
  replaceMemoryState({
    ...memoryState,
    recentConversationStates: recentStates.map(state => (
      state?.conversationId === conversationId ? { ...state, sourceHash: nextSourceHash } : state
    ))
  });
  index.getAll()
    .filter(record => (
      record?.conversationId === conversationId
      && (record.recordType === 'conversation-capsule' || record.recordType === 'conversation-fragment')
      && record.sourceHash === previousSourceHash
    ))
    .forEach(record => index.put({ ...record, sourceHash: nextSourceHash }));
  return true;
}

export function activeMemoryRecordIds({ memoryState = {}, records = [], conversationIds = [] } = {}) {
  const active = new Set(asArray(conversationIds));
  return new Set([
    ...asArray(memoryState.conversationCapsules)
      .filter(capsule => active.has(capsule?.conversationId))
      .map(capsule => `capsule:${capsule.conversationId}`),
    ...asArray(records)
      .filter(record => record?.recordType === 'conversation-fragment' && active.has(record.conversationId))
      .map(record => record.recordId),
    ...asArray(memoryState.mediaMemories)
      .filter(media => active.has(media?.conversationId))
      .map(media => `media:${media.conversationId}:${media.sourceHash}`)
  ]);
}
