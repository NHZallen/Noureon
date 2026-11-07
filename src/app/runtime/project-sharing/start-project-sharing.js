// Starts the sharing of projects for the page (docs/superpowers/specs/2026-11-06-project-sharing-design.md): the page of the members and the invitations (opened by the event
// `noureon:project-members` from the menu of a project) and the invitation a person opens (noureon.com/join/<code>, kept by the start of the page until a signed-in cloud account is ready).
// It is loaded after the page; a reply never waits for it.

import { getAnnouncedUser, USER_READY_EVENT } from '../features/user-ready.js';
import { getSupabaseClient } from '../../auth/supabase-client.js';
import { SERVICES, getService } from '../services.js';
import { createProjectShareClient } from './project-share-client.js';
import { createAvatarLoader } from './avatar-loader.js';
import { subscribeProjectLive } from './project-live.js';
import { createSharedMemoryStore } from './shared-memory-store.js';
import { getNotesMemory, setSharedMemoryFor } from '../memory-store/memory-ref.js';
import { PENDING_CHAT_KEY, chatLinkUrl, clearPendingChatLink, clearPendingJoin, readPendingChatLink, readPendingJoin } from './join-route.js';
import { createSharedProjectReader } from './project-reader-client.js';
import { branchFromMirror } from './branch-from-mirror.js';
import { createSharedFolders } from './shared-folders.js';
import { createProjectSnapshots, lightSource } from './project-snapshots.js';
import { ownProjectFrom } from './own-project.js';
import { setProjectFoldersReader } from '../projects/project-instructions.js';
import { setSharedProjectHook } from '../projects/project-actions.js';

export const MEMBERS_EVENT = 'noureon:project-members';
export const SHARED_EVENT = 'noureon:shared-projects';
const SHARE_CONVERSATION_EVENT = 'astra:share-conversation';
const LIVE_NET_MS = 15000;

const nameOf = (user) => {
  const candidate = String(user?.displayName || user?.username || '').trim();
  return candidate && !candidate.includes('@') ? candidate : '';
};

export function startProjectSharing({ document, window = globalThis.window, configAccess, dataStore, i18n, saveAppData, showNotification, renderSidebar = () => {}, openConversation = () => {}, supabase = null, client = null, storage = null, copyText = null, createReader = (args) => createSharedProjectReader(args), pollMs = 3000, retryMs = 3000, defaultsOf = null, renderMarkdown = null }) {
  const getSupabase = () => { if (supabase) return supabase; try { return getSupabaseClient(); } catch { return null; } };
  const avatarOf = createAvatarLoader({ getSupabase });
  const shareClient = client || createProjectShareClient({ getSupabase });
  const text = (key, values = {}) => {
    const table = i18n[configAccess.getUiLanguage()] || i18n['zh-TW'] || {};
    return String(table[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => (values[name] ?? ''));
  };
  // The replies of a conversation made in a shared project carry its instructions and use its memory only: the folders the replies look at are the person's own and the shared ones.
  const sharedFolders = createSharedFolders({ storage: (() => { try { return storage || window.localStorage; } catch { return null; } })() });
  setProjectFoldersReader(() => [...(dataStore.getFolders() || []), ...sharedFolders.list()]);
  // A chat made in a shared project uses the notes of that project, which are the owner's: one store for each project, made when a reply first needs it (only an editor writes in it).
  const memoryStores = new Map();
  setSharedMemoryFor(async (conversation) => {
    const projectId = conversation?.sharedProject?.id;
    if (!projectId || !getService(SERVICES.cloudSync)?.getStatus?.()?.enabled) return null;
    const personal = await getNotesMemory()?.ready();
    if (!personal?.isLoaded()) return null;
    const role = sharedFolders.roleOf(projectId) || 'chat';
    let held = memoryStores.get(projectId);
    if (!held || held.role !== role) { held?.stop(); held = createSharedMemoryStore({ personal, getSupabase, projectId, role }); memoryStores.set(projectId, held); }
    if (!held.isLoaded()) { try { await held.load(); } catch { memoryStores.delete(projectId); return null; } } else { try { await held.refresh(); } catch { /* the notes as they were are used */ } }
    return held;
  });
  const cloudOn = () => getService(SERVICES.cloudSync)?.getStatus?.()?.enabled === true;
  // The cloud account may still be starting when the person opens the list or a project (the page is quick): what needs it waits for it, a little while, then runs.
  const whenCloudOn = (run, { tries = 40, every = Math.min(1500, retryMs), need = () => true, giveUp = () => {} } = {}) => {
    const ready = () => cloudOn() && need();
    if (ready()) { run(); return; }
    let waited = 0;
    const timer = setInterval(() => { waited += 1; if (ready()) { clearInterval(timer); run(); } else if (waited >= tries) { clearInterval(timer); giveUp(); } }, every);
    timer?.unref?.();
  };
  const pendingStorage = () => { try { return storage || window.localStorage; } catch { return null; } };
  const copy = copyText || (async (value) => { try { await window.navigator.clipboard.writeText(value); return true; } catch { return false; } });
  let stylesLoaded = null;
  const ensureStyles = () => (stylesLoaded ||= Promise.all([import('../../../styles/projects.css'), import('../../../styles/project-sharing.css')]).catch(() => {}));

  async function openMembers({ projectId, root = null }) {
    const folder = (dataStore.getFolders() || []).find((entry) => entry.id === projectId) || sharedFolders.folderOf(projectId);
    if (!folder) return null;
    if (!cloudOn()) { showNotification(text('psNeedCloud'), 'error'); return null; }
    await ensureStyles();
    const { openMembersPanel } = await import('../../ui/projects/project-members-panel.js');
    let panel = null;
    // The window follows the people of the project: a ping about the project itself (a person joined or left) draws it again.
    const heard = subscribeProjectLive({ getSupabase, projectId, onPing: (ping) => { if (!ping?.c) void panel?.refresh?.(); } });
    panel = await openMembersPanel({
      document, root: root || document.body, text, client: shareClient, project: { id: folder.id, name: folder.name },
      inviterName: nameOf(getAnnouncedUser()), origin: window.location?.origin || '', copy, notify: showNotification,
      // The folder the page keeps has the memory the database has now (a stale copy written back could not undo it: the database keeps it, but the page should show it too).
      avatarUrl: avatarOf, onClosed: () => heard.stop(),
      onShared: async () => { sharedFolders.addOwned(folder.id); folder.memoryScope = 'project'; try { await saveAppData({ immediateCloudSync: true }); } catch { /* the next save carries it */ } }
    });
    return panel;
  }

  // The model and the settings a conversation of the person starts with (the ones they used last), as when a conversation is copied from a share.
  async function defaults() {
    if (defaultsOf) return defaultsOf();
    const [{ MODELS }, { getDefaultGenConfig }, { createDisabledCouncilConfig }] = await Promise.all([import('../shell/model-registry.js'), import('../shell/conversation-actions.js'), import('../shell/conversation-council-state.js')]);
    const config = configAccess.getConfig();
    const model = MODELS.find((entry) => entry.id === config.lastUsedModel) || MODELS.find((entry) => entry.id === config.defaultModel) || MODELS[0];
    return { model: model.id, provider: model.provider, genConfig: getDefaultGenConfig(), council: createDisabledCouncilConfig(config.lastCouncilConfig) };
  }
  const put = async (conversation) => {
    dataStore.getConversations().unshift(conversation);
    await saveAppData({ immediateCloudSync: true });
    renderSidebar();
    openConversation(conversation.id);
  };

  // ----- a shared project is shown by the page of the projects, as a project of the person's own is: these actions answer for it (runtime/projects/project-actions.js, setSharedProjectHook)
  // The conversations of each shared project as the server gave them, and the project being kept live (the one the page of the projects shows).
  const chatsByProject = new Map();
  const sessions = new Map();
  const me = () => getAnnouncedUser()?.supabaseUserId || '';
  // What the page drew the last time (the chats and the files of each shared project), so a project opens at once while the server is asked again; and the projects whose reading failed (their own chats are drawn, not "loading").
  const snapshots = createProjectSnapshots({ storage: pendingStorage(), user: me });
  const failedReads = new Set();
  const keptChats = (projectId) => (snapshots.get(projectId)?.chats || []).filter((entry) => entry.authorId !== me());
  const stampOf = (chat) => Date.parse(chat?.lastUpdatedAt || chat?.updatedAt || chat?.createdAt || '') || 0;
  const rowOf = (chat) => ({ id: chat.id, title: chat.title || '', lastUpdatedAt: chat.updatedAt, createdAt: chat.createdAt, messages: chat.messages || [], pinned: false, shared: true, mine: chat.authorId === me(), authorId: chat.authorId, authorName: chat.authorName });
  // The chats of a shared project: the person's own (the copies they keep, which are newer than what the cloud has) and everybody else's (as the server gave them).
  const chatsOf = (projectId) => {
    const own = (dataStore.getConversations() || []).filter((entry) => entry.sharedProject?.id === projectId && !entry.deletedAt && !entry.archived && (entry.messages || []).length > 0).map((entry) => ({ ...entry, shared: true, mine: true }));
    const ids = new Set(own.map((entry) => entry.id));
    const others = (chatsByProject.has(projectId) ? chatsByProject.get(projectId) : keptChats(projectId)).filter((entry) => !ids.has(entry.id)).map(rowOf);
    return [...own, ...others].sort((left, right) => Number(Boolean(right.pinned)) - Number(Boolean(left.pinned)) || stampOf(right) - stampOf(left));
  };
  const remember = (projectId, info) => sharedFolders.set({ ...info.project, id: projectId, role: info.role, ownerId: info.owner?.id, ownerName: info.owner?.name, ...(Array.isArray(info.conversations) ? { chatCount: info.conversations.length } : {}) });
  // The folder as the page draws it: its files come from what was read, or, until then, from the cards that were kept.
  const shownFolder = (id) => { const folder = sharedFolders.folderOf(id); if (!folder) return null; return folder.sources?.length ? folder : { ...folder, sources: snapshots.get(id)?.sources || [] }; };

  async function saveInstructionsOf(session, value) {
    const saved = await shareClient.updateProject(session.projectId, { instructions: value, expected: session.readAt });
    if (saved.ok) { session.readAt = saved.data?.updated_at || session.readAt; session.info.project.instructions = value; remember(session.projectId, session.info); session.refresh?.({ full: true }); showNotification(text('psInstructionsSaved'), 'success'); return { ok: true }; }
    return failedWrite(session, saved);
  }
  async function saveSourcesOf(session, list) {
    const saved = await shareClient.updateProject(session.projectId, { sources: list, expected: session.readAt });
    if (saved.ok) { session.readAt = saved.data?.updated_at || session.readAt; session.info.project.sources = list; remember(session.projectId, session.info); session.refresh?.({ full: true }); return { ok: true }; }
    return failedWrite(session, saved);
  }
  // A write that met a newer version of the project reads it again and says so; one that is not allowed says that.
  async function failedWrite(session, saved) {
    if (saved.code === 'stale') { await loadSession(session); showNotification(text('psStale'), 'error'); return { ok: false, code: 'stale' }; }
    showNotification(text(saved.code === 'not_allowed' ? 'psNotAllowed' : 'psFailed'), 'error');
    return { ok: false, code: saved.code === 'not_allowed' ? 'not_allowed' : 'failed' };
  }
  const sourcesOfSession = (session) => (Array.isArray(session.info?.project?.sources) ? session.info.project.sources : []);
  async function addSourceTo(session, input) {
    const [model, { getProjectFileStore }] = await Promise.all([import('../projects/project-source-model.js'), import('../projects/project-source-files.js')]);
    const list = sourcesOfSession(session);
    let source = model.normalizeSource({ ...input, id: crypto.randomUUID(), addedAt: new Date().toISOString(), addedBy: { id: me(), name: nameOf(getAnnouncedUser()) } });
    if (!source) return { ok: false, code: 'empty' };
    if (list.length >= model.PROJECT_SOURCES_MAX) return { ok: false, code: 'full' };
    if (model.sourcesCharsOf(list) + source.text.length > model.PROJECT_SOURCES_CHARS_MAX) return { ok: false, code: 'too_much' };
    if (source.file && source.file.size > model.PROJECT_SOURCE_FILE_BYTES_MAX) return { ok: false, code: 'too_big' };
    if (source.file && model.sourceFilesBytesOf(list) + source.file.size > model.PROJECT_SOURCE_FILES_BYTES_MAX) return { ok: false, code: 'files_too_much' };
    if (source.file) {
      // The original that the page kept goes to the server, which keeps it in the owner's space (the owner's space pays); the source then names it.
      const loaded = await getProjectFileStore()?.load(source.file);
      if (!loaded) return { ok: false, code: 'unreadable' };
      const up = await session.reader.uploadData({ data: loaded.data, mimeType: loaded.mimeType || source.file.mimeType });
      if (!up.ok) return { ok: false, code: up.code === 'too_big' ? 'too_big' : 'failed' };
      source = { ...source, file: { ...source.file, hash: up.data.hash, asset: up.data.asset } };
    }
    const saved = await saveSourcesOf(session, [...list, source]);
    return saved.ok ? { ok: true, id: source.id } : { ok: false, code: saved.code };
  }
  async function removeSourceFrom(session, sourceId) {
    const list = sourcesOfSession(session);
    if (!list.some((source) => source.id === sourceId)) return { ok: false, code: 'gone' };
    return saveSourcesOf(session, list.filter((source) => source.id !== sourceId));
  }
  // The chats of a shared project are read in the background when the list shows it, so opening it does not wait for the server.
  const prefetching = new Set();
  async function prefetch(projectId) {
    if (!projectId || chatsByProject.has(projectId) || prefetching.has(projectId) || !cloudOn()) return;
    prefetching.add(projectId);
    try {
      const read = await createReader({ projectId }).load();
      if (read.ok && !chatsByProject.has(projectId)) { chatsByProject.set(projectId, read.project.conversations || []); failedReads.delete(projectId); snapshots.set(projectId, { chats: read.project.conversations || [], sources: read.project.project?.sources || [] }); }
    } catch { /* it is read when the project is opened */ } finally { prefetching.delete(projectId); }
  }
  const sessionFor = (id) => sessions.get(id) || null;
  // A file of a shared project as a member gets it: the server gives it from the owner's folder (a file that the project holds).
  const sharedFile = async (id, source) => {
    // The file is named by its path when the source has it, else by where the files of a person are kept: `<person>/<hash>` (as the server reads them for a reply). Most sources have no path: the page keeps the original here first.
    const owner = sharedFolders.ownerOf(id) || sessionFor(id)?.info?.owner?.id || '';
    const path = source?.file?.asset?.__astraCloudAsset?.path || (owner && source?.file?.hash ? `${owner}/${source.file.hash}` : '');
    // With no path known the server finds the owner by the project and is asked by the hash.
    const data = path || source?.file?.hash ? await (sessionFor(id)?.reader || createReader({ projectId: id })).asset(path, source?.file?.hash || '') : '';
    return data ? { mimeType: source.file.mimeType, data } : null;
  };
  setSharedProjectHook({
    has: (id) => sharedFolders.has(id),
    list: () => sharedFolders.list().map((folder) => shownFolder(folder.id)),
    folderOf: (id) => shownFolder(id),
    chatsOf,
    // (The number comes from the list until the chats are read.)
    countOf: (id) => (chatsByProject.has(id) || snapshots.get(id) ? chatsOf(id).length : sharedFolders.folderOf(id)?.chatCount || 0),
    chatsLoading: (id) => sharedFolders.has(id) && !chatsByProject.has(id) && !snapshots.get(id) && !failedReads.has(id),
    update: async (id, patch = {}) => {
      const session = sessionFor(id);
      if (!session) return { ok: false, code: 'gone' };
      const look = ['name', 'icon', 'color', 'textColor'].filter((key) => key in patch);
      if (!('instructions' in patch) && !look.length) return { ok: false, code: 'gone' };
      if (look.length) {
        const saved = await shareClient.updateProject(id, { name: patch.name, icon: patch.icon, color: patch.color, textColor: patch.textColor, expected: session.readAt });
        if (!saved.ok) return failedWrite(session, saved);
        session.readAt = saved.data?.updated_at || session.readAt;
        await loadSession(session);
        session.refresh?.({ full: true });
      }
      if ('instructions' in patch) return saveInstructionsOf(session, String(patch.instructions ?? '').slice(0, 8000));
      return { ok: true };
    },
    // The owner of a project that is shared: the chats of the others come with the person's own, and the owner may take one out of the project (never delete it).
    othersOf: (id) => (sharedFolders.isOwned(id) && !sharedFolders.has(id) ? (chatsByProject.has(id) ? chatsByProject.get(id).filter((entry) => entry.authorId !== me()) : keptChats(id)).map(rowOf) : []),
    canModerate: (id) => sharedFolders.isOwned(id) && !sharedFolders.has(id),
    // A project of the person's own that is shared: how many chats it has, of everybody (from the list until its chats are read).
    ownedCount: (id) => {
      if (!sharedFolders.isOwned(id) || sharedFolders.has(id)) return null;
      const others = chatsByProject.has(id) ? chatsByProject.get(id).filter((entry) => entry.authorId !== me()) : snapshots.get(id) ? keptChats(id) : null;
      if (!others) return sharedFolders.ownedCount(id);
      const mine = (dataStore.getConversations() || []).filter((entry) => entry.folderId === id && !entry.deletedAt && !entry.archived && (entry.messages || []).length > 0).length;
      return mine + others.length;
    },
    moveOut: async (id, conversationId) => {
      const result = await shareClient.moveOut(id, conversationId);
      if (!result.ok) return result;
      chatsByProject.set(id, (chatsByProject.get(id) || []).filter((entry) => entry.id !== conversationId));
      const held = sessions.get(id);
      if (held) void tickSession(held);
      return { ok: true };
    },
    addSource: async (id, input) => { const session = sessionFor(id); return session ? addSourceTo(session, input) : { ok: false, code: 'gone' }; },
    removeSource: async (id, sourceId) => { const session = sessionFor(id); return session ? removeSourceFrom(session, sourceId) : { ok: false, code: 'gone' }; },
    // A file of the project as a member gets it: the server gives it from the owner's folder (a file that the project holds).
    fileOf: (id, source) => sharedFile(id, source),
    // The same for a project of the person's own that is shared (a file a member added is not on this device): the last place to look.
    ownFileOf: (id, source) => (sharedFolders.isOwned(id) && !sharedFolders.has(id) ? sharedFile(id, source) : null),
    // (The owner is known from the list, from the read, or from the open session; a chat is never linked with none.)
    link: (id) => ({ id, ownerId: sharedFolders.ownerOf(id) || sessions.get(id)?.info?.owner?.id || '' }),
    sent: () => { void Promise.resolve(saveAppData({ immediateCloudSync: true })).catch(() => {}); }
  });

  // The link of a conversation to a shared project is forgotten (the person left, was taken out, or the owner took the conversation out): it is a plain conversation of the person's history again.
  function releaseConversations(match) {
    let changed = false;
    const stamp = new Date().toISOString();
    for (const conversation of dataStore.getConversations() || []) {
      if (!conversation?.sharedProject || !match(conversation)) continue;
      delete conversation.sharedProject;
      conversation.stateUpdatedAt = stamp;
      changed = true;
    }
    if (changed) { void Promise.resolve(saveAppData({ immediateCloudSync: true })).catch(() => {}); renderSidebar(); }
    return changed;
  }
  // What the server gave is put where the page looks: the folder the replies use, the chats of the project, and the page itself (its chats, or all of it when the project's own parts changed).
  function applyInfo(session, info) {
    // (What the page shows is what it knows from the list until this first read: only a difference from it draws the whole page again.)
    const shown = session.info ? { project: session.info.project, role: session.info.role } : { project: shownFolder(session.projectId) || {}, role: sharedFolders.roleOf(session.projectId) };
    // What of the project changed (the page draws again only what shows it): the files, the instructions, the head (name, icon, colour) or the person's role.
    const parts = (project, role) => ({ sources: JSON.stringify((project?.sources || []).map(lightSource)), instructions: project?.instructions || '', head: JSON.stringify([project?.name, project?.icon, project?.color]), role });
    const before = parts(shown.project, shown.role);
    session.info = info;
    if (info.project?.updated_at) session.readAt = info.project.updated_at;
    if (!session.owned) remember(session.projectId, info);
    chatsByProject.set(session.projectId, info.conversations || []);
    failedReads.delete(session.projectId);
    snapshots.set(session.projectId, { chats: info.conversations || [], sources: session.owned ? [] : info.project?.sources || [] });
    const fresh = session.viewer ? (info.conversations || []).find((entry) => entry.id === session.viewer.chatId) : null;
    if (fresh) session.viewer.sheet.update(fresh);
    // (An owner's own page keeps the project itself by its own sync: only the chats are drawn again.)
    const after = parts(info.project, info.role);
    const what = session.owned ? [] : Object.keys(after).filter((key) => before[key] !== after[key]);
    session.refresh?.(what.length ? { full: true, what } : { full: false });
  }
  // The person was taken out of the project (or it was deleted): say so, forget it, and let the page of the projects go back to its list.
  function removedFrom(session) {
    if (!sessions.has(session.projectId)) return;
    if (session.owned) { stopSession(session); chatsByProject.delete(session.projectId); snapshots.forget(session.projectId); return; }
    showNotification(text('psSharedGone'), 'error');
    stopSession(session);
    // What the person made in the project is theirs again (the database gave it back): their page forgets the link too.
    releaseConversations((conversation) => conversation.sharedProject?.id === session.projectId);
    sharedFolders.forget(session.projectId);
    chatsByProject.delete(session.projectId);
    snapshots.forget(session.projectId);
    memoryStores.get(session.projectId)?.stop();
    memoryStores.delete(session.projectId);
    document.dispatchEvent(new window.CustomEvent('noureon:project-gone', { detail: { projectId: session.projectId } }));
  }
  async function loadSession(session) {
    const read = await session.reader.load();
    if (read.ok) applyInfo(session, read.project);
    return read;
  }
  async function tickSession(session) {
    if (document.hidden || !sessions.has(session.projectId)) return;
    if (session.reading) { session.again = true; return; }
    session.reading = true;
    try {
      session.lastRead = Date.now();
      const result = await session.reader.refresh();
      if (result.ok && result.changed) {
        applyInfo(session, result.project);
        // A conversation of the person that the owner took out of the project is told as gone: their page lets go of it too.
        if (result.removed?.length) { const gone = new Set(result.removed); releaseConversations((conversation) => conversation.sharedProject?.id === session.projectId && gone.has(conversation.id)); }
      } else if (!result.ok && result.code === 'gone') removedFrom(session);
    } finally { session.reading = false; }
    if (session.again) { session.again = false; later(() => { void tickSession(session); }, 300); }
  }
  // Live: while the Realtime channel of the project is joined the page reads when it is pinged (at most once in 300 ms, one more read right after if pings came meanwhile) and, as a net, every LIVE_NET_MS;
  // while it is not joined the page reads every `pollMs`.
  function startLive(session) {
    session.live = false;
    session.lastRead = Date.now();
    const onVisible = () => { if (!document.hidden) void tickSession(session); };
    session.channel = subscribeProjectLive({ getSupabase, projectId: session.projectId, onPing: (ping) => { if (session.owned && !ping?.c) void Promise.resolve(getService(SERVICES.cloudSync)?.retry?.()).catch(() => {}).then(() => session.refresh?.({ full: true })); void tickSession(session); }, onState: (joined) => { session.live = joined; if (joined) void tickSession(session); } });
    session.timer = setInterval(() => { if (!session.live || Date.now() - session.lastRead >= LIVE_NET_MS) void tickSession(session); }, pollMs);
    session.timer?.unref?.(); // (a page keeps the process of a test alive otherwise; in a browser the timer is a number)
    document.addEventListener('visibilitychange', onVisible);
    session.off = () => document.removeEventListener('visibilitychange', onVisible);
  }
  function stopSession(session) {
    clearInterval(session.timer);
    session.channel?.stop();
    session.off?.();
    session.viewer?.sheet?.close?.();
    sessions.delete(session.projectId);
  }
  /** Reads a shared project of the person and keeps it live (the page of the projects shows it). Resolves the session, or null when the person is not in the project. */
  async function startSession(projectId, refresh = null, { notMemberText = 'psSharedGone', quiet = false, owned = false } = {}) {
    if (sessions.has(projectId)) { const held = sessions.get(projectId); if (refresh) held.refresh = refresh; return held; }
    const session = { projectId, owned, reader: createReader({ projectId }), info: null, readAt: null, refresh, live: false, lastRead: 0, reading: false, again: false, timer: null, channel: null, viewer: null, off: null };
    const read = await session.reader.load();
    if (!read.ok) { if (!quiet) showNotification(text(read.code === 'gone' ? notMemberText : 'psSharedLoadFailed'), 'error'); failedReads.add(projectId); try { refresh?.(); } catch { /* the page may be gone */ } return null; }
    if (sessions.has(projectId)) return sessions.get(projectId);
    sessions.set(projectId, session);
    applyInfo(session, read.project);
    startLive(session);
    return session;
  }
  // The page of the projects says which project it shows: the shared one is read and kept live while it is shown, and left when the page goes elsewhere. A project of the person's own that is shared is only
  // listened to: when the people of it change something (an editor adds a file), the person's own cloud is asked for the change, and the page draws it.
  // The project the page shows now: when the page learns later (it asks when it starts) that this one is shared, its session is started then.
  let viewing = null;
  // A read that fails (the server is waking up, the network is weak) is asked again a few times while the project is shown, so the person is not left with an empty project.
  async function startWithRetry(projectId, refresh, options = {}, attempt = 0) {
    const session = await startSession(projectId, refresh, { ...options, quiet: options.quiet || attempt > 0 });
    if (session || attempt >= 4 || viewing?.projectId !== projectId) return session;
    await new Promise((resolve) => { later(resolve, retryMs * (attempt + 1)); });
    if (viewing?.projectId !== projectId || sessions.has(projectId)) return sessions.get(projectId) || null;
    return startWithRetry(projectId, refresh, options, attempt + 1);
  }
  const startViewed = () => {
    if (!viewing?.projectId || !cloudOn() || sessions.has(viewing.projectId)) return;
    if (sharedFolders.has(viewing.projectId)) void startWithRetry(viewing.projectId, viewing.refresh);
    else if (sharedFolders.isOwned(viewing.projectId)) void startWithRetry(viewing.projectId, viewing.refresh, { owned: true, quiet: true });
  };
  document.addEventListener('noureon:project-view', (event) => {
    const { projectId, refresh } = event.detail || {};
    viewing = projectId ? { projectId, refresh } : null;
    for (const session of [...sessions.values()]) if (session.projectId !== projectId) stopSession(session);
    if (!projectId) return;
    if (!cloudOn()) { whenCloudOn(() => { void refreshShared().then(startViewed); }); return; }
    if (sharedFolders.has(projectId)) { void startWithRetry(projectId, refresh); return; }
    // A project of the person's own that is shared: the chats of the others are read with it, and when the people of it change something else (an editor adds a file) the person's own cloud is asked for it.
    if (sharedFolders.isOwned(projectId)) void startWithRetry(projectId, refresh, { owned: true, quiet: true });
  });

  // Someone else's chat of the project is read as a page, with the way on: a branch (a conversation of the reader's, made of it up to the last reply or the reply they chose).
  async function branchOf(session, chat, pick) {
    const shared = { id: session.projectId, ownerId: session.info.owner.id };
    try {
      const fresh = await session.reader.conversation(chat.id);
      const base = fresh.ok ? fresh.chat : chat;
      const messages = base.messages || [];
      let index = pick?.last ? messages.map((message) => message.role).lastIndexOf('model') : messages.findIndex((message) => message.id === pick?.id);
      if (index < 0 && Number.isInteger(pick?.index)) index = pick.index;
      const made = branchFromMirror({ chat: base, messageIndex: index, shared, title: text('branchTitle', { title: base.title || '' }), defaults: await defaults() });
      if (!made) { showNotification(text('branchNothing'), 'error'); return; }
      await put(made);
      showNotification(text('psBranched'), 'success');
    } catch { showNotification(text('branchFailed'), 'error'); }
  }
  async function readChat(session, chat, host) {
    await ensureStyles();
    const language = configAccess.getUiLanguage();
    const [{ openProjectConversation }, { createSourceOpener }] = await Promise.all([import('../../ui/projects/project-conversation-viewer.js'), import('../../ui/projects/project-source-open.js')]);
    // The files of the project that a reply looked into: looked at, or had, as the page of the sources does.
    const opener = createSourceOpener({
      document, language: () => configAccess.getUiLanguage(), text, notify: (message, type = 'success') => showNotification(message, type),
      loadFile: ({ source }) => sharedFile(session.projectId, source),
      openMedia: (media, trigger) => { void import('../projects/project-media-viewer.js').then(({ openProjectMedia }) => openProjectMedia({ document, language: configAccess.getUiLanguage(), media, trigger, getText: (key, fallback) => (i18n[configAccess.getUiLanguage()] || i18n['zh-TW'] || {})[key] || fallback })); }
    });
    const named = (name) => { const wanted = String(name || '').trim().toLowerCase(); return (session.info?.project?.sources || []).find((item) => [item.title, item.file?.name].some((value) => String(value || '').trim().toLowerCase() === wanted)) || null; };
    const withSource = (name, run) => { const source = named(name); if (!source) { showNotification(text('pjSourceOpenFailed'), 'error'); return false; } return run({ id: session.projectId }, source); };
    const sheet = openProjectConversation({
      onOpenSource: (name, row) => withSource(name, (project, source) => opener.preview(project, source, row)), onDownloadSource: (name) => withSource(name, (project, source) => opener.download(project, source)),
      document, root: host || document.body, text, texts: i18n[language] || i18n['zh-TW'] || {}, language, chat, renderMarkdown, loadAsset: (path) => session.reader.asset?.(path), project: session.info?.project,
      onClose: () => { if (session.viewer?.sheet === sheet) session.viewer = null; }, onBranch: (pick) => { void branchOf(session, chat, pick); }
    });
    session.viewer = { chatId: chat.id, sheet };
    return sheet;
  }
  document.addEventListener('noureon:shared-chat', (event) => {
    const { projectId, chat, root } = event.detail || {};
    void (async () => {
      // (A chat that is only a line kept from the last time is read as it is now, then opened.)
      const session = sessions.get(projectId) || await startSession(projectId, null, { quiet: true });
      if (!session) return;
      let full = (chatsByProject.get(projectId) || []).find((entry) => entry.id === chat?.id);
      if (!full) { const fresh = await session.reader.conversation(chat?.id); full = fresh.ok ? fresh.chat : null; }
      if (full) void readChat(session, full, root);
    })();
  });
  // Leaving: asked from the menu of the project; the person may keep the conversations they made there as a project of their own.
  document.addEventListener('noureon:project-leave', (event) => {
    const { projectId, root, onLeft } = event.detail || {};
    const session = sessions.get(projectId);
    if (!session) return;
    void (async () => {
      await ensureStyles();
      const { openLeaveDialog } = await import('../../ui/projects/shared-project-page.js');
      const mineCount = (chatsByProject.get(projectId) || []).filter((chat) => chat.authorId === me()).length;
      openLeaveDialog({
        document, root: root || document.body, text, project: session.info.project, mineCount,
        onLeave: async (choice = {}) => {
          // First the project keeps its copy of what the person made (the server needs it as it is), then their own project is thought of, then they leave. If the copy cannot be made they choose.
          if (choice.keep !== false && mineCount > 0) {
            const { askKeepFailed, keepConversationsOrAsk } = await import('../../ui/projects/project-keep.js');
            const done = await keepConversationsOrAsk({ client: shareClient, projectId, ask: () => askKeepFailed({ document, root: root || document.body, text }) });
            if (!done.ok) return;
          }
          const made = choice.own ? ownProjectFrom({ conversations: dataStore.getConversations() || [], sharedId: projectId, name: choice.name, memoryScope: choice.memory, icon: session.info.project?.icon, color: session.info.project?.color }) : null;
          const left = await shareClient.leave(projectId);
          if (!left.ok) { showNotification(text('psFailed'), 'error'); return; }
          const name = session.info.project?.name || '';
          stopSession(session);
          sharedFolders.forget(projectId);
          chatsByProject.delete(projectId);
          snapshots.forget(projectId);
          memoryStores.get(projectId)?.stop();
          memoryStores.delete(projectId);
          onLeft?.();
          // What the person made is theirs again: in a project of their own when they chose that, else in their history.
          const moved = new Set(made?.ids || []);
          if (made && moved.size) {
            dataStore.replaceFolders([...(dataStore.getFolders() || []), made.folder]);
            const stamp = new Date().toISOString();
            for (const conversation of dataStore.getConversations() || []) if (moved.has(conversation.id)) { delete conversation.sharedProject; conversation.folderId = made.folder.id; conversation.stateUpdatedAt = stamp; }
          }
          releaseConversations((conversation) => conversation.sharedProject?.id === projectId);
          if (moved.size) {
            try { await saveAppData({ immediateCloudSync: true }); } catch { /* the next save carries it */ }
            renderSidebar();
            showNotification(text('psLeaveOwnDone', { name: made.folder.name }), 'success');
            return;
          }
          showNotification(text('psLeft', { name }), 'success');
        }
      });
    })();
  });

  /**
   * Opens a shared project of the person in the page of the projects (the same page as a project of their own). With `openChatId` (a link to one conversation) that conversation is opened at once: the person's
   * own in the chat, someone else's as the page that is read. Resolves the session, or null when the person is not in the project.
   */
  async function openShared({ project_id: projectId, root = null, openChatId = '', notMemberText = 'psSharedGone', ...item }) {
    let session = sessions.get(projectId) || null;
    if (!session) {
      const info = await createReader({ projectId }).info();
      if (!info.ok) { showNotification(text(info.code === 'gone' ? notMemberText : 'psSharedLoadFailed'), 'error'); return null; }
      remember(projectId, info.project);
      // The page of the projects shows it; it tells which project it shows, and that starts the session.
      document.dispatchEvent(new window.CustomEvent('noureon:open-project', { detail: { id: projectId } }));
      session = sessions.get(projectId) || await startSession(projectId, null, { quiet: true });
      if (!session) return null;
    }
    void item;
    if (openChatId) {
      const wanted = (chatsByProject.get(projectId) || []).find((entry) => entry.id === openChatId);
      if (!wanted) showNotification(text('psSharedGone'), 'error');
      else if (wanted.authorId === me() && (dataStore.getConversations() || []).some((entry) => entry.id === wanted.id)) openConversation(wanted.id);
      else await readChat(session, wanted, root);
    }
    return session;
  }

  /** Fills the list "Shared with you" of the projects page; a row opens the project in the page itself. */
  // `box`: where to draw the list (none: only the page is told, by `done`, that the projects shared with the person are known).
  let sharedAskedAt = 0;
  async function drawSharedList({ box = null, root = null, go = null, done = null }) {
    if (!cloudOn()) { whenCloudOn(() => { void drawSharedList({ box, root, go, done }); }); return; }
    // The page asks each time its list is drawn (a letter typed in the search): not more than every few seconds.
    if (!box && Date.now() - sharedAskedAt < 8000) { try { done?.(); } catch { /* the page may be gone */ } return; }
    sharedAskedAt = Date.now();
    const result = await shareClient.sharedWithMe();
    if (!result.ok || !Array.isArray(result.data) || !result.data.length) return;
    for (const item of result.data) {
      const known = sharedFolders.folderOf(item.project_id);
      sharedFolders.set({ ...(known || {}), id: item.project_id, name: item.name, icon: item.icon, color: item.color, role: item.role, ownerId: item.owner_id, ownerName: item.owner_name, chatCount: item.chat_count });
    }
    result.data.slice(0, 6).forEach((item) => { void prefetch(item.project_id); });
    if (box) {
      await ensureStyles();
      const { drawSharedProjects } = await import('../../ui/projects/shared-project-page.js');
      drawSharedProjects({ document, box, text, items: result.data, onOpen: (item) => { if (go) go(item.project_id); else void openShared({ ...item, root }); } });
    }
    try { done?.(); } catch { /* the page may be gone */ }
  }

  // What the replies need of the shared projects is read again when the page starts (and the account is ready): which of the person's own projects are shared, and the instructions and sources of the others.
  let refreshing = false;
  let refreshWaiting = false;
  async function refreshShared() {
    if (refreshing) return;
    // (The cloud account and the person may not be known yet when the page starts: wait for them, a little while, instead of giving up.)
    if (!cloudOn() || !getAnnouncedUser()?.supabaseUserId) { if (!refreshWaiting) { refreshWaiting = true; whenCloudOn(() => { refreshWaiting = false; void refreshShared(); }, { need: () => Boolean(getAnnouncedUser()?.supabaseUserId), tries: 80, giveUp: () => { refreshWaiting = false; } }); } return; }
    refreshing = true;
    try {
      const mine = await shareClient.mine();
      if (mine.ok) sharedFolders.setOwned(mine.data || []);
      // What the owner of a project took out of it while this page was away: the link it still holds is forgotten.
      const exits = await shareClient.exits?.();
      if (exits?.ok) { const gone = new Set((exits.data || []).map((item) => item.conversation_id)); if (gone.size) releaseConversations((conversation) => gone.has(conversation.id)); }
      const others = await shareClient.sharedWithMe();
      if (others.ok) for (const item of others.data || []) { const info = await createReader({ projectId: item.project_id }).info(); if (info.ok) sharedFolders.set({ ...info.project.project, id: item.project_id, role: info.project.role, ownerId: info.project.owner?.id || item.owner_id, ownerName: info.project.owner?.name, chatCount: item.chat_count }); }
      // Their chats and files are read in the background and kept, so each of them opens at once (a few of them: the ones the person has just used are the first).
      [...(mine.ok ? mine.data || [] : []), ...(others.ok ? others.data || [] : [])].slice(0, 6).forEach((item) => { void prefetch(String(item?.project_id || '')); });
    } catch { /* the next start tries again */ } finally { refreshing = false; startViewed(); }
  }
  const later = (run, wait) => { const timer = setTimeout(run, wait); timer?.unref?.(); };
  const lookToRefresh = () => { for (const wait of [3000, 20000]) later(() => { void refreshShared(); }, wait); };
  lookToRefresh();

  let joining = false;
  async function takePending() {
    const storageArea = pendingStorage();
    const code = storageArea ? readPendingJoin(storageArea) : '';
    if (!code || joining) return;
    const user = getAnnouncedUser();
    if (!user) return; // not signed in yet: the code stays for after the login
    if (!user.supabaseUserId) { clearPendingJoin(storageArea); showNotification(text('psJoinNeedCloud'), 'error'); return; }
    if (!cloudOn()) return; // the cloud account is still starting
    joining = true;
    try {
      const invite = await shareClient.invite(code);
      clearPendingJoin(storageArea);
      if (!invite.ok || !invite.data) { showNotification(text('psJoinInvalid'), 'error'); return; }
      await ensureStyles();
      const { openJoinDialog } = await import('../../ui/projects/project-join-dialog.js');
      await openJoinDialog({ document, root: document.body, text, client: shareClient, code, invite: invite.data, notify: showNotification, onOpen: (projectId) => { if (projectId) document.dispatchEvent(new window.CustomEvent('noureon:open-project', { detail: { id: projectId } })); } });
    } catch {
      showNotification(text('psFailed'), 'error');
    } finally { joining = false; }
  }
  // The account may take a moment to be ready after the page opens or after the login: look a few times.
  const lookForPending = () => { for (const wait of [0, 2000, 6000, 15000, 30000]) later(() => { void takePending(); }, wait); };
  lookForPending();

  // A link to a conversation of a shared project (noureon.com/c/<project>/<conversation>) waits like an invitation does; someone who is not in the project is told so.
  let opening = false;
  async function takePendingChat() {
    const area = pendingStorage();
    const link = area ? readPendingChatLink(area) : null;
    if (!link || opening || joining) return;
    const user = getAnnouncedUser();
    if (!user) return;
    if (!user.supabaseUserId) { clearPendingChatLink(area); showNotification(text('psJoinNeedCloud'), 'error'); return; }
    if (!cloudOn()) return;
    opening = true;
    try { clearPendingChatLink(area); await openShared({ project_id: link.projectId, openChatId: link.conversationId, notMemberText: 'psChatLinkNotMember' }); } finally { opening = false; }
  }
  const lookForChat = () => { for (const wait of [0, 2000, 6000, 15000, 30000]) later(() => { void takePendingChat(); }, wait); };
  lookForChat();

  // "Share conversation" in a shared project gives a link that only its members can open (the conversation is first put in the cloud, where the others read it).
  const shareHere = async (event) => {
    const id = String(event.detail?.id || '');
    const conversation = (dataStore.getConversations() || []).find((entry) => entry.id === id);
    const projectId = conversation?.sharedProject?.id || (conversation?.folderId && sharedFolders.isOwned(conversation.folderId) ? conversation.folderId : '');
    if (!projectId) return;
    event.stopImmediatePropagation();
    try { await saveAppData({ immediateCloudSync: true }); } catch { /* the server says if the conversation is not there */ }
    showNotification(text((await copy(chatLinkUrl(window.location?.origin || '', projectId, id))) ? 'psChatLinkCopied' : 'psCopyFailed'), 'success');
  };
  window.addEventListener(SHARE_CONVERSATION_EVENT, (event) => { void shareHere(event); }, true);
  document.addEventListener(SHARED_EVENT, (event) => { if (event.detail) void drawSharedList({ box: event.detail.box || null, root: event.detail.root || null, go: event.detail.go || null, done: event.detail.done || null }); });
  // The head of a shared project shows its people (the box comes from the page of the project); the pictures are read from the bucket once for each version.
  const MEMBERS_SLOT_EVENT = 'noureon:project-members-slot';
  // The page of a project is drawn again whenever something of it changes, and each time it asks for its head: the button is kept (the people it showed, and the little pictures as they were drawn) so a new head
  // gets it at once, and a new answer that says the same people draws nothing (no letter that turns into a picture again, no flash). One live channel for each project, the one of the head that is shown.
  const memberViews = new Map();
  const memberChannels = new Map();
  document.addEventListener(MEMBERS_SLOT_EVENT, (event) => {
    const { projectId, slot, root } = event.detail || {};
    if (!projectId || !slot || !cloudOn()) return;
    const open = () => { void openMembers({ projectId, root }); };
    const show = (node, sign) => { slot.replaceChildren(node); slot.dataset.sign = sign; };
    const held = memberViews.get(projectId);
    if (held?.node) { const copy = held.node.cloneNode(true); copy.addEventListener('click', open); show(copy, held.sign); }
    const paint = async (members) => {
      const sign = JSON.stringify((Array.isArray(members) ? members : []).map((member) => [member.user_id, member.name, member.avatar_version, member.photo_url]));
      if (slot.firstChild && slot.dataset.sign === sign) return;
      await ensureStyles();
      const { drawMemberButton } = await import('../../ui/projects/project-head-members.js');
      if (!slot.isConnected) return;
      const node = drawMemberButton({ document, slot, text, members, avatarOf, onOpen: open });
      slot.dataset.sign = sign;
      if (node) memberViews.set(projectId, { sign, node }); else memberViews.delete(projectId);
    };
    // The button is drawn when the page of the project opens and again whenever the people of the project change (a person joins or leaves: the database pings the channel of the project).
    let drawing = false;
    let again = false;
    const draw = async () => {
      if (drawing) { again = true; return; }
      drawing = true;
      try {
        const answer = await shareClient.members(projectId);
        if (answer.ok && slot.isConnected) await paint(answer.data?.members || answer.data);
      } finally { drawing = false; }
      if (again) { again = false; void draw(); }
    };
    void draw();
    memberChannels.get(projectId)?.stop();
    const heard = subscribeProjectLive({ getSupabase, projectId, onPing: (ping) => { if (!slot.isConnected) { heard.stop(); if (memberChannels.get(projectId) === heard) memberChannels.delete(projectId); } else if (!ping?.c) void draw(); } });
    memberChannels.set(projectId, heard);
  });
  document.addEventListener(MEMBERS_EVENT, (event) => { void openMembers({ projectId: String(event.detail?.projectId || ''), root: event.detail?.root || null }); });
  document.addEventListener(USER_READY_EVENT, () => { const area = pendingStorage(); if (area && readPendingJoin(area)) lookForPending(); if (area && readPendingChatLink(area)) lookForChat(); lookToRefresh(); });
  void PENDING_CHAT_KEY;
  return { openMembers, openShared, takePending, takePendingChat, drawSharedList, refreshShared, sharedFolders };
}
