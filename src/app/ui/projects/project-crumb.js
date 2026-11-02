// A chat that belongs to a project says so: its header becomes the project's (a way back to the project at the left, the project's icon and name in the middle with "Chat" under it), on a phone
// and on a computer alike (as the apps this one is modelled on do: the person must always know they are writing inside a project). Only the arrow opens the page of the project; the name is a label and does nothing when tapped.
// It follows the chat that is open (the chat is drawn again, a project is renamed or taken away, a chat is moved). Names are put in with textContent.

import { FOLDER_SVGS } from '../../runtime/features/folder-metadata.js';
import { colorOf } from './project-parts.js';

/**
 * deps: document, text(key, vars), getProject() (the project of the chat that is open, or null), openProject(id).
 * Returns { update(), stop() }.
 */
export function createProjectCrumb({ document, text, getProject, openProject }) {
  const win = document.defaultView;
  let title = null;
  let back = null;
  let observer = null;
  let timer = null;

  const header = () => document.querySelector('#chat-workspace > header');

  const dropHeader = () => {
    header()?.classList.remove('pj-in-project');
    title?.remove();
    back?.remove();
    title = null;
    back = null;
  };

  const drawHeader = (project) => {
    const bar = header();
    if (!bar) return;
    bar.classList.add('pj-in-project');
    const label = text('pjCrumb', { name: project.name || '' });
    if (!back?.isConnected) {
      back = document.createElement('button');
      back.type = 'button';
      back.id = 'project-head-back';
      back.className = 'pj-head-back p-2 rounded-md hover:bg-[var(--hover-bg)]';
      back.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>';
      back.addEventListener('click', () => { const id = back.dataset.projectId; if (id) openProject(id); });
      bar.firstElementChild?.prepend(back);
    }
    back.dataset.projectId = project.id;
    back.setAttribute('aria-label', label);
    back.title = label;
    if (!title?.isConnected) {
      title = document.createElement('div');
      title.id = 'project-head-title';
      title.className = 'pj-head-title';
      bar.append(title);
    }
    const icon = document.createElement('span');
    icon.className = 'pj-head-icon';
    icon.style.setProperty('color', colorOf(project.color));
    icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="folder-icon-svg" aria-hidden="true">${FOLDER_SVGS[project.icon] || FOLDER_SVGS.default}</svg>`;
    const name = document.createElement('span');
    name.className = 'pj-head-name';
    name.textContent = project.name || '';
    const top = document.createElement('span');
    top.className = 'pj-head-top';
    top.append(icon, name);
    const sub = document.createElement('span');
    sub.className = 'pj-head-sub';
    sub.textContent = text('pjHeadSub');
    title.replaceChildren(top, sub);
  };

  function update() {
    const project = getProject();
    if (project) drawHeader(project);
    else dropHeader();
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
      dropHeader();
    }
  };
}
