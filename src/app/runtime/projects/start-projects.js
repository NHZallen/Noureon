// Starts the projects for the page (docs/superpowers/specs/2026-10-31-projects-design.md): the entry "Projects" of the left menu, the page of the projects and of one project (loaded when it is
// first opened: ui/projects/) and the address that opens it (noureon.com/projects, noureon.com/projects/<id>). A reply never waits for any of it.

import { USER_READY_EVENT, getAnnouncedUser } from '../features/user-ready.js';
import { projectsRouteFromPath } from '../../ui/projects/project-path.js';
import { createSidebarProjects } from '../../ui/projects/sidebar-projects.js';
import { createProjectActions } from './project-actions.js';
import { createProjectComposer } from './project-composer.js';
import { setProjectPlaceholder } from './project-placeholder.js';
import { createProjectCrumb } from '../../ui/projects/project-crumb.js';
import { createIdbFileBackend, createMemoryFileBackend, createProjectFileStore, setProjectFileDeps } from './project-source-files.js';
import { PROJECT_SOURCE_FILE_BYTES_MAX } from './project-source-model.js';
import { getDrivePicker } from './drive-picker.js';
import { SERVICES, getService } from '../services.js';
import { getNotesMemory, getPageTranscription, getPageVectors, setProjectPieces } from '../memory-store/memory-ref.js';
import { createProjectPieces } from './project-pieces.js';
import { createProjectTranscripts } from './project-transcripts.js';
import { setProjectsApi } from './projects-api.js';

const ENTRY_ID = 'open-projects-btn';
const folderIcon = '<svg class="cli-sidebar-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>';

/**
 * deps: document, configAccess (getUiLanguage), dataStore, i18n, getDefaultFolder(), saveAppData, renderSidebar, showNotification, deleteFolderFromCloud, deferConversationFolderSync,
 * startNewChat, loadChat, archiveChat, deleteChat (the app's own, which ask what has to be asked), getCurrentConversationId, getMessageInput(), submitChatForm().
 */
export function startProjects({
  document, configAccess, dataStore, i18n, getDefaultFolder, saveAppData, renderSidebar, showNotification = () => {}, deleteFolderFromCloud, deferConversationFolderSync,
  startNewChat, loadChat, archiveChat, deleteChat, getCurrentConversationId, getMessageInput = () => null, submitChatForm = () => {}, load = null
}) {
  const win = document.defaultView || globalThis;
  const text = (key, values = {}) => {
    const table = i18n[configAccess.getUiLanguage()] || i18n['zh-TW'] || {};
    return String(table[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => (values[name] ?? ''));
  };
  const sendText = (value) => {
    const input = getMessageInput();
    if (!input) return;
    input.value = value;
    input.dispatchEvent(new win.Event('input', { bubbles: true }));
    submitChatForm();
  };
  // The originals of pictures and scans: on this device (IndexedDB, one database for each person) and, with a cloud account, in the cloud storage of the files (project-source-files.js).
  const backends = new Map();
  const backend = () => {
    const user = getAnnouncedUser();
    const key = String(user?.supabaseUserId || user?.username || 'local');
    if (!backends.has(key)) backends.set(key, win.indexedDB ? createIdbFileBackend({ indexedDB: win.indexedDB, name: `noureon-project-files:${key}` }) : createMemoryFileBackend());
    return backends.get(key);
  };
  const files = createProjectFileStore({
    backend: { get: (id) => backend().get(id), put: (record) => backend().put(record), remove: (id) => backend().remove(id) },
    getAssets: () => getService(SERVICES.cloudAssets), cryptoProvider: win.crypto || globalThis.crypto
  });
  setProjectFileDeps({ store: files });
  // The passages of the files of the projects are made into vectors with the ones of the past conversations (memory-store/page-vectors.js, when the person turned that on); a source that
  // comes or goes, or a project that goes, has the vectors brought up to date.
  setProjectPieces(createProjectPieces({ getFolders: () => dataStore.getFolders(), getConversations: () => dataStore.getConversations() }));
  // The words said in the videos and recordings of the projects are written down in the background when speech to text is on (project-transcripts.js).
  let transcripts = null;
  const actions = createProjectActions({ onSourcesChanged: () => { void getPageVectors()?.sync?.({ rerun: true }); void transcripts?.run(); }, dataStore, getDefaultFolder, saveAppData, renderSidebar, deleteFolderFromCloud, deferConversationFolderSync, startNewChat, getCurrentConversationId, sendText, dropFiles: (descriptions) => files.drop(descriptions), dropNotes: async (projectId) => { const store = await getNotesMemory()?.ready(); await store?.clearAll?.({ keepTombstones: false, scopeId: projectId }); } });

  transcripts = createProjectTranscripts({ getFolders: () => dataStore.getFolders(), getTranscription: () => getPageTranscription(), getStore: () => files, setTranscript: (projectId, sourceId, transcript) => actions.setTranscript(projectId, sourceId, transcript) });
  const first = win.setTimeout(() => { void transcripts.run(); }, 10_000);
  first?.unref?.();

  // Google's own file picker (its tabs, search and folders), when the page has the keys for it (VITE_GOOGLE_PICKER_*, see .env.example); without them the choice is not shown.
  const drive = getDrivePicker({ document, getLanguage: () => configAccess.getUiLanguage() });

  // A file a person adds: text and code as text, anything else kept as it is, for the model to read like an attachment.
  const readProjectFile = async (file) => {
    const read = await (await import('./project-source-reader.js')).readSourceFile(file);
    if (!read.ok || !read.original) return read;
    if (file.size > PROJECT_SOURCE_FILE_BYTES_MAX) return { ok: false, code: 'too_big' };
    try {
      return { ...read, file: await files.save(file) };
    } catch {
      return { ok: false, code: 'unreadable' };
    }
  };

  // What the rest of the page may ask (the report of a deep research is added to a project: ui/research/research-project.js).
  setProjectsApi({
    list: () => actions.list().map((folder) => ({ id: folder.id, name: folder.name, sources: actions.sourcesOf(folder.id).length })),
    // One file added as a source like a file chosen in the project: refused with the code of the reason, 'duplicate' for a text the project already has.
    async addFile(projectId, file, { origin = '' } = {}) {
      const read = await readProjectFile(file).catch(() => ({ ok: false, code: 'unreadable' }));
      if (!read.ok) return { ok: false, code: read.code || 'unreadable' };
      if (read.text && actions.sourcesOf(projectId).some((source) => source.text === read.text)) return { ok: false, code: 'duplicate' };
      const added = await actions.addSource(projectId, { kind: 'file', title: read.title, mime: read.mime, size: read.size, text: read.text, ...(origin === 'research' ? { origin } : {}), ...(read.file ? { file: read.file } : {}) }).catch(() => ({ ok: false }));
      return added.ok ? { ok: true, truncated: Boolean(read.truncated) } : { ok: false, code: added.code || 'failed' };
    }
  });
  // The page and its styles are a separate part, loaded the first time (the page still opens plain if the styles fail).
  const loadPage = load || (async () => {
    const [page] = await Promise.all([import('../../ui/projects/projects-page.js'), import('../../../styles/projects.css').catch((error) => { console.warn('Loading the styles of the projects failed.', error); }), import('../../../styles/projects-wide.css').catch(() => {}), import('../../../styles/project-motion.css').catch(() => {}), import('../../../styles/projects-composer.css').catch(() => {})]);
    return page;
  });
  let opening = null;
  // The box a project's page writes in is the chat's own (project-composer.js).
  const composer = createProjectComposer({
    document, actions, loadChat, getCurrentConversationId,
    getActiveConversation: () => dataStore.getConversations().find((conversation) => conversation.id === getCurrentConversationId()) || null,
    isInProject: (id) => dataStore.getConversations().some((conversation) => conversation.id === id && conversation.folderId),
    conversationExists: (id) => dataStore.getConversations().some((conversation) => conversation.id === id && !conversation.deletedAt)
  });
  // The left menu next to or over the page, the same on a phone and on a computer: the back button of the overview opens the menu (on a phone a drawer over the page, which stays behind its dim layer; on a wide
  // computer the menu is docked and the page moves over to make room, styles/projects-wide.css); with the menu already open the back leaves the page. A tap on the dim layer shuts the menu and leaves the
  // page there; a choice in the menu leaves the page for what was chosen.
  let drawerPage = null;
  // With the rail of a computer (ui/rail/) the left menu is beside the page or comes by itself on hover: the page neither brings it nor shuts it.
  const railDocked = () => ['pinned', 'hover'].includes(document.documentElement.getAttribute('data-rail-layout'));
  const drawerOpen = () => railDocked() || Boolean(document.getElementById('sidebar')?.classList.contains('open') || document.getElementById('sidebar-overlay')?.classList.contains('visible') || document.getElementById('app-container')?.classList.contains('sidebar-open'));
  const drawerOverPage = () => {
    if (drawerOpen()) return false;
    const toggle = document.getElementById('menu-toggle-btn');
    if (!toggle) return false;
    toggle.click();
    return true;
  };
  // Choosing something in the menu shuts it, as choosing a chat of the history does (on a phone the drawer, on a wide computer the docked menu).
  const closeDrawer = () => { if (!railDocked() && drawerOpen()) document.getElementById('menu-toggle-btn')?.click(); };
  const watchDrawer = (page) => {
    if (drawerPage === page) return;
    drawerPage = page;
    const side = document.getElementById('sidebar');
    if (!side) return;
    const onPick = (event) => {
      if (!page.element?.isConnected) { side.removeEventListener('click', onPick, true); drawerPage = null; return; }
      const target = event.target;
      // Leaving: a chat or a Noura of the lists, a new chat, the Extensions (not the buttons inside a row: the ⋯ of a chat, selecting). Everything else (the entry of the projects, the projects themselves, the windows
      // of the menu: search, settings, account) keeps the page.
      const row = target?.closest?.('#history-list .sidebar-item, #astras-list > *, [data-chat-id], #new-chat-btn, #open-cli-store-btn');
      if (!row || row.closest('#sidebar-projects-list') && !row.matches('[data-chat-id]')) return;
      const button = target.closest('button');
      if (button && button !== row) return;
      if (target.closest('.conv-select-checkbox') || document.querySelector('#history-list .conv-select-checkbox')) return;
      side.removeEventListener('click', onPick, true);
      drawerPage = null;
      page.close({ restore: false });
    };
    side.addEventListener('click', onPick, true);
  };
  // A shared project of someone else (joined, or opened by a link) is shown by this page like any project.
  document.addEventListener('noureon:open-project', (event) => { if (event.detail?.id) void open({ id: event.detail.id }); });
  const open = async (route = { list: true }) => {
    // A second tap while the page is being loaded does not load it again.
    opening = opening || loadPage().finally(() => { opening = null; });
    const page = await opening;
    const opened = page.openProjectsPage({
      document, text, actions, route, sourcesEnabled: true, composer,
      readFile: (file) => readProjectFile(file), drive,
      vectors: { status: (sourceId) => getPageVectors()?.sourceStatus?.(sourceId) || 'off', subscribe: (listener) => getPageVectors()?.subscribe?.(listener) },
      chats: { archive: (id) => archiveChat(id), remove: (id) => deleteChat(id) },
      openChat: (id) => { loadChat(id); closeDrawer(); },
      notify: (message, type = 'success') => showNotification(message, type),
      // Going back out of the overview on a phone brings the left menu (the drawer) over the page, which stays behind its dim layer (as in the apps this one is modelled on).
      backOut: () => drawerOverPage(),
      onClose: () => {}
    });
    watchDrawer(opened);
    return opened;
  };

  // ----- the entry of the left menu (below the one of the Extensions when that is there)
  const ensureEntry = () => {
    const list = document.querySelector('#sidebar .overflow-y-auto');
    if (!list) return null;
    // The entry is in the page from its first paint (templates/fragments/00-shell.fragment.js), with its label; here it gets its click. Without it (a test, an older template) one is made.
    let entry = document.getElementById(ENTRY_ID);
    const created = !entry;
    if (!entry) {
      entry = document.createElement('button');
      entry.id = ENTRY_ID;
      entry.type = 'button';
      entry.className = 'sidebar-item cli-sidebar-entry w-full text-left rounded-lg flex items-center';
      entry.innerHTML = `${folderIcon}<span class="cli-sidebar-label"></span>`;
    }
    if (entry.dataset.bound !== 'true') {
      entry.dataset.bound = 'true';
      entry.addEventListener('click', () => {
        // On a phone the menu is a drawer over the chat: it goes away as the page comes.
        closeDrawer();
        void open({ list: true });
      });
    }
    if (created) {
      const extensions = document.getElementById('open-cli-store-btn');
      if (extensions?.parentNode === list) list.insertBefore(entry, extensions.nextSibling);
      else list.insertBefore(entry, list.firstChild);
    }
    const label = text('pjEntry');
    const span = entry.querySelector('.cli-sidebar-label');
    if (span && span.textContent !== label) span.textContent = label;
    entry.title = label;
    return entry;
  };
  ensureEntry();
  // The entry is drawn again when the language changes, and when the Extensions entry comes after it.
  try { new win.MutationObserver(() => ensureEntry()).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] }); } catch { /* the label stays in the language it was drawn in */ }
  document.addEventListener(USER_READY_EVENT, ensureEntry);

  // ----- the projects in the left menu (a computer): drawn again whenever the history is
  const sidebarProjects = createSidebarProjects({
    document, text, actions,
    openProject: (id) => { closeDrawer(); void open({ id }); },
    openSettings: (id) => { closeDrawer(); void open({ id, edit: true }); },
    askDelete: async (id) => {
      const project = actions.folderOf(id);
      if (!project) return;
      const [page, sheets] = await Promise.all([loadPage(), import('../../ui/projects/project-sheets.js')]);
      void page;
      sheets.openDeleteSheet({ document, root: document.body, text, actions, project, notify: (message, type = 'success') => showNotification(message, type), onDeleted: () => {} });
    },
    openChat: (id) => { loadChat(id); closeDrawer(); },
    createProject: () => { void open({ create: true }); },
    openList: () => { closeDrawer(); void open({ list: true }); },
    getCurrentConversationId,
    loadParts: () => loadPage().then(() => {}),
    storage: (() => { try { return win.localStorage; } catch { return null; } })()
  });
  sidebarProjects.mount();

  // A chat that belongs to a project says so, under its header (ui/projects/project-crumb.js), and its empty box says "Message <project>".
  const projectOfActiveChat = () => {
    const conversation = dataStore.getConversations().find((entry) => entry.id === getCurrentConversationId());
    // (A chat made in a project that someone else shares is in no folder of the person: it is in the project by its mark.)
    const id = conversation?.folderId || conversation?.sharedProject?.id || '';
    return id ? actions.folderOf(id) : null;
  };
  void import('../../../styles/project-crumb.css').catch(() => {});
  createProjectCrumb({ document, text, getProject: projectOfActiveChat, openProject: (id) => { void open({ id }); } });
  setProjectPlaceholder((conversation) => {
    const projectId = conversation?.folderId || conversation?.sharedProject?.id || '';
    const project = projectId ? actions.folderOf(projectId) : null;
    if (!project) return null;
    const name = String(project.name || '');
    return text('pjComposer', { name: name.length > 16 ? `${name.slice(0, 15)}…` : name });
  });
  document.addEventListener(USER_READY_EVENT, () => sidebarProjects.render());

  // ----- the address: opened by it, the page starts at the project it names (or at the list when that project is not there)
  const route = projectsRouteFromPath(win.location?.pathname);
  if (route) {
    const start = async () => {
      const page = await open(route);
      // The projects may arrive after the page (the workspace is read first): a project that was not there yet is shown once the workspace is in.
      if (route.id && !actions.folderOf(route.id)) {
        const again = () => { if (actions.folderOf(route.id)) { page?.go?.(route); win.removeEventListener('astra:cloud-workspace-committed', again); } };
        win.addEventListener('astra:cloud-workspace-committed', again);
      }
    };
    if (getAnnouncedUser()) void start();
    else document.addEventListener(USER_READY_EVENT, () => { void start(); }, { once: true });
  }
  return { open, actions, ensureEntry, sidebarProjects };
}
