// The pages of the projects (docs/superpowers/specs/2026-10-31-projects-design.md, §7), after the ones of ChatGPT that Allen gave: the list of the projects (tabs All, Created by you, Shared
// with you; a search at the foot) and one project (its chats, a box to write to it, a menu with edit, instructions and delete). They open over the chat at noureon.com/projects and
// noureon.com/projects/<id>. Names and titles are put in with textContent; colours are the tokens (styles/projects.css) and the colour a person chose for a project.

import { cameraAvailable, openCameraDialog } from './project-camera.js';
import { liftSandboxRunBlock } from '../sandbox/sandbox-run-block.js';
import { stripCitationMarkers } from '../citations/citation-model.js';
import { plainMarkdown } from '../citations/plain-text.js';
import { isWide, make, ICONS, openActionSheet, openMenu, projectMark, sourceTile, toneOfName } from './project-parts.js';
import { openCreateSheet, openDeleteSheet, openEditSheet, openInstructionsSheet, openRenameChatSheet, openSourceTextSheet, openSourceUrlSheet, sourceFailureText } from './project-sheets.js';
import { PROJECT_SOURCES_MAX } from '../../runtime/projects/project-source-model.js';
import { sourceUrlHost, sourceUrlIcon } from '../../../data/project-source-url.js';
import { pictureOf } from '../../runtime/projects/project-pieces.js';
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

// What a chat says, as the list of the chats of a project shows it: the last message that has words, without the record of what the model did (the ```noureon-run block at the start of a reply),
// the markers that cite sources, the files that went with it, or the marks of Markdown.
const previewOf = (conversation) => {
  const messages = Array.isArray(conversation?.messages) ? conversation.messages : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const raw = (messages[index]?.parts || []).map((part) => part?.text || '').join('\n');
    const { run, text: said } = liftSandboxRunBlock(raw);
    const text = plainMarkdown(stripCitationMarkers(said, run?.sources).replace(/(`{3,})file[^\n]*\n[\s\S]*?(?:\1`*|$)/g, ' ')).replace(/\s+/g, ' ').trim();
    if (text) return text.slice(0, 160);
  }
  return '';
};

/**
 * Opens the page, once (opened again it only turns to `route`). `route` is { list: true } or { id }.
 * deps: document, text(key, vars), actions (runtime/projects/project-actions.js), chats { archive(id), remove(id) } (the app's own, which ask what has to be asked), openChat(id),
 * vectors ({ status(sourceId), subscribe(listener) }: where the vectors of a source are, runtime/memory-store/page-vectors.js; none: no line about it), notify(message, type), sourcesEnabled (the tab of the sources, when there is a part for it), readFile(file) (reads a file into
 * { ok, title, mime, size, text, truncated } or { ok: false, code }: runtime/projects/project-source-reader.js), drive ({ warm(), pick() }: Google's own file picker, runtime/projects/google-picker.js; none: no such choice), onClose().
 */
export function openProjectsPage({ document, text, actions, chats = {}, openChat = () => {}, notify = () => {}, route = { list: true }, sourcesEnabled = false, readFile = async () => ({ ok: false, code: 'unsupported' }), drive = null, vectors = null, composer = null, backOut = () => false, onClose = () => {} }) {
  if (current) {
    current.go(route);
    return current;
  }
  const win = document.defaultView;
  // `fromList`: the project was opened from the list (going back is a step back in the history); a project opened straight (from its chat) goes back to the list, the page that holds all of them.
  const state = { view: 'list', projectId: null, listTab: 'all', query: '', tab: 'chats', listDrawn: false, fromList: false };
  const root = make(document, 'div', 'pj');
  root.setAttribute('role', 'region');
  const opener = document.activeElement;
  let closed = false;
  let pushed = false;
  let menu = null;

  const projectOrNull = (id) => actions.folderOf(id);
  // Which project the page shows is told (a shared project is read and kept live while it is shown: runtime/project-sharing/); `refresh({ full })` draws it again: its chats, or all of it.
  const announceView = (projectId) => {
    try { document.dispatchEvent(new win.CustomEvent('noureon:project-view', { detail: { projectId, root, refresh: ({ full = false } = {}) => { if (closed || state.view !== 'project' || state.projectId !== projectId) return; if (full) drawProject(); else drawChats(); } } })); } catch { /* nothing listens */ }
  };
  // A shared project of someone else (runtime/project-sharing/): everyone reads it, only an editor changes its instructions and sources; the project itself is not the person's to rename, pin or delete.
  const canEdit = (project) => !project?.shared || project.role === 'editor';
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
  // The settings of a project (a dialog on a computer): the name and icon, and on a computer its sources.
  const openEdit = (project, onSaved) => openEditSheet({ document, root, text, actions, project, notify, onSaved, sources: sourcesEnabled ? { list: () => actions.sourcesOf(project.id), row: (source, after) => sourceRow(project, source, after), add: (after) => openAddSources(project, after) } : null });
  // The button that opened the menu closes it when it is pressed again.
  const toggledOff = (anchor) => { if (anchor && menu?.anchor === anchor) { closeMenu(); return true; } return false; };
  const projectMenu = (project, anchor, point = null, { fromPage = false } = {}) => {
    if (toggledOff(anchor)) return;
    closeMenu();
    const refresh = () => { if (state.view === 'project') drawProject(); else drawList(); };
    const items = [];
    if (project.shared) {
      // A project of someone else: a new chat in it, the instructions for an editor, and leaving.
      if (!fromPage) items.push({ label: text('pjMenuNewChat'), icon: 'plus', action: async () => { const result = await actions.startChat(project.id, '').catch(() => ({ ok: false })); if (result.ok) close(); else notify(text('pjFailed'), 'error'); } });
      // An editor changes the name, the icon and the colour of the project too (not deleting it: that is for its owner).
      if (canEdit(project)) items.push({ label: text(fromPage ? 'pjMenuEdit' : 'pjMenuSettings'), icon: 'edit', action: () => openEdit(project, refresh) });
      if (canEdit(project) && fromPage && !isWide(document)) items.push({ label: text('pjMenuInstructions'), icon: 'sliders', action: () => openInstructionsSheet({ document, root, text, actions, project, notify, onSaved: refresh }) });
      items.push({ label: text('psLeave'), icon: 'remove', danger: true, action: () => document.dispatchEvent(new document.defaultView.CustomEvent('noureon:project-leave', { detail: { projectId: project.id, root, onLeft: () => go({ list: true }, false) } })) });
      anchor?.setAttribute?.('aria-expanded', 'true');
      menu = openMenu({ document, root, anchor, point, items, onClose: () => { anchor?.removeAttribute?.('aria-expanded'); menu = null; } });
      return;
    }
    if (!fromPage) items.push({ label: text('pjMenuNewChat'), icon: 'plus', action: async () => { const result = await actions.startChat(project.id, '').catch(() => ({ ok: false })); if (result.ok) close(); else notify(text('pjFailed'), 'error'); } });
    items.push(
      { label: project.pinned ? text('pjMenuUnpin') : text('pjMenuPin'), icon: 'pin', action: async () => { await actions.togglePinProject(project.id); refresh(); } },
      { label: text(fromPage ? 'pjMenuEdit' : 'pjMenuSettings'), icon: 'edit', action: () => openEdit(project, refresh) }
    );
    if (fromPage && !isWide(document)) items.push({ label: text('pjMenuInstructions'), icon: 'sliders', action: () => openInstructionsSheet({ document, root, text, actions, project, notify, onSaved: refresh }) });
    items.push({ label: text('psMenu'), icon: 'users', action: () => document.dispatchEvent(new document.defaultView.CustomEvent('noureon:project-members', { detail: { projectId: project.id, root } })) });
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
      // The projects shared with the person are put here by runtime/project-sharing (the empty state stays when there are none).
      document.dispatchEvent(new document.defaultView.CustomEvent('noureon:shared-projects', { detail: { box: listBody, root, go: (id) => go({ id }, true) } }));
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
  // The search box of the list (at the foot of a phone's page, in the bar under the title on a computer).
  const makeSearch = () => {
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
    return search;
  };
  const drawList = () => {
    state.listDrawn = true;
    composer?.park();
    closeMenu();
    state.view = 'list';
    announceView(null);
    const wide = isWide(document);
    root.classList.toggle('is-wide', wide);
    const title = headingOf(document, 'pj-title');
    title.textContent = text('pjTitle');
    // On a computer the + has its words with it ("New project"): the page is built like the store of the Nouras, a bar under the title and cards (projects-wide.css).
    const plus = round('plus', text('pjNew'), () => newProject());
    plus.classList.add('has-label');
    plus.append(make(document, 'span', 'pj-round-label', text('pjNew')));
    root.classList.add('is-list');
    root.classList.remove('is-project');
    listBody = make(document, 'div', 'pj-list');
    const body = make(document, 'main', 'pj-body');
    const tabBar = tabs([['all', text('pjTabAll')], ['mine', text('pjTabMine')], ['shared', text('pjTabShared')]], state.listTab, (key) => { state.listTab = key; drawList(); }, text('pjTitle'));
    if (wide) {
      // A computer: the search and the + are in the title bar, the pills under it, the projects in a column of rows below (projects-wide.css).
      const actionsBox = make(document, 'div', 'pj-head-actions');
      actionsBox.append(makeSearch(), plus);
      const head = header({ left: round('back', text('pjBack'), () => { if (!backOut()) close({ viaBack: true }); }), title, right: actionsBox });
      const bar = make(document, 'div', 'pj-bar');
      bar.appendChild(tabBar);
      body.appendChild(listBody);
      root.replaceChildren(head, bar, body);
    } else {
      const head = header({ left: round('back', text('pjBack'), () => { if (!backOut()) close({ viaBack: true }); }), title, right: plus });
      body.append(tabBar, listBody);
      const foot = make(document, 'footer', 'pj-foot');
      foot.appendChild(makeSearch());
      root.replaceChildren(head, body, foot);
    }
    drawListBody();
  };

  // ----- one project
  let chatsBody = null;
  const chatMenu = (conversation, anchor, point) => {
    if (toggledOff(anchor)) return;
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
  // The conversation of someone else in a project of the person: the only thing the owner can do with it is to take it out of the project (it goes back to the history of the person who wrote it).
  const otherChatMenu = (project, conversation, anchor, point) => {
    if (toggledOff(anchor)) return;
    closeMenu();
    const items = [{ label: text('psMoveOut'), icon: 'remove', action: async () => { const result = await actions.moveChatOut(project.id, conversation.id); if (result.ok) notify(text('psMovedOut'), 'success'); else notify(text('pjFailed'), 'error'); drawChats(); } }];
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
      // In a shared project the chats of the others are theirs: they are read in a page of their own, and have no menu but for the owner of the project, who may take them out of it (never delete them).
      // The person's own open in the chat.
      const others = conversation.shared && !conversation.mine;
      const moderator = others && actions.canModerate?.(project.id) === true;
      const menuFor = (anchor, point = null) => { if (!others) chatMenu(conversation, anchor, point); else if (moderator) otherChatMenu(project, conversation, anchor, point); };
      more.addEventListener('click', (event) => { event.stopPropagation(); menuFor(more); });
      if (others && !moderator) row.append(words); else row.append(words, more);
      const open = () => { if (others) { document.dispatchEvent(new win.CustomEvent('noureon:shared-chat', { detail: { projectId: project.id, chat: conversation, root } })); return; } close(); openChat(conversation.id); };
      row.addEventListener('click', open);
      row.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } });
      row.addEventListener('contextmenu', (event) => { event.preventDefault(); menuFor(null, { x: event.clientX, y: event.clientY }); });
      // A touch held on a row opens the menu, as the long press of the phone's own lists.
      let timer = null;
      let held = false;
      const stop = () => { if (timer) { win.clearTimeout(timer); timer = null; } };
      row.addEventListener('pointerdown', (event) => {
        if (event.pointerType !== 'touch') return;
        held = false;
        stop();
        timer = win.setTimeout(() => { held = true; timer = null; menuFor(row); }, LONG_PRESS_MS);
      });
      for (const name of ['pointerup', 'pointercancel', 'pointermove', 'pointerleave']) row.addEventListener(name, stop);
      row.addEventListener('click', (event) => { if (held) { event.stopImmediatePropagation(); held = false; } }, true);
      chatsBody.appendChild(row);
    }
  };
  // ----- the sources of a project: texts and files that every chat of the project reads
  // What a source is, in a word: the extension of a file (PDF, DOCX...), a picture, a text.
  const kindLabel = (source) => {
    if (source.origin === 'research') return text('pjSourceKindResearch');
    if (source.kind === 'url') return text('pjSourceKindUrl');
    if (source.kind === 'image') return text('pjSourceKindImage');
    if (source.kind !== 'file') return text('pjSourceKindText');
    const extension = String(source.title || '').includes('.') ? String(source.title).split('.').pop().toUpperCase() : '';
    return extension && extension.length <= 5 ? extension : text('pjSourceKindFile');
  };
  const sizeText = (source) => {
    if (source.kind === 'url') return sourceUrlHost(source.url) || source.url;
    const size = Number(source.size) || source.text.length;
    return size >= 1048576 ? `${(size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;
  };
  // Three hidden inputs: files, photos from the library, and the camera of a phone (the same as the chat's own).
  const makeInput = (accept, { capture = '', multiple = true } = {}) => {
    const input = make(document, 'input', 'pj-file-input');
    input.type = 'file';
    input.multiple = multiple;
    input.hidden = true;
    input.accept = accept;
    if (capture) input.setAttribute('capture', capture);
    return input;
  };
  // Any file: the model looks into it by itself (the texts, the pictures: project-files-access.js); what it cannot open yet is named to it as such.
  const fileInput = makeInput('');
  // The photo library of a phone lists videos too when the input accepts them.
  const photoInput = makeInput('image/*,video/*');
  // The camera of a phone: its own camera app, for a photo or a video.
  const cameraInput = makeInput('image/*,video/*', { capture: 'environment', multiple: false });
  const inputs = [fileInput, photoInput, cameraInput];
  // One file added as a source (from the device or from Drive): read, kept, described in the source. Gives { ok, code } and tells the person what happened.
  const addFile = async (project, file) => {
    const read = await readFile(file).catch(() => ({ ok: false, code: 'unreadable' }));
    if (!read.ok) { notify(sourceFailureText(text, read, file.name), 'error'); return { ok: false, code: read.code };}
    const kind = String(file.type || '').startsWith('image/') ? 'image' : 'file';
    const added = await actions.addSource(project.id, { kind, title: read.title, mime: read.mime, size: read.size, text: read.text, ...(read.file ? { file: read.file } : {}) }).catch(() => ({ ok: false }));
    if (!added.ok) { notify(sourceFailureText(text, added, file.name), 'error'); return { ok: false, code: added.code }; }
    notify(read.truncated ? text('pjSourceTruncated', { name: read.title, max: '100,000' }) : text('pjSourceAdded'), 'success');
    return { ok: true };
  };
  // The project the files that are chosen now go to, and what to redraw afterwards: the project that is open, or the one whose settings are open (a computer lists the sources there too).
  let addTarget = null;
  const addAll = async (project, files) => {
    // The sheet that makes a project only lists what is to be added: nothing is read or kept until the project is there (commitStaged).
    if (project.staging) { stageFiles(files); return; }
    for (const file of files) {
      const result = await addFile(project, file);
      if (!result.ok && (result.code === 'full' || result.code === 'too_much' || result.code === 'files_too_much')) break;
    }
  };
  const afterAdd = () => {
    const done = addTarget?.onDone;
    addTarget = null;
    done?.();
    if (state.view === 'project' && state.tab === 'sources') drawProject();
  };
  const ingest = async (input) => {
    const project = addTarget?.project || projectOrNull(state.projectId);
    const files = [...(input.files || [])];
    input.value = '';
    if (!project) return;
    await addAll(project, files);
    afterAdd();
  };
  for (const input of inputs) input.addEventListener('change', () => { void ingest(input); });
  // Google's own picker (its tabs, its search, its folders): the files chosen come back as files and are added like ones from the device.
  const pickFromDrive = async (project) => {
    const picked = await drive.pick().catch(() => ({ ok: false, code: 'failed' }));
    if (!picked.ok) { if (picked.code !== 'cancelled') notify(text('pjDriveFailed'), 'error'); return; }
    for (const failure of picked.failed || []) notify(failure.code === 'too_big' ? text('pjSourceTooBig', { name: failure.name }) : text('pjDriveReadFailed', { name: failure.name }), 'error');
    await addAll(project, picked.files);
    afterAdd();
  };
  // The list of what can be added (a phone's own choices, and on a computer the camera of the computer): shared by the tab of the sources and the settings of a project.
  const openAddSources = (project, onDone) => {
    closeMenu();
    // What is chosen below goes to this project, and `onDone` is told afterwards (set when a choice is made, so a list that was closed with no choice leaves nothing behind).
    const via = (run) => () => { addTarget = { project, onDone }; return run(); };
    // Google's scripts are loaded now, so the sign-in window can open the moment the choice is tapped (a browser lets a window open only from a tap).
    drive?.warm?.();
    openActionSheet({
      document, root, title: text('pjSourcesAdd'),
      items: [
        { label: text('pjSourceTakePhoto'), icon: 'camera', action: via(() => (cameraAvailable(document) ? openCameraDialog({ document, root, text, onCapture: async (file) => { await addAll(project, [file]); afterAdd(); }, onError: () => notify(text('pjCameraFailed'), 'error') }) : cameraInput.click())) },
        { label: text('pjSourceAddPhoto'), icon: 'image', action: via(() => photoInput.click()) },
        { label: text('pjSourceAddFile'), icon: 'attach', action: via(() => fileInput.click()) },
        { label: text('pjSourceAddUrl'), icon: 'link', action: () => openSourceUrlSheet({ document, root, text, actions: project.staging ? stagingActions : actions, project, notify: project.staging ? () => {} : notify, onSaved: () => { addTarget = null; onDone?.(); if (!project.staging) drawProject(); } }) },
        { label: text('pjSourceAddText'), icon: 'text', action: () => openSourceTextSheet({ document, root, text, actions: project.staging ? stagingActions : actions, project, notify: project.staging ? () => {} : notify, onSaved: () => { addTarget = null; onDone?.(); if (!project.staging) drawProject(); } }) },
        ...(drive ? [{ label: text('pjSourceAddDrive'), icon: 'driveColor', action: via(() => pickFromDrive(project)) }] : [])
      ]
    });
  };
  // ----- the sources listed in the sheet that makes a project (a computer): kept in memory until "Create project" is pressed
  const staged = [];
  const stagingTarget = { id: 'staging', staging: true };
  const stageFull = () => staged.length >= PROJECT_SOURCES_MAX;
  const stageFiles = (files) => {
    for (const file of files) {
      if (stageFull()) { notify(sourceFailureText(text, { code: 'full' }), 'error'); break; }
      staged.push({ id: `s${staged.length}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, kind: String(file.type || '').startsWith('image/') ? 'image' : 'file', title: file.name, size: file.size, text: '', file });
    }
  };
  // The sheet of a written text asks its `actions` to add the source: here it only goes into the list.
  const stagingActions = { addSource: async (_id, source) => {
    if (stageFull()) return { ok: false, code: 'full' };
    if (source.kind === 'url') { staged.push({ id: `u${staged.length}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, kind: 'url', title: source.title, url: source.url, size: 0, text: '' }); return { ok: true }; }
    staged.push({ id: `t${staged.length}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, kind: 'text', title: source.title, size: source.text.length, text: source.text });
    return { ok: true };
  } };
  const stagedSources = {
    list: () => staged,
    row: (item, after) => sourceRow(stagingTarget, item, after, () => { const at = staged.findIndex((entry) => entry.id === item.id); if (at >= 0) staged.splice(at, 1); }),
    add: (after) => openAddSources(stagingTarget, after),
    // Files dragged onto the sheet.
    drop: (files) => stageFiles(files)
  };
  // The project is there: what was listed is read and kept as its sources, one by one (the limits are the same as when a source is added to a project that exists).
  const commitStaged = async (id) => {
    const project = projectOrNull(id);
    const items = staged.splice(0, staged.length);
    if (!project) return;
    for (const item of items) {
      const result = item.kind === 'url' || item.kind === 'text'
        ? await actions.addSource(id, item.kind === 'url' ? { kind: 'url', title: item.title, url: item.url } : { kind: 'text', title: item.title, text: item.text }).then((added) => { if (!added.ok) notify(sourceFailureText(text, added, item.title), 'error'); return added; }).catch(() => ({ ok: false }))
        : await addFile(project, item.file);
      if (!result.ok && (result.code === 'full' || result.code === 'too_much' || result.code === 'files_too_much')) break;
    }
    if (state.view === 'project' && state.tab === 'sources') drawProject();
  };
  // One source as a row: its tile, its title and kind and size, and a bin. `after` is called once it is removed.
  // The line of a source about its vectors; empty when they are off or the source has none.
  const indexStatusInto = (node, source) => {
    const state = vectors?.status?.(source.id) || 'off';
    const picture = pictureOf(source);
    const key = state === 'pending' ? 'pjIndexPending' : state === 'ready' ? 'pjIndexReady' : state === 'failed' ? 'pjIndexFailed' : state === 'none' && picture?.tooBig ? 'pjIndexTooBig' : '';
    node.textContent = key ? text(key) : '';
    node.hidden = !key;
    node.dataset.state = key ? state : '';
  };
  // The lines are brought up to date when the vectors change (a build ends), without drawing the page again.
  const unsubscribeVectors = vectors?.subscribe?.(() => {
    if (closed) return;
    for (const node of root.querySelectorAll('.pj-row-status')) {
      const source = actions.folderOf(state.projectId)?.sources?.find((entry) => entry.id === node.dataset.sourceId);
      if (source) indexStatusInto(node, source);
    }
  });
  // The tile of a web address: the small picture of the site (its own /favicon.ico, asked by the browser, never sent anything of ours), a globe until it has loaded or when it cannot be.
  const urlTile = (source) => {
    const tile = sourceTile(document, { icon: ICONS.globe(18) });
    const address = sourceUrlIcon(source.url);
    if (address) {
      const image = document.createElement('img');
      image.className = 'pj-favicon';
      image.alt = '';
      image.width = 20;
      image.height = 20;
      image.decoding = 'async';
      image.referrerPolicy = 'no-referrer';
      image.addEventListener('load', () => { if (image.naturalWidth > 1) tile.replaceChildren(image); });
      image.src = address;
    }
    return tile;
  };
  // (In a project that others share, who added a source: their name.)
  const addedByText = (source) => (source.addedBy?.name ? ` · ${text('psSourceAddedBy', { name: source.addedBy.name })}` : '');
  const sourceRow = (project, source, after, onRemove = null) => {
    const row = make(document, 'div', 'pj-row pj-source');
    row.dataset.sourceId = source.id;
    const label = kindLabel(source);
    const tone = source.kind === 'image' ? 'picture' : source.kind === 'file' ? toneOfName(source.title) : '';
    const tile = source.kind === 'url' ? urlTile(source) : tone && source.kind === 'file' && source.origin !== 'research' && label.length <= 4 ? sourceTile(document, { tone, label })
      : sourceTile(document, { tone, icon: (source.kind === 'image' ? ICONS.image : source.kind === 'file' ? ICONS.file : ICONS.text)(18) });
    const meta = make(document, 'span', 'pj-row-text');
    meta.append(make(document, 'span', 'pj-row-title', source.title || text('pjSourceUntitled')), make(document, 'span', 'pj-row-meta', `${label} · ${sizeText(source)}${project.shared || actions.canModerate?.(project.id) ? addedByText(source) : ''}`));
    // Where the vectors of the source are (only when they are turned on): being made, made, not possible, or too big.
    const status = make(document, 'span', 'pj-row-status');
    status.dataset.sourceId = source.id;
    indexStatusInto(status, source);
    meta.appendChild(status);
    const remove = make(document, 'button', 'pj-more');
    remove.type = 'button';
    remove.setAttribute('aria-label', text('pjSourceRemove'));
    remove.innerHTML = ICONS.trash(18);
    remove.addEventListener('click', async () => {
      if (onRemove) { onRemove(); after(); return; }
      const result = await actions.removeSource(project.id, source.id);
      if (result.ok) notify(text('pjSourceRemoved'), 'success');
      after();
    });
    if (canEdit(project)) row.append(tile, meta, remove); else row.append(tile, meta);
    return row;
  };
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
    const openAdd = () => openAddSources(project, drawProject);
    add.addEventListener('click', openAdd);
    add.addEventListener('keydown', (event) => { if (event.target === add && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openAdd(); } });
    if (canEdit(project)) box.appendChild(add);
    for (const source of list) box.appendChild(sourceRow(project, source, drawProject));
    return box;
  };
  // The box that writes to the project: a message sent from it starts a chat in the project.
  // The placeholder of the box names the project; it must stay on one line (a placeholder that wraps is cut off at the bottom of the box), so the name is cut with "…" until the words fit the box.
  // The width of the words is measured with a canvas in the font of the box; where there is none (a test) the whole name is kept.
  const fitPlaceholder = (area, name) => {
    const full = text('pjComposer', { name });
    area.placeholder = full;
    const measure = (() => {
      try {
        const context = document.createElement('canvas').getContext('2d');
        return context ? (words) => { context.font = win.getComputedStyle(area).font; return context.measureText(words).width; } : null;
      } catch { return null; }
    })();
    if (!measure) return;
    const fit = () => {
      const room = area.clientWidth;
      if (!room) return;
      let shown = Array.from(name);
      let words = full;
      while (shown.length > 1 && measure(words) > room) {
        shown = shown.slice(0, shown.length - 1);
        words = text('pjComposer', { name: `${shown.join('').trimEnd()}…` });
      }
      area.placeholder = words;
    };
    if (typeof win.ResizeObserver === 'function') new win.ResizeObserver(fit).observe(area);
    win.requestAnimationFrame?.(fit);
  };
  const makeComposer = (project) => {
    // The box of the chat itself, moved onto the page (runtime/projects/project-composer.js); the plain box below is for a page opened without it.
    if (composer) {
      const slot = make(document, 'div', 'pj-composer-slot');
      composer.attach(slot, project.id, { done: () => close() });
      return slot;
    }
    const box = make(document, 'form', 'pj-composer');
    const area = make(document, 'textarea', 'pj-composer-input');
    area.rows = 1;
    fitPlaceholder(area, project.name || '');
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
    return box;
  };

  // A computer: the project is a page of three columns — the projects at the left (to go from one to another), the box and the chats in the middle, the instructions and the sources at the right.
  const projectSide = (project) => {
    const side = make(document, 'aside', 'pj-side');
    const top = make(document, 'div', 'pj-side-head');
    const title = headingOf(document, 'pj-title');
    title.textContent = text('pjTitle');
    top.append(round('back', text('pjBack'), () => back()), title, round('plus', text('pjNew'), () => newProject()));
    const list = make(document, 'div', 'pj-side-list');
    // Which projects the column lists: all of them, the ones the person made, or the ones shared with them (the shared ones are not in the person's own folders).
    if (!state.sideTab) state.sideTab = project.shared ? 'shared' : 'all';
    const makeKinds = () => tabs([['all', text('pjTabAll')], ['mine', text('pjTabMine')], ['shared', text('pjTabShared')]], state.sideTab, (key) => { state.sideTab = key; kinds.replaceWith(kinds = makeKinds()); draw(); }, text('pjTitle'));
    let kinds = makeKinds();
    const draw = () => {
      const query = state.query.trim().toLowerCase();
      list.replaceChildren();
      const shown = [...(state.sideTab === 'shared' ? [] : actions.list()), ...(state.sideTab === 'mine' ? [] : actions.sharedList?.() || [])];
      if (!shown.length) list.appendChild(make(document, 'p', 'pj-none', text(state.sideTab === 'shared' ? 'pjSharedEmpty' : 'pjEmpty')));
      for (const folder of shown) {
        if (query && !String(folder.name || '').toLowerCase().includes(query)) continue;
        const row = make(document, 'button', `pj-side-row${folder.id === project.id ? ' is-current' : ''}`);
        row.type = 'button';
        row.dataset.projectId = folder.id;
        if (folder.id === project.id) row.setAttribute('aria-current', 'page');
        const words = make(document, 'span', 'pj-row-text');
        const name = make(document, 'span', 'pj-row-name');
        if (folder.pinned) { const pin = make(document, 'span', 'pj-row-pin'); pin.innerHTML = ICONS.pin(13); name.appendChild(pin); }
        name.appendChild(make(document, 'span', 'pj-row-title', folder.name || ''));
        words.append(name, make(document, 'span', 'pj-row-meta', folder.shared ? String(folder.ownerName || '') : text('pjCount', { n: actions.countOf(folder.id) })));
        row.append(projectMark(document, folder, 'is-small'), words);
        row.addEventListener('click', () => { if (folder.id !== project.id) go({ id: folder.id }, true); });
        list.appendChild(row);
      }
    };
    const search = makeSearch();
    search.querySelector('input').addEventListener('input', draw);
    side.append(top, search, kinds, list);
    draw();
    return side;
  };
  // The two cards of the right column fold (a project with many sources has a long column); what was folded is remembered in this browser.
  const PANEL_KEY = 'noureon.projectPanels.v1';
  const folded = (() => { try { return new Set(JSON.parse(win.localStorage?.getItem(PANEL_KEY) || '[]')); } catch { return new Set(); } })();
  const foldTitle = (key, label, count = '') => {
    const toggle = make(document, 'button', 'pj-card-toggle');
    toggle.type = 'button';
    toggle.dataset.card = key;
    toggle.setAttribute('aria-expanded', String(!folded.has(key)));
    toggle.innerHTML = ICONS.chevron(16);
    toggle.append(make(document, 'span', 'pj-card-title', label));
    if (count) toggle.appendChild(make(document, 'span', 'pj-card-count', count));
    return toggle;
  };
  const foldable = (card, toggle, key) => {
    card.classList.toggle('is-folded', folded.has(key));
    toggle.addEventListener('click', () => {
      if (folded.has(key)) folded.delete(key); else folded.add(key);
      try { win.localStorage?.setItem(PANEL_KEY, JSON.stringify([...folded])); } catch { /* the fold is only a convenience */ }
      card.classList.toggle('is-folded', folded.has(key));
      toggle.setAttribute('aria-expanded', String(!folded.has(key)));
    });
  };
  const projectPanel = (project) => {
    const panel = make(document, 'aside', 'pj-panel');
    // The instructions: a few lines, and a pencil that opens them.
    const instructions = make(document, 'section', 'pj-card');
    const instructionsHead = make(document, 'div', 'pj-card-head');
    const instructionsEdit = make(document, 'button', 'pj-more');
    instructionsEdit.type = 'button';
    instructionsEdit.setAttribute('aria-label', text('pjMenuInstructions'));
    instructionsEdit.innerHTML = ICONS.edit(16);
    instructionsEdit.addEventListener('click', () => openInstructionsSheet({ document, root, text, actions, project: actions.folderOf(project.id) || project, notify, onSaved: drawProject, advanced: true }));
    const instructionsToggle = foldTitle('instructions', text('pjInstructionsTitle'));
    if (canEdit(project)) instructionsHead.append(instructionsToggle, instructionsEdit); else instructionsHead.append(instructionsToggle);
    foldable(instructions, instructionsToggle, 'instructions');
    const written = String(project.instructions || '').trim();
    instructions.append(instructionsHead, make(document, 'p', `pj-card-text${written ? '' : ' is-empty'}`, written || text('pjInstructionsNone')));
    panel.appendChild(instructions);
    if (sourcesEnabled) {
      const list = actions.sourcesOf(project.id);
      const card = make(document, 'section', 'pj-card');
      const head = make(document, 'div', 'pj-card-head');
      const add = make(document, 'button', 'pj-more');
      add.type = 'button';
      add.setAttribute('aria-label', text('pjSourcesAdd'));
      add.innerHTML = ICONS.plus(16);
      add.addEventListener('click', () => openAddSources(project, drawProject));
      const sourcesToggle = foldTitle('sources', text('pjTabSources'), text('pjSourcesCount', { n: list.length, max: PROJECT_SOURCES_MAX }));
      if (canEdit(project)) head.append(sourcesToggle, add); else head.append(sourcesToggle);
      foldable(card, sourcesToggle, 'sources');
      const rows = make(document, 'div', 'pj-sources');
      for (const source of list) rows.appendChild(sourceRow(project, source, drawProject));
      if (!list.length) rows.appendChild(make(document, 'p', 'pj-card-text is-empty', text('pjSourcesNone')));
      card.append(head, rows);
      panel.appendChild(card);
    }
    return panel;
  };

  const drawProject = () => {
    root.classList.remove('is-list');
    root.classList.add('is-project');
    closeMenu();
    const project = projectOrNull(state.projectId);
    if (!project) { go({ list: true }, false); return; }
    state.view = 'project';
    announceView(project.id);
    const wide = isWide(document);
    root.classList.toggle('is-wide', wide);
    const title = headingOf(document, 'pj-title is-project');
    title.append(projectMark(document, project, 'is-small'), make(document, 'span', 'pj-title-text', project.name || ''));
    const more = round('dots', text('pjMore'), () => projectMenu(project, more, null, { fromPage: true }));
    // A shared project shows its people here: the sharing code fills this box (psh-stack) when the project has members.
    const slot = make(document, 'span', 'pj-members-slot');
    document.dispatchEvent(new document.defaultView.CustomEvent('noureon:project-members-slot', { detail: { projectId: project.id, slot, root } }));
    const headActions = make(document, 'div', 'pj-head-actions');
    headActions.append(slot, more);
    if (wide) {
      const main = make(document, 'main', 'pj-main');
      const head = header({ title, right: headActions });
      chatsBody = make(document, 'div', 'pj-chats');
      // The box of the chat is under the list, outside what scrolls (its menus open upward over the list). The plain box, when there is none, stays above the list.
      if (composer) {
        const scroll = make(document, 'div', 'pj-main-scroll');
        scroll.append(head, make(document, 'div', 'pj-main-title', text('pjTabChats')), chatsBody);
        main.classList.add('has-composer');
        main.append(scroll, makeComposer(project));
      } else {
        main.append(head, makeComposer(project), make(document, 'div', 'pj-main-title', text('pjTabChats')), chatsBody);
      }
      const grid = make(document, 'div', 'pj-three');
      grid.append(projectSide(project), main, projectPanel(project));
      root.replaceChildren(grid, ...inputs);
      drawChats();
      return;
    }
    const head = header({ left: round('back', text('pjBack'), () => back()), title, right: headActions });
    const body = make(document, 'main', 'pj-body');
    const choose = (key) => { state.tab = key; drawProject(); };
    if (sourcesEnabled) body.appendChild(tabs([['chats', text('pjTabChats')], ['sources', text('pjTabSources')]], state.tab, choose, project.name || ''));
    if (sourcesEnabled && state.tab === 'sources') {
      composer?.park();
      body.appendChild(sourcesView(project));
      root.replaceChildren(head, body, ...inputs);
      return;
    }
    chatsBody = make(document, 'div', 'pj-chats');
    body.appendChild(chatsBody);
    const foot = make(document, 'footer', 'pj-foot');
    foot.appendChild(makeComposer(project));
    root.replaceChildren(head, body, foot, ...inputs);
    drawChats();
  };

  // ----- going from one page to the other
  function go(next, push = false) {
    if (closed) return;
    if (next?.id && projectOrNull(next.id)) {
      state.fromList = state.listDrawn;
      state.projectId = next.id;
      state.tab = 'chats';
      setAddress(projectPath(next.id), push);
      drawProject();
      // Asked from the left menu: the settings of the project are open at once.
      if (next.edit) openEdit(projectOrNull(next.id), drawProject);
    } else {
      state.projectId = null;
      setAddress(PROJECTS_PATH, push);
      drawList();
      // Asked from the + of the left menu: the dialog that makes a project is open at once.
      if (next?.create) newProject();
    }
  }
  function back() {
    if (state.fromList && pushed && win.history.state?.projects) win.history.back();
    else go({ list: true }, false);
  }
  // `alone`: the sheet was asked for from the left menu with no page behind it (root.pj-dialog-only): the page goes away with the sheet unless a project was made.
  const newProject = ({ alone = false } = {}) => {
    staged.length = 0;
    // The hidden inputs of the files and photos are in the page while the sheet is open (the sheet lists what they bring).
    for (const input of inputs) if (!input.isConnected) root.appendChild(input);
    let made = false;
    return openCreateSheet({
      document, root, text, actions, notify,
      onCreated: (id) => { made = true; root.classList.remove('pj-dialog-only'); go({ id }, true); },
      // A computer: what is listed in the sheet (camera, photos, files, texts, Google Drive) and the files of the folder that was chosen are added to the new project one after another.
      sources: sourcesEnabled ? stagedSources : null,
      commitSources: sourcesEnabled ? (id) => commitStaged(id) : null,
      onFolderFiles: sourcesEnabled ? async (id, files) => { const project = projectOrNull(id); if (project) { await addAll(project, files); if (state.view === 'project' && state.tab === 'sources') drawProject(); } } : null,
      // The sheet closes just before the page is told that a project was made (and the listed sources are taken to be added): what is decided after that is whether it was a cancel.
      onClose: () => { Promise.resolve().then(() => { if (made) return; staged.length = 0; if (alone) close(); }); }
    });
  };

  const onPopState = () => {
    const route = projectsRouteFromPath(win.location.pathname);
    if (!route) { close({ addressDone: true, viaBack: true }); return; }
    go(route, false);
  };
  const onKey = (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    if (menu || openSheets()) return;
    event.preventDefault();
    if (state.view === 'project') back(); else close();
  };

  function close({ addressDone = false, viaBack = false, restore = true } = {}) {
    if (closed) return;
    closed = true;
    closeMenu();
    announceView(null);
    win.removeEventListener('popstate', onPopState);
    win.removeEventListener('keydown', onKey);
    document.removeEventListener('noureon:project-gone', onGone);
    media?.removeEventListener?.('change', onMedia);
    unsubscribeVectors?.();
    // The box of the chat goes home before the page is taken away (the chat it made for the project is given up there if it was not used).
    composer?.park();
    void composer?.release({ leaveProject: viaBack, restore });
    document.documentElement.classList.remove('pj-open');
    root.remove();
    current = null;
    // The address goes back to the chat's; the entries the page added are left in the history (one step back must not leave the site).
    if (!addressDone) { try { win.history.replaceState(win.history.state, '', '/'); } catch { /* nothing to restore */ } }
    try { opener?.focus?.(); } catch { /* the opener may be gone */ }
    onClose({ viaBack });
  }

  // The page is drawn for the width it has (a phone's or a computer's): it is drawn again when the window crosses that width.
  const media = win.matchMedia?.('(min-width: 768px)') || null;
  const onMedia = () => { if (closed || root.classList.contains('pj-dialog-only')) return; if (state.view === 'project') drawProject(); else drawList(); };
  media?.addEventListener?.('change', onMedia);
  document.documentElement.classList.add('pj-open');
  // The page is laid in the app (not on the page), under the layers of the left menu on a phone (its dim layer is 30, the menu 40): going back out of the projects leaves the page behind the menu.
  (document.getElementById('app-container') || document.body).appendChild(root);
  win.addEventListener('popstate', onPopState);
  win.addEventListener('keydown', onKey);
  // The person was taken out of the shared project that is shown (or it was deleted): back to the list.
  const onGone = (event) => { if (!closed && state.view === 'project' && state.projectId === event.detail?.projectId) go({ list: true }, false); };
  document.addEventListener('noureon:project-gone', onGone);
  const first = route?.id && projectOrNull(route.id) ? route : { list: true, ...(route?.create ? { create: true } : {}) };
  // The page opened by its address starts where the address says; opened by a tap it adds an entry to the history.
  const addressRoute = projectsRouteFromPath(win.location.pathname);
  current = { close, go: (next) => go(next, true), element: root, state, refresh: () => { if (state.view === 'project') drawProject(); else drawList(); } };
  // From the + of the left menu on a computer (`create` and no `list`): only the sheet that makes a project, over the chat; the page and its list are drawn once a project is made.
  if (route?.create && !route.list && !route.id) {
    root.classList.add('pj-dialog-only');
    newProject({ alone: true });
  } else {
    go(first, !addressRoute);
  }
  return current;
}
