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

const BUILDERS = { confirm: confirmPanel };

/** `ask`: the event of the server ({ id, kind, … }). Returns null for a kind this page does not know (the question then waits for the answer of the timeout). */
export function createAskPanel({ document, language, ask, onAnswer }) {
  const build = BUILDERS[ask?.kind];
  if (!build) return null;
  return build({ document, language, info: ask, answer: (payload) => onAnswer?.(ask.id, payload) });
}

/** The words of the capsule and of the button under the pill while a question is open. */
export const askWords = (language) => ({ need: sandboxText(language, 'browserAskNeed'), open: sandboxText(language, 'browserAskOpenConfirm') });
