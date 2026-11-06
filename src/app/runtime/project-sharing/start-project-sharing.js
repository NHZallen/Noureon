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
import { branchFromMirror, newSharedConversation } from './branch-from-mirror.js';
import { createSharedFolders } from './shared-folders.js';
import { ownProjectFrom } from './own-project.js';
import { setProjectFoldersReader } from '../projects/project-instructions.js';

export const MEMBERS_EVENT = 'noureon:project-members';
export const SHARED_EVENT = 'noureon:shared-projects';
const SHARE_CONVERSATION_EVENT = 'astra:share-conversation';
const LIVE_NET_MS = 15000;

const nameOf = (user) => {
  const candidate = String(user?.displayName || user?.username || '').trim();
  return candidate && !candidate.includes('@') ? candidate : '';
};

export function startProjectSharing({ document, window = globalThis.window, configAccess, dataStore, i18n, saveAppData, showNotification, renderSidebar = () => {}, openConversation = () => {}, supabase = null, client = null, storage = null, copyText = null, createReader = (args) => createSharedProjectReader(args), pollMs = 3000, defaultsOf = null, renderMarkdown = null }) {
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
  const pendingStorage = () => { try { return storage || window.localStorage; } catch { return null; } };
  const copy = copyText || (async (value) => { try { await window.navigator.clipboard.writeText(value); return true; } catch { return false; } });
  let stylesLoaded = null;
  const ensureStyles = () => (stylesLoaded ||= Promise.all([import('../../../styles/projects.css'), import('../../../styles/project-sharing.css')]).catch(() => {}));

  async function openMembers({ projectId, root = null }) {
    const folder = (dataStore.getFolders() || []).find((entry) => entry.id === projectId);
    if (!folder) return null;
    if (!cloudOn()) { showNotification(text('psNeedCloud'), 'error'); return null; }
    await ensureStyles();
    const { openMembersPanel } = await import('../../ui/projects/project-members-panel.js');
    return openMembersPanel({
      document, root: root || document.body, text, client: shareClient, project: { id: folder.id, name: folder.name },
      inviterName: nameOf(getAnnouncedUser()), origin: window.location?.origin || '', copy, notify: showNotification,
      // The folder the page keeps has the memory the database has now (a stale copy written back could not undo it: the database keeps it, but the page should show it too).
      avatarUrl: avatarOf,
      onShared: async () => { sharedFolders.addOwned(folder.id); folder.memoryScope = 'project'; try { await saveAppData({ immediateCloudSync: true }); } catch { /* the next save carries it */ } }
    });
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

  /** Opens a shared project of the person (one of the list "Shared with you"). The page keeps reading it while it is open, so what others write shows at once. */
  async function openShared({ project_id: projectId, root = null, openChatId = '', notMemberText = 'psSharedGone' }) {
    const me = getAnnouncedUser()?.supabaseUserId || '';
    const reader = createReader({ projectId });
    const read = await reader.load();
    if (!read.ok) { showNotification(text(read.code === 'gone' ? notMemberText : 'psSharedLoadFailed'), 'error'); return null; }
    sharedFolders.set({ ...read.project.project, id: projectId, role: read.project.role });
    await ensureStyles();
    const language = configAccess.getUiLanguage();
    const texts = i18n[language] || i18n['zh-TW'] || {};
    const shared = { id: projectId, ownerId: read.project.owner.id };
    const host = root || document.body;
    const [{ openSharedProjectPage }, { openProjectConversation }] = await Promise.all([import('../../ui/projects/shared-project-page.js'), import('../../ui/projects/project-conversation-viewer.js')]);
    let readAt = read.project.project?.updated_at || null;
    let page = null;
    let viewer = null;
    let timer = null;
    // A branch is made of the conversation as it is now, not as it was drawn a while ago; the reply is found by its id (the last one when the reader asked for the last).
    const branch = async (chat, pick) => {
      try {
        const fresh = await reader.conversation(chat.id);
        const base = fresh.ok ? fresh.chat : chat;
        const messages = base.messages || [];
        let index = pick?.last ? messages.map((message) => message.role).lastIndexOf('model') : messages.findIndex((message) => message.id === pick?.id);
        if (index < 0 && Number.isInteger(pick?.index)) index = pick.index;
        const made = branchFromMirror({ chat: base, messageIndex: index, shared, title: text('branchTitle', { title: base.title || '' }), defaults: await defaults() });
        if (!made) { showNotification(text('branchNothing'), 'error'); return; }
        await put(made);
        showNotification(text('psBranched'), 'success');
      } catch { showNotification(text('branchFailed'), 'error'); }
    };
    const openChat = (chat) => {
      viewer = { chatId: chat.id, sheet: openProjectConversation({ document, root: host, text, texts, language, chat, renderMarkdown, loadAsset: (path) => reader.asset?.(path), onClose: () => { viewer = null; }, onBranch: (pick) => { void branch(chat, pick); } }) };
    };
    const apply = (project) => {
      sharedFolders.set({ ...project.project, id: projectId, role: project.role });
      if (project.project?.updated_at) readAt = project.project.updated_at;
      read.project.project = project.project;
      page?.update(project);
      const fresh = viewer ? project.conversations.find((entry) => entry.id === viewer.chatId) : null;
      if (fresh) viewer.sheet.update(fresh);
    };
    // Live: while the Realtime channel of the project is joined the page reads when it is pinged (at most once in 300 ms, and one more read right after if pings came meanwhile) and, as a net, every
    // LIVE_NET_MS; while it is not joined the page reads every `pollMs`.
    let live = false;
    let lastRead = 0;
    let reading = false;
    let again = false;
    const tick = async () => {
      if (document.hidden) return;
      if (reading) { again = true; return; }
      reading = true;
      try {
        lastRead = Date.now();
        const result = await reader.refresh();
        if (result.ok && result.changed) apply(result.project);
        else if (!result.ok && result.code === 'gone') removed();
      } finally { reading = false; }
      if (again) { again = false; later(() => { void tick(); }, 300); }
    };
    const onVisible = () => { if (!document.hidden) void tick(); };
    const liveChannel = subscribeProjectLive({ getSupabase, projectId, onPing: () => { void tick(); }, onState: (joined) => { live = joined; if (joined) void tick(); } });
    const stop = () => { clearInterval(timer); liveChannel.stop(); document.removeEventListener('visibilitychange', onVisible); };
    // An editor changes the instructions: written with the time the project was read at; when someone changed it since, the project is read again and the person is told.
    const editInstructions = async () => {
      const { openInstructionsEditor } = await import('../../ui/projects/shared-project-page.js');
      openInstructionsEditor({
        document, root: host, text, value: String(read.project.project?.instructions || ''),
        onSave: async (value) => {
          const saved = await shareClient.updateProject(projectId, { instructions: value, expected: readAt });
          if (saved.ok) { readAt = saved.data?.updated_at || readAt; read.project.project.instructions = value; sharedFolders.set({ ...read.project.project, id: projectId, role: read.project.role }); showNotification(text('psInstructionsSaved'), 'success'); return true; }
          if (saved.code === 'stale') { const fresh = await reader.load(); if (fresh.ok) { read.project.project = fresh.project.project; readAt = fresh.project.project?.updated_at || readAt; apply(fresh.project); } showNotification(text('psStale'), 'error'); return false; }
          showNotification(text(saved.code === 'not_allowed' ? 'psNotAllowed' : 'psFailed'), 'error');
          return false;
        }
      });
    };
    // The person was taken out of the project (or it was deleted) while the page was open: say so, forget it and close the page.
    const removed = () => {
      if (!page) return;
      showNotification(text('psSharedGone'), 'error');
      sharedFolders.forget(projectId);
      memoryStores.get(projectId)?.stop();
      memoryStores.delete(projectId);
      const closing = page;
      page = null;
      stop();
      closing.close();
    };
    // The sources of the project: everyone may take a file; the owner and the editors add and remove (written like the instructions: with the time the project was read at).
    const sourcesOf = () => (Array.isArray(read.project.project?.sources) ? read.project.project.sources : []);
    const saveSources = async (list) => {
      const saved = await shareClient.updateProject(projectId, { sources: list, expected: readAt });
      if (saved.ok) {
        readAt = saved.data?.updated_at || readAt;
        read.project.project.sources = list;
        sharedFolders.set({ ...read.project.project, id: projectId, role: read.project.role });
        page?.updateSources(list);
        return true;
      }
      if (saved.code === 'stale') { const fresh = await reader.load(); if (fresh.ok) { read.project.project = fresh.project.project; readAt = fresh.project.project?.updated_at || readAt; apply(fresh.project); } showNotification(text('psStale'), 'error'); return false; }
      showNotification(text(saved.code === 'not_allowed' ? 'psNotAllowed' : 'psFailed'), 'error');
      return false;
    };
    const addSource = async (file) => {
      const model = await import('../projects/project-source-model.js');
      const list = sourcesOf();
      if (list.length >= model.PROJECT_SOURCES_MAX) { showNotification(text('psSourceFull'), 'error'); return; }
      if (file.size > model.PROJECT_SOURCE_FILE_BYTES_MAX || model.sourceFilesBytesOf(list) + file.size > model.PROJECT_SOURCE_FILES_BYTES_MAX) { showNotification(text('psSourceTooBig'), 'error'); return; }
      let entry = null;
      if (/^text\//.test(file.type) || /\.(txt|md|csv|json)$/i.test(file.name)) {
        const body = (await file.text()).slice(0, model.PROJECT_SOURCE_CHARS_MAX);
        entry = model.normalizeSource({ id: crypto.randomUUID(), kind: 'text', title: file.name, mime: file.type || 'text/plain', size: file.size, text: body, addedAt: new Date().toISOString() });
      } else {
        const up = await reader.upload(file);
        if (!up.ok) { showNotification(text(up.code === 'too_big' ? 'psSourceTooBig' : up.code === 'forbidden' ? 'psNotAllowed' : 'psFailed'), 'error'); return; }
        entry = model.normalizeSource({ id: crypto.randomUUID(), kind: /^image\//.test(file.type) ? 'image' : 'file', title: file.name, mime: up.data.mimeType, size: up.data.size, file: { name: file.name, mimeType: up.data.mimeType, size: up.data.size, hash: up.data.hash, asset: up.data.asset }, addedAt: new Date().toISOString() });
      }
      if (!entry) { showNotification(text('psFailed'), 'error'); return; }
      if (await saveSources([...list, entry])) showNotification(text('psSourceAdded'), 'success');
    };
    const removeSource = async (source) => { if (await saveSources(sourcesOf().filter((entry) => entry.id !== source.id))) showNotification(text('psSourceRemoved'), 'success'); };
    // Taking a source: a text is made into a file here; a file is asked of the server (it gives it only for a file the project holds) and saved by the browser.
    const openSource = async (source) => {
      try {
        let blob = null;
        let name = source.file?.name || source.title || 'source';
        if (source.file?.hash) {
          const path = source.file.asset?.__astraCloudAsset?.path || `${read.project.owner.id}/${source.file.hash}`;
          const data = await reader.asset(path);
          if (!data) throw new Error('not given');
          const binary = atob(data);
          const bytes = new Uint8Array(binary.length);
          for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
          blob = new window.Blob([bytes], { type: source.file.mimeType || 'application/octet-stream' });
        } else if (typeof source.text === 'string' && source.text) {
          blob = new window.Blob([source.text], { type: 'text/plain;charset=utf-8' });
          if (!/\.[A-Za-z0-9]{1,5}$/.test(name)) name += '.txt';
        } else if (source.kind === 'url' && source.url) { window.open(source.url, '_blank', 'noopener'); return; }
        if (!blob) return;
        const link = document.createElement('a');
        const href = window.URL.createObjectURL(blob);
        link.href = href;
        link.download = name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => window.URL.revokeObjectURL(href), 10_000);
      } catch { showNotification(text('psSourceOpenFailed'), 'error'); }
    };
    page = openSharedProjectPage({
      document, root: host, text, language, shared: read.project, meId: me, onClose: stop, onOpenSource: openSource, onAddSource: addSource, onRemoveSource: removeSource,
      onOpenChat: openChat,
      onOpenOwn: (chat) => { if ((dataStore.getConversations() || []).some((entry) => entry.id === chat.id)) openConversation(chat.id); else openChat(chat); },
      onLeave: async (choice = {}) => {
        let made = null;
        if (choice.own) {
          // First the copy is made (it needs the conversations as they are), then the person leaves.
          made = ownProjectFrom({ conversations: dataStore.getConversations() || [], sharedId: projectId, name: choice.name, memoryScope: choice.memory, icon: read.project.project?.icon, color: read.project.project?.color });
        }
        const left = await shareClient.leave(projectId);
        if (!left.ok) { showNotification(text('psFailed'), 'error'); return; }
        sharedFolders.forget(projectId);
        if (made && made.copies.length) {
          dataStore.replaceFolders([...(dataStore.getFolders() || []), made.folder]);
          dataStore.getConversations().unshift(...made.copies);
          try { await saveAppData({ immediateCloudSync: true }); } catch { /* the next save carries it */ }
          renderSidebar();
          showNotification(text('psLeaveOwnDone', { name: made.folder.name }), 'success');
          return;
        }
        showNotification(text('psLeft', { name: read.project.project?.name || '' }), 'success');
      },
      onEditInstructions: () => editInstructions(),
      onNewChat: async () => { try { await put(newSharedConversation({ shared, defaults: await defaults() })); } catch { showNotification(text('psFailed'), 'error'); } }
    });
    // A link to one conversation opens it at once: one's own in the chat, someone else's as the page that is read.
    const wanted = openChatId ? read.project.conversations.find((entry) => entry.id === openChatId) : null;
    if (wanted) { if (wanted.authorId === me && (dataStore.getConversations() || []).some((entry) => entry.id === wanted.id)) { page.close(); openConversation(wanted.id); } else openChat(wanted); }
    else if (openChatId) showNotification(text('psSharedGone'), 'error');
    timer = setInterval(() => { if (!live || Date.now() - lastRead >= LIVE_NET_MS) void tick(); }, pollMs);
    timer?.unref?.(); // (a page keeps the process of a test alive otherwise; in a browser the timer is a number)
    document.addEventListener('visibilitychange', onVisible);
    return page;
  }

  /** Fills the list "Shared with you" of the projects page. */
  async function drawSharedList({ box, root = null }) {
    if (!cloudOn()) return;
    const result = await shareClient.sharedWithMe();
    if (!result.ok || !Array.isArray(result.data) || !result.data.length) return;
    await ensureStyles();
    const { drawSharedProjects } = await import('../../ui/projects/shared-project-page.js');
    drawSharedProjects({ document, box, text, items: result.data, onOpen: (item) => { void openShared({ ...item, root }); } });
  }

  // What the replies need of the shared projects is read again when the page starts (and the account is ready): which of the person's own projects are shared, and the instructions and sources of the others.
  let refreshing = false;
  async function refreshShared() {
    if (refreshing || !cloudOn() || !getAnnouncedUser()?.supabaseUserId) return;
    refreshing = true;
    try {
      const mine = await shareClient.mine();
      if (mine.ok) sharedFolders.setOwned((mine.data || []).map((item) => item.project_id));
      const others = await shareClient.sharedWithMe();
      if (others.ok) for (const item of others.data || []) { const info = await createReader({ projectId: item.project_id }).info(); if (info.ok) sharedFolders.set({ ...info.project.project, id: item.project_id, role: info.project.role }); }
    } catch { /* the next start tries again */ } finally { refreshing = false; }
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
      await openJoinDialog({ document, root: document.body, text, client: shareClient, code, invite: invite.data, notify: showNotification });
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
  document.addEventListener(SHARED_EVENT, (event) => { if (event.detail?.box) void drawSharedList({ box: event.detail.box, root: event.detail.root || null }); });
  // The head of a shared project shows its people (the box comes from the page of the project); the pictures are read from the bucket once for each version.
  const MEMBERS_SLOT_EVENT = 'noureon:project-members-slot';
  document.addEventListener(MEMBERS_SLOT_EVENT, (event) => {
    const { projectId, slot, root } = event.detail || {};
    if (!projectId || !slot || !cloudOn()) return;
    // The button is drawn when the page of the project opens and again whenever the people of the project change (a person joins or leaves: the database pings the channel of the project).
    const draw = async () => {
      const answer = await shareClient.members(projectId);
      if (!answer.ok || !slot.isConnected) return;
      await ensureStyles();
      const { drawMemberButton } = await import('../../ui/projects/project-head-members.js');
      drawMemberButton({ document, slot, text, members: answer.data?.members || answer.data, avatarOf, onOpen: () => { void openMembers({ projectId, root }); } });
    };
    void draw();
    let heard = null;
    heard = subscribeProjectLive({ getSupabase, projectId, onPing: (ping) => { if (!slot.isConnected) heard?.stop(); else if (!ping?.c) void draw(); } });
  });
  document.addEventListener(MEMBERS_EVENT, (event) => { void openMembers({ projectId: String(event.detail?.projectId || ''), root: event.detail?.root || null }); });
  document.addEventListener(USER_READY_EVENT, () => { const area = pendingStorage(); if (area && readPendingJoin(area)) lookForPending(); if (area && readPendingChatLink(area)) lookForChat(); lookToRefresh(); });
  void PENDING_CHAT_KEY;
  return { openMembers, openShared, takePending, takePendingChat, drawSharedList, refreshShared, sharedFolders };
}
