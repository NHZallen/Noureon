// The window that asks the person for the login a CLI tool needs (docs/superpowers/specs/2026-10-04-cli-store-design.md, §10): the tool and its
// site, one field for each thing it needs, named by what it is (Token, Cookie, Password) with one line on where to find it, and a button to show or
// hide what is typed. What is entered is always saved (there is no "save?" box); it can be seen, replaced or deleted later in the settings.
// Black and white, in the manner of the sign-in windows of ChatGPT and Claude.

import { cliCredentialInfo } from '../../../data/cli-catalog.js';
import { permissionText } from '../../runtime/cli/permission-texts.js';

const TYPE_KEYS = Object.freeze({ token: 'credTypeToken', cookie: 'credTypeCookie', password: 'credTypePassword' });
const EYE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.7 10.7 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A16.6 16.6 0 0 0 2 12s3.6 7 10 7a10.5 10.5 0 0 0 4.2-.9"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';

/**
 * `tool`: { id, name }; `fields`: [{ env, label, type, site }] (what is missing); `onSubmit({ NAME: value })` resolves { ok, reason? } (the window stays
 * open on a failure and says so); `onSkip()` is "not now" (also Escape). Returns { close() }.
 */
export function openCredentialModal({ document, language, tool, fields, onSubmit, onSkip = () => {} }) {
  const t = (key, values) => permissionText(language, key, values);
  const make = (tag, className, content) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  };
  const known = fields.map((field) => ({ ...field, info: cliCredentialInfo(field.env) }));
  const site = known.find((field) => field.site)?.site || '';

  const overlay = make('div', 'cred-modal');
  overlay.dataset.askTool = tool.id;
  const dialog = make('form', 'cred-modal-dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  const titleId = `cred-modal-title-${Math.random().toString(36).slice(2, 8)}`;
  dialog.setAttribute('aria-labelledby', titleId);
  const title = make('h2', 'cred-modal-title', t('credModalTitle', { tool: tool.name }));
  title.id = titleId;
  const sub = make('p', 'cred-modal-site', site ? t('credKnownTool', { tool: tool.name, site }) : tool.name);
  dialog.append(title, sub);

  const inputs = new Map();
  for (const field of known) {
    const group = make('div', 'cred-modal-field');
    const inputId = `cred-modal-${field.env}`;
    const label = make('label', 'cred-modal-label');
    label.htmlFor = inputId;
    label.append(make('span', 'cred-modal-type', t(TYPE_KEYS[field.type] || 'credTypeToken')), make('span', 'cred-modal-name', field.label));
    const how = make('p', 'cred-modal-how', t(`credHow_${field.env}`) === `credHow_${field.env}` ? t('credHowGeneric') : t(`credHow_${field.env}`));
    const wrap = make('div', 'cred-modal-input');
    const input = make('input', 'cred-modal-text');
    input.id = inputId;
    input.type = 'password';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('autocapitalize', 'off');
    const toggle = make('button', 'cred-modal-eye');
    toggle.type = 'button';
    toggle.innerHTML = EYE;
    toggle.setAttribute('aria-label', t('credShow'));
    toggle.addEventListener('click', () => {
      const hidden = input.type === 'password';
      input.type = hidden ? 'text' : 'password';
      toggle.innerHTML = hidden ? EYE_OFF : EYE;
      toggle.setAttribute('aria-label', t(hidden ? 'credHide' : 'credShow'));
    });
    wrap.append(input, toggle);
    group.append(label, how, wrap);
    dialog.append(group);
    inputs.set(field.env, input);
  }

  dialog.append(make('p', 'cred-modal-note', t('credModalDesc')));
  const error = make('p', 'cred-modal-error');
  error.hidden = true;
  const actions = make('div', 'cred-modal-actions');
  const skip = make('button', 'cred-modal-button', t('credModalSkip'));
  skip.type = 'button';
  const save = make('button', 'cred-modal-button is-primary', t('credModalSave'));
  save.type = 'submit';
  actions.append(skip, save);
  dialog.append(error, actions);
  overlay.append(dialog);
  document.body.append(overlay);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    overlay.remove();
  };
  const onKey = (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    close();
    onSkip();
  };
  document.addEventListener('keydown', onKey, true);
  skip.addEventListener('click', () => { close(); onSkip(); });

  dialog.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = {};
    for (const [env, input] of inputs) {
      const value = input.value.trim();
      if (!value) {
        error.textContent = t('credModalRequired');
        error.hidden = false;
        input.focus();
        return;
      }
      values[env] = value;
    }
    error.hidden = true;
    save.disabled = true;
    skip.disabled = true;
    let result = { ok: false };
    try {
      result = await onSubmit(values);
    } catch {
      result = { ok: false };
    }
    if (result?.ok) {
      close();
      return;
    }
    save.disabled = false;
    skip.disabled = false;
    error.textContent = result?.reason === 'bad_value' ? t('credBadValue') : (result?.reason === 'too_many' ? t('credTooMany') : t('credFailed'));
    error.hidden = false;
  });

  inputs.values().next().value?.focus();
  return { close };
}
