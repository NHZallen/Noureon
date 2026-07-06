import { deterministicUuid, isUuid } from './cloud-sync-v2-codecs.js';

async function mapLegacyId({
  kind,
  id,
  idMap,
  userId,
  cryptoProvider
}) {
  if (!id) return id;
  const stringId = String(id);
  if (isUuid(stringId)) return stringId;
  if (!idMap.has(stringId)) {
    idMap.set(
      stringId,
      await deterministicUuid(`astra-sync-v2:${userId}:${kind}:${stringId}`, cryptoProvider)
    );
  }
  return idMap.get(stringId);
}

export async function repairWorkspaceEntityIds({
  workspace = {},
  userId,
  cryptoProvider = globalThis.crypto
} = {}) {
  const folderIdMap = new Map();
  const conversationIdMap = new Map();
  const astraIdMap = new Map();
  let changed = false;

  const astras = [];
  for (const astra of workspace.astras || []) {
    if (!astra?.id) {
      astras.push(astra);
      continue;
    }
    const nextId = await mapLegacyId({
      kind: 'astra',
      id: astra.id,
      idMap: astraIdMap,
      userId,
      cryptoProvider
    });
    if (nextId !== astra.id) changed = true;
    astras.push({ ...astra, id: nextId });
  }
  const astraIds = new Set(astras.map(astra => astra?.id).filter(Boolean));

  const folders = [];
  for (const folder of workspace.folders || []) {
    if (!folder?.id) {
      folders.push(folder);
      continue;
    }
    const nextId = await mapLegacyId({
      kind: 'folder',
      id: folder.id,
      idMap: folderIdMap,
      userId,
      cryptoProvider
    });
    const nextConversationIds = [];
    for (const conversationId of folder.conversationIds || []) {
      const nextConversationId = await mapLegacyId({
        kind: 'conversation',
        id: conversationId,
        idMap: conversationIdMap,
        userId,
        cryptoProvider
      });
      if (nextConversationId) nextConversationIds.push(nextConversationId);
    }
    if (nextId !== folder.id || JSON.stringify(nextConversationIds) !== JSON.stringify(folder.conversationIds || [])) {
      changed = true;
    }
    folders.push({
      ...folder,
      id: nextId,
      conversationIds: nextConversationIds
    });
  }

  const conversations = [];
  for (const conversation of workspace.conversations || []) {
    if (!conversation?.id) {
      conversations.push(conversation);
      continue;
    }
    const nextId = await mapLegacyId({
      kind: 'conversation',
      id: conversation.id,
      idMap: conversationIdMap,
      userId,
      cryptoProvider
    });
    const nextFolderId = conversation.folderId
      ? (folderIdMap.get(String(conversation.folderId)) || (isUuid(conversation.folderId) ? conversation.folderId : null))
      : null;
    const nextAstraId = conversation.astrasId
      ? (astraIdMap.get(String(conversation.astrasId)) || (astraIds.has(conversation.astrasId) ? conversation.astrasId : null))
      : null;
    if (
      nextId !== conversation.id
      || nextFolderId !== (conversation.folderId || null)
      || nextAstraId !== (conversation.astrasId || null)
    ) changed = true;
    const nextConversation = {
      ...conversation,
      id: nextId,
      folderId: nextFolderId
    };
    if (Object.hasOwn(conversation, 'astrasId') || nextAstraId) nextConversation.astrasId = nextAstraId;
    conversations.push(nextConversation);
  }

  const folderById = new Map(folders.filter(folder => folder?.id).map(folder => [
    folder.id,
    { ...folder, conversationIds: [...new Set(folder.conversationIds || [])] }
  ]));
  for (const conversation of conversations) {
    if (!conversation?.folderId || conversation.deletedAt) continue;
    const folder = folderById.get(conversation.folderId);
    if (!folder) continue;
    if (!folder.conversationIds.includes(conversation.id)) {
      folder.conversationIds.push(conversation.id);
      changed = true;
    }
  }

  return {
    changed,
    workspace: {
      ...workspace,
      folders: folders.map(folder => folder?.id && folderById.has(folder.id) ? folderById.get(folder.id) : folder),
      conversations,
      ...(Object.hasOwn(workspace, 'astras') ? { astras } : {})
    },
    repaired: {
      folders: folderIdMap.size,
      conversations: conversationIdMap.size,
      astras: astraIdMap.size
    }
  };
}
