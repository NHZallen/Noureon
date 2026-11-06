// A member who leaves a shared project can take what they made in it into a project of their own (docs/superpowers/specs/2026-11-06-project-sharing-design.md, §9): the conversations they made are
// copied into a new private project; the files, the instructions and the memory of the shared project do not come along. The originals stay in the shared project.

import { branchMessages } from '../branch/branch-conversation.js';

/** { folder, copies }: the new folder and the copies of the conversations of the person that were made in the project `sharedId`. */
export function ownProjectFrom({ conversations, sharedId, name, memoryScope = 'default', icon = 'default', color = 'gray', uuid = () => crypto.randomUUID(), now = () => new Date().toISOString() }) {
  const folder = { id: uuid(), name: String(name || '').trim().slice(0, 80) || 'Project', conversationIds: [], color, icon, textColor: 'gray', instructions: '', pinned: false, sources: [], memoryScope: memoryScope === 'project' ? 'project' : 'default' };
  const at = now();
  const mine = (conversations || []).filter((conversation) => conversation?.sharedProject?.id === sharedId && !conversation.deletedAt && !conversation.isTemporary);
  const copies = mine.map((conversation) => {
    const { sharedProject, id, ...rest } = conversation;
    const messages = branchMessages(conversation, (conversation.messages || []).length - 1, { uuid });
    return { ...structuredClone({ ...rest, messages: [] }), id: uuid(), messages, folderId: folder.id, pinned: false, createdAt: at, lastUpdatedAt: at, stateUpdatedAt: at, deletedAt: null };
  });
  folder.conversationIds = copies.map((copy) => copy.id);
  return { folder, copies };
}
