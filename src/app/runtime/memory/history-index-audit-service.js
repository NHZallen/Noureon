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
      // A capsule-only legacy index is still usable and should not trigger a
      // costly migration rebuild. Once a conversation has detailed fragments,
      // however, every one must match the current source.
      const fragmentsHealthy = fragmentRecords.length === 0 || (fragmentRecords.length === expectedFragmentIds.size
        && fragmentRecords.every(item => (
          item.sourceHash === sourceHash && expectedFragmentIds.has(item.recordId)
        )));
      expectedRecordIds.add(recordId);
      if (fragmentRecords.length > 0) expectedFragmentIds.forEach(id => expectedRecordIds.add(id));
      let captureQueued = false;
      const queueCapture = () => {
        if (captureQueued) return;
        tasks.push({ type: 'capture', conversationId: conversation.id, sourceHash, turns });
        captureQueued = true;
      };
      if (!capsule || recent?.sourceHash !== sourceHash) {
        if (record && !capsule && !recent) orphanRecordIds.add(recordId);
        else (capsule || recent ? outdated += 1 : missing += 1);
        queueCapture();
      } else if (!record) {
        missing += 1;
        tasks.push({ type: 'capsule', capsule, sourceHash });
      } else if (record.sourceHash !== sourceHash) {
        outdated += 1;
        tasks.push({ type: 'capsule', capsule, sourceHash });
      } else {
        healthyCapsules += 1;
      }
      if (fragmentRecords.length > 0 && fragmentsHealthy) healthyFragments += fragmentRecords.length;
      if (fragmentRecords.length > 0 && !fragmentsHealthy) {
        // Fragments are queried directly, so retaining a stale vector can
        // surface outdated wording even when the capsule itself is current.
        if (!captureQueued) {
          const hasStaleFragment = fragmentRecords.some(item => item.sourceHash !== sourceHash);
          if (hasStaleFragment) outdated += 1;
          else missing += 1;
          queueCapture();
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
      repairable: tasks.length + extraRecordIds.length,
      tasks,
      extraRecordIds
    };
  }

  async function optimize(report, { onProgress = () => {} } = {}) {
    const tasks = asArray(report?.tasks);
    const extras = asArray(report?.extraRecordIds);
    extras.forEach(recordId => index.removeRecord(recordId));
    let completed = 0;
    let repaired = 0;
    let failed = 0;
    onProgress({ completed, total: tasks.length, repaired, removed: extras.length, failed });
    for (const task of tasks) {
      try {
        if (task.type === 'capsule') await indexCapsule(task);
        else if (task.type === 'media') await indexMediaMemory(task);
        else await captureCompletedTurn({
          ...task,
          forceCapture: true,
          collectProfileCandidates: false,
          allowTopicSummary: false
        });
        repaired += 1;
      } catch {
        failed += 1;
      }
      completed += 1;
      onProgress({ completed, total: tasks.length, repaired, removed: extras.length, failed });
    }
    await persistMemoryState();
    if (persistence?.save) await persistence.save();
    return { repaired, removed: extras.length, failed, unchanged: report?.healthy || 0 };
  }

  return { audit, optimize };
}
