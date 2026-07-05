import { mergeConcurrentWorkspaceAppData } from './cloud-sync-versioning.js';

function hasMessages(conversation = {}) {
  return Array.isArray(conversation.messages) && conversation.messages.length > 0;
}

function shouldUploadConversation(conversation = {}) {
  return !(conversation.isTemporary && !hasMessages(conversation));
}

function normalizeFolderMembership(folders = [], conversations = []) {
  return folders.map(folder => ({
    ...folder,
    conversationIds: conversations
      .filter(conversation => conversation.folderId === folder.id && !conversation.deletedAt)
      .map(conversation => conversation.id)
  }));
}

export function prepareWorkspaceAppDataForCloud(value = {}) {
  const conversations = (value.conversations || [])
    .filter(shouldUploadConversation)
    .map(conversation => ({ ...conversation }));
  const folders = normalizeFolderMembership(
    (value.folders || []).map(folder => {
      const { isOpen: _isOpen, ...cloudFolder } = folder || {};
      return cloudFolder;
    }),
    conversations
  );

  return {
    conversations,
    folders,
    astras: (value.astras || []).map(astra => ({ ...astra })),
    personalMemories: [...(value.personalMemories || [])]
  };
}

export function mergeWorkspaceAppDataForCloud({ base = {}, local = {}, remote = {} } = {}) {
  return prepareWorkspaceAppDataForCloud(mergeConcurrentWorkspaceAppData(
    prepareWorkspaceAppDataForCloud(base),
    prepareWorkspaceAppDataForCloud(local),
    prepareWorkspaceAppDataForCloud(remote)
  ));
}

export function preserveLocalFolderUiState(local = {}, remote = {}) {
  const openState = new Map((local.folders || []).map(folder => [folder?.id, Boolean(folder?.isOpen)]));
  return {
    ...remote,
    folders: (remote.folders || []).map(folder => (
      openState.has(folder?.id)
        ? { ...folder, isOpen: openState.get(folder.id) }
        : folder
    ))
  };
}
