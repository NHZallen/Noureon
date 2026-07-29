import { buildConversationFragments } from './history-indexing-service.js';
import {
  buildHistoryIndexTurns,
  serializeHistoryIndexSource
} from './history-index-source.js';

const asArray = value => Array.isArray(value) ? value : [];

export function createHistoryIndexAuditService({
  getConversations,
  getMemoryState,
  index,
  hashString,
  captureCompletedTurn,
  indexCapsule,
  indexMediaMemory,
  repairIndexedSource = null,
  persistence = null,
  persistMemoryState = async () => {}
} = {}) {
  if (typeof getConversations !== 'function' || typeof getMemoryState !== 'function') throw new TypeError('History index audit requires memory sources.');
  if (!index?.getAll || !index?.removeRecord) throw new TypeError('History index audit requires an index store.');
  if (typeof hashString !== 'function') throw new TypeError('History index audit requires hashString.');

  async function audit() {
    const conversations = asArray(getConversations())
      .filter(conversation => conversation?.id && !conversation.deletedAt && !conversation.isTemporary)
      .map(conversation => ({ conversation, turns: buildHistoryIndexTurns(conversation) }))
      .filter(item => item.turns.length > 0);
    const memoryState = getMemoryState() || {};
    const records = index.getAll();
    const expectedRecordIds = new Set();
    const tasks = [];
    let healthyCapsules = 0;
    let healthyFragments = 0;
    let healthyMedia = 0;
    let missing = 0;
    let outdated = 0;
    const orphanRecordIds = new Set();

    for (const { conversation, turns } of conversations) {
      const sourceHash = await hashString(serializeHistoryIndexSource(turns));
      const capsule = asArray(memoryState.conversationCapsules).find(item => item?.conversationId === conversation.id);
      const recent = asArray(memoryState.recentConversationStates).find(item => item?.conversationId === conversation.id);
      const recordId = `capsule:${conversation.id}`;
      const record = records.find(item => item.recordId === recordId);
      const fragmentPrefix = `fragment:${conversation.id}:`;
      const expectedFragmentIds = new Set(buildConversationFragments(turns)
        .map((_fragment, index) => `${fragmentPrefix}${index}`));
      const fragmentRecords = records.filter(item => (
        item?.recordType === 'conversation-fragment' && item.conversationId === conversation.id
      ));
      const fragmentsHealthy = fragmentRecords.length === expectedFragmentIds.size
        && fragmentRecords.every(item => (
          item.sourceHash === sourceHash && expectedFragmentIds.has(item.recordId)
        ));
      expectedRecordIds.add(recordId);
      expectedFragmentIds.forEach(id => expectedRecordIds.add(id));
      let captureQueued = false;
      const queueCapture = () => {
        if (captureQueued) return;
        tasks.push({ type: 'capture', conversationId: conversation.id, sourceHash, turns });
        captureQueued = true;
      };
      const queueSourceRepair = () => {
        if (captureQueued) return;
        tasks.push({
          type: 'source',
          conversationId: conversation.id,
          sourceHash,
          turns,
          capsule
        });
        captureQueued = true;
      };
      if (!capsule || recent?.sourceHash !== sourceHash) {
        if (record && !capsule && !recent) orphanRecordIds.add(recordId);
        else (capsule || recent ? outdated += 1 : missing += 1);
        queueCapture();
      } else {
        const capsuleHealthy = record?.sourceHash === sourceHash;
        if (capsuleHealthy) healthyCapsules += 1;
        if (fragmentsHealthy) healthyFragments += fragmentRecords.length;
        if (!capsuleHealthy || !fragmentsHealthy) {
          const hasStaleRecord = Boolean(record && record.sourceHash !== sourceHash)
            || fragmentRecords.some(item => item.sourceHash !== sourceHash);
          if (hasStaleRecord) outdated += 1;
          else missing += 1;
          queueSourceRepair();
        }
      }
    }

    for (const media of asArray(memoryState.mediaMemories)) {
      const conversationEntry = conversations.find(item => item.conversation.id === media?.conversationId);
      if (!conversationEntry || !media?.sourceHash) continue;
      const recordId = `media:${media.conversationId}:${media.sourceHash}`;
      expectedRecordIds.add(recordId);
      if (records.some(record => record.recordId === recordId)) {
        healthyMedia += 1;
        continue;
      }
      const turn = conversationEntry.turns.find(item => item.id === media.messageId);
      const attachment = turn?.attachments?.find(item => item.partIndex === media.partIndex);
      if (attachment) {
        missing += 1;
        tasks.push({ type: 'media', mediaMemory: media, attachment });
      }
    }

    const extraRecordIds = [...new Set([
      ...orphanRecordIds,
      ...records
      .filter(record => !expectedRecordIds.has(record.recordId))
      .map(record => record.recordId)
    ])];
    return {
      totalConversations: conversations.length,
      healthy: healthyCapsules + healthyFragments + healthyMedia,
      healthyCapsules,
      healthyFragments,
      healthyMedia,
      missing,
      outdated,
      extra: extraRecordIds.length,
      // An audit can run while the workspace is still receiving a local or
      // cloud snapshot.  A record missing from that temporary list is not
      // evidence that its conversation was deleted.  Only the explicit trash
      // and permanent-delete lifecycle owns destructive index invalidation.
      // The audit may repair proven gaps, but must never offer to delete an
      // otherwise usable local vector.
      repairable: tasks.length,
      protected: extraRecordIds.length,
      tasks,
      extraRecordIds
    };
  }

  async function optimize(report, { onProgress = () => {} } = {}) {
    const tasks = asArray(report?.tasks);
    const extras = asArray(report?.extraRecordIds);
    const repairedConversationIds = new Set();
    let completed = 0;
    let repaired = 0;
    let failed = 0;
    onProgress({ completed, total: tasks.length, repaired, removed: 0, failed });
    for (const task of tasks) {
      try {
        if (task.type === 'source' && typeof repairIndexedSource === 'function') {
          const result = await repairIndexedSource(task);
          if (result === false || result?.indexed === false) throw new Error('History index source repair failed.');
        }
        else if (task.type === 'capsule') await indexCapsule(task);
        else if (task.type === 'media') await indexMediaMemory(task);
        else await captureCompletedTurn({
          ...task,
          forceCapture: true,
          collectProfileCandidates: false,
          allowTopicSummary: false
        });
        repaired += 1;
        if (task.conversationId) repairedConversationIds.add(task.conversationId);
        if (task.capsule?.conversationId) repairedConversationIds.add(task.capsule.conversationId);
        if (task.mediaMemory?.conversationId) repairedConversationIds.add(task.mediaMemory.conversationId);
      } catch {
        failed += 1;
      }
      completed += 1;
      onProgress({ completed, total: tasks.length, repaired, removed: 0, failed });
    }
    // Do not delete audit extras here.  During refresh, an incomplete
    // workspace snapshot makes every otherwise valid record look orphaned.
    // Explicit deletion already removes source-linked records immediately,
    // so retaining uncertain extras is the safe and privacy-preserving choice.
    const removed = 0;
    await persistMemoryState();
    if (persistence?.save) await persistence.save();
    return {
      repaired,
      removed,
      failed,
      unchanged: (report?.healthy || 0) + extras.filter(recordId => {
        const record = index.getAll().find(item => item.recordId === recordId);
        return !repairedConversationIds.has(record?.conversationId);
      }).length
    };
  }

  return { audit, optimize };
}
