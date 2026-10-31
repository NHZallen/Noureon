// Starts the projects for the page (docs/superpowers/specs/2026-10-31-projects-design.md): the entry "Projects" of the left menu, the page of the projects and of one project (loaded when it is
// first opened: ui/projects/) and the address that opens it (noureon.com/projects, noureon.com/projects/<id>). A reply never waits for any of it.

import { USER_READY_EVENT, getAnnouncedUser } from '../features/user-ready.js';
import { projectsRouteFromPath } from '../../ui/projects/project-path.js';
import { createProjectActions } from './project-actions.js';
import { createIdbFileBackend, createMemoryFileBackend, createProjectFileStore, setProjectFileDeps } from './project-source-files.js';
import { PROJECT_SOURCE_FILE_BYTES_MAX } from './project-source-model.js';
import { createGooglePicker, googlePickerConfigured } from './google-picker.js';
import { modelSupportsUploadedFile } from '../shell/model-registry.js';
import { SERVICES, getService } from '../services.js';

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
  setProjectFileDeps({ store: files, supports: (modelInfo, inlineData) => modelSupportsUploadedFile(modelInfo, { inlineData }) });
  const actions = createProjectActions({ dataStore, getDefaultFolder, saveAppData, renderSidebar, deleteFolderFromCloud, deferConversationFolderSync, startNewChat, getCurrentConversationId, sendText, dropFiles: (descriptions) => files.drop(descriptions) });

  // Google's own file picker (its tabs, search and folders), when the page has the keys for it (VITE_GOOGLE_PICKER_*, see .env.example); without them the choice is not shown.
  const pickerConfig = { clientId: import.meta.env?.VITE_GOOGLE_PICKER_CLIENT_ID?.trim() || '', apiKey: import.meta.env?.VITE_GOOGLE_PICKER_API_KEY?.trim() || '', appId: import.meta.env?.VITE_GOOGLE_PICKER_APP_ID?.trim() || '' };
  const drive = googlePickerConfigured(pickerConfig) ? createGooglePicker({ config: pickerConfig, document, getLanguage: () => ({ 'zh-TW': 'zh-TW', en: 'en', fr: 'fr', ru: 'ru', es: 'es' })[configAccess.getUiLanguage()] || 'en' }) : null;

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

  // The page and its styles are a separate part, loaded the first time (the page still opens plain if the styles fail).
  const loadPage = load || (async () => {
    const [page] = await Promise.all([import('../../ui/projects/projects-page.js'), import('../../../styles/projects.css').catch((error) => { console.warn('Loading the styles of the projects failed.', error); })]);
    return page;
  });
  let opening = null;
  const open = async (route = { list: true }) => {
    // A second tap while the page is being loaded does not load it again.
    opening = opening || loadPage().finally(() => { opening = null; });
    const page = await opening;
    return page.openProjectsPage({
      document, text, actions, route, sourcesEnabled: true,
      readFile: (file) => readProjectFile(file), drive,
      chats: { archive: (id) => archiveChat(id), remove: (id) => deleteChat(id) },
      openChat: (id) => loadChat(id),
      notify: (message, type = 'success') => showNotification(message, type)
    });
  };

  // ----- the entry of the left menu (below the one of the Extensions when that is there)
  const ensureEntry = () => {
    const list = document.querySelector('#sidebar .overflow-y-auto');
    if (!list) return null;
    let entry = document.getElementById(ENTRY_ID);
    if (!entry) {
      entry = document.createElement('button');
      entry.id = ENTRY_ID;
      entry.type = 'button';
      entry.className = 'sidebar-item cli-sidebar-entry w-full text-left rounded-lg flex items-center';
      entry.innerHTML = `${folderIcon}<span class="cli-sidebar-label"></span>`;
      entry.addEventListener('click', () => {
        // On a phone the menu is a drawer over the chat: it goes away as the page comes.
        const overlay = document.getElementById('sidebar-overlay');
        if (overlay?.classList.contains('visible')) overlay.click();
        void open({ list: true });
      });
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
  return { open, actions, ensureEntry };
}
