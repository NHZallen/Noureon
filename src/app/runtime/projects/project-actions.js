// What the page of the projects does to the workspace (docs/superpowers/specs/2026-10-31-projects-design.md): a project is a folder of the workspace, so these work on the folders and on the
// `folderId` of the conversations, as the sidebar's folders do. The page (ui/projects/) only asks; saving, the cloud and the sidebar are done here.

import { FOLDER_SVGS } from '../features/folder-metadata.js';
import { FOLDER_COLORS } from '../shell/runtime-ui-colors.js';
import { confirmDeleteShared } from '../share/share-ref.js';
import { PROJECT_INSTRUCTIONS_MAX } from './project-instructions.js';
import { normalizeSource, normalizeSources, normalizeTranscript, PROJECT_SOURCE_FILE_BYTES_MAX, PROJECT_SOURCE_FILES_BYTES_MAX, PROJECT_SOURCES_CHARS_MAX, PROJECT_SOURCES_MAX, sourceFilesBytesOf, sourcesCharsOf } from './project-source-model.js';

export const PROJECT_NAME_MAX = 80;

/**
 * The shared projects of someone else, as the page of the projects sees them (docs/superpowers/specs/2026-11-06-project-sharing-design.md): the code that runs them (runtime/project-sharing/) gives a
 * hook, and for a project the hook `has` these actions go through it instead of the person's own folders: { has(id), folderOf(id), chatsOf(id), countOf(id), update(id, patch), addSource(id, input),
 * removeSource(id, sourceId), link(id) -> { id, ownerId }, sent(conversationId) }. Without a hook everything is the person's own, as before.
 */
let sharedHook = null;
export const setSharedProjectHook = (hook) => { sharedHook = hook || null; };
const sharedHas = (id) => Boolean(sharedHook?.has?.(id));
/** The shared projects of someone else that the person has joined, as folders ('shared', with the role). */
const sharedList = () => (sharedHook?.list?.() || []);

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
  const folderOf = (id) => (sharedHas(id) ? sharedHook.folderOf(id) : folders().find((folder) => folder.id === id && !folder.deletedAt) || null);

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

  // The empty chats made for the box of a project's page (prepareChat) and not used yet: they are in the project only for what is typed in them, so no list or count shows them.
  const prepared = new Set();

  /** The conversations of a project: the pinned first, then the newest; none that is in the trash, archived or temporary. */
  // (In a project of the person that others share, the chats of the others come with the person's own: the hook gives them, `othersOf`.)
  const chatsOf = (id) => (sharedHas(id) ? sharedHook.chatsOf(id) : [...ownChatsOf(id), ...(sharedHook?.othersOf?.(id) || [])].sort((left, right) => Number(Boolean(right.pinned)) - Number(Boolean(left.pinned)) || stamp(right) - stamp(left)));
  const ownChatsOf = (id) => conversations()
    .filter((conversation) => conversation.folderId === id && !prepared.has(conversation.id) && !conversation.deletedAt && !conversation.archived && conversation.retentionMode !== 'ephemeral')
    .sort((left, right) => Number(Boolean(right.pinned)) - Number(Boolean(left.pinned)) || stamp(right) - stamp(left));

  const countOf = (id) => (sharedHas(id) ? sharedHook.countOf(id) : (sharedHook?.ownedCount?.(id) ?? ownCountOf(id)));
  /** The owner of a shared project may take the chat of another member out of it (it goes back to the history of its author). */
  /** A shared project whose chats have not come from the server yet (the page draws a place for them, not "no chats"). */
  const chatsLoading = (id) => sharedHas(id) && sharedHook.chatsLoading?.(id) === true;
  const canModerate = (id) => sharedHook?.canModerate?.(id) === true;
  const moveChatOut = async (projectId, conversationId) => (canModerate(projectId) && sharedHook.moveOut ? sharedHook.moveOut(projectId, conversationId) : { ok: false, code: 'not_allowed' });
  const ownCountOf = (id) => conversations().filter((conversation) => conversation.folderId === id && !prepared.has(conversation.id) && !conversation.deletedAt && conversation.retentionMode !== 'ephemeral').length;

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
    if (sharedHas(id)) return sharedHook.update(id, patch);
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
   * together would pass 400 000 characters), 'too_big' / 'files_too_much' (an original over 30 MB, or the originals of the project over 200 MB), 'empty' or 'gone'.
   */
  async function addSource(id, input = {}) {
    if (sharedHas(id)) return sharedHook.addSource(id, input);
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
    if (sharedHas(id)) return sharedHook.removeSource(id, sourceId);
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

  /** Keeps the words said in a video or a recording of a source (written by speech to text); the files tools and the vectors take them up. */
  async function setTranscript(id, sourceId, transcript) {
    const folder = folderOf(id);
    const next = normalizeTranscript(transcript);
    const current = sourcesOf(id);
    if (!folder || !next || !current.some((source) => source.id === sourceId && source.file)) return { ok: false, code: 'gone' };
    folder.sources = current.map((source) => (source.id === sourceId ? { ...source, transcript: next } : source));
    dataStore.replaceFolders([...folders()]);
    await saveAppData();
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
    // A chat made in a shared project of someone else is taken out of it by dropping the link (the others keep seeing it only while it is linked).
    if (conversation?.sharedProject) { delete conversation.sharedProject; await saveAppData({ immediateCloudSync: true }); renderSidebar(); return { ok: true }; }
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

  /** An empty chat in the project, open in the box of the message (the folder only knows it; nothing is synced until something is sent). */
  async function prepareChat(projectId) {
    const folder = folderOf(projectId);
    if (!folder) return { ok: false, code: 'gone' };
    await startNewChat({ keepSidebarOpen: false });
    const conversation = conversations().find((entry) => entry.id === getCurrentConversationId());
    if (!conversation) return { ok: false, code: 'failed' };
    if (sharedHas(projectId)) {
      // A shared project of someone else: the chat is linked to it by its `sharedProject` (the folder is not the person's).
      conversation.sharedProject = sharedHook.link(projectId);
      conversation.folderId = null;
      prepared.add(conversation.id);
      return { ok: true, conversationId: conversation.id };
    }
    conversation.folderId = projectId;
    if (!(folder.conversationIds || []).includes(conversation.id)) folder.conversationIds = [...(folder.conversationIds || []), conversation.id];
    prepared.add(conversation.id);
    return { ok: true, conversationId: conversation.id };
  }

  /** The chat made by prepareChat was not used: it is no longer of the project (it is an empty chat, as any the person leaves open). */
  function abandonChat(conversationId) {
    const conversation = conversations().find((entry) => entry.id === conversationId);
    prepared.delete(conversationId);
    if (!conversation || (conversation.messages || []).length > 0) return false;
    if (conversation.sharedProject) { delete conversation.sharedProject; return true; }
    const folder = folderOf(conversation.folderId);
    if (folder) folder.conversationIds = (folder.conversationIds || []).filter((id) => id !== conversationId);
    conversation.folderId = null;
    return true;
  }

  /** Something was sent in the chat made by prepareChat: the cloud is told it is in the project. */
  function sentChat(conversationId) {
    prepared.delete(conversationId);
    if (conversations().find((entry) => entry.id === conversationId)?.sharedProject) { sharedHook?.sent?.(conversationId); return; }
    deferConversationFolderSync(conversationId);
  }

  /** A new chat in the project, with the text as its first message (without a text: an empty chat in the project, for the person to write in). */
  async function startChat(projectId, text) {
    const message = String(text ?? '').trim();
    const made = await prepareChat(projectId);
    if (!made.ok) return made;
    prepared.delete(made.conversationId);
    if (sharedHas(projectId)) sharedHook.sent?.(made.conversationId); else deferConversationFolderSync(made.conversationId);
    if (message) sendText(message);
    return { ok: true, conversationId: made.conversationId };
  }

  return { list, sharedList, chatsLoading, canModerate, moveChatOut, sourcesOf, addSource, removeSource, setTranscript, chatsOf, countOf, folderOf, create, update, remove, removeChat, renameChat, togglePin, togglePinProject, startChat, prepareChat, abandonChat, sentChat };
}
