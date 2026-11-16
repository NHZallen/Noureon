// The panels of the browser agent in the conversation (design section 16): what the person is asked, in the place of the card of the browser (no window, no blur). One panel for each kind of
// question the server asks (server/browser-ask.js): `confirm` here; the login, code and payment panels come in the same shape. A panel is `{ element, destroy() }`; it calls `answer(payload)`
// once with what the person decided, and the card takes it away when the server says the question is over.

import { sandboxText } from '../../runtime/sandbox/sandbox-texts.js';

const TITLES = { payment: 'browserAskTitlePayment', delete: 'browserAskTitleDelete', change: 'browserAskTitleChange', irreversible: 'browserAskTitleIrreversible' };

const make = (document, tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

function confirmPanel({ document, language, info, answer }) {
  const t = (key, values) => sandboxText(language, key, values);
  const root = make(document, 'div', 'bpanel');
  root.setAttribute('role', 'group');
  const title = make(document, 'div', 'bpanel-title', t(TITLES[info.action] || TITLES.irreversible));
  const site = make(document, 'div', 'bpanel-site', info.domain ? t('browserAskSite', { domain: info.domain }) : '');
  site.hidden = !info.domain;
  const summary = make(document, 'div', 'bpanel-summary', info.summary || '');
  summary.hidden = !info.summary;
  const row = make(document, 'div', 'bpanel-row');
  const cancel = make(document, 'button', 'bpanel-button', t('browserAskCancel'));
  cancel.type = 'button';
  const danger = info.action === 'delete';
  const confirm = make(document, 'button', `bpanel-button is-primary${danger ? ' is-danger' : ''}`, t(danger ? 'browserAskConfirmDelete' : 'browserAskConfirm'));
  confirm.type = 'button';
  row.append(cancel, confirm);
  const hint = make(document, 'div', 'bpanel-hint', t('browserAskWait'));
  root.append(title, site, summary, row, hint);
  let sent = false;
  const send = (decision) => { if (sent) return; sent = true; root.classList.add('is-sent'); cancel.disabled = true; confirm.disabled = true; answer({ decision }); };
  cancel.addEventListener('click', () => send('cancel'));
  confirm.addEventListener('click', () => send('confirm'));
  return { element: root, focus: () => cancel.focus?.(), destroy: () => root.remove() };
}

const METHOD_KEYS = { password: 'browserLoginPassword', google: 'browserLoginGoogle', apple: 'browserLoginApple', passkey: 'browserLoginPasskey', sms: 'browserLoginSms', takeover: 'browserLoginTakeover' };

// How to sign in: the ways the page offers; "user name and password" opens the two fields. What is typed goes to the server in the answer, and nowhere else (not into the chat, never shown again).
function loginPanel({ document, language, info, answer }) {
  const t = (key, values) => sandboxText(language, key, values);
  const root = make(document, 'div', 'bpanel');
  root.setAttribute('role', 'group');
  const title = make(document, 'div', 'bpanel-title', t('browserLoginTitle'));
  const site = make(document, 'div', 'bpanel-site', info.domain ? t('browserAskSite', { domain: info.domain }) : '');
  site.hidden = !info.domain;
  const list = make(document, 'div', 'bpanel-methods');
  const form = make(document, 'form', 'bpanel-form');
  form.hidden = true;
  const field = (labelKey, type, autocomplete) => {
    const label = make(document, 'label', 'bpanel-field');
    label.append(make(document, 'span', 'bpanel-label', t(labelKey)));
    const input = make(document, 'input', 'bpanel-input');
    input.type = type; input.autocomplete = autocomplete; input.spellcheck = false;
    input.setAttribute('autocapitalize', 'none'); input.setAttribute('autocorrect', 'off');
    label.append(input);
    return { label, input };
  };
  const user = field('browserLoginUser', 'text', 'off');
  const pass = field('browserLoginPass', 'password', 'new-password');
  const saveRow = make(document, 'label', 'bpanel-check');
  const save = make(document, 'input');
  save.type = 'checkbox'; save.checked = true;
  saveRow.append(save, make(document, 'span', '', t('browserLoginSave')));
  const row = make(document, 'div', 'bpanel-row');
  const back = make(document, 'button', 'bpanel-button', t('browserLoginBack'));
  back.type = 'button';
  const go = make(document, 'button', 'bpanel-button is-primary', t('browserLoginGo'));
  go.type = 'submit'; go.disabled = true;
  row.append(back, go);
  form.append(user.label, pass.label, saveRow, row);
  const note = make(document, 'div', 'bpanel-hint', t('browserLoginNote'));
  const methods = (info.methods || []).filter((m) => METHOD_KEYS[m]);
  let sent = false;
  const finish = (payload) => { if (sent) return; sent = true; root.classList.add('is-sent'); root.querySelectorAll('button, input').forEach((el) => { el.disabled = true; }); answer(payload); };
  for (const method of methods) {
    const button = make(document, 'button', `bpanel-method${method === 'takeover' ? ' is-quiet' : ''}`, t(METHOD_KEYS[method]));
    button.type = 'button';
    button.addEventListener('click', () => {
      if (method === 'password') { list.hidden = true; form.hidden = false; user.input.focus?.(); } else finish({ method });
    });
    list.append(button);
  }
  const ready = () => { go.disabled = !(user.input.value.trim() && pass.input.value); };
  user.input.addEventListener('input', ready); pass.input.addEventListener('input', ready);
  back.addEventListener('click', () => { form.hidden = true; list.hidden = false; });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (go.disabled) return;
    const payload = { method: 'password', username: user.input.value.trim(), password: pass.input.value, save: save.checked };
    pass.input.value = ''; user.input.value = '';
    finish(payload);
  });
  root.append(title, site, list, form, note);
  return { element: root, focus: () => list.querySelector('button')?.focus?.(), destroy: () => { pass.input.value = ''; root.remove(); } };
}

// A code: one cell for each digit and a keypad (a typed digit also goes in); a way out for "I cannot get it".
function codePanel({ document, language, info, answer }) {
  const t = (key, values) => sandboxText(language, key, values);
  const digits = [4, 6, 8].includes(info.digits) ? info.digits : 6;
  const root = make(document, 'div', 'bpanel');
  root.setAttribute('role', 'group');
  const title = make(document, 'div', 'bpanel-title', t('browserCodeTitle'));
  const site = make(document, 'div', 'bpanel-site', info.domain ? t('browserAskSite', { domain: info.domain }) : '');
  site.hidden = !info.domain;
  const cells = make(document, 'div', 'bpanel-cells');
  const boxes = Array.from({ length: digits }, (_, index) => { const cell = make(document, 'span', 'bpanel-cell'); cell.setAttribute('aria-label', t('browserCodeCell', { n: index + 1 })); cells.append(cell); return cell; });
  const pad = make(document, 'div', 'bpanel-pad');
  let value = '';
  const send = make(document, 'button', 'bpanel-button is-primary', t('browserCodeSend'));
  send.type = 'button'; send.disabled = true;
  const draw = () => { boxes.forEach((cell, index) => { cell.textContent = value[index] || ''; cell.classList.toggle('is-on', index === value.length); }); send.disabled = value.length !== digits; };
  const push = (digit) => { if (value.length < digits) { value += digit; draw(); } };
  const pop = () => { value = value.slice(0, -1); draw(); };
  for (const key of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del']) {
    if (key === '') { pad.append(make(document, 'span')); continue; }
    const button = make(document, 'button', 'bpanel-key', key === 'del' ? '⌫' : key);
    button.type = 'button';
    if (key === 'del') button.setAttribute('aria-label', t('browserCodeDelete'));
    button.addEventListener('click', () => (key === 'del' ? pop() : push(key)));
    pad.append(button);
  }
  const other = make(document, 'button', 'bpanel-link', t('browserCodeOther'));
  other.type = 'button';
  const note = make(document, 'div', 'bpanel-hint', t('browserLoginNote'));
  let sent = false;
  const finish = (payload) => { if (sent) return; sent = true; value = ''; root.classList.add('is-sent'); root.querySelectorAll('button').forEach((el) => { el.disabled = true; }); answer(payload); };
  send.addEventListener('click', () => { if (value.length === digits) finish({ code: value }); });
  other.addEventListener('click', () => finish({ method: 'other' }));
  root.addEventListener('keydown', (event) => { if (/^[0-9]$/.test(event.key)) push(event.key); else if (event.key === 'Backspace') pop(); else if (event.key === 'Enter' && value.length === digits) finish({ code: value }); });
  root.tabIndex = -1;
  draw();
  root.append(title, site, cells, pad, send, other, note);
  return { element: root, focus: () => root.focus?.(), destroy: () => { value = ''; root.remove(); } };
}

// The person works the page themselves (a login only they can do): the card stays, with this under it.
function takeoverPanel({ document, language, info, answer, helpers }) {
  const t = (key, values) => sandboxText(language, key, values);
  const root = make(document, 'div', 'bpanel is-inline');
  root.setAttribute('role', 'group');
  root.append(make(document, 'div', 'bpanel-title', t('browserHandTitle')), make(document, 'div', 'bpanel-summary', info.reason || t('browserHandBody')));
  const row = make(document, 'div', 'bpanel-row');
  const cancel = make(document, 'button', 'bpanel-button', t('browserHandCancel'));
  const take = make(document, 'button', 'bpanel-button', t('browserHandTake'));
  const done = make(document, 'button', 'bpanel-button is-primary', t('browserHandDone'));
  for (const button of [cancel, take, done]) button.type = 'button';
  row.append(cancel, take, done);
  root.append(row);
  let sent = false;
  const finish = (decision) => { if (sent) return; sent = true; root.classList.add('is-sent'); root.querySelectorAll('button').forEach((el) => { el.disabled = true; }); answer({ decision }); };
  cancel.addEventListener('click', () => finish('cancel'));
  take.addEventListener('click', () => helpers?.takeOver?.());
  done.addEventListener('click', () => finish('done'));
  return { element: root, below: true, finish, focus: () => take.focus?.(), destroy: () => root.remove() };
}

const BUILDERS = { confirm: confirmPanel, login: loginPanel, code: codePanel, takeover: takeoverPanel };
const OPEN_KEYS = { confirm: 'browserAskOpenConfirm', login: 'browserAskOpenLogin', code: 'browserAskOpenCode', takeover: 'browserAskOpenHand' };

/** `ask`: the event of the server ({ id, kind, … }). Returns null for a kind this page does not know (the question then waits for the answer of the timeout). */
export function createAskPanel({ document, language, ask, onAnswer, helpers = null }) {
  const build = BUILDERS[ask?.kind];
  if (!build) return null;
  return build({ document, language, info: ask, answer: (payload) => onAnswer?.(ask.id, payload), helpers });
}

/** The words of the capsule and of the button under the pill while a question is open. */
export const askWords = (language, kind = 'confirm') => ({ need: sandboxText(language, kind === 'confirm' ? 'browserAskNeed' : 'browserAskNeedYou'), open: sandboxText(language, OPEN_KEYS[kind] || OPEN_KEYS.confirm) });
