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


// "Other": under a question with fixed answers, a quiet button opens a box where the person writes what they want instead (Allen, 2026-11-20: they may want to ask the model something). It goes to the
// model as the person's own words, in place of the choice. `deliver(text)` ends the question.
function otherBox({ document, t, deliver }) {
  const root = make(document, 'div', 'bpanel-other');
  const open = make(document, 'button', 'bpanel-link', t('browserOther'));
  open.type = 'button';
  const form = make(document, 'form', 'bpanel-other-form');
  form.hidden = true;
  const input = make(document, 'textarea', 'bpanel-other-input');
  input.rows = 2; input.maxLength = 500; input.placeholder = t('browserOtherPlaceholder'); input.setAttribute('aria-label', t('browserOther'));
  const go = make(document, 'button', 'bpanel-button is-primary', t('browserOtherSend'));
  go.type = 'submit'; go.disabled = true;
  form.append(input, go);
  root.append(open, form);
  open.addEventListener('click', () => { open.hidden = true; form.hidden = false; input.focus?.(); });
  input.addEventListener('input', () => { go.disabled = !input.value.trim(); });
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); form.requestSubmit?.(); } });
  form.addEventListener('submit', (event) => { event.preventDefault(); const value = input.value.trim(); if (value) deliver(value); });
  return root;
}

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
  root.append(otherBox({ document, t, deliver: (other) => { if (sent) return; sent = true; root.classList.add('is-sent'); cancel.disabled = true; confirm.disabled = true; answer({ other }); } }));
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
      if (method === 'password') { list.hidden = true; other.hidden = true; form.hidden = false; user.input.focus?.(); } else finish({ method });
    });
    list.append(button);
  }
  const ready = () => { go.disabled = !(user.input.value.trim() && pass.input.value); };
  user.input.addEventListener('input', ready); pass.input.addEventListener('input', ready);
  back.addEventListener('click', () => { form.hidden = true; list.hidden = false; other.hidden = false; });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (go.disabled) return;
    const payload = { method: 'password', username: user.input.value.trim(), password: pass.input.value, save: save.checked };
    pass.input.value = ''; user.input.value = '';
    finish(payload);
  });
  const other = otherBox({ document, t, deliver: (text) => finish({ other: text }) });
  root.append(title, site, list, other, form, note);
  return { element: root, focus: () => list.querySelector('button')?.focus?.(), destroy: () => { pass.input.value = ''; root.remove(); } };
}

const RESEND_AFTER_S = 30;

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
  // A code that does not come: after a short wait the person can ask the AI to have the page send it again (the wait is the one most sites keep between two messages).
  const resend = make(document, 'button', 'bpanel-link', t('browserCodeResendIn', { n: RESEND_AFTER_S }));
  resend.type = 'button';
  resend.disabled = true;
  let left = RESEND_AFTER_S;
  const timer = setInterval(() => {
    left -= 1;
    if (left <= 0) { clearInterval(timer); resend.disabled = false; resend.textContent = t('browserCodeResend'); } else resend.textContent = t('browserCodeResendIn', { n: left });
  }, 1000);
  timer.unref?.();
  const note = make(document, 'div', 'bpanel-hint', t('browserLoginNote'));
  let sent = false;
  const finish = (payload) => { if (sent) return; sent = true; clearInterval(timer); value = ''; root.classList.add('is-sent'); root.querySelectorAll('button').forEach((el) => { el.disabled = true; }); answer(payload); };
  send.addEventListener('click', () => { if (value.length === digits) finish({ code: value }); });
  other.addEventListener('click', () => finish({ method: 'other' }));
  resend.addEventListener('click', () => { if (!resend.disabled) finish({ method: 'resend' }); });
  root.addEventListener('keydown', (event) => { if (/^[0-9]$/.test(event.key)) push(event.key); else if (event.key === 'Backspace') pop(); else if (event.key === 'Enter' && value.length === digits) finish({ code: value }); });
  root.tabIndex = -1;
  draw();
  root.append(title, site, cells, pad, send, resend, other, note);
  return { element: root, focus: () => root.focus?.(), destroy: () => { clearInterval(timer); value = ''; root.remove(); } };
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
  done.addEventListener('click', () => { finish('done'); helpers?.giveBack?.(); });
  root.append(otherBox({ document, t, deliver: (other) => { if (sent) return; sent = true; root.classList.add('is-sent'); root.querySelectorAll('button, textarea').forEach((el) => { el.disabled = true; }); answer({ other }); } }));
  return { element: root, below: true, finish, focus: () => take.focus?.(), destroy: () => root.remove() };
}

// How to pay: the card (used once), Apple Pay, or another way. The card itself is asked in the next panel.
function paymentPanel({ document, language, info, answer }) {
  const t = (key, values) => sandboxText(language, key, values);
  const root = make(document, 'div', 'bpanel');
  root.setAttribute('role', 'group');
  root.append(make(document, 'div', 'bpanel-title', t('browserPayTitle')));
  if (info.domain) root.append(make(document, 'div', 'bpanel-site', t('browserAskSite', { domain: info.domain })));
  const list = make(document, 'div', 'bpanel-methods');
  const keys = { card: 'browserPayCard', applepay: 'browserPayApple', other: 'browserPayOther' };
  let sent = false;
  for (const method of (info.methods || []).filter((m) => keys[m])) {
    const button = make(document, 'button', 'bpanel-method', t(keys[method]));
    button.type = 'button';
    button.addEventListener('click', () => { if (sent) return; sent = true; root.classList.add('is-sent'); root.querySelectorAll('button').forEach((el) => { el.disabled = true; }); answer({ method }); });
    list.append(button);
  }
  root.append(list, otherBox({ document, t, deliver: (other) => { if (sent) return; sent = true; root.classList.add('is-sent'); root.querySelectorAll('button, textarea').forEach((el) => { el.disabled = true; }); answer({ other }); } }));
  return { element: root, focus: () => list.querySelector('button')?.focus?.(), destroy: () => root.remove() };
}

// The card, in two steps (the card and the holder, then the address). It goes from this page straight to the browser host with the one-time ticket of the question: the answer to the
// server holds only which fields were filled. What was typed is wiped when it has gone, and is never written anywhere else.
const CARD_STEP1 = [['number', 'browserCardNumber', { inputMode: 'numeric', autocomplete: 'off', max: 23 }], ['exp', 'browserCardExp', { inputMode: 'numeric', autocomplete: 'off', max: 5, placeholder: 'MM/YY' }], ['cvc', 'browserCardCvc', { inputMode: 'numeric', autocomplete: 'off', max: 4 }], ['name', 'browserCardName', { autocomplete: 'off' }]];
const CARD_STEP2 = [['line1', 'browserCardLine1', { required: true }], ['line2', 'browserCardLine2'], ['city', 'browserCardCity'], ['state', 'browserCardState'], ['zip', 'browserCardZip'], ['country', 'browserCardCountry'], ['phone', 'browserCardPhone', { inputMode: 'tel' }], ['email', 'browserCardEmail', { inputMode: 'email' }]];
const REQUIRED = new Set(['number', 'exp', 'cvc', 'name', 'line1']);

function cardPanel({ document, language, info, answer, helpers }) {
  const t = (key, values) => sandboxText(language, key, values);
  const root = make(document, 'div', 'bpanel');
  root.setAttribute('role', 'group');
  const title = make(document, 'div', 'bpanel-title', t('browserCardTitle'));
  const dots = make(document, 'span', 'bpanel-dots');
  const dot = [make(document, 'i', 'is-on'), make(document, 'i')];
  dots.append(...dot);
  const head = make(document, 'div', 'bpanel-head');
  head.append(title, dots);
  const stepName = make(document, 'div', 'bpanel-site');
  const inputs = {};
  const rows = {};
  const build = (list) => list.map(([key, labelKey, extra = {}]) => {
    const label = make(document, 'label', 'bpanel-field');
    const top = make(document, 'span', 'bpanel-label');
    top.textContent = `${t(labelKey)} · ${t(REQUIRED.has(key) ? 'browserCardRequired' : 'browserCardOptional')}`;
    const input = make(document, 'input', 'bpanel-input');
    input.type = 'text'; input.spellcheck = false; input.autocomplete = extra.autocomplete || 'off';
    if (extra.inputMode) input.inputMode = extra.inputMode;
    if (extra.max) input.maxLength = extra.max;
    if (extra.placeholder) input.placeholder = extra.placeholder;
    input.setAttribute('autocapitalize', 'off');
    label.append(top, input);
    inputs[key] = input; rows[key] = label;
    return label;
  });
  const one = make(document, 'div', 'bpanel-form'); one.append(...build(CARD_STEP1));
  const two = make(document, 'div', 'bpanel-form'); two.append(...build(CARD_STEP2));
  two.hidden = true;
  // The number in groups of four, the expiry with its slash.
  inputs.number.addEventListener('input', () => { inputs.number.value = inputs.number.value.replace(/\D/g, '').slice(0, 19).replace(/(.{4})/g, '$1 ').trim(); });
  inputs.exp.addEventListener('input', () => { const digits = inputs.exp.value.replace(/\D/g, '').slice(0, 4); inputs.exp.value = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits; });
  inputs.cvc.addEventListener('input', () => { inputs.cvc.value = inputs.cvc.value.replace(/\D/g, '').slice(0, 4); });
  const hint = make(document, 'div', 'bpanel-hint');
  const row = make(document, 'div', 'bpanel-row');
  const left = make(document, 'button', 'bpanel-button', t('browserCardCancel'));
  const right = make(document, 'button', 'bpanel-button is-primary', t('browserCardNext'));
  left.type = 'button'; right.type = 'button';
  row.append(left, right);
  const note = make(document, 'div', 'bpanel-hint', t('browserCardNote'));
  const error = make(document, 'div', 'bpanel-error');
  error.hidden = true;
  let step = 1;
  let busy = false;
  let sent = false;
  const validShape = {
    number: (v) => /^[0-9]{12,19}$/.test(v.replace(/\s/g, '')),
    exp: (v) => /^(0[1-9]|1[0-2])\/?([0-9]{2})$/.test(v.replace(/\s/g, '')),
    cvc: (v) => /^[0-9]{3,4}$/.test(v),
    name: (v) => v.trim().length > 0,
    line1: (v) => v.trim().length > 0
  };
  const lacking = () => (step === 1 ? ['number', 'exp', 'cvc', 'name'] : ['line1']).filter((key) => !validShape[key](inputs[key].value));
  const refresh = () => {
    const missing = lacking();
    stepName.textContent = t(step === 1 ? 'browserCardStep1' : 'browserCardStep2');
    one.hidden = step !== 1; two.hidden = step !== 2;
    dot[0].classList.toggle('is-on', step === 1); dot[1].classList.toggle('is-on', step === 2);
    left.textContent = t(step === 1 ? 'browserCardCancel' : 'browserCardBack');
    right.textContent = t(step === 1 ? 'browserCardNext' : 'browserCardSend');
    right.disabled = busy || missing.length > 0;
    hint.textContent = missing.length && Object.values(inputs).some((el) => el.value) ? t('browserCardMissing', { fields: missing.map((key) => t((CARD_STEP1.concat(CARD_STEP2).find((item) => item[0] === key))[1])).join(', ') }) : '';
  };
  const wipe = () => { for (const input of Object.values(inputs)) input.value = ''; };
  const finish = (payload) => { if (sent) return; sent = true; root.classList.add('is-sent'); wipe(); root.querySelectorAll('button, input').forEach((el) => { el.disabled = true; }); answer(payload); };
  const card = () => Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key, input.value.trim()]).filter(([, value]) => value));
  async function submit() {
    busy = true; error.hidden = true; refresh();
    try {
      const fetchImpl = helpers?.fetch || document.defaultView?.fetch?.bind(document.defaultView);
      const response = await fetchImpl(`https://${info.host}${info.path}`, { method: 'POST', headers: { Authorization: `Bearer ${info.ticket}`, 'Content-Type': 'application/json' }, body: JSON.stringify(card()), cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result?.ok) { finish({ done: true, filled: result.filled || [], missing: result.missing || [] }); return; }
      error.textContent = t('browserCardFailed');
    } catch {
      error.textContent = t('browserCardFailed');
    }
    error.hidden = false; busy = false; refresh();
  }
  left.addEventListener('click', () => { if (busy) return; if (step === 2) { step = 1; refresh(); } else { finish({ cancel: true }); } });
  right.addEventListener('click', () => { if (busy || lacking().length) return; if (step === 1) { step = 2; refresh(); inputs.line1.focus?.(); } else void submit(); });
  root.addEventListener('input', refresh);
  root.append(head, stepName, one, two, error, hint, row, note);
  refresh();
  return { element: root, focus: () => inputs.number.focus?.(), destroy: () => { wipe(); root.remove(); } };
}


// The person's one browser is in another conversation: stop it and use it here, wait for it (how long at most is said), or go on without a browser.
function busyPanel({ document, language, info, answer }) {
  const t = (key, values) => sandboxText(language, key, values);
  const root = make(document, 'div', 'bpanel');
  root.setAttribute('role', 'group');
  const hint = info.minutes > 0 ? t('browserBusyHint', { minutes: info.minutes }) : t('browserBusyHintUnknown');
  root.append(make(document, 'div', 'bpanel-title', t('browserBusyTitle')), make(document, 'div', 'bpanel-summary', t('browserBusyBody')));
  const row = make(document, 'div', 'bpanel-row');
  const wait = make(document, 'button', 'bpanel-button', t('browserBusyWait'));
  const stop = make(document, 'button', 'bpanel-button is-primary', t('browserBusyStop'));
  for (const button of [wait, stop]) button.type = 'button';
  row.append(wait, stop);
  const skip = make(document, 'button', 'bpanel-link', t('browserBusySkip'));
  skip.type = 'button';
  root.append(row, make(document, 'div', 'bpanel-hint', hint), skip);
  let sent = false;
  const finish = (decision) => { if (sent) return; sent = true; root.classList.add('is-sent'); root.querySelectorAll('button').forEach((el) => { el.disabled = true; }); answer({ decision }); };
  wait.addEventListener('click', () => finish('wait'));
  stop.addEventListener('click', () => finish('stop'));
  skip.addEventListener('click', () => finish('skip'));
  return { element: root, finish, focus: () => stop.focus?.(), destroy: () => root.remove() };
}

const BUILDERS = { busy: busyPanel, confirm: confirmPanel, login: loginPanel, code: codePanel, takeover: takeoverPanel, payment: paymentPanel, card: cardPanel };
const OPEN_KEYS = { busy: 'browserAskOpenBusy', confirm: 'browserAskOpenConfirm', login: 'browserAskOpenLogin', code: 'browserAskOpenCode', takeover: 'browserAskOpenHand', payment: 'browserPayTitle', card: 'browserCardTitle' };

/** `ask`: the event of the server ({ id, kind, … }). Returns null for a kind this page does not know (the question then waits for the answer of the timeout). */
export function createAskPanel({ document, language, ask, onAnswer, helpers = null }) {
  const build = BUILDERS[ask?.kind];
  if (!build) return null;
  return build({ document, language, info: ask, answer: (payload) => onAnswer?.(ask.id, payload), helpers });
}

/** The words of the capsule and of the button under the pill while a question is open. */
export const askWords = (language, kind = 'confirm') => ({ need: sandboxText(language, kind === 'confirm' ? 'browserAskNeed' : 'browserAskNeedYou'), open: sandboxText(language, OPEN_KEYS[kind] || OPEN_KEYS.confirm) });
