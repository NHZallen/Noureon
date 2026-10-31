// The projects in the left menu on a computer (docs/superpowers/specs/2026-10-31-projects-design.md, §15): the one "Projects" section above the history (its arrow folds it, its + makes a project, its
// last row opens the page with all the projects), one row for each project (its icon in its colour, its name, a ⋯ menu) that opens its page and folds out to show its newest chats. Pinned projects come
// first. The chats of a project are listed here only, not in the history. A phone has the entry "Projects" only (the page of the projects; the entry is hidden on a computer by sidebar.css), so the section is hidden
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
 * question about deleting it), createProject() (the dialog that makes one), openList() (the page with all the projects), openChat(id), getCurrentConversationId(), loadParts() (resolves when the styles of the menus are there), storage.
 * Returns { render(), mount(), stop() }.
 */
export function createSidebarProjects({ document, text, actions, openProject, openSettings, askDelete, openChat, createProject = () => {}, openList = () => {}, getCurrentConversationId = () => null, loadParts = async () => {}, storage = null }) {
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
    // The page has the section from its first paint (templates/fragments/01-shell.fragment.js): its header, its + and an empty list. It is taken as it is: the page's own fold is on its header
    // already, and the + gets its click here. A page without it (a test, an older template) gets one made below.
    const made = document.querySelector('.sidebar-section[data-section="projects"]');
    if (made) {
      section = made;
      list = made.querySelector('#sidebar-projects-list');
      made.querySelector('#sidebar-projects-new-btn')?.addEventListener('click', (event) => { event.stopPropagation(); createProject(); });
      if (list) return section;
      section = null;
      made.remove();
    }
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
    const actionsGroup = make(document, 'div', 'actions-group');
    const add = make(document, 'button', 'section-action-btn');
    add.type = 'button';
    add.id = 'sidebar-projects-new-btn';
    add.title = text('pjNew');
    add.setAttribute('aria-label', text('pjNew'));
    add.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
    add.addEventListener('click', (event) => { event.stopPropagation(); createProject(); });
    actionsGroup.appendChild(add);
    header.appendChild(actionsGroup);
    // The page folds every section with a listener of its own, put on the headers that were there when it started; a header made later may get it too, so this one stops the others (one fold, not two).
    header.addEventListener('click', (event) => {
      event.stopImmediatePropagation();
      if (event.target.closest?.('button')) return;
      section.dataset.open = String(section.dataset.open !== 'true');
    });
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
    // The ⋯ that opened the menu closes it when it is pressed again.
    if (menu && menu.anchor === anchor) { menu.close(); return; }
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
    // The words of the section that the page made are put in the language of the page now (the page translates its own texts a little later, from the part that is loaded with it).
    const title = found.querySelector('.title-group > span');
    if (title && title.textContent !== text('pjEntry')) title.textContent = text('pjEntry');
    const add = found.querySelector('#sidebar-projects-new-btn');
    if (add) { add.title = text('pjNew'); add.setAttribute('aria-label', text('pjNew')); }
    if (!wide()) return;
    const projects = actions.list();
    const rows = projects.map(projectRow);
    if (projects.length) {
      const all = make(document, 'button', 'sidebar-item w-full text-left rounded-lg p-2 text-sm text-[var(--text-secondary)]');
      all.type = 'button';
      all.dataset.projectsAll = 'true';
      all.textContent = text('pjSidebarAll');
      all.addEventListener('click', () => openList());
      rows.push(all);
    }
    list.replaceChildren(...rows);
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
