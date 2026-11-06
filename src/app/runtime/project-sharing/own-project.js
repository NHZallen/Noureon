// A member who leaves a shared project can take what they made in it into a project of their own (docs/superpowers/specs/2026-11-06-project-sharing-design.md, §9): the conversations they made are
// moved into a new private project (they are theirs; the shared project gives them back when the person leaves). The files, the instructions and the memory of the shared project do not come along.
// (The shared project may keep a copy of them for its owner: that is made by the server before, and is not this.)

/** { folder, ids }: the new folder and the ids of the conversations of the person that were made in the project `sharedId` and now belong to it. The caller moves them (folderId, no sharedProject). */
export function ownProjectFrom({ conversations, sharedId, name, memoryScope = 'default', icon = 'default', color = 'gray', uuid = () => crypto.randomUUID() }) {
  const folder = { id: uuid(), name: String(name || '').trim().slice(0, 80) || 'Project', conversationIds: [], color, icon, textColor: 'gray', instructions: '', pinned: false, sources: [], memoryScope: memoryScope === 'project' ? 'project' : 'default' };
  const ids = (conversations || []).filter((conversation) => conversation?.sharedProject?.id === sharedId && !conversation.deletedAt && !conversation.isTemporary).map((conversation) => conversation.id);
  folder.conversationIds = [...ids];
  return { folder, ids };
}
