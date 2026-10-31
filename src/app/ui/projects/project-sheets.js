// The sheets of the projects (docs/superpowers/specs/2026-10-31-projects-design.md, §7): create one, edit its name and icon, choose the icon and colour, write its instructions, delete it
// (with the choice of what happens to its chats) and rename a chat. Each asks `actions` (runtime/projects/project-actions.js) and says in words when that did not work.

import { FOLDER_SVGS } from '../../runtime/features/folder-metadata.js';
import { FOLDER_COLORS } from '../../runtime/shell/runtime-ui-colors.js';
import { PROJECT_INSTRUCTIONS_MAX } from '../../runtime/projects/project-instructions.js';
import { PROJECT_NAME_MAX } from '../../runtime/projects/project-actions.js';
import { PROJECT_SOURCE_CHARS_MAX, PROJECT_SOURCE_TITLE_MAX } from '../../runtime/projects/project-source-model.js';
import { colorOf, make, openSheet, projectMark } from './project-parts.js';

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

/** The sheet where the icon and the colour are chosen; `onDone({ icon, color })` is called as it is closed with "Done". */
export function openIconPicker({ document, root, text, draft, onDone }) {
  let { icon, color } = draft;
  const preview = make(document, 'div', 'pj-picker-preview');
  const colors = make(document, 'div', 'pj-colors');
  colors.setAttribute('role', 'radiogroup');
  colors.setAttribute('aria-label', text('pjColor'));
  const icons = make(document, 'div', 'pj-icons');
  icons.setAttribute('role', 'radiogroup');
  icons.setAttribute('aria-label', text('pjIcon'));
  const redraw = () => {
    preview.replaceChildren(projectMark(document, { icon, color }, 'is-large'));
    for (const button of colors.children) button.setAttribute('aria-checked', String(button.dataset.color === color));
    for (const button of icons.children) button.setAttribute('aria-checked', String(button.dataset.icon === icon));
    for (const button of icons.children) button.style.setProperty('--pj-color', colorOf(color));
  };
  for (const key of Object.keys(FOLDER_COLORS)) {
    const dot = make(document, 'button', 'pj-dot');
    dot.type = 'button';
    dot.dataset.color = key;
    dot.setAttribute('role', 'radio');
    dot.setAttribute('aria-label', key);
    dot.style.setProperty('--pj-dot', FOLDER_COLORS[key]);
    dot.addEventListener('click', () => { color = key; redraw(); });
    colors.appendChild(dot);
  }
  for (const key of Object.keys(FOLDER_SVGS)) {
    const button = make(document, 'button', 'pj-icon-option');
    button.type = 'button';
    button.dataset.icon = key;
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-label', key);
    button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${FOLDER_SVGS[key]}</svg>`;
    button.addEventListener('click', () => { icon = key; redraw(); });
    icons.appendChild(button);
  }
  // "Done" is at the right of the head, in the place of the cross (as in ChatGPT's): what was chosen is kept only by it.
  const sheet = openSheet({ document, root, title: text('pjChooseIcon'), action: { label: text('pjDone'), onClick: () => onDone({ icon, color }) }, body: (body) => body.append(preview, colors, icons) });
  redraw();
  return sheet;
};

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
  iconButton.addEventListener('click', () => openIconPicker({ document, root, text, draft: state, onDone: ({ icon, color }) => { state.icon = icon; state.color = color; draw(); onChange(state); } }));
  field.append(iconButton, input);
  return {
    element: field,
    input,
    state,
    set(partial) { Object.assign(state, partial); input.value = state.name; draw(); onChange(state); }
  };
}

/** The sheet that makes a project. `onCreated(id)` is called after it is made. */
export function openCreateSheet({ document, root, text, actions, notify = () => {}, onCreated = () => {} }) {
  let busy = false;
  const { foot, button } = footerButton(document, text('pjCreate'));
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
    }
  });
  button.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    button.disabled = true;
    sheet.setError('');
    const result = await actions.create({ name: field.state.name, icon: field.state.icon, color: field.state.color }).catch(() => ({ ok: false }));
    busy = false;
    if (!result.ok) { button.disabled = !field.state.name.trim(); sheet.setError(failureText(text, result)); return; }
    sheet.close();
    notify(text('pjCreated'), 'success');
    onCreated(result.id);
  });
  return sheet;
}

/** The sheet that changes the name, the icon and the colour of a project. */
export function openEditSheet({ document, root, text, actions, project, notify = () => {}, onSaved = () => {} }) {
  let busy = false;
  const { foot, button } = footerButton(document, text('pjSave'));
  const field = nameField({
    document, root, text, initial: { name: project.name, icon: project.icon, color: project.color },
    onChange: (state) => { button.disabled = busy || !state.name.trim(); },
    onSubmit: () => { if (!button.disabled) button.click(); }
  });
  const sheet = openSheet({ document, root, title: text('pjEditTitle'), close: text('pjCancel'), footer: foot, body: (body) => body.appendChild(field.element) });
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
export function openInstructionsSheet({ document, root, text, actions, project, notify = () => {}, onSaved = () => {} }) {
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
    document, root, title: text('pjInstructionsTitle'), close: text('pjCancel'), footer: foot,
    body: (body) => {
      body.append(make(document, 'p', 'pj-intro', text('pjInstructionsHint')), area, count, make(document, 'p', 'pj-note', text('pjInstructionsNote')));
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
    case 'unsupported': return text('pjSourceUnsupported', vars);
    case 'empty': return name ? text('pjSourceEmpty', vars) : text('pjFailed');
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
