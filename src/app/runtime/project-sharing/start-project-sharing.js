// Starts the sharing of projects for the page (docs/superpowers/specs/2026-11-06-project-sharing-design.md): the page of the members and the invitations (opened by the event
// `noureon:project-members` from the menu of a project) and the invitation a person opens (noureon.com/join/<code>, kept by the start of the page until a signed-in cloud account is ready).
// It is loaded after the page; a reply never waits for it.

import { getAnnouncedUser, USER_READY_EVENT } from '../features/user-ready.js';
import { getSupabaseClient } from '../../auth/supabase-client.js';
import { SERVICES, getService } from '../services.js';
import { createProjectShareClient } from './project-share-client.js';
import { clearPendingJoin, readPendingJoin } from './join-route.js';
import { createSharedProjectReader } from './project-reader-client.js';
import { branchFromMirror, newSharedConversation } from './branch-from-mirror.js';
import { createSharedFolders } from './shared-folders.js';
import { ownProjectFrom } from './own-project.js';
import { setProjectFoldersReader } from '../projects/project-instructions.js';

export const MEMBERS_EVENT = 'noureon:project-members';
export const SHARED_EVENT = 'noureon:shared-projects';

const nameOf = (user) => {
  const candidate = String(user?.displayName || user?.username || '').trim();
  return candidate && !candidate.includes('@') ? candidate : '';
};

export function startProjectSharing({ document, window = globalThis.window, configAccess, dataStore, i18n, saveAppData, showNotification, renderSidebar = () => {}, openConversation = () => {}, supabase = null, client = null, storage = null, copyText = null, createReader = (args) => createSharedProjectReader(args), pollMs = 3000, defaultsOf = null, renderMarkdown = null }) {
  const getSupabase = () => { if (supabase) return supabase; try { return getSupabaseClient(); } catch { return null; } };
  const shareClient = client || createProjectShareClient({ getSupabase });
  const text = (key, values = {}) => {
    const table = i18n[configAccess.getUiLanguage()] || i18n['zh-TW'] || {};
    return String(table[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => (values[name] ?? ''));
  };
  // The replies of a conversation made in a shared project carry its instructions and use its memory only: the folders the replies look at are the person's own and the shared ones.
  const sharedFolders = createSharedFolders({ storage: (() => { try { return storage || window.localStorage; } catch { return null; } })() });
  setProjectFoldersReader(() => [...(dataStore.getFolders() || []).map(sharedFolders.decorate), ...sharedFolders.list()]);
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
      onNotes: (list) => sharedFolders.setOwnNotes(folder.id, list),
      onShared: async () => { folder.memoryScope = 'project'; try { await saveAppData({ immediateCloudSync: true }); } catch { /* the next save carries it */ } }
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
  async function openShared({ project_id: projectId, root = null }) {
    const me = getAnnouncedUser()?.supabaseUserId || '';
    const reader = createReader({ projectId });
    const read = await reader.load();
    if (!read.ok) { showNotification(text(read.code === 'gone' ? 'psSharedGone' : 'psSharedLoadFailed'), 'error'); return null; }
    sharedFolders.set({ ...read.project.project, id: projectId });
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
      viewer = { chatId: chat.id, sheet: openProjectConversation({ document, root: host, text, texts, language, chat, renderMarkdown, onClose: () => { viewer = null; }, onBranch: (pick) => { void branch(chat, pick); } }) };
    };
    const apply = (project) => {
      sharedFolders.set({ ...project.project, id: projectId });
      if (project.project?.updated_at) readAt = project.project.updated_at;
      read.project.project = project.project;
      page?.update(project);
      const fresh = viewer ? project.conversations.find((entry) => entry.id === viewer.chatId) : null;
      if (fresh) viewer.sheet.update(fresh);
    };
    const tick = async () => {
      if (document.hidden) return;
      const result = await reader.refresh();
      if (result.ok && result.changed) apply(result.project);
    };
    const onVisible = () => { if (!document.hidden) void tick(); };
    const stop = () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
    // An editor changes the instructions: written with the time the project was read at; when someone changed it since, the project is read again and the person is told.
    const editInstructions = async () => {
      const { openInstructionsEditor } = await import('../../ui/projects/shared-project-page.js');
      openInstructionsEditor({
        document, root: host, text, value: String(read.project.project?.instructions || ''),
        onSave: async (value) => {
          const saved = await shareClient.updateProject(projectId, { instructions: value, expected: readAt });
          if (saved.ok) { readAt = saved.data?.updated_at || readAt; read.project.project.instructions = value; sharedFolders.set({ ...read.project.project, id: projectId }); showNotification(text('psInstructionsSaved'), 'success'); return true; }
          if (saved.code === 'stale') { const fresh = await reader.load(); if (fresh.ok) { read.project.project = fresh.project.project; readAt = fresh.project.project?.updated_at || readAt; apply(fresh.project); } showNotification(text('psStale'), 'error'); return false; }
          showNotification(text(saved.code === 'not_allowed' ? 'psNotAllowed' : 'psFailed'), 'error');
          return false;
        }
      });
    };
    page = openSharedProjectPage({
      document, root: host, text, language, shared: read.project, meId: me, onClose: stop,
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
    timer = setInterval(() => { void tick(); }, pollMs);
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

  // What the replies need of the shared projects is read again when the page starts (and the account is ready): the notes of the person's own shared projects, and the instructions, notes and sources of the others.
  let refreshing = false;
  async function refreshShared() {
    if (refreshing || !cloudOn() || !getAnnouncedUser()?.supabaseUserId) return;
    refreshing = true;
    try {
      const mine = await shareClient.mine();
      if (mine.ok) for (const item of mine.data || []) sharedFolders.setOwnNotes(item.project_id, item.notes);
      const others = await shareClient.sharedWithMe();
      if (others.ok) for (const item of others.data || []) { const info = await createReader({ projectId: item.project_id }).info(); if (info.ok) sharedFolders.set({ ...info.project.project, id: item.project_id }); }
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

  document.addEventListener(SHARED_EVENT, (event) => { if (event.detail?.box) void drawSharedList({ box: event.detail.box, root: event.detail.root || null }); });
  document.addEventListener(MEMBERS_EVENT, (event) => { void openMembers({ projectId: String(event.detail?.projectId || ''), root: event.detail?.root || null }); });
  document.addEventListener(USER_READY_EVENT, () => { const area = pendingStorage(); if (area && readPendingJoin(area)) lookForPending(); lookToRefresh(); });
  return { openMembers, openShared, takePending, drawSharedList, refreshShared, sharedFolders };
}
