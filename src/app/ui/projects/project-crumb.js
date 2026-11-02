// A chat that belongs to a project says so: a small line under the header of the chat with the project's icon and name, which opens the page of the project (what the apps this one is modelled
// on do: the person must always know they are writing inside a project). It follows the chat that is open (the chat is drawn again, a project is renamed or taken away, a chat is moved).
// Names are put in with textContent.

import { FOLDER_SVGS } from '../../runtime/features/folder-metadata.js';
import { colorOf } from './project-parts.js';

const chevron = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';

/**
 * deps: document, text(key, vars), getProject() (the project of the chat that is open, or null), openProject(id).
 * Returns { update(), stop() }.
 */
export function createProjectCrumb({ document, text, getProject, openProject }) {
  const win = document.defaultView;
  let crumb = null;
  let observer = null;
  let timer = null;

  const place = () => {
    if (crumb?.isConnected) return crumb;
    const header = document.querySelector('#chat-workspace > header');
    if (!header) return null;
    crumb = document.createElement('button');
    crumb.type = 'button';
    crumb.id = 'project-crumb';
    crumb.className = 'pj-crumb';
    crumb.hidden = true;
    crumb.addEventListener('click', () => { const id = crumb.dataset.projectId; if (id) openProject(id); });
    header.after(crumb);
    return crumb;
  };

  function update() {
    const project = getProject();
    const node = place();
    if (!node) return;
    if (!project) { node.hidden = true; node.dataset.projectId = ''; return; }
    node.hidden = false;
    node.dataset.projectId = project.id;
    const label = text('pjCrumb', { name: project.name || '' });
    node.setAttribute('aria-label', label);
    node.title = label;
    const icon = document.createElement('span');
    icon.className = 'pj-crumb-icon';
    icon.style.setProperty('color', colorOf(project.color));
    icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="folder-icon-svg" aria-hidden="true">${FOLDER_SVGS[project.icon] || FOLDER_SVGS.default}</svg>`;
    const name = document.createElement('span');
    name.className = 'pj-crumb-name';
    name.textContent = project.name || '';
    const arrow = document.createElement('span');
    arrow.className = 'pj-crumb-arrow';
    arrow.innerHTML = chevron;
    node.replaceChildren(icon, name, arrow);
  }

  const later = () => { win.clearTimeout(timer); timer = win.setTimeout(update, 40); };
  document.addEventListener('noureon:chat-changed', later);
  win.addEventListener('astra:active-conversation-changed', later);
  win.addEventListener('astra:cloud-workspace-committed', later);
  // The history is drawn again when a chat or a project changes (a rename, a move): so is this.
  const history = document.getElementById('history-list');
  if (history && win.MutationObserver) { observer = new win.MutationObserver(later); observer.observe(history, { childList: true }); }
  update();

  return {
    update,
    stop() {
      document.removeEventListener('noureon:chat-changed', later);
      win.removeEventListener('astra:active-conversation-changed', later);
      win.removeEventListener('astra:cloud-workspace-committed', later);
      observer?.disconnect();
      win.clearTimeout(timer);
      crumb?.remove();
    }
  };
}
