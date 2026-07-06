export function createCloudConversationDeletion({
  getCurrentUser,
  getConversations,
  getSync
} = {}) {
  return async function deleteConversationsFromCloud(conversationIds = [], options = {}) {
    const ids = [...new Set((conversationIds || []).filter(Boolean))];
    if (!ids.length) return;
    const isCloudUser = getCurrentUser?.()?.authProvider === 'supabase';
    const sync = getSync?.();
    if (!sync?.permanentlyDeleteConversations) {
      if (isCloudUser) throw new Error('Cloud conversation sync is not ready yet.');
      return;
    }
    if (sync.ready) await sync.ready;
    const status = sync.getStatus?.();
    if (status?.state === 'disabled') {
      if (isCloudUser) throw new Error(status.error || 'Cloud conversation sync is disabled.');
      return;
    }
    if (status && status.enabled === false) {
      throw new Error(status.error || 'Cloud conversation sync is not ready yet.');
    }
    const snapshotsById = new Map(
      [...(getConversations?.() || []), ...(Array.isArray(options.conversations) ? options.conversations : [])]
        .filter(conversation => ids.includes(conversation?.id))
        .map(conversation => [conversation.id, conversation])
    );
    const conversations = [...snapshotsById.values()];
    if (options.requireSnapshots && conversations.length < ids.length) {
      throw new Error('Cloud delete is missing local snapshots.');
    }
    await sync.permanentlyDeleteConversations(ids, {
      conversations,
      requireSnapshots: Boolean(options.requireSnapshots)
    });
  };
}
