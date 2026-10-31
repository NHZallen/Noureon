// The pages of the projects (docs/superpowers/specs/2026-10-31-projects-design.md, §7), after the ones of ChatGPT that Allen gave: the list of the projects (tabs All, Created by you, Shared
// with you; a search at the foot) and one project (its chats, a box to write to it, a menu with edit, instructions and delete). They open over the chat at noureon.com/projects and
// noureon.com/projects/<id>. Names and titles are put in with textContent; colours are the tokens (styles/projects.css) and the colour a person chose for a project.

import { make, ICONS, openMenu, projectMark } from './project-parts.js';
import { openCreateSheet, openDeleteSheet, openEditSheet, openInstructionsSheet, openRenameChatSheet, openSourceTextSheet, sourceFailureText } from './project-sheets.js';
import { PROJECT_SOURCES_MAX } from '../../runtime/projects/project-source-model.js';
import { projectSourcesFor } from '../../runtime/projects/project-source-prompt.js';
import { PROJECTS_PATH, projectPath, projectsRouteFromPath } from './project-path.js';

let current = null;

/** The page that is open, if any. */
export const getProjectsPage = () => current;
export const closeProjectsPage = () => current?.close();

const LONG_PRESS_MS = 500;

// A heading is a div with the role: the page forces every h1 to h6 to the bold weight, and the style of the projects has none (docs/superpowers/specs/2026-10-31-ui-style-rules.md).
const headingOf = (document, className, level = 1) => {
  const node = document.createElement('div');
  node.className = className;
  node.setAttribute('role', 'heading');
  node.setAttribute('aria-level', String(level));
  return node;
};

const previewOf = (conversation) => {
  const messages = Array.isArray(conversation?.messages) ? conversation.messages : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const text = (messages[index]?.parts || []).map((part) => part?.text || '').join(' ').replace(/\s+/g, ' ').trim();
    if (text) return text.slice(0, 160);
  }
  return '';
};

/**
 * Opens the page, once (opened again it only turns to `route`). `route` is { list: true } or { id }.
 * deps: document, text(key, vars), actions (runtime/projects/project-actions.js), chats { archive(id), remove(id) } (the app's own, which ask what has to be asked), openChat(id),
 * notify(message, type), sourcesEnabled (the tab of the sources, when there is a part for it), readFile(file) (reads a file into
 * { ok, title, mime, size, text, truncated } or { ok: false, code }: runtime/projects/project-source-reader.js), onClose().
 */
export function openProjectsPage({ document, text, actions, chats = {}, openChat = () => {}, notify = () => {}, route = { list: true }, sourcesEnabled = false, readFile = async () => ({ ok: false, code: 'unsupported' }), onClose = () => {} }) {
  if (current) {
    current.go(route);
    return current;
  }
  const win = document.defaultView;
  const state = { view: 'list', projectId: null, listTab: 'all', query: '', tab: 'chats' };
  const root = make(document, 'div', 'pj');
  root.setAttribute('role', 'region');
  const opener = document.activeElement;
  let closed = false;
  let pushed = false;
  let menu = null;

  const projectOrNull = (id) => actions.folderOf(id);
  const openSheets = () => root.querySelectorAll('.pj-backdrop').length;
  const closeMenu = () => { menu?.close(); menu = null; };

  // ----- the address: the list and a project each have one, and the back of the browser goes from one to the other
  const setAddress = (path, push) => {
    try {
      if (win.location.pathname === path) return;
      if (push) { win.history.pushState({ projects: true }, '', path); pushed = true; } else win.history.replaceState(win.history.state, '', path);
    } catch { /* an address that cannot be set does not stop the page */ }
  };

  const header = ({ left, title, right }) => {
    const head = make(document, 'header', 'pj-head');
    head.append(left || make(document, 'span', 'pj-head-gap'), title, right || make(document, 'span', 'pj-head-gap'));
    return head;
  };
  const round = (icon, label, onClick) => {
    const button = make(document, 'button', 'pj-round');
    button.type = 'button';
    button.setAttribute('aria-label', label);
    button.innerHTML = ICONS[icon](20);
    button.addEventListener('click', onClick);
    return button;
  };
  const emptyState = (title, hint, iconKey = 'folder') => {
    const box = make(document, 'div', 'pj-empty');
    const icon = make(document, 'span', 'pj-empty-icon');
    icon.innerHTML = ICONS[iconKey](22);
    box.append(icon, make(document, 'p', 'pj-empty-title', title));
    if (hint) box.appendChild(make(document, 'p', 'pj-empty-hint', hint));
    return box;
  };
  const tabs = (items, selected, onSelect, label) => {
    const bar = make(document, 'div', 'pj-tabs');
    bar.setAttribute('role', 'tablist');
    bar.setAttribute('aria-label', label);
    for (const [key, name] of items) {
      const tab = make(document, 'button', 'pj-tab', name);
      tab.type = 'button';
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(key === selected));
      tab.addEventListener('click', () => onSelect(key));
      bar.appendChild(tab);
    }
    return bar;
  };

  // ----- the menu of a project: the same on the list (the ⋯ of a row) and on the page of the project
  const projectMenu = (project, anchor, point = null, { fromPage = false } = {}) => {
    closeMenu();
    const refresh = () => { if (state.view === 'project') drawProject(); else drawList(); };
    const items = [];
    if (!fromPage) items.push({ label: text('pjMenuNewChat'), icon: 'plus', action: async () => { const result = await actions.startChat(project.id, '').catch(() => ({ ok: false })); if (result.ok) close(); else notify(text('pjFailed'), 'error'); } });
    items.push(
      { label: project.pinned ? text('pjMenuUnpin') : text('pjMenuPin'), icon: 'pin', action: async () => { await actions.togglePinProject(project.id); refresh(); } },
      { label: text(fromPage ? 'pjMenuEdit' : 'pjMenuSettings'), icon: 'edit', action: () => openEditSheet({ document, root, text, actions, project, notify, onSaved: refresh }) }
    );
    if (fromPage) items.push({ label: text('pjMenuInstructions'), icon: 'sliders', action: () => openInstructionsSheet({ document, root, text, actions, project, notify, onSaved: refresh }) });
    items.push({ label: text('pjMenuDelete'), icon: 'trash', danger: true, action: () => openDeleteSheet({ document, root, text, actions, project, notify, onDeleted: () => go({ list: true }, false) }) });
    anchor?.setAttribute?.('aria-expanded', 'true');
    menu = openMenu({ document, root, anchor, point, items, onClose: () => { anchor?.removeAttribute?.('aria-expanded'); menu = null; } });
  };

  // ----- the list of the projects
  let listBody = null;
  const drawListBody = () => {
    if (!listBody) return;
    listBody.replaceChildren();
    if (state.listTab === 'shared') {
      listBody.appendChild(emptyState(text('pjSharedEmpty'), text('pjSharedEmptyHint')));
      return;
    }
    const all = actions.list();
    const query = state.query.trim().toLowerCase();
    const shown = query ? all.filter((folder) => String(folder.name || '').toLowerCase().includes(query)) : all;
    if (!all.length) { listBody.appendChild(emptyState(text('pjEmpty'), text('pjEmptyHint'))); return; }
    if (!shown.length) { listBody.appendChild(make(document, 'p', 'pj-none', text('pjNoMatch'))); return; }
    for (const folder of shown) {
      const row = make(document, 'div', 'pj-row');
      row.setAttribute('role', 'button');
      row.tabIndex = 0;
      row.dataset.projectId = folder.id;
      const words = make(document, 'span', 'pj-row-text');
      const name = make(document, 'span', 'pj-row-name');
      if (folder.pinned) {
        const pin = make(document, 'span', 'pj-row-pin');
        pin.innerHTML = ICONS.pin(13);
        name.appendChild(pin);
      }
      name.appendChild(make(document, 'span', 'pj-row-title', folder.name || ''));
      words.append(name, make(document, 'span', 'pj-row-meta', text('pjCount', { n: actions.countOf(folder.id) })));
      const more = make(document, 'button', 'pj-more');
      more.type = 'button';
      more.setAttribute('aria-label', text('pjMore'));
      more.setAttribute('aria-haspopup', 'menu');
      more.innerHTML = ICONS.dots(18);
      more.addEventListener('click', (event) => { event.stopPropagation(); projectMenu(folder, more); });
      row.append(projectMark(document, folder, 'is-row'), words, more);
      row.addEventListener('click', () => go({ id: folder.id }, true));
      row.addEventListener('keydown', (event) => { if (event.target === row && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); go({ id: folder.id }, true); } });
      row.addEventListener('contextmenu', (event) => { event.preventDefault(); projectMenu(folder, null, { x: event.clientX, y: event.clientY }); });
      listBody.appendChild(row);
    }
  };
  const drawList = () => {
    closeMenu();
    state.view = 'list';
    const title = headingOf(document, 'pj-title');
    title.textContent = text('pjTitle');
    const head = header({ left: round('back', text('pjBack'), () => close()), title, right: round('plus', text('pjNew'), () => newProject()) });
    listBody = make(document, 'div', 'pj-list');
    const body = make(document, 'main', 'pj-body');
    body.appendChild(tabs([['all', text('pjTabAll')], ['mine', text('pjTabMine')], ['shared', text('pjTabShared')]], state.listTab, (key) => { state.listTab = key; drawList(); }, text('pjTitle')));
    body.appendChild(listBody);
    const search = make(document, 'div', 'pj-search');
    const input = make(document, 'input', 'pj-search-input');
    input.type = 'search';
    input.placeholder = text('pjSearch');
    input.setAttribute('aria-label', text('pjSearch'));
    input.value = state.query;
    input.addEventListener('input', () => { state.query = input.value; drawListBody(); });
    const lens = make(document, 'span', 'pj-search-icon');
    lens.innerHTML = ICONS.search(20);
    search.append(lens, input);
    const foot = make(document, 'footer', 'pj-foot');
    foot.appendChild(search);
    root.replaceChildren(head, body, foot);
    drawListBody();
  };

  // ----- one project
  let chatsBody = null;
  const chatMenu = (conversation, anchor, point) => {
    closeMenu();
    const items = [
      { label: conversation.pinned ? text('pjChatUnpin') : text('pjChatPin'), icon: 'pin', action: async () => { await actions.togglePin(conversation.id); drawChats(); } },
      { label: text('pjChatRename'), icon: 'rename', action: () => openRenameChatSheet({ document, root, text, actions, conversation, onSaved: drawChats }) },
      { label: text('pjChatRemove'), icon: 'remove', action: async () => { const result = await actions.removeChat(conversation.id); if (result.ok) notify(text('pjRemoved'), 'success'); drawChats(); } },
      { label: text('pjChatArchive'), icon: 'archive', action: async () => { await chats.archive?.(conversation.id); drawChats(); } },
      { label: text('pjChatDelete'), icon: 'trash', danger: true, action: async () => { await chats.remove?.(conversation.id); drawChats(); } }
    ];
    menu = openMenu({ document, root, anchor, point, items, onClose: () => { menu = null; } });
  };
  const drawChats = () => {
    if (!chatsBody) return;
    chatsBody.replaceChildren();
    const project = projectOrNull(state.projectId);
    if (!project) return;
    const list = actions.chatsOf(project.id);
    if (!list.length) { chatsBody.appendChild(emptyState(text('pjChatsEmpty'), '', 'folder')); return; }
    for (const conversation of list) {
      const row = make(document, 'div', 'pj-chat');
      row.setAttribute('role', 'button');
      row.tabIndex = 0;
      row.dataset.conversationId = conversation.id;
      const words = make(document, 'div', 'pj-chat-text');
      const title = make(document, 'span', 'pj-chat-title', conversation.title || '');
      if (conversation.pinned) {
        const pin = make(document, 'span', 'pj-chat-pin');
        pin.innerHTML = ICONS.pin(14);
        title.prepend(pin);
      }
      words.append(title, make(document, 'span', 'pj-chat-preview', previewOf(conversation)));
      const more = make(document, 'button', 'pj-more');
      more.type = 'button';
      more.setAttribute('aria-label', text('pjMore'));
      more.innerHTML = ICONS.dots(18);
      more.addEventListener('click', (event) => { event.stopPropagation(); chatMenu(conversation, more); });
      row.append(words, more);
      const open = () => { close(); openChat(conversation.id); };
      row.addEventListener('click', open);
      row.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } });
      row.addEventListener('contextmenu', (event) => { event.preventDefault(); chatMenu(conversation, null, { x: event.clientX, y: event.clientY }); });
      // A touch held on a row opens the menu, as the long press of the phone's own lists.
      let timer = null;
      let held = false;
      const stop = () => { if (timer) { win.clearTimeout(timer); timer = null; } };
      row.addEventListener('pointerdown', (event) => {
        if (event.pointerType !== 'touch') return;
        held = false;
        stop();
        timer = win.setTimeout(() => { held = true; timer = null; chatMenu(conversation, row); }, LONG_PRESS_MS);
      });
      for (const name of ['pointerup', 'pointercancel', 'pointermove', 'pointerleave']) row.addEventListener(name, stop);
      row.addEventListener('click', (event) => { if (held) { event.stopImmediatePropagation(); held = false; } }, true);
      chatsBody.appendChild(row);
    }
  };
  // ----- the sources of a project: texts and files that every chat of the project reads
  const sizeText = (source) => {
    const size = Number(source.size) || source.text.length;
    return size >= 1048576 ? `${(size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;
  };
  const fileInput = make(document, 'input', 'pj-file-input');
  fileInput.type = 'file';
  fileInput.multiple = true;
  fileInput.hidden = true;
  fileInput.accept = '.txt,.md,.markdown,.csv,.tsv,.json,.xml,.html,.htm,.yaml,.yml,.log,.pdf,.docx,.pptx,.xlsx,.py,.js,.ts,.java,.c,.cpp,.go,.rs,.sql,.css,text/*,application/pdf';
  root.appendChild(fileInput);
  fileInput.addEventListener('change', async () => {
    const project = projectOrNull(state.projectId);
    const files = [...(fileInput.files || [])];
    fileInput.value = '';
    if (!project) return;
    for (const file of files) {
      const read = await readFile(file).catch(() => ({ ok: false, code: 'unreadable' }));
      if (!read.ok) { notify(sourceFailureText(text, read, file.name), 'error'); continue; }
      const added = await actions.addSource(project.id, { kind: 'file', title: read.title, mime: read.mime, size: read.size, text: read.text }).catch(() => ({ ok: false }));
      if (!added.ok) { notify(sourceFailureText(text, added, file.name), 'error'); if (added.code === 'full' || added.code === 'too_much') break; continue; }
      notify(read.truncated ? text('pjSourceTruncated', { name: read.title, max: '100,000' }) : text('pjSourceAdded'), 'success');
    }
    if (state.view === 'project' && state.tab === 'sources') drawProject();
  });
  const sourcesView = (project) => {
    const box = make(document, 'div', 'pj-sources');
    const list = actions.sourcesOf(project.id);
    box.appendChild(make(document, 'p', 'pj-note', text('pjSourcesHint')));
    const add = make(document, 'div', 'pj-row pj-source-add');
    add.setAttribute('role', 'button');
    add.tabIndex = 0;
    const plus = make(document, 'span', 'pj-source-tile');
    plus.innerHTML = ICONS.plus(18);
    const words = make(document, 'span', 'pj-row-text');
    words.append(make(document, 'span', 'pj-row-title', text('pjSourcesAdd')), make(document, 'span', 'pj-row-meta', text('pjSourcesCount', { n: list.length, max: PROJECT_SOURCES_MAX })));
    add.append(plus, words);
    const openAdd = () => {
      closeMenu();
      menu = openMenu({
        document, root, anchor: add, onClose: () => { menu = null; },
        items: [
          { label: text('pjSourceAddFile'), icon: 'file', action: () => fileInput.click() },
          { label: text('pjSourceAddText'), icon: 'notes', action: () => openSourceTextSheet({ document, root, text, actions, project, notify, onSaved: drawProject }) }
        ]
      });
    };
    add.addEventListener('click', openAdd);
    add.addEventListener('keydown', (event) => { if (event.target === add && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openAdd(); } });
    box.appendChild(add);
    for (const source of list) {
      const row = make(document, 'div', 'pj-row pj-source');
      row.dataset.sourceId = source.id;
      const tile = make(document, 'span', 'pj-source-tile');
      tile.innerHTML = (source.kind === 'file' ? ICONS.file : ICONS.notes)(18);
      const meta = make(document, 'span', 'pj-row-text');
      meta.append(make(document, 'span', 'pj-row-title', source.title || text('pjSourceUntitled')), make(document, 'span', 'pj-row-meta', `${text(source.kind === 'file' ? 'pjSourceKindFile' : 'pjSourceKindText')} · ${sizeText(source)}`));
      const remove = make(document, 'button', 'pj-more');
      remove.type = 'button';
      remove.setAttribute('aria-label', text('pjSourceRemove'));
      remove.innerHTML = ICONS.trash(18);
      remove.addEventListener('click', async () => { const result = await actions.removeSource(project.id, source.id); if (result.ok) notify(text('pjSourceRemoved'), 'success'); drawProject(); });
      row.append(tile, meta, remove);
      box.appendChild(row);
    }
    const left = projectSourcesFor(project).left;
    if (left.length) box.appendChild(make(document, 'p', 'pj-note', text('pjSourcesLeftOut', { n: left.length })));
    return box;
  };
  const drawProject = () => {
    closeMenu();
    const project = projectOrNull(state.projectId);
    if (!project) { go({ list: true }, false); return; }
    state.view = 'project';
    const title = headingOf(document, 'pj-title is-project');
    title.append(projectMark(document, project, 'is-small'), make(document, 'span', 'pj-title-text', project.name || ''));
    const more = round('dots', text('pjMore'), () => projectMenu(project, more, null, { fromPage: true }));
    const head = header({ left: round('back', text('pjBack'), () => back()), title, right: more });
    const body = make(document, 'main', 'pj-body');
    if (sourcesEnabled) body.appendChild(tabs([['chats', text('pjTabChats')], ['sources', text('pjTabSources')]], state.tab, (key) => { state.tab = key; drawProject(); }, project.name || ''));
    if (sourcesEnabled && state.tab === 'sources') {
      body.appendChild(sourcesView(project));
      root.replaceChildren(head, body, fileInput);
      return;
    }
    chatsBody = make(document, 'div', 'pj-chats');
    body.appendChild(chatsBody);
    // The box that writes to the project: a message sent from it starts a chat in the project.
    const box = make(document, 'form', 'pj-composer');
    const area = make(document, 'textarea', 'pj-composer-input');
    area.rows = 1;
    area.placeholder = text('pjComposer', { name: project.name || '' });
    area.setAttribute('aria-label', text('pjComposer', { name: project.name || '' }));
    const send = make(document, 'button', 'pj-send');
    send.type = 'submit';
    send.disabled = true;
    send.setAttribute('aria-label', text('pjSend'));
    send.innerHTML = ICONS.send(18);
    area.addEventListener('input', () => { send.disabled = !area.value.trim(); area.style.height = 'auto'; area.style.height = `${Math.min(area.scrollHeight || 0, 160)}px`; });
    area.addEventListener('keydown', (event) => {
      // Enter sends on a wide screen with a keyboard; on a phone it is a new line (a phone's keyboard has the button).
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && win.matchMedia?.('(hover: hover) and (pointer: fine)').matches) { event.preventDefault(); if (!send.disabled) box.requestSubmit?.(); }
    });
    box.addEventListener('submit', async (event) => {
      event.preventDefault();
      const message = area.value.trim();
      if (!message || send.disabled) return;
      send.disabled = true;
      const result = await actions.startChat(project.id, message).catch(() => ({ ok: false }));
      if (!result.ok) { send.disabled = false; notify(text('pjFailed'), 'error'); return; }
      close();
    });
    box.append(area, send);
    const foot = make(document, 'footer', 'pj-foot');
    foot.appendChild(box);
    root.replaceChildren(head, body, foot, fileInput);
    drawChats();
  };

  // ----- going from one page to the other
  function go(next, push = false) {
    if (closed) return;
    if (next?.id && projectOrNull(next.id)) {
      state.projectId = next.id;
      state.tab = 'chats';
      setAddress(projectPath(next.id), push);
      drawProject();
    } else {
      state.projectId = null;
      setAddress(PROJECTS_PATH, push);
      drawList();
    }
  }
  function back() {
    if (pushed && win.history.state?.projects) win.history.back();
    else go({ list: true }, false);
  }
  const newProject = () => openCreateSheet({ document, root, text, actions, notify, onCreated: (id) => go({ id }, true) });

  const onPopState = () => {
    const route = projectsRouteFromPath(win.location.pathname);
    if (!route) { close({ addressDone: true }); return; }
    go(route, false);
  };
  const onKey = (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    if (menu || openSheets()) return;
    event.preventDefault();
    if (state.view === 'project') back(); else close();
  };

  function close({ addressDone = false } = {}) {
    if (closed) return;
    closed = true;
    closeMenu();
    win.removeEventListener('popstate', onPopState);
    win.removeEventListener('keydown', onKey);
    document.documentElement.classList.remove('pj-open');
    root.remove();
    current = null;
    // The address goes back to the chat's; the entries the page added are left in the history (one step back must not leave the site).
    if (!addressDone) { try { win.history.replaceState(win.history.state, '', '/'); } catch { /* nothing to restore */ } }
    try { opener?.focus?.(); } catch { /* the opener may be gone */ }
    onClose();
  }

  document.documentElement.classList.add('pj-open');
  document.body.appendChild(root);
  win.addEventListener('popstate', onPopState);
  win.addEventListener('keydown', onKey);
  const first = route?.id && projectOrNull(route.id) ? route : { list: true };
  // The page opened by its address starts where the address says; opened by a tap it adds an entry to the history.
  const addressRoute = projectsRouteFromPath(win.location.pathname);
  go(first, !addressRoute);
  current = { close, go: (next) => go(next, true), element: root, state, refresh: () => { if (state.view === 'project') drawProject(); else drawList(); } };
  return current;
}
