function createCloudEntityDeletion({
  getCurrentUser,
  getEntities,
  getSync,
  syncMethod,
  optionKey,
  unavailableMessage,
  disabledMessage = unavailableMessage,
  snapshotsRequired = false
}) {
  return async function deleteEntitiesFromCloud(entityIds = [], options = {}) {
    const ids = [...new Set((entityIds || []).filter(Boolean))];
    if (!ids.length) return;
    const isCloudUser = getCurrentUser?.()?.authProvider === 'supabase';
    const sync = getSync?.();
    if (!sync?.[syncMethod]) {
      if (isCloudUser) throw new Error(unavailableMessage);
      return;
    }
    if (sync.ready) await sync.ready;
    const status = sync.getStatus?.();
    if (status?.state === 'disabled') {
      if (isCloudUser) throw new Error(status.error || disabledMessage);
      return;
    }
    if (status && status.enabled === false) {
      throw new Error(status.error || unavailableMessage);
    }
    const snapshotsById = new Map(
      [...(getEntities?.() || []), ...(Array.isArray(options[optionKey]) ? options[optionKey] : [])]
        .filter(entity => ids.includes(entity?.id))
        .map(entity => [entity.id, entity])
    );
    const entities = [...snapshotsById.values()];
    if ((snapshotsRequired || options.requireSnapshots) && entities.length < ids.length) {
      throw new Error(`Cloud ${optionKey === 'astras' ? 'Astra ' : ''}delete is missing local snapshots.`);
    }
    const payload = { [optionKey]: entities };
    if (optionKey === 'conversations') payload.requireSnapshots = Boolean(options.requireSnapshots);
    await sync[syncMethod](ids, payload);
  };
}

export function createCloudConversationDeletion({ getCurrentUser, getConversations, getSync } = {}) {
  return createCloudEntityDeletion({
    getCurrentUser,
    getEntities: getConversations,
    getSync,
    syncMethod: 'permanentlyDeleteConversations',
    optionKey: 'conversations',
    unavailableMessage: 'Cloud conversation sync is not ready yet.',
    disabledMessage: 'Cloud conversation sync is disabled.'
  });
}

export function createCloudAstraDeletion({
  getCurrentUser,
  getAstras,
  getSync
} = {}) {
  return createCloudEntityDeletion({
    getCurrentUser,
    getEntities: getAstras,
    getSync,
    syncMethod: 'permanentlyDeleteAstras',
    optionKey: 'astras',
    unavailableMessage: 'Cloud Astra sync is not ready yet.',
    snapshotsRequired: true
  });
}

export function createCloudDeletionLifecycle({
  getCurrentUser,
  getConversations,
  getAstras,
  getSync
} = {}) {
  return {
    deleteConversations: createCloudConversationDeletion({ getCurrentUser, getConversations, getSync }),
    deleteAstras: createCloudAstraDeletion({ getCurrentUser, getAstras, getSync })
  };
}
