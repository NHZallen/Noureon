import { buildConversationFragments } from './history-indexing-service.js';

const asArray = value => Array.isArray(value)
  ? value
  : value && typeof value[Symbol.iterator] === 'function' ? [...value] : [];

export function hasCurrentHistoryIndexRecords({ records = [], conversationId, sourceHash, turns = [] } = {}) {
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
  return capsuleMatches && (fragments.length === 0 || (
    fragments.length === expectedFragmentIds.size
    && fragments.every(record => record.sourceHash === sourceHash && expectedFragmentIds.has(record.recordId))
  ));
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
