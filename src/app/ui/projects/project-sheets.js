// The sheets of the projects (docs/superpowers/specs/2026-10-31-projects-design.md, §7): create one, edit its name and icon, choose the icon and colour, write its instructions, delete it
// (with the choice of what happens to its chats) and rename a chat. Each asks `actions` (runtime/projects/project-actions.js) and says in words when that did not work.

import { FOLDER_SVGS } from '../../runtime/features/folder-metadata.js';
import { FOLDER_COLORS } from '../../runtime/shell/runtime-ui-colors.js';
import { PROJECT_INSTRUCTIONS_MAX } from '../../runtime/projects/project-instructions.js';
import { PROJECT_NAME_MAX } from '../../runtime/projects/project-actions.js';
import { PROJECT_SOURCES_MAX, PROJECT_SOURCE_CHARS_MAX, PROJECT_SOURCE_TITLE_MAX } from '../../runtime/projects/project-source-model.js';
import { iconMatches } from '../../../data/project-icon-words.js';
import { ICONS, colorOf, isWide, make, openSheet, projectMark } from './project-parts.js';

// What a project can be made with one tap: its name, icon and colour.
export const PROJECT_PRESETS = Object.freeze([
  Object.freeze({ key: 'pjPresetResearch', icon: 'globe', color: 'blue' }),
  Object.freeze({ key: 'pjPresetPlan', icon: 'book', color: 'green' }),
  Object.freeze({ key: 'pjPresetCode', icon: 'code', color: 'orange' }),
  Object.freeze({ key: 'pjPresetMeeting', icon: 'notes', color: 'purple' })
]);

const failureText = (text, result) => (result?.code === 'no_name' ? text('pjNoName') : text('pjFailed'));

const footerButton = (document, label, className = 'pj-primary') => {
  const foot = make(document, 'div', 'pj-sheet-foot');
  const button = make(document, 'button', `pj-button ${className}`, label);
  button.type = 'button';
  foot.appendChild(button);
  return { foot, button };
};

/** The search box, the colours and the icons of the picker (the same in the sheet of a phone and in the box of a computer). `onChange({ icon, color })` is told at each choice. */
function iconPickerContent({ document, text, draft, onChange = () => {} }) {
  let { icon, color } = draft;
  const language = text('pjIconLang');
  const search = make(document, 'input', 'pj-icon-search');
  search.type = 'search';
  search.placeholder = text('pjIconSearch');
  search.setAttribute('aria-label', text('pjIconSearch'));
  const colors = make(document, 'div', 'pj-colors');
  colors.setAttribute('role', 'radiogroup');
  colors.setAttribute('aria-label', text('pjColor'));
  const icons = make(document, 'div', 'pj-icons');
  icons.setAttribute('role', 'radiogroup');
  icons.setAttribute('aria-label', text('pjIcon'));
  const redraw = () => {
    for (const button of colors.children) button.setAttribute('aria-checked', String(button.dataset.color === color));
    for (const button of icons.children) {
      button.setAttribute('aria-checked', String(button.dataset.icon === icon));
      button.style.setProperty('--pj-color', colorOf(color));
    }
  };
  for (const key of Object.keys(FOLDER_COLORS)) {
    const dot = make(document, 'button', 'pj-dot');
    dot.type = 'button';
    dot.dataset.color = key;
    dot.setAttribute('role', 'radio');
    dot.setAttribute('aria-label', key);
    dot.style.setProperty('--pj-dot', FOLDER_COLORS[key]);
    dot.addEventListener('click', () => { color = key; redraw(); onChange({ icon, color }); });
    colors.appendChild(dot);
  }
  for (const key of Object.keys(FOLDER_SVGS)) {
    const button = make(document, 'button', 'pj-icon-option');
    button.type = 'button';
    button.dataset.icon = key;
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-label', key);
    button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${FOLDER_SVGS[key]}</svg>`;
    button.addEventListener('click', () => { icon = key; redraw(); onChange({ icon, color }); });
    icons.appendChild(button);
  }
  // The icons that do not match what was typed are hidden.
  search.addEventListener('input', () => { for (const button of icons.children) button.hidden = !iconMatches(button.dataset.icon, search.value, language); });
  redraw();
  return { search, colors, icons, value: () => ({ icon, color }) };
}

/** The sheet where the icon and the colour are chosen (on a phone); `onDone({ icon, color })` is called as it is closed with "Done". */
export function openIconPicker({ document, root, text, draft, onDone }) {
  let chosen = { icon: draft.icon, color: draft.color };
  const preview = make(document, 'div', 'pj-picker-preview');
  const content = iconPickerContent({ document, text, draft, onChange: (value) => { chosen = value; preview.replaceChildren(projectMark(document, chosen, 'is-large')); } });
  preview.replaceChildren(projectMark(document, chosen, 'is-large'));
  // "Done" is at the right of the head, in the place of the cross (as in ChatGPT's): what was chosen is kept only by it.
  return openSheet({ document, root, title: text('pjChooseIcon'), action: { label: text('pjDone'), onClick: () => onDone(chosen) }, body: (body) => body.append(preview, content.search, content.colors, content.icons) });
}

/** The box of the icon on a computer: under the name, with a search box, the colours and the icons; a choice counts at once, and a click outside (or Escape) closes it. */
function openIconPopover({ document, sheet, anchor, text, draft, onChange }) {
  const win = document.defaultView;
  const box = make(document, 'div', 'pj-popover');
  const content = iconPickerContent({ document, text, draft, onChange });
  box.append(content.search, content.colors, content.icons);
  sheet.appendChild(box);
  const place = anchor.getBoundingClientRect();
  const around = sheet.getBoundingClientRect();
  box.style.top = `${Math.round(place.bottom - around.top + 6)}px`;
  box.style.left = `${Math.round(place.left - around.left)}px`;
  box.style.width = `${Math.round(Math.min(place.width, 30 * 16))}px`;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    win.removeEventListener('pointerdown', onOutside, true);
    win.removeEventListener('keydown', onKey, true);
    box.remove();
  };
  const onOutside = (event) => { if (!box.contains(event.target) && !anchor.contains(event.target)) close(); };
  const onKey = (event) => { if (event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); close(); } };
  win.addEventListener('pointerdown', onOutside, true);
  win.addEventListener('keydown', onKey, true);
  content.search.focus();
  return { close, element: box };
}

/** The field of a name with the button of its icon at the left. Returns { element, input, value(), icon(), color(), set(partial) }. */
function nameField({ document, root, text, initial, onChange = () => {}, onSubmit = () => {} }) {
  const state = { name: initial.name || '', icon: initial.icon || 'default', color: initial.color || 'gray' };
  const field = make(document, 'div', 'pj-name-field');
  const iconButton = make(document, 'button', 'pj-name-icon');
  iconButton.type = 'button';
  iconButton.setAttribute('aria-label', text('pjChooseIcon'));
  const input = make(document, 'input', 'pj-name-input');
  input.type = 'text';
  input.maxLength = PROJECT_NAME_MAX;
  input.placeholder = text('pjNamePlaceholder');
  input.setAttribute('aria-label', text('pjNamePlaceholder'));
  input.value = state.name;
  const draw = () => { iconButton.replaceChildren(projectMark(document, state)); };
  draw();
  input.addEventListener('input', () => { state.name = input.value; onChange(state); });
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); onSubmit(); } });
  const choose = ({ icon, color }) => { state.icon = icon; state.color = color; draw(); onChange(state); };
  let popover = null;
  iconButton.addEventListener('click', () => {
    // A computer: a box under the name; a phone: a sheet of its own.
    const sheet = field.closest?.('.pj-sheet');
    if (isWide(document) && sheet) {
      if (popover?.element.isConnected) { popover.close(); popover = null; return; }
      popover = openIconPopover({ document, sheet, anchor: field, text, draft: state, onChange: choose });
      return;
    }
    openIconPicker({ document, root, text, draft: state, onDone: choose });
  });
  field.append(iconButton, input);
  return {
    element: field,
    input,
    state,
    set(partial) { Object.assign(state, partial); input.value = state.name; draw(); onChange(state); }
  };
}

const MEMORY_OPTIONS = [['default', 'pjMemoryDefault', 'pjMemoryDefaultBody'], ['project', 'pjMemoryProject', 'pjMemoryProjectBody']];

/** The choice of where the notes of the chats are kept, shown when a project is made (it cannot be changed afterwards): two rows, one ticked (on a phone). */
function memoryChoice(document, text, onChange) {
  const group = make(document, 'div', 'pj-memory');
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', text('pjMemoryTitle'));
  group.appendChild(make(document, 'div', 'pj-section-title', text('pjMemoryTitle')));
  const rows = [];
  for (const [value, title, body] of MEMORY_OPTIONS) {
    const row = make(document, 'button', 'pj-memory-row');
    row.type = 'button';
    row.setAttribute('role', 'radio');
    const label = make(document, 'span', 'pj-memory-text');
    label.append(make(document, 'span', 'pj-memory-name', text(title)), make(document, 'span', 'pj-memory-body', text(body)));
    row.append(make(document, 'span', 'pj-memory-dot'), label);
    row.addEventListener('click', () => select(value));
    rows.push({ value, row });
    group.appendChild(row);
  }
  function select(value) {
    for (const entry of rows) {
      entry.row.setAttribute('aria-checked', String(entry.value === value));
      entry.row.classList.toggle('is-selected', entry.value === value);
    }
    onChange(value);
  }
  select('default');
  group.appendChild(make(document, 'p', 'pj-memory-note', text('pjMemoryFixed')));
  return group;
}

/** The same choice on a computer: a button at the left of the foot ("Default memory ▾") that opens a list with a word under each choice, as in the apps of a computer. */
function memoryDropdown(document, text, onChange) {
  const win = document.defaultView;
  const wrap = make(document, 'div', 'pj-dropdown');
  const button = make(document, 'button', 'pj-dropdown-button');
  button.type = 'button';
  button.setAttribute('aria-haspopup', 'listbox');
  button.setAttribute('aria-expanded', 'false');
  let value = 'default';
  let list = null;
  const label = () => { button.replaceChildren(make(document, 'span', '', text(MEMORY_OPTIONS.find((entry) => entry[0] === value)[1])), make(document, 'span', 'pj-dropdown-caret', '▾')); };
  const closeList = () => {
    if (!list) return;
    list.remove();
    list = null;
    button.setAttribute('aria-expanded', 'false');
    win.removeEventListener('pointerdown', onOutside, true);
    win.removeEventListener('keydown', onKey, true);
  };
  const onOutside = (event) => { if (!wrap.contains(event.target)) closeList(); };
  const onKey = (event) => { if (event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); closeList(); } };
  button.addEventListener('click', () => {
    if (list) { closeList(); return; }
    list = make(document, 'div', 'pj-dropdown-list');
    list.setAttribute('role', 'listbox');
    for (const [key, title, body] of MEMORY_OPTIONS) {
      const item = make(document, 'button', 'pj-dropdown-item');
      item.type = 'button';
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(key === value));
      const words = make(document, 'span', 'pj-memory-text');
      words.append(make(document, 'span', 'pj-memory-name', text(title)), make(document, 'span', 'pj-memory-body', text(body)));
      item.append(words, make(document, 'span', 'pj-dropdown-check', key === value ? '✓' : ''));
      item.addEventListener('click', () => { value = key; label(); onChange(value); closeList(); });
      list.appendChild(item);
    }
    wrap.appendChild(list);
    button.setAttribute('aria-expanded', 'true');
    win.addEventListener('pointerdown', onOutside, true);
    win.addEventListener('keydown', onKey, true);
  });
  label();
  wrap.appendChild(button);
  return wrap;
}

/** The place to take the files of a folder of the computer from (a computer only): "Source folder", a box with a button that opens the choice of a folder, and what was chosen. */
function folderChoice(document, text, onChange) {
  const box = make(document, 'div', 'pj-folder');
  box.appendChild(make(document, 'div', 'pj-section-title', text('pjSourceFolder')));
  const area = make(document, 'div', 'pj-folder-box');
  const hint = make(document, 'div', 'pj-folder-hint', text('pjFolderHint'));
  const input = make(document, 'input', 'pj-file-input');
  input.type = 'file';
  input.hidden = true;
  input.multiple = true;
  input.setAttribute('webkitdirectory', '');
  const add = make(document, 'button', 'pj-chip pj-folder-add');
  add.type = 'button';
  add.innerHTML = ICONS.folder(16);
  add.append(make(document, 'span', 'pj-chip-label', text('pjFolderAdd')));
  add.addEventListener('click', () => input.click());
  const result = make(document, 'div', 'pj-folder-result');
  result.hidden = true;
  const clear = make(document, 'button', 'pj-more');
  clear.type = 'button';
  clear.setAttribute('aria-label', text('pjSourceRemove'));
  clear.innerHTML = ICONS.close(16);
  input.addEventListener('change', () => {
    const picked = pickFolderFiles([...(input.files || [])]);
    input.value = '';
    if (!picked.files.length && !picked.skipped) return;
    show(picked);
    onChange(picked);
  });
  const show = (picked) => {
    result.replaceChildren(make(document, 'span', 'pj-folder-name', text('pjFolderPicked', { n: picked.files.length, name: picked.name })), ...(picked.skipped ? [make(document, 'span', 'pj-row-meta', text('pjFolderSkipped', { n: picked.skipped }))] : []), clear);
    result.hidden = !picked.files.length;
    hint.hidden = Boolean(picked.files.length);
    add.hidden = Boolean(picked.files.length);
  };
  clear.addEventListener('click', () => { result.hidden = true; hint.hidden = false; add.hidden = false; onChange({ files: [], skipped: 0, name: '' }); });
  area.append(hint, add, result, input);
  box.appendChild(area);
  return box;
}

const FOLDER_SKIP = /(^|\/)(\.|node_modules\/|__pycache__\/|dist\/|build\/)/;
/** The files of a chosen folder that are worth adding as sources: no hidden files and no folders of tools, at most as many as a project holds; `skipped` says how many were left out. */
export function pickFolderFiles(files, max = PROJECT_SOURCES_MAX) {
  const name = String(files[0]?.webkitRelativePath || '').split('/')[0] || '';
  const usable = files.filter((file) => file.size > 0 && !FOLDER_SKIP.test(String(file.webkitRelativePath || file.name)));
  return { name, files: usable.slice(0, max), skipped: files.length - Math.min(usable.length, max) };
}

/** The sheet that makes a project. `onCreated(id)` is called after it is made; `onFolderFiles(id, files)` is given the files of the folder that was chosen (a computer), to be added as sources. */
export function openCreateSheet({ document, root, text, actions, notify = () => {}, onCreated = () => {}, onFolderFiles = null }) {
  let busy = false;
  let memoryScope = 'default';
  let folder = { files: [], skipped: 0, name: '' };
  const wide = isWide(document);
  const { foot, button } = footerButton(document, text('pjCreate'));
  // On a computer the choice of memory sits at the left of the foot, and the button at the right.
  if (wide) foot.prepend(memoryDropdown(document, text, (value) => { memoryScope = value; }));
  let sheet;
  const field = nameField({
    document, root, text, initial: {},
    onChange: (state) => { button.disabled = busy || !state.name.trim(); },
    onSubmit: () => { if (!button.disabled) button.click(); }
  });
  button.disabled = true;
  sheet = openSheet({
    document, root, title: text('pjNew'), close: text('pjCancel'), footer: foot,
    body: (body) => {
      body.appendChild(make(document, 'p', 'pj-intro', text('pjNewIntro')));
      body.appendChild(field.element);
      const chips = make(document, 'div', 'pj-chips');
      for (const preset of PROJECT_PRESETS) {
        const chip = make(document, 'button', 'pj-chip');
        chip.type = 'button';
        chip.appendChild(projectMark(document, preset, 'is-chip'));
        chip.append(make(document, 'span', 'pj-chip-label', text(preset.key)));
        chip.addEventListener('click', () => { field.set({ name: text(preset.key), icon: preset.icon, color: preset.color }); field.input.focus(); });
        chips.appendChild(chip);
      }
      body.appendChild(chips);
      if (wide && onFolderFiles) body.appendChild(folderChoice(document, text, (picked) => { folder = picked; }));
      if (!wide) body.appendChild(memoryChoice(document, text, (value) => { memoryScope = value; }));
    }
  });
  button.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    button.disabled = true;
    sheet.setError('');
    const result = await actions.create({ name: field.state.name, icon: field.state.icon, color: field.state.color, memoryScope }).catch(() => ({ ok: false }));
    busy = false;
    if (!result.ok) { button.disabled = !field.state.name.trim(); sheet.setError(failureText(text, result)); return; }
    sheet.close();
    notify(text('pjCreated'), 'success');
    onCreated(result.id);
    // The files of the chosen folder are added after the project is there (the sources are read and kept one by one).
    if (folder.files.length && onFolderFiles) void onFolderFiles(result.id, folder.files);
  });
  return sheet;
}

/**
 * The sheet that changes the name, the icon and the colour of a project. On a computer it also lists the sources ("Available sources", with an add button and a bin on each) and has an
 * "Advanced" button at the left of the foot that opens the instructions; `sources` is { list(), row(source, refresh), add(refresh) } from the page (without it a computer shows the name only).
 */
export function openEditSheet({ document, root, text, actions, project, notify = () => {}, onSaved = () => {}, sources = null }) {
  let busy = false;
  const wide = isWide(document);
  const { foot, button } = footerButton(document, text('pjSave'));
  if (wide) {
    const advanced = make(document, 'button', 'pj-button pj-secondary pj-foot-left');
    advanced.type = 'button';
    advanced.innerHTML = ICONS.sliders(16);
    advanced.append(make(document, 'span', '', text('pjAdvanced')));
    advanced.addEventListener('click', () => openInstructionsSheet({ document, root, text, actions, project: actions.folderOf?.(project.id) || project, notify, onSaved, advanced: true }));
    foot.prepend(advanced);
  }
  const field = nameField({
    document, root, text, initial: { name: project.name, icon: project.icon, color: project.color },
    onChange: (state) => { button.disabled = busy || !state.name.trim(); },
    onSubmit: () => { if (!button.disabled) button.click(); }
  });
  const sheet = openSheet({ document, root, title: text('pjEditTitle'), close: text('pjCancel'), footer: foot, className: wide ? 'pj-sheet-settings' : '',
    body: (body) => {
      body.appendChild(field.element);
      // Where the notes are kept was chosen when the project was made and is only shown here.
      if (project.memoryScope === 'project') body.appendChild(make(document, 'p', 'pj-note pj-memory-shown', text('pjMemoryBadge')));
      if (wide && sources) {
        const head = make(document, 'div', 'pj-sources-head');
        head.appendChild(make(document, 'div', 'pj-section-title', text('pjSourcesAvailable')));
        const add = make(document, 'button', 'pj-chip');
        add.type = 'button';
        add.innerHTML = ICONS.plus(16);
        add.append(make(document, 'span', 'pj-chip-label', text('pjFolderAdd')));
        const list = make(document, 'div', 'pj-sources-list');
        const refresh = () => {
          list.replaceChildren(...sources.list().map((source) => sources.row(source, refresh)));
          if (!list.children.length) list.appendChild(make(document, 'p', 'pj-note', text('pjSourcesNone')));
        };
        add.addEventListener('click', () => sources.add(refresh));
        head.appendChild(add);
        refresh();
        body.append(head, list);
      }
    }
  });
  button.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    button.disabled = true;
    sheet.setError('');
    const result = await actions.update(project.id, { name: field.state.name, icon: field.state.icon, color: field.state.color }).catch(() => ({ ok: false }));
    busy = false;
    if (!result.ok) { button.disabled = !field.state.name.trim(); sheet.setError(failureText(text, result)); return; }
    sheet.close();
    notify(text('pjSaved'), 'success');
    onSaved();
  });
  return sheet;
}

/** The sheet where the instructions of a project are written. */
export function openInstructionsSheet({ document, root, text, actions, project, notify = () => {}, onSaved = () => {}, advanced = false }) {
  let busy = false;
  const { foot, button } = footerButton(document, text('pjSave'));
  const area = make(document, 'textarea', 'pj-textarea');
  area.maxLength = PROJECT_INSTRUCTIONS_MAX;
  area.placeholder = text('pjInstructionsPlaceholder');
  area.setAttribute('aria-label', text('pjInstructionsTitle'));
  area.value = String(project.instructions || '');
  const count = make(document, 'p', 'pj-count');
  const redraw = () => { count.textContent = text('pjInstructionsCount', { n: area.value.length, max: PROJECT_INSTRUCTIONS_MAX }); };
  area.addEventListener('input', redraw);
  redraw();
  const sheet = openSheet({
    document, root, title: text(advanced ? 'pjAdvancedTitle' : 'pjInstructionsTitle'), close: text('pjCancel'), footer: foot,
    body: (body) => {
      body.append(make(document, 'p', 'pj-intro', text('pjInstructionsHint')), area, count, make(document, 'p', 'pj-note', text('pjInstructionsNote')));
      // Where the notes are kept was chosen when the project was made: shown, not changeable.
      const kept = project.memoryScope === 'project';
      const memory = make(document, 'div', 'pj-memory-shown-block');
      memory.append(make(document, 'div', 'pj-section-title', text('pjMemoryTitle')), make(document, 'p', 'pj-note', text(kept ? 'pjMemoryShownProject' : 'pjMemoryShownDefault')), make(document, 'div', 'pj-readonly', text(kept ? 'pjMemoryProject' : 'pjMemoryDefault')));
      body.appendChild(memory);
    }
  });
  button.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    button.disabled = true;
    sheet.setError('');
    const result = await actions.update(project.id, { instructions: area.value }).catch(() => ({ ok: false }));
    busy = false;
    button.disabled = false;
    if (!result.ok) { sheet.setError(failureText(text, result)); return; }
    sheet.close();
    notify(text('pjSaved'), 'success');
    onSaved();
  });
  return sheet;
}

/** The sheet where a text is added to the sources of a project: a title (optional) and the text. */
export function openSourceTextSheet({ document, root, text, actions, project, notify = () => {}, onSaved = () => {} }) {
  let busy = false;
  const { foot, button } = footerButton(document, text('pjSave'));
  button.disabled = true;
  const title = make(document, 'input', 'pj-text-input');
  title.type = 'text';
  title.maxLength = PROJECT_SOURCE_TITLE_MAX;
  title.placeholder = text('pjSourceTitleField');
  title.setAttribute('aria-label', text('pjSourceTitleField'));
  const area = make(document, 'textarea', 'pj-textarea');
  area.maxLength = PROJECT_SOURCE_CHARS_MAX;
  area.placeholder = text('pjSourceTextPlaceholder');
  area.setAttribute('aria-label', text('pjSourceTextField'));
  const count = make(document, 'p', 'pj-count');
  const redraw = () => {
    count.textContent = text('pjInstructionsCount', { n: area.value.length, max: PROJECT_SOURCE_CHARS_MAX });
    button.disabled = busy || !area.value.trim();
  };
  area.addEventListener('input', redraw);
  redraw();
  const sheet = openSheet({ document, root, title: text('pjSourceTextTitle'), close: text('pjCancel'), footer: foot, body: (body) => body.append(title, area, count) });
  title.focus?.();
  button.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    button.disabled = true;
    sheet.setError('');
    const result = await actions.addSource(project.id, { kind: 'text', title: title.value.trim() || text('pjSourceUntitled'), text: area.value }).catch(() => ({ ok: false }));
    busy = false;
    redraw();
    if (!result.ok) { sheet.setError(sourceFailureText(text, result)); return; }
    sheet.close();
    notify(text('pjSourceAdded'), 'success');
    onSaved();
  });
  return sheet;
}

/** The words for a source that could not be added or read (`result.code`), with the name of the file when there is one. */
export function sourceFailureText(text, result = {}, name = '') {
  const vars = { name, max: result.max ?? 20 };
  switch (result.code) {
    case 'full': return text('pjSourcesFull', { max: 20 });
    case 'too_much': return text('pjSourcesTooMuch');
    case 'empty': return name ? text('pjSourceEmpty', vars) : text('pjFailed');
    case 'files_too_much': return text('pjSourceFilesTooMuch');
    case 'too_big': return text('pjSourceTooBig', vars);
    case 'unreadable': return text('pjSourceUnreadable', vars);
    default: return text('pjFailed');
  }
}

/** The sheet before a project is deleted: with chats in it the person says what happens to them; without, it is a plain question. `onDeleted(result)` is called after. */
export function openDeleteSheet({ document, root, text, actions, project, notify = () => {}, onDeleted = () => {} }) {
  const chats = actions.countOf(project.id);
  let busy = false;
  const foot = make(document, 'div', 'pj-sheet-foot is-stacked');
  const keep = make(document, 'button', 'pj-button pj-secondary', chats ? text('pjDeleteKeep') : text('pjMenuDelete'));
  keep.type = 'button';
  keep.classList.toggle('is-danger', !chats);
  const withChats = make(document, 'button', 'pj-button pj-secondary is-danger', text('pjDeleteWithChats'));
  withChats.type = 'button';
  const cancel = make(document, 'button', 'pj-button pj-plain', text('pjCancel'));
  cancel.type = 'button';
  foot.append(keep);
  if (chats) foot.append(withChats);
  foot.append(cancel);
  const sheet = openSheet({
    document, root, title: text('pjDeleteTitle'), close: text('pjCancel'), footer: foot, className: 'pj-sheet-small', dialog: true,
    body: (body) => body.appendChild(make(document, 'p', 'pj-intro', chats ? text('pjDeleteBody', { name: project.name, n: chats }) : text('pjDeleteEmptyBody', { name: project.name })))
  });
  const run = (withChatsToo) => async () => {
    if (busy) return;
    busy = true;
    for (const button of [keep, withChats, cancel]) button.disabled = true;
    sheet.setError('');
    const result = await actions.remove(project.id, { withChats: withChatsToo }).catch(() => ({ ok: false }));
    busy = false;
    for (const button of [keep, withChats, cancel]) button.disabled = false;
    if (result.code === 'cancelled') return;
    if (!result.ok) { sheet.setError(text('pjFailed')); return; }
    sheet.close();
    notify(withChatsToo && chats ? text('pjDeletedWithChats') : text('pjDeleted'), 'success');
    onDeleted(result);
  };
  keep.addEventListener('click', run(false));
  withChats.addEventListener('click', run(true));
  cancel.addEventListener('click', () => sheet.close());
  return sheet;
}

/** The sheet that renames a chat of a project. */
export function openRenameChatSheet({ document, root, text, actions, conversation, onSaved = () => {} }) {
  let busy = false;
  const { foot, button } = footerButton(document, text('pjSave'));
  const input = make(document, 'input', 'pj-text-input');
  input.type = 'text';
  input.maxLength = 200;
  input.value = String(conversation.title || '');
  input.setAttribute('aria-label', text('pjChatRename'));
  input.addEventListener('input', () => { button.disabled = busy || !input.value.trim(); });
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); if (!button.disabled) button.click(); } });
  const sheet = openSheet({ document, root, title: text('pjChatRename'), close: text('pjCancel'), footer: foot, className: 'pj-sheet-small', dialog: true, body: (body) => body.appendChild(input) });
  input.select?.();
  button.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    button.disabled = true;
    const result = await actions.renameChat(conversation.id, input.value).catch(() => ({ ok: false }));
    busy = false;
    if (!result.ok) { button.disabled = !input.value.trim(); sheet.setError(failureText(text, result)); return; }
    sheet.close();
    onSaved();
  });
  return sheet;
}
