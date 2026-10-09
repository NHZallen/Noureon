// The window that takes a skill pasted as text (docs/superpowers/specs/2026-10-09-skills-design.md, §5): one box for the text of a SKILL.md, a check as it is
// typed (the name and the description it found, or what is wrong with it), the warning that a skill is instructions for the model, and a button that
// adds it only when the text is good. It looks like the window of the credentials (the same classes, permissions.css).

import { parseSkillMarkdown } from '../../../data/skill-format.js';
import { skillText } from '../../runtime/skill/skill-texts.js';

/**
 * `onSubmit(text, { replace })` resolves { ok: true } (the window closes) or { ok: false, error } (it stays, with the reason; `name_taken` offers
 * "Replace"). `existing(name)` tells whether the person already has a skill of that name. `initialText` is a text to start with (the draft a model wrote:
 * it is checked at once, and the person reads it and presses "Add"). Returns { close }.
 */
export function openSkillPasteModal({ document, language, onSubmit, existing = () => false, initialText = '', onClose = () => {} }) {
  const t = (key, values) => skillText(language, key, values);
  const make = (tag, className, content) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  };

  const overlay = make('div', 'cred-modal skill-paste');
  const dialog = make('form', 'cred-modal-dialog skill-paste-dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  const titleId = `skill-paste-title-${Math.random().toString(36).slice(2, 8)}`;
  dialog.setAttribute('aria-labelledby', titleId);
  const title = make('h2', 'cred-modal-title', t('skillPasteTitle'));
  title.id = titleId;
  const hint = make('p', 'cred-modal-how skill-paste-hint', t('skillPasteHint'));
  const area = make('textarea', 'skill-paste-text');
  area.setAttribute('aria-label', t('skillTextLabel'));
  area.placeholder = t('skillPastePlaceholder');
  area.spellcheck = false;
  area.autocomplete = 'off';
  area.setAttribute('autocapitalize', 'off');
  const check = make('div', 'skill-paste-check');
  check.setAttribute('aria-live', 'polite');
  const warning = make('p', 'cred-modal-note skill-paste-warning', t('skillPasteWarning'));
  const actions = make('div', 'cred-modal-actions');
  const cancel = make('button', 'cred-modal-button', t('skillPasteCancel'));
  cancel.type = 'button';
  const submit = make('button', 'cred-modal-button is-primary btn-primary', t('skillPasteAdd'));
  submit.type = 'submit';
  submit.disabled = true;
  actions.append(cancel, submit);
  dialog.append(title, hint, area, check, warning, actions);
  overlay.append(dialog);
  document.body.append(overlay);

  let replacing = false;
  let busy = false;
  let serverError = '';

  const show = (nodes) => check.replaceChildren(...nodes);
  const problem = (key) => {
    const line = make('p', 'cred-modal-error skill-paste-error', t(key));
    return [line];
  };
  // What the check says for the text now: nothing for an empty box, what is wrong, or what was found.
  const refresh = () => {
    const text = area.value;
    replacing = false;
    submit.textContent = t('skillPasteAdd');
    if (!text.trim()) {
      submit.disabled = true;
      serverError = '';
      show([]);
      return;
    }
    const parsed = parseSkillMarkdown(text);
    if (!parsed.ok) {
      submit.disabled = true;
      serverError = '';
      show(parsed.error === 'empty' ? [] : problem(`skillErr_${parsed.error}`));
      return;
    }
    const { skill } = parsed;
    const rows = [['skillPreviewName', skill.name], ['skillPreviewDescription', skill.description], [null, t('skillPreviewSize', { count: skill.body.length })]];
    const summary = make('dl', 'skill-paste-found');
    for (const [key, value] of rows) {
      if (key) summary.append(make('dt', '', t(key)), make('dd', '', value));
      else summary.append(make('dd', 'skill-paste-size', value));
    }
    const nodes = [summary];
    if (serverError) nodes.push(...problem(`skillErr_${serverError}`));
    // A name the person already has can be replaced by the new text.
    if (existing(skill.name)) {
      replacing = true;
      submit.textContent = t('skillPasteReplace');
    }
    show(nodes);
    submit.disabled = busy;
  };
  area.addEventListener('input', () => { serverError = ''; refresh(); });

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    overlay.remove();
    onClose();
  };
  const onKey = (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    close();
  };
  document.addEventListener('keydown', onKey, true);
  cancel.addEventListener('click', close);
  // A click on the dark part outside the window closes it, as a click on "Cancel" does.
  overlay.addEventListener('mousedown', (event) => { if (event.target === overlay) close(); });

  dialog.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || submit.disabled) return;
    busy = true;
    submit.disabled = true;
    cancel.disabled = true;
    let result = { ok: false, error: 'failed' };
    try {
      result = await onSubmit(area.value, { replace: replacing });
    } catch {
      result = { ok: false, error: 'failed' };
    }
    busy = false;
    cancel.disabled = false;
    if (result?.ok) {
      close();
      return;
    }
    serverError = result?.error || 'failed';
    refresh();
  });

  if (initialText) {
    area.value = String(initialText);
    refresh();
  }
  area.focus?.();
  return { close, element: overlay };
}
