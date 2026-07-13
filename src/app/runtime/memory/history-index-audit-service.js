const asArray = value => Array.isArray(value) ? value : [];

const toTurns = conversation => asArray(conversation?.messages).map((message, index) => ({
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
})).filter(turn => turn.text || turn.attachments.length > 0);

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
      .map(conversation => ({ conversation, turns: toTurns(conversation) }))
      .filter(item => item.turns.length > 0);
    const memoryState = getMemoryState() || {};
    const records = index.getAll();
    const expectedRecordIds = new Set();
    const tasks = [];
    let healthy = 0;
    let missing = 0;
    let outdated = 0;
    const orphanRecordIds = new Set();

    for (const { conversation, turns } of conversations) {
      const sourceHash = await hashString(JSON.stringify(turns));
      const capsule = asArray(memoryState.conversationCapsules).find(item => item?.conversationId === conversation.id);
      const recent = asArray(memoryState.recentConversationStates).find(item => item?.conversationId === conversation.id);
      const recordId = `capsule:${conversation.id}`;
      const record = records.find(item => item.recordId === recordId);
      expectedRecordIds.add(recordId);
      if (!capsule || recent?.sourceHash !== sourceHash) {
        if (record && !capsule && !recent) orphanRecordIds.add(recordId);
        else (capsule || recent ? outdated += 1 : missing += 1);
        tasks.push({ type: 'capture', conversationId: conversation.id, sourceHash, turns });
      } else if (!record) {
        missing += 1;
        tasks.push({ type: 'capsule', capsule, sourceHash });
      } else if (record.sourceHash !== sourceHash) {
        outdated += 1;
        tasks.push({ type: 'capsule', capsule, sourceHash });
      } else {
        healthy += 1;
      }
    }

    for (const media of asArray(memoryState.mediaMemories)) {
      const conversationEntry = conversations.find(item => item.conversation.id === media?.conversationId);
      if (!conversationEntry || !media?.sourceHash) continue;
      const recordId = `media:${media.conversationId}:${media.sourceHash}`;
      expectedRecordIds.add(recordId);
      if (records.some(record => record.recordId === recordId)) {
        healthy += 1;
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
      healthy,
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
