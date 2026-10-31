// What the page of the projects does to the workspace (docs/superpowers/specs/2026-10-31-projects-design.md): a project is a folder of the workspace, so these work on the folders and on the
// `folderId` of the conversations, as the sidebar's folders do. The page (ui/projects/) only asks; saving, the cloud and the sidebar are done here.

import { FOLDER_SVGS } from '../features/folder-metadata.js';
import { FOLDER_COLORS } from '../shell/runtime-ui-colors.js';
import { confirmDeleteShared } from '../share/share-ref.js';
import { PROJECT_INSTRUCTIONS_MAX } from './project-instructions.js';

export const PROJECT_NAME_MAX = 80;

const cleanName = (value) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, PROJECT_NAME_MAX);
const stamp = (conversation) => Date.parse(conversation?.lastUpdatedAt || conversation?.stateUpdatedAt || conversation?.createdAt || '') || 0;

/**
 * deps: dataStore (getFolders, replaceFolders, getConversations), getDefaultFolder(), saveAppData(options), renderSidebar(), deleteFolderFromCloud(id, { folder }),
 * deferConversationFolderSync(conversationId), startNewChat(options), getCurrentConversationId(), sendText(text) (puts the text in the box of the message and sends it), randomUUID().
 */
export function createProjectActions({
  dataStore,
  getDefaultFolder = () => ({ color: 'gray', icon: 'default', textColor: 'gray', isOpen: false }),
  saveAppData = async () => {},
  renderSidebar = () => {},
  deleteFolderFromCloud = async () => {},
  deferConversationFolderSync = () => {},
  startNewChat = async () => {},
  getCurrentConversationId = () => null,
  sendText = () => {},
  randomUUID = () => globalThis.crypto.randomUUID()
} = {}) {
  const folders = () => dataStore.getFolders();
  const conversations = () => dataStore.getConversations();
  const folderOf = (id) => folders().find((folder) => folder.id === id && !folder.deletedAt) || null;

  /** The projects, the pinned ones first, then the one with the newest chat first (a project without a chat after them, newest made first). */
  const list = () => {
    const newest = new Map();
    for (const conversation of conversations()) {
      if (!conversation.folderId || conversation.deletedAt) continue;
      newest.set(conversation.folderId, Math.max(newest.get(conversation.folderId) || 0, stamp(conversation)));
    }
    return folders()
      .filter((folder) => !folder.deletedAt)
      .map((folder, index) => ({ folder, index, at: newest.get(folder.id) || 0 }))
      .sort((left, right) => Number(Boolean(right.folder.pinned)) - Number(Boolean(left.folder.pinned)) || right.at - left.at || right.index - left.index)
      .map((entry) => entry.folder);
  };

  /** The conversations of a project: the pinned first, then the newest; none that is in the trash, archived or temporary. */
  const chatsOf = (id) => conversations()
    .filter((conversation) => conversation.folderId === id && !conversation.deletedAt && !conversation.archived && conversation.retentionMode !== 'ephemeral')
    .sort((left, right) => Number(Boolean(right.pinned)) - Number(Boolean(left.pinned)) || stamp(right) - stamp(left));

  const countOf = (id) => conversations().filter((conversation) => conversation.folderId === id && !conversation.deletedAt && conversation.retentionMode !== 'ephemeral').length;

  async function create({ name, icon, color } = {}) {
    const title = cleanName(name);
    if (!title) return { ok: false, code: 'no_name' };
    const folder = {
      id: randomUUID(),
      name: title,
      conversationIds: [],
      ...getDefaultFolder(),
      ...(icon in FOLDER_SVGS ? { icon } : {}),
      ...(color in FOLDER_COLORS ? { color } : {}),
      instructions: ''
    };
    dataStore.replaceFolders([...folders(), folder]);
    await saveAppData();
    renderSidebar();
    return { ok: true, id: folder.id };
  }

  async function update(id, patch = {}) {
    const folder = folderOf(id);
    if (!folder) return { ok: false, code: 'gone' };
    if ('name' in patch) {
      const title = cleanName(patch.name);
      if (!title) return { ok: false, code: 'no_name' };
      folder.name = title;
    }
    if (patch.icon in FOLDER_SVGS) folder.icon = patch.icon;
    if (patch.color in FOLDER_COLORS) folder.color = patch.color;
    if ('instructions' in patch) folder.instructions = String(patch.instructions ?? '').slice(0, PROJECT_INSTRUCTIONS_MAX);
    dataStore.replaceFolders([...folders()]);
    await saveAppData();
    renderSidebar();
    return { ok: true };
  }

  async function togglePinProject(id) {
    const folder = folderOf(id);
    if (!folder) return { ok: false, code: 'gone' };
    folder.pinned = !folder.pinned;
    dataStore.replaceFolders([...folders()]);
    await saveAppData();
    renderSidebar();
    return { ok: true, pinned: folder.pinned };
  }

  /** Deletes a project. `withChats`: its conversations go to the trash too (they can be restored); otherwise they are kept, outside any project. */
  async function remove(id, { withChats = false } = {}) {
    const folder = folderOf(id);
    if (!folder) return { ok: false, code: 'gone' };
    const inside = conversations().filter((conversation) => conversation.folderId === id && !conversation.deletedAt);
    if (withChats && inside.length && !(await confirmDeleteShared(inside.map((conversation) => conversation.id)))) return { ok: false, code: 'cancelled' };
    try {
      await deleteFolderFromCloud(id, { folder });
    } catch {
      return { ok: false, code: 'cloud' };
    }
    const deletedAt = new Date().toISOString();
    for (const conversation of conversations()) {
      if (conversation.folderId !== id) continue;
      conversation.folderId = null;
      if (withChats && !conversation.deletedAt) {
        conversation.deletedAt = deletedAt;
        conversation.stateUpdatedAt = deletedAt;
        conversation.trashStateUpdatedAt = deletedAt;
        conversation.archived = false;
      }
    }
    dataStore.replaceFolders(folders().filter((entry) => entry.id !== id));
    // The conversation that is open and went to the trash is left at once, for a new chat.
    const openId = getCurrentConversationId();
    if (withChats && inside.some((conversation) => conversation.id === openId)) await startNewChat({ keepSidebarOpen: true });
    await saveAppData(withChats ? { immediateCloudSync: true } : undefined);
    renderSidebar();
    return { ok: true, chats: inside.length, withChats };
  }

  /** The conversation goes back to the ones outside any project. */
  async function removeChat(conversationId) {
    const conversation = conversations().find((entry) => entry.id === conversationId);
    if (!conversation?.folderId) return { ok: false, code: 'gone' };
    const folder = folders().find((entry) => entry.id === conversation.folderId);
    if (folder) folder.conversationIds = (folder.conversationIds || []).filter((entry) => entry !== conversationId);
    conversation.folderId = null;
    deferConversationFolderSync(conversationId);
    await saveAppData();
    renderSidebar();
    return { ok: true };
  }

  async function renameChat(conversationId, title) {
    const conversation = conversations().find((entry) => entry.id === conversationId);
    const name = String(title ?? '').trim().slice(0, 200);
    if (!conversation || !name) return { ok: false, code: conversation ? 'no_name' : 'gone' };
    conversation.title = name;
    conversation.isRenamed = true;
    await saveAppData();
    renderSidebar();
    return { ok: true };
  }

  async function togglePin(conversationId) {
    const conversation = conversations().find((entry) => entry.id === conversationId);
    if (!conversation) return { ok: false, code: 'gone' };
    conversation.pinned = !conversation.pinned;
    await saveAppData();
    renderSidebar();
    return { ok: true, pinned: conversation.pinned };
  }

  /** A new chat in the project, with the text as its first message (without a text: an empty chat in the project, for the person to write in). */
  async function startChat(projectId, text) {
    const folder = folderOf(projectId);
    const message = String(text ?? '').trim();
    if (!folder) return { ok: false, code: 'gone' };
    await startNewChat({ keepSidebarOpen: false });
    const conversation = conversations().find((entry) => entry.id === getCurrentConversationId());
    if (!conversation) return { ok: false, code: 'failed' };
    conversation.folderId = projectId;
    if (!(folder.conversationIds || []).includes(conversation.id)) folder.conversationIds = [...(folder.conversationIds || []), conversation.id];
    deferConversationFolderSync(conversation.id);
    if (message) sendText(message);
    return { ok: true, conversationId: conversation.id };
  }

  return { list, chatsOf, countOf, folderOf, create, update, remove, removeChat, renameChat, togglePin, togglePinProject, startChat };
}
