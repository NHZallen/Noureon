// Starts the projects for the page (docs/superpowers/specs/2026-10-31-projects-design.md): the entry "Projects" of the left menu, the page of the projects and of one project (loaded when it is
// first opened: ui/projects/) and the address that opens it (noureon.com/projects, noureon.com/projects/<id>). A reply never waits for any of it.

import { USER_READY_EVENT, getAnnouncedUser } from '../features/user-ready.js';
import { projectsRouteFromPath } from '../../ui/projects/project-path.js';
import { createProjectActions } from './project-actions.js';
import { createVisionReader } from './project-source-vision.js';
import { getMemoryModelRunner } from '../memory-store/memory-ref.js';

const ENTRY_ID = 'open-projects-btn';
const folderIcon = '<svg class="cli-sidebar-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>';

/**
 * deps: document, configAccess (getUiLanguage), dataStore, i18n, getDefaultFolder(), saveAppData, renderSidebar, showNotification, deleteFolderFromCloud, deferConversationFolderSync,
 * startNewChat, loadChat, archiveChat, deleteChat (the app's own, which ask what has to be asked), getCurrentConversationId, getMessageInput(), submitChatForm(),
 * getApiKeyForProvider(provider) and getActiveConversation() (a picture added to a project is looked at by a model that sees: the chat's own when it has a key, else another).
 */
export function startProjects({
  document, configAccess, dataStore, i18n, getDefaultFolder, saveAppData, renderSidebar, showNotification = () => {}, deleteFolderFromCloud, deferConversationFolderSync,
  startNewChat, loadChat, archiveChat, deleteChat, getCurrentConversationId, getMessageInput = () => null, submitChatForm = () => {}, getApiKeyForProvider = () => '', getActiveConversation = () => null, load = null
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
  const actions = createProjectActions({ dataStore, getDefaultFolder, saveAppData, renderSidebar, deleteFolderFromCloud, deferConversationFolderSync, startNewChat, getCurrentConversationId, sendText });

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
      readFile: async (file) => {
        const [reader, browser, registry, shrink] = await Promise.all([import('./project-source-reader.js'), import('./project-source-browser.js'), import('../shell/model-registry.js'), import('../../ui/files/office-text/shrink-image-browser.js')]);
        const vision = createVisionReader({
          getModels: () => registry.MODELS, supportsVision: registry.modelSupportsVision, hasKey: (provider) => Boolean(getApiKeyForProvider(provider)),
          getCurrentModelId: () => getActiveConversation()?.model?.id || getActiveConversation()?.model || '', getRunner: getMemoryModelRunner, shrinkImage: shrink.shrinkImage, renderPdfPages: browser.renderPdfPages
        });
        return reader.readSourceFile(file, { ...browser, readImage: vision.readImage, readScan: vision.readScan });
      },
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
