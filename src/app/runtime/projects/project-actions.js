// What the page of the projects does to the workspace (docs/superpowers/specs/2026-10-31-projects-design.md): a project is a folder of the workspace, so these work on the folders and on the
// `folderId` of the conversations, as the sidebar's folders do. The page (ui/projects/) only asks; saving, the cloud and the sidebar are done here.

import { FOLDER_SVGS } from '../features/folder-metadata.js';
import { FOLDER_COLORS } from '../shell/runtime-ui-colors.js';
import { confirmDeleteShared } from '../share/share-ref.js';
import { PROJECT_INSTRUCTIONS_MAX } from './project-instructions.js';
import { normalizeSource, normalizeSources, PROJECT_SOURCE_FILE_BYTES_MAX, PROJECT_SOURCE_FILES_BYTES_MAX, PROJECT_SOURCES_CHARS_MAX, PROJECT_SOURCES_MAX, sourceFilesBytesOf, sourcesCharsOf } from './project-source-model.js';

export const PROJECT_NAME_MAX = 80;

const cleanName = (value) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, PROJECT_NAME_MAX);
const stamp = (conversation) => Date.parse(conversation?.lastUpdatedAt || conversation?.stateUpdatedAt || conversation?.createdAt || '') || 0;

/**
 * deps: dataStore (getFolders, replaceFolders, getConversations), getDefaultFolder(), saveAppData(options), renderSidebar(), deleteFolderFromCloud(id, { folder }),
 * deferConversationFolderSync(conversationId), startNewChat(options), getCurrentConversationId(), sendText(text) (puts the text in the box of the message and sends it), randomUUID(),
 * dropNotes(projectId) (takes away the notes of a project that kept them for itself),
 * dropFiles(descriptions) (forgets the kept originals of sources on this device when no source uses them any more).
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
  dropFiles = async () => {},
  // Takes away the notes a project kept for itself (the page's memory); called when the project is deleted.
  dropNotes = async () => {},
  // The sources of a project changed (one came, one went, or the project went): the vectors of the files are brought up to date.
  onSourcesChanged = () => {},
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

  async function create({ name, icon, color, memoryScope } = {}) {
    const title = cleanName(name);
    if (!title) return { ok: false, code: 'no_name' };
    const folder = {
      id: randomUUID(),
      name: title,
      conversationIds: [],
      ...getDefaultFolder(),
      ...(icon in FOLDER_SVGS ? { icon } : {}),
      ...(color in FOLDER_COLORS ? { color } : {}),
      instructions: '',
      // Where the notes of its chats are kept; chosen here and never changed (docs/superpowers/specs/2026-10-31-projects-design.md, §14).
      memoryScope: memoryScope === 'project' ? 'project' : 'default'
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

  /** The sources of a project (texts and files that were read), in the order they were added. */
  const sourcesOf = (id) => normalizeSources(folderOf(id)?.sources);

  // The kept originals no source of any project uses (so they can be forgotten on this device).
  const unusedFiles = (candidates) => {
    const used = new Set(folders().flatMap((folder) => (Array.isArray(folder.sources) ? folder.sources : []).map((source) => source?.file?.hash).filter(Boolean)));
    return (candidates || []).filter((file) => file?.hash && !used.has(file.hash));
  };

  /**
   * Adds a source ({ kind, title, mime, size, text, file }): `file` is the description of a kept original (a picture, a scan). Refused with code 'full' (20 already), 'too_much' (the texts
   * together would pass 400 000 characters), 'too_big' / 'files_too_much' (an original over 20 MB, or the originals of the project over 100 MB), 'empty' or 'gone'.
   */
  async function addSource(id, input = {}) {
    const folder = folderOf(id);
    if (!folder) return { ok: false, code: 'gone' };
    const current = sourcesOf(id);
    const source = normalizeSource({ ...input, id: randomUUID(), addedAt: new Date().toISOString() });
    if (!source) return { ok: false, code: 'empty' };
    const refuse = async (code) => { await dropFiles(unusedFiles([source.file])); return { ok: false, code }; };
    if (current.length >= PROJECT_SOURCES_MAX) return refuse('full');
    if (sourcesCharsOf(current) + source.text.length > PROJECT_SOURCES_CHARS_MAX) return refuse('too_much');
    if (source.file && source.file.size > PROJECT_SOURCE_FILE_BYTES_MAX) return refuse('too_big');
    if (source.file && sourceFilesBytesOf(current) + source.file.size > PROJECT_SOURCE_FILES_BYTES_MAX) return refuse('files_too_much');
    folder.sources = [...current, source];
    dataStore.replaceFolders([...folders()]);
    await saveAppData();
    onSourcesChanged();
    return { ok: true, id: source.id };
  }

  async function removeSource(id, sourceId) {
    const folder = folderOf(id);
    if (!folder) return { ok: false, code: 'gone' };
    const current = sourcesOf(id);
    const gone = current.find((source) => source.id === sourceId);
    if (!gone) return { ok: false, code: 'gone' };
    folder.sources = current.filter((source) => source.id !== sourceId);
    dataStore.replaceFolders([...folders()]);
    await saveAppData();
    await dropFiles(unusedFiles([gone.file]));
    onSourcesChanged();
    return { ok: true };
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
    // A project that kept its notes for itself takes them with it.
    if (folder.memoryScope === 'project') await Promise.resolve(dropNotes(id)).catch(() => {});
    await dropFiles(unusedFiles(normalizeSources(folder.sources).map((source) => source.file)));
    // The conversation that is open and went to the trash is left at once, for a new chat.
    const openId = getCurrentConversationId();
    if (withChats && inside.some((conversation) => conversation.id === openId)) await startNewChat({ keepSidebarOpen: true });
    await saveAppData(withChats ? { immediateCloudSync: true } : undefined);
    renderSidebar();
    if (Array.isArray(folder.sources) && folder.sources.length) onSourcesChanged();
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

  return { list, sourcesOf, addSource, removeSource, chatsOf, countOf, folderOf, create, update, remove, removeChat, renameChat, togglePin, togglePinProject, startChat };
}
