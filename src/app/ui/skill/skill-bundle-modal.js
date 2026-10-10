// The window that shows a skill pack (a zip) before it is added (docs/superpowers/specs/2026-10-09-skills-design.md, §14.5): the name and the description the pack
// carries, every file in it (a script is marked), the text of any file to read, the warning that a skill is instructions for the model (and, with scripts, that they can
// be run), and a button that adds it. It looks like the window that takes a pasted skill (the same classes).

import { bundleFileText } from '../../../data/skill-bundle.js';
import { skillText } from '../../runtime/skill/skill-texts.js';
import { formatFileSize } from './skill-file-size.js';

const SKILL_FILE = 'SKILL.md';

/**
 * `read` is what readSkillBundle gave for the zip ({ ok: true, skill, files, bundle }). `onSubmit(read, { replace })` resolves { ok: true } (the window closes) or
 * { ok: false, error } (it stays, with the reason; `name_taken` offers "Replace"). `existing(name)` tells whether the person already has a skill of that name.
 * Returns { close, element }.
 */
export function openSkillBundleModal({ document, language, read, onSubmit, existing = () => false, onClose = () => {} }) {
  const t = (key, values) => skillText(language, key, values);
  const make = (tag, className, content) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  };
  const { skill, files } = read;
  const scripts = files.some((file) => file.kind === 'script');
  const replacing = Boolean(existing(skill.name));

  const overlay = make('div', 'cred-modal skill-paste skill-bundle');
  const dialog = make('form', 'cred-modal-dialog skill-paste-dialog skill-bundle-dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  const titleId = `skill-bundle-title-${Math.random().toString(36).slice(2, 8)}`;
  dialog.setAttribute('aria-labelledby', titleId);
  const title = make('h2', 'cred-modal-title', t('skillBundleTitle'));
  title.id = titleId;
  const hint = make('p', 'cred-modal-how skill-paste-hint', t('skillBundleHint'));

  const summary = make('dl', 'skill-paste-found');
  summary.append(
    make('dt', '', t('skillPreviewName')), make('dd', '', skill.name),
    make('dt', '', t('skillPreviewDescription')), make('dd', '', skill.description),
    make('dd', 'skill-paste-size', `${t('skillPreviewSize', { count: skill.body.length })} · ${t('skillPreviewFiles', { count: files.length + 1 })}`)
  );

  // The files: SKILL.md first (its text is what the model is given), then the others; a click shows the text of one.
  const heading = make('h3', 'skill-bundle-heading', t('skillBundleFiles', { count: files.length + 1 }));
  const list = make('ul', 'skill-bundle-files');
  const view = make('pre', 'skill-bundle-view');
  view.tabIndex = 0;
  const note = make('p', 'skill-bundle-note');
  let shown = SKILL_FILE;
  const entries = [{ path: SKILL_FILE, size: skill.body.length, kind: 'text' }, ...files];
  const show = (path) => {
    shown = path;
    for (const item of list.children) item.firstChild.setAttribute('aria-pressed', String(item.dataset.path === path));
    if (path === SKILL_FILE) {
      view.textContent = skill.body;
      note.textContent = '';
      return;
    }
    const text = bundleFileText(files, path);
    view.textContent = text ? text.text : '';
    note.textContent = text ? (text.cut ? t('skillFileCut', { count: text.text.length }) : '') : t('skillFileNoPreview');
  };
  for (const entry of entries) {
    const item = make('li', 'skill-bundle-file');
    item.dataset.path = entry.path;
    const choose = make('button', 'skill-bundle-file-button');
    choose.type = 'button';
    choose.setAttribute('aria-pressed', 'false');
    choose.append(make('span', 'skill-bundle-file-path', entry.path));
    if (entry.kind === 'script') choose.append(make('span', 'cs-badge skill-bundle-script', t('skillKindScript')));
    choose.append(make('span', 'skill-bundle-file-size', formatFileSize(entry.size)));
    choose.addEventListener('click', () => show(entry.path));
    item.append(choose);
    list.append(item);
  }
  show(SKILL_FILE);

  const warning = make('p', 'cred-modal-note skill-paste-warning', t('skillBundleWarning'));
  const scriptsWarning = scripts ? make('p', 'cred-modal-note skill-paste-warning skill-bundle-scripts-warning', t('skillBundleScriptsWarning')) : null;
  const check = make('div', 'skill-paste-check');
  check.setAttribute('aria-live', 'polite');
  const actions = make('div', 'cred-modal-actions');
  const cancel = make('button', 'cred-modal-button', t('skillPasteCancel'));
  cancel.type = 'button';
  const submit = make('button', 'cred-modal-button is-primary btn-primary', t(replacing ? 'skillPasteReplace' : 'skillPasteAdd'));
  submit.type = 'submit';
  actions.append(cancel, submit);
  dialog.append(title, hint, summary, heading, list, view, note, ...(scriptsWarning ? [scriptsWarning] : []), warning, check, actions);
  overlay.append(dialog);
  document.body.append(overlay);

  let busy = false;
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
  overlay.addEventListener('mousedown', (event) => { if (event.target === overlay) close(); });

  dialog.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    submit.disabled = true;
    cancel.disabled = true;
    check.replaceChildren();
    let result = { ok: false, error: 'failed' };
    try {
      result = await onSubmit(read, { replace: replacing });
    } catch {
      result = { ok: false, error: 'failed' };
    }
    busy = false;
    cancel.disabled = false;
    if (result?.ok) {
      close();
      return;
    }
    submit.disabled = false;
    const detail = result?.detail ? ` (${result.detail})` : '';
    check.replaceChildren(make('p', 'cred-modal-error skill-paste-error', `${t(`skillErr_${result?.error || 'failed'}`)}${detail}`));
  });

  submit.focus?.();
  return { close, element: overlay, get shown() { return shown; } };
}
