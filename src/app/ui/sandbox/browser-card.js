// The card of the browser agent in the conversation (design: docs/superpowers/specs/2026-11-16-browser-agent-design.md, section 16).
// The card is the screen; a solid capsule at its lower edge says what is being done; the capsule turns the card over to the list of steps; two round
// buttons at the lower right shrink it to a pill and cancel the task. When the work is over it folds into a small tag, and the tag opens the card again.
// Until the live screen exists (phase 3) the screen is a quiet place holding the name of the site. The words say only the site, never what was clicked.

import { sandboxText } from '../../runtime/sandbox/sandbox-texts.js';

const SVG = 'http://www.w3.org/2000/svg';
const ICONS = {
  check: 'M5 12.5l4.5 4.5L19 7.5',
  cross: 'M6 6l12 12M18 6L6 18',
  warn: 'M12 4l9 16H3zM12 10v4.5M12 17.2h.01',
  shrink: 'M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7',
  globe: 'M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c2.4 2.6 3.6 5.6 3.6 9S14.4 18.4 12 21c-2.4-2.6-3.6-5.6-3.6-9S9.6 5.6 12 3z'
};

const icon = (document, name, size = 16, width = 2) => {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', String(width));
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', ICONS[name]);
  svg.append(path);
  return svg;
};

/**
 * `host`: where the card goes (right under the line of the steps of the reply). `onCancel`: the person cancelled the task (the reply is stopped).
 * `handle(event)` takes the `browser` events of the server; `complete()` says the reply is over.
 */
export function createBrowserCard({ document, host, language = 'zh-TW', onCancel = null }) {
  const t = (key, values) => sandboxText(language, key, values);
  // The steps: the same kind of step on the same site is one step that goes on, so thirty clicks are not thirty lines.
  const steps = [];
  let phase = 'run'; // run, queued, done, failed, cancelled
  let view = 'front'; // front, back, pill
  let queuedLabel = '';
  let domain = '';
  let dialog = null;

  const make = (tag, className, attrs = {}) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    Object.entries(attrs).forEach(([name, value]) => node.setAttribute(name, value));
    return node;
  };
  const button = (className, label, onClick, child) => {
    const node = make('button', className, { type: 'button', 'aria-label': label, title: label });
    if (child) node.append(child);
    node.addEventListener('click', onClick);
    return node;
  };

  const root = make('div', 'bcard');
  const card = make('div', 'bcard-card');
  const front = make('div', 'bcard-face bcard-front');
  const back = make('div', 'bcard-face bcard-back');
  const screen = make('div', 'bcard-screen');
  const screenSite = make('span', 'bcard-site');
  screen.append(icon(document, 'globe', 22, 1.6), screenSite);
  const capsule = make('button', 'bcard-capsule', { type: 'button', 'aria-label': t('browserProgress') });
  const capsuleLead = make('span', 'bcard-lead');
  const capsuleText = make('span', 'bcard-text', { 'aria-live': 'polite' });
  capsule.append(capsuleLead, capsuleText);
  const shrinkButton = button('bcard-round', t('browserShrink'), () => setView('pill'), icon(document, 'shrink', 14));
  const cancelButton = button('bcard-round', t('browserCancel'), () => askCancel(), icon(document, 'cross', 14));
  const buttons = make('span', 'bcard-buttons');
  buttons.append(shrinkButton, cancelButton);
  front.append(screen, capsule, buttons);

  const backHead = make('div', 'bcard-back-head');
  const backTitle = make('span', '', {});
  backTitle.textContent = t('browserProgress');
  backHead.append(backTitle, button('bcard-back-close', t('browserBack'), () => setView('front'), icon(document, 'cross', 15)));
  const list = make('ul', 'bcard-steps');
  back.append(backHead, list);
  card.append(front, back);

  // The pill: the capsule alone (while the work goes on) or the tag it folds into (when it is over); a press opens the card again.
  const pill = make('button', 'bcard-pill', { type: 'button' });
  const pillLead = make('span', 'bcard-lead');
  const pillText = make('span', 'bcard-text');
  // Waiting in the line: the pill has its own cross inside (leave the line); the card comes when the browser is there.
  const pillCross = make('span', 'bcard-pill-cross', { role: 'button', tabindex: '0' });
  pillCross.append(icon(document, 'cross', 14));
  pill.append(pillLead, pillText, pillCross);
  pill.addEventListener('click', () => { if (phase !== 'queued') setView('front'); });
  const pillCrossAction = (event) => {
    event.stopPropagation();
    askCancel();
  };
  pillCross.addEventListener('click', pillCrossAction);
  pillCross.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') pillCrossAction(event); });
  capsule.addEventListener('click', () => setView('back'));
  root.append(card, pill);
  host.append(root);

  const statusOf = () => (phase === 'queued' ? 'run' : phase === 'cancelled' || phase === 'failed' ? 'fail' : phase);
  const leadFor = (state) => {
    const wrap = make('span', `bcard-icon is-${state}`);
    if (state === 'run') wrap.append(make('i', 'bcard-spin'));
    else wrap.append(icon(document, state === 'done' ? 'check' : state === 'help' ? 'warn' : 'cross', 14, 2.4));
    return wrap;
  };
  const labelNow = () => {
    if (phase === 'queued') return queuedLabel;
    if (phase === 'done') return t('browserDone');
    if (phase === 'cancelled') return t('browserCancelled');
    if (phase === 'failed') return t('browserFailed');
    return steps.at(-1)?.label || t('browserCardLabel');
  };

  const render = () => {
    const status = statusOf();
    const label = labelNow();
    root.dataset.phase = phase;
    root.dataset.view = view;
    pillCross.hidden = phase !== 'queued';
    pillCross.setAttribute('aria-label', t('browserCancelQueue'));
    card.hidden = view === 'pill';
    pill.hidden = view !== 'pill';
    // The card is turned over (or not): the face that is not seen does not take the focus.
    card.classList.toggle('is-flipped', view === 'back');
    front.inert = view === 'back';
    back.inert = view !== 'back';
    capsuleLead.replaceChildren(leadFor(status));
    capsuleText.textContent = label;
    pillLead.replaceChildren(leadFor(status));
    pillText.textContent = label;
    pill.classList.toggle('is-tag', phase === 'done' || phase === 'cancelled');
    pill.setAttribute('aria-label', label);
    screenSite.textContent = domain;
    // Once it is over there is no task to cancel: only the shrink button stays (and a queue can be left, but not shrunk).
    cancelButton.hidden = phase === 'done' || phase === 'failed' || phase === 'cancelled';
    list.replaceChildren(...steps.map((step) => {
      const row = make('li', `bcard-step is-${step.state}`);
      const tick = make('i', 'bcard-tick');
      if (step.state === 'done') tick.append(icon(document, 'check', 9, 3.2));
      else if (step.state === 'fail') tick.append(icon(document, 'cross', 9, 3.2));
      const text = make('span');
      text.textContent = step.label;
      row.append(tick, text);
      return row;
    }));
    // The last step is in view as the list grows.
    list.scrollTop = list.scrollHeight;
  };

  const setView = (next) => {
    if (view === next) return;
    view = next;
    render();
  };

  const closeDialog = () => {
    dialog?.remove();
    dialog = null;
  };
  // Asking first: a small card in the middle, a light veil, no blur.
  const askCancel = () => {
    if (dialog) return;
    const veil = make('div', 'bcard-veil');
    const box = make('div', 'bcard-dialog', { role: 'alertdialog', 'aria-modal': 'true' });
    const ask = make('div', 'bcard-dialog-text');
    ask.textContent = t('browserCancelAsk');
    const body = make('div', 'bcard-dialog-body');
    body.textContent = t('browserCancelBody');
    const keep = make('button', 'bcard-dialog-button', { type: 'button' });
    keep.textContent = t('browserCancelNo');
    const yes = make('button', 'bcard-dialog-button is-danger', { type: 'button' });
    yes.textContent = t('browserCancelYes');
    const row = make('div', 'bcard-dialog-row');
    row.append(keep, yes);
    box.append(ask, body, row);
    veil.append(box);
    keep.addEventListener('click', closeDialog);
    veil.addEventListener('click', (event) => { if (event.target === veil) closeDialog(); });
    yes.addEventListener('click', () => {
      closeDialog();
      cancel();
    });
    document.addEventListener('keydown', function onKey(event) {
      if (event.key !== 'Escape') return;
      document.removeEventListener('keydown', onKey);
      closeDialog();
    });
    dialog = veil;
    document.body.append(veil);
    keep.focus?.();
  };

  const cancel = () => {
    if (phase === 'done' || phase === 'failed' || phase === 'cancelled') return;
    steps.forEach((step) => { if (step.state === 'run') step.state = 'fail'; });
    phase = 'cancelled';
    view = 'pill';
    render();
    try {
      onCancel?.();
    } catch {
      // The reply stops by its own stop button as well.
    }
  };

  const finishRunning = (state) => steps.forEach((step) => { if (step.state === 'run') step.state = state; });

  // The work is over: the card folds into its tag. A second look is one press away.
  const over = (next) => {
    phase = next;
    if (next === 'done') view = 'pill';
    render();
  };

  const handle = (event) => {
    if (phase === 'cancelled') return;
    if (event?.event === 'queued') {
      phase = 'queued';
      view = 'pill';
      queuedLabel = event.label || '';
      render();
      return;
    }
    if (event?.event === 'failed') {
      finishRunning('fail');
      over('failed');
      return;
    }
    if (event?.event !== 'call') return;
    if (phase === 'queued') {
      phase = 'run';
      view = 'front';
    }
    if (event.domain) domain = event.domain;
    if (event.action === 'close') {
      finishRunning('done');
      steps.push({ key: 'close', label: event.label, state: 'done' });
      over('done');
      return;
    }
    const key = `${event.action === 'open' ? 'open' : 'act'}:${event.domain || ''}`;
    const last = steps.at(-1);
    if (event.action !== 'open' && last?.key === key) {
      last.state = 'run';
    } else {
      finishRunning('done');
      steps.push({ key, label: event.label, state: 'run' });
    }
    render();
  };

  // The reply is over (the browser may not have been closed by the model): what ran is done.
  const complete = () => {
    if (phase !== 'run' && phase !== 'queued') return;
    finishRunning('done');
    over('done');
  };

  render();
  return {
    handle,
    complete,
    cancel,
    get element() { return root; },
    get phase() { return phase; },
    get view() { return view; },
    remove() {
      closeDialog();
      root.remove();
    }
  };
}
