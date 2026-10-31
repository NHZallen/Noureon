// The projects in the left menu on a computer (docs/superpowers/specs/2026-10-31-projects-design.md, §15): a "Projects" section above the history, one row for each project (its icon in its colour,
// its name, a ⋯ menu) that opens its page and folds out to show its newest chats. Pinned projects come first. A phone has the entry "Projects" only (the page of the projects), so the section is hidden
// there. It draws itself again whenever the history is drawn again (that is when a chat or a project changed). Names and titles are put in with textContent.

import { FOLDER_SVGS } from '../../runtime/features/folder-metadata.js';
import { colorOf, make, openMenu } from './project-parts.js';

const SHOWN = 5;
const STORE_KEY = 'noureon.sidebarProjects.open.v1';
const arrow = '<svg class="folder-arrow flex-shrink-0" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>';
const dots = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>';

function readOpen(storage) {
  try { return new Set(JSON.parse(storage?.getItem(STORE_KEY) || '[]')); } catch { return new Set(); }
}

/**
 * deps: document, text(key, vars), actions (runtime/projects/project-actions.js), openProject(id), openSettings(id), askDelete(id) (open the page of the project, its settings, the
 * question about deleting it), openChat(id), getCurrentConversationId(), loadParts() (resolves when the styles of the menus are there), storage.
 * Returns { render(), mount(), stop() }.
 */
export function createSidebarProjects({ document, text, actions, openProject, openSettings, askDelete, openChat, getCurrentConversationId = () => null, loadParts = async () => {}, storage = null }) {
  const win = document.defaultView;
  const open = readOpen(storage);
  let section = null;
  let list = null;
  let timer = null;
  let observer = null;
  let menu = null;
  const media = win.matchMedia?.('(min-width: 768px)') || null;
  const wide = () => (media ? media.matches : true);
  const save = () => { try { storage?.setItem(STORE_KEY, JSON.stringify([...open])); } catch { /* the folds are only a convenience */ } };

  function ensureSection() {
    if (section?.isConnected) return section;
    const history = document.querySelector('.sidebar-section[data-section="history"]');
    if (!history?.parentNode) return null;
    section = make(document, 'div', 'sidebar-section');
    section.dataset.section = 'projects';
    section.dataset.open = 'true';
    const header = make(document, 'header', 'sidebar-section-header');
    const title = make(document, 'div', 'title-group');
    title.append(make(document, 'span', '', text('pjEntry')));
    title.insertAdjacentHTML('beforeend', '<svg class="section-toggle-arrow" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>');
    header.appendChild(title);
    header.addEventListener('click', () => { section.dataset.open = String(section.dataset.open !== 'true'); });
    const content = make(document, 'div', 'sidebar-section-content');
    list = make(document, 'div', 'space-y-1');
    list.id = 'sidebar-projects-list';
    content.appendChild(list);
    section.append(header, content);
    history.parentNode.insertBefore(section, history);
    return section;
  }

  const chatRow = (conversation) => {
    const row = make(document, 'button', `sidebar-item w-full text-left rounded-lg p-2 truncate text-sm${conversation.id === getCurrentConversationId() ? ' active' : ''}`);
    row.type = 'button';
    row.dataset.chatId = conversation.id;
    row.textContent = conversation.title || '';
    row.addEventListener('click', () => openChat(conversation.id));
    return row;
  };

  const showMenu = async (project, anchor) => {
    menu?.close();
    await loadParts();
    menu = openMenu({
      document, root: document.body, anchor,
      items: [
        { label: project.pinned ? text('pjMenuUnpin') : text('pjMenuPin'), icon: 'pin', action: async () => { await actions.togglePinProject(project.id); } },
        { label: text('pjMenuSettings'), icon: 'edit', action: () => openSettings(project.id) },
        { label: text('pjMenuDelete'), icon: 'trash', danger: true, action: () => askDelete(project.id) }
      ],
      onClose: () => { menu = null; }
    });
  };

  const projectRow = (project) => {
    const item = make(document, 'div', 'folder-item text-sm');
    item.dataset.id = project.id;
    item.dataset.open = String(open.has(project.id));
    const summary = make(document, 'div', 'folder-summary sidebar-item p-3 rounded-lg flex items-center justify-between');
    const left = make(document, 'div', 'flex items-center gap-2 truncate');
    const toggle = make(document, 'button', 'flex-shrink-0 flex items-center');
    toggle.type = 'button';
    toggle.setAttribute('aria-label', project.name || '');
    toggle.setAttribute('aria-expanded', String(open.has(project.id)));
    toggle.innerHTML = arrow;
    const icon = make(document, 'span', 'folder-icon mr-1 flex-shrink-0');
    icon.style.setProperty('--folder-icon-color', colorOf(project.color));
    icon.style.setProperty('color', colorOf(project.color));
    icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="folder-icon-svg">${FOLDER_SVGS[project.icon] || FOLDER_SVGS.default}</svg>`;
    const name = make(document, 'button', 'font-medium truncate text-left');
    name.type = 'button';
    name.textContent = project.name || '';
    left.append(toggle, icon, name);
    const more = make(document, 'button', 'folder-options-btn flex-shrink-0 w-6 h-6 rounded-md hover:bg-[var(--active-bg)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)]');
    more.type = 'button';
    more.setAttribute('aria-label', text('pjMore'));
    more.innerHTML = dots;
    summary.append(left, more);
    const box = make(document, 'div', 'folder-content-container');
    const inner = make(document, 'div', 'pl-4 mt-1 space-y-1');
    const chats = actions.chatsOf(project.id);
    for (const conversation of chats.slice(0, SHOWN)) inner.appendChild(chatRow(conversation));
    if (chats.length > SHOWN) {
      const rest = make(document, 'button', 'sidebar-item w-full text-left rounded-lg p-2 text-sm text-[var(--text-secondary)]');
      rest.type = 'button';
      rest.textContent = text('pjSidebarMore', { n: chats.length - SHOWN });
      rest.addEventListener('click', () => openProject(project.id));
      inner.appendChild(rest);
    }
    box.appendChild(inner);
    const fold = (event) => {
      event.stopPropagation();
      if (open.has(project.id)) open.delete(project.id); else open.add(project.id);
      save();
      item.dataset.open = String(open.has(project.id));
      toggle.setAttribute('aria-expanded', String(open.has(project.id)));
    };
    toggle.addEventListener('click', fold);
    name.addEventListener('click', () => openProject(project.id));
    more.addEventListener('click', (event) => { event.stopPropagation(); void showMenu(project, more); });
    item.append(summary, box);
    return item;
  };

  function render() {
    const found = ensureSection();
    if (!found) return;
    found.hidden = !wide();
    if (!wide()) return;
    const projects = actions.list();
    found.hidden = !projects.length;
    list.replaceChildren(...projects.map(projectRow));
  }
  const later = () => { win.clearTimeout(timer); timer = win.setTimeout(render, 60); };

  function mount() {
    render();
    // The history is drawn again when a chat or a project changes: so is this.
    const history = document.getElementById('history-list');
    if (history && win.MutationObserver) { observer = new win.MutationObserver(later); observer.observe(history, { childList: true }); }
    media?.addEventListener?.('change', render);
    win.addEventListener('astra:cloud-workspace-committed', later);
  }
  function stop() {
    observer?.disconnect();
    media?.removeEventListener?.('change', render);
    win.removeEventListener('astra:cloud-workspace-committed', later);
    win.clearTimeout(timer);
    menu?.close();
    section?.remove();
  }
  return { render, mount, stop };
}
