export function createTombstoneIndex(rows = []) {
  const conversations = new Set();
  const folders = new Set();

  for (const row of rows) {
    if (row?.entity_type === 'conversation' && row.entity_id) {
      conversations.add(row.entity_id);
    }
    if (row?.entity_type === 'folder' && row.entity_id) {
      folders.add(row.entity_id);
    }
  }

  return { conversations, folders };
}

export function createAstraTombstoneIndex(rows = []) {
  return new Set(
    (rows || [])
      .filter(row => row?.id && row.deleted_at)
      .map(row => row.id)
  );
}

export function applyAstraTombstones(workspace = {}, tombstoneIds = new Set()) {
  return {
    ...workspace,
    astras: (workspace.astras || [])
      .filter(astra => astra?.id && !tombstoneIds.has(astra.id))
  };
}

export function applyWorkspaceTombstones(workspace = {}, index = createTombstoneIndex()) {
  const conversations = (workspace.conversations || [])
    .filter(conversation => conversation?.id && !index.conversations.has(conversation.id))
    .map(conversation => index.folders.has(conversation?.folderId)
      ? { ...conversation, folderId: null }
      : conversation);
  const membershipByFolder = new Map();
  for (const conversation of conversations) {
    if (conversation.deletedAt) continue;
    const folderId = conversation.folderId;
    if (!folderId) continue;
    const conversationIds = membershipByFolder.get(folderId) || [];
    conversationIds.push(conversation.id);
    membershipByFolder.set(folderId, conversationIds);
  }
  const folders = (workspace.folders || [])
    .filter(folder => folder?.id && !index.folders.has(folder.id))
    .map(folder => ({
      ...folder,
      conversationIds: membershipByFolder.get(folder.id) || []
    }));

  return { ...workspace, conversations, folders };
}

export function filterEncodedWorkspaceByTombstones(
  encoded = {},
  index = createTombstoneIndex(),
  astraTombstoneIds = new Set()
) {
  const conversations = (encoded.conversations || [])
    .filter(conversation => conversation?.id && !index.conversations.has(conversation.id))
    .map(conversation => index.folders.has(conversation?.folder_id)
      ? { ...conversation, folder_id: null }
      : conversation);
  const conversationIds = new Set(conversations.map(conversation => conversation.id));

  return {
    ...encoded,
    folders: (encoded.folders || [])
      .filter(folder => folder?.id && !index.folders.has(folder.id)),
    conversations,
    messages: (encoded.messages || [])
      .filter(message => conversationIds.has(message?.conversation_id)),
    astras: (encoded.astras || [])
      .filter(astra => astra?.id && !astraTombstoneIds.has(astra.id))
  };
}
